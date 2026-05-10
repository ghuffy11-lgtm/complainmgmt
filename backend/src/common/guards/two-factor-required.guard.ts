import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthUser } from '../../modules/auth/auth-user.type';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

/**
 * Enforces mandatory 2FA enrollment for users with the `admin` role
 * (T-443). Once an admin's first password verification succeeds, every
 * subsequent request from them is rejected with 412 MUST_ENROLL_2FA
 * until they finish enrollment — UNLESS the request hits one of the
 * paths needed to *complete* enrollment.
 *
 * Allow-list (paths the unenrolled admin can still call):
 *   * /auth/me             — frontend bootstrap reads it on every page
 *   * /auth/logout         — escape hatch
 *   * /auth/change-password — pre-existing self-service
 *   * /auth/2fa/setup      — generate the QR
 *   * /auth/2fa/enable     — confirm + persist
 *
 * /branding, /health, /auth/login, /auth/refresh are already @Public(),
 * so they bypass JwtAuthGuard entirely and never reach this guard.
 *
 * Non-admin users are unaffected.
 */
const ALLOW_PATH_PREFIXES = [
  '/auth/me',
  '/auth/logout',
  '/auth/change-password',
  '/auth/2fa/setup',
  '/auth/2fa/enable',
];

@Injectable()
export class TwoFactorRequiredGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) return true; // JwtAuthGuard will have already rejected.

    const isAdmin = user.roleKeys.includes('admin');
    if (!isAdmin) return true;
    if (user.twoFactorEnrolled) return true;

    // Strip a leading `/api` if it's still on the path (depends on
    // global prefix config). Express normalises path separately.
    const path = req.path.replace(/^\/api/, '');
    if (ALLOW_PATH_PREFIXES.some((p) => path === p || path.startsWith(p + '/'))) {
      return true;
    }

    // 412 PRECONDITION_FAILED — semantic match for "you have to do X
    // before this request is acceptable". Distinct from 401/403 so the
    // frontend can route it specifically (forced-enrollment screen).
    throw new HttpException(
      { code: 'MUST_ENROLL_2FA', message: 'Admin accounts must enroll in two-factor authentication before continuing.' },
      HttpStatus.PRECONDITION_FAILED,
    );
  }
}
