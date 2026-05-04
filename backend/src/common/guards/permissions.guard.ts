import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AuthUser } from '../../modules/auth/auth-user.type';
import { hasPermission } from '../../modules/permissions/permission-resolver';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from '../decorators/permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const all = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const any = this.reflector.getAllAndOverride<string[] | undefined>(ANY_PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!all && !any) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) throw new ForbiddenException({ code: 'NO_AUTH_USER' });

    if (all && !all.every((p) => hasPermission(user.permissions, p))) {
      throw new ForbiddenException({ code: 'RBAC_DENIED', missing: all });
    }
    if (any && !any.some((p) => hasPermission(user.permissions, p))) {
      throw new ForbiddenException({ code: 'RBAC_DENIED', missingAnyOf: any });
    }
    return true;
  }
}
