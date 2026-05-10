import { BadRequestException, ForbiddenException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthProviderRegistry } from './auth-provider.registry';
import { RefreshTokenService } from './refresh-token.service';
import { TwoFactorService } from './two-factor.service';
import { LockoutPolicy } from './lockout-policy.service';
import { UserEntity } from './entities/user.entity';
import { PermissionsService } from '../permissions/permissions.service';
import { AuthUser } from './auth-user.type';
import { AppConfig } from '../../config/configuration';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { AuthCallContext } from './auth-provider.interface';
import { AuthAuditService } from '../auth-audit/auth-audit.service';

type AccessTokenClaims = {
  sub: string;
  username: string;
  roleKeys: string[];
};

@Injectable()
export class AuthService {
  private readonly accessTtl: number;
  private readonly bcryptRounds: number;

  constructor(
    private readonly providers: AuthProviderRegistry,
    private readonly jwt: JwtService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly permissions: PermissionsService,
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    cfg: ConfigService,
    @Optional() private readonly auditor?: AuthAuditService,
    @Optional() private readonly twoFactor?: TwoFactorService,
    @Optional() private readonly lockoutPolicy?: LockoutPolicy,
  ) {
    const app = cfg.get<AppConfig>('app')!;
    this.accessTtl = app.jwt.accessTtl;
    this.bcryptRounds = app.bcryptRounds;
  }

  async login(dto: LoginDto, ctx: AuthCallContext) {
    const { user } = await this.providers.tryAuthenticate(dto.username, dto.password, ctx);
    // If the user has 2FA enrolled, the password step is not yet a
    // session — issue a 5-min single-use challenge token instead and
    // make the client present a code at /auth/2fa/verify. We don't
    // audit `login.success` here; that's reserved for the post-2FA
    // success in completeTwoFactor().
    if (this.twoFactor?.isEnrolled(user)) {
      const challengeToken = await this.twoFactor.issueChallengeToken(user.id);
      return { twoFactorRequired: true as const, challengeToken };
    }
    return this.issueSession(user, ctx, 'login.success');
  }

  /** Second leg of a 2FA login: consume a challenge token + verify a
   *  TOTP or backup code, then issue the session. */
  async completeTwoFactor(
    challengeToken: string,
    code: string,
    ctx: AuthCallContext,
  ) {
    if (!this.twoFactor) {
      throw new UnauthorizedException({ code: '2FA_NOT_AVAILABLE' });
    }
    const userId = await this.twoFactor.consumeChallengeToken(challengeToken).catch(() => {
      throw new UnauthorizedException({ code: '2FA_CHALLENGE_INVALID' });
    });
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException({ code: 'USER_DISABLED' });
    if (!this.twoFactor.isEnrolled(user)) {
      // The user disabled 2FA between password step and verify step.
      // Refuse rather than silently issuing a session — the client
      // should restart the login.
      throw new UnauthorizedException({ code: '2FA_NOT_ENROLLED' });
    }

    // If the account got locked out (e.g. by repeated wrong-password
    // attempts in another tab) between password step and verify step,
    // refuse — same posture as LocalAuthProvider's locked-account branch.
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await this.auditor?.record({
        username: user.username,
        userId: user.id,
        event: 'login.account_locked',
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        detail: { lockedUntil: user.lockedUntil.toISOString(), stage: '2fa' },
      });
      throw new ForbiddenException({ code: 'ACCOUNT_LOCKED', until: user.lockedUntil });
    }

    const cleanCode = code.trim();
    const isTotp = /^\d{6}$/.test(cleanCode);
    let usedBackup = false;
    let ok = false;
    if (isTotp) {
      ok = this.twoFactor.verifyTotp(user, cleanCode);
    }
    if (!ok) {
      // Always also try as a backup code, so a user who pasted a
      // backup code with no formatting still gets through.
      ok = await this.twoFactor.verifyAndConsumeBackupCode(user.id, cleanCode);
      if (ok) usedBackup = true;
    }

    if (!ok) {
      const policy = this.lockoutPolicy
        ? await this.lockoutPolicy.resolve()
        : { maxFailures: 5, windowMinutes: 15 };
      const failed = (user.failed2faCount ?? 0) + 1;
      if (failed >= policy.maxFailures) {
        // Same shared `locked_until` field as password lockout — once
        // tripped, the user can't bypass it via either route until the
        // window expires or an admin unlocks them.
        const lockedUntil = new Date(Date.now() + policy.windowMinutes * 60_000);
        await this.users.update(
          { id: user.id },
          { failed2faCount: 0, lockedUntil },
        );
        await this.auditor?.record({
          username: user.username,
          userId: user.id,
          event: 'login.2fa_failed',
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
          detail: { mode: isTotp ? 'totp' : 'backup', attempt: failed, threshold: policy.maxFailures },
        });
        await this.auditor?.record({
          username: user.username,
          userId: user.id,
          event: 'account.locked',
          ip: ctx.ip ?? null,
          userAgent: ctx.userAgent ?? null,
          detail: { lockedUntil: lockedUntil.toISOString(), windowMinutes: policy.windowMinutes, trigger: '2fa' },
        });
        throw new ForbiddenException({ code: 'ACCOUNT_LOCKED', until: lockedUntil });
      }
      await this.users.update({ id: user.id }, { failed2faCount: failed });
      await this.auditor?.record({
        username: user.username,
        userId: user.id,
        event: 'login.2fa_failed',
        ip: ctx.ip ?? null,
        userAgent: ctx.userAgent ?? null,
        detail: { mode: isTotp ? 'totp' : 'backup', attempt: failed, threshold: policy.maxFailures },
      });
      throw new UnauthorizedException({ code: '2FA_CODE_INVALID' });
    }

    // Success — clear failure counter, mint tokens.
    await this.users.update({ id: user.id }, { failed2faCount: 0 });
    return this.issueSession(user, ctx, 'login.2fa_success', { usedBackup });
  }

  private async issueSession(
    user: UserEntity,
    ctx: AuthCallContext,
    event: 'login.success' | 'login.2fa_success',
    detail?: Record<string, unknown>,
  ) {
    const authUser = await this.permissions.materialize(user);
    const accessToken = await this.signAccess(authUser);
    const refreshToken = await this.refreshTokens.issue(user.id, ctx);
    await this.auditor?.record({
      username: user.username,
      userId: user.id,
      event,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      detail: detail ?? null,
    });
    return { accessToken, refreshToken, user: this.toMeDto(authUser) };
  }

  async refresh(rawRefresh: string, ctx: AuthCallContext) {
    const { userId, raw: newRefresh } = await this.refreshTokens.rotate(rawRefresh, ctx);
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || !user.isActive) throw new UnauthorizedException({ code: 'USER_DISABLED' });
    const authUser = await this.permissions.materialize(user);
    return {
      accessToken: await this.signAccess(authUser),
      refreshToken: newRefresh,
    };
  }

  async logout(rawRefresh: string, ctx: AuthCallContext = {}): Promise<void> {
    const userId = await this.refreshTokens.revoke(rawRefresh);
    if (!userId || !this.auditor) return;
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) return;
    await this.auditor.record({
      username: user.username,
      userId: user.id,
      event: 'logout',
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  }

  async verifyAccessToken(token: string): Promise<AuthUser> {
    const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token);
    const user = await this.users.findOne({ where: { id: claims.sub } });
    if (!user || !user.isActive) throw new UnauthorizedException({ code: 'USER_DISABLED' });
    return this.permissions.materialize(user);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
    ctx: AuthCallContext = {},
  ): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    const ok = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    if (dto.newPassword.length < 10) {
      throw new BadRequestException({ code: 'PASSWORD_TOO_SHORT' });
    }
    const newHash = await bcrypt.hash(dto.newPassword, this.bcryptRounds);
    await this.users.update({ id: user.id }, { passwordHash: newHash });
    await this.refreshTokens.revokeAllForUser(user.id);
    await this.auditor?.record({
      username: user.username,
      userId: user.id,
      event: 'password_changed',
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  }

  /** Self-disable 2FA. Requires re-asserting the current password.
   *  Forces re-login by revoking all refresh tokens — the next login
   *  will go straight from password to session (no challenge step). */
  async disableTwoFactor(
    userId: string,
    currentPassword: string,
    ctx: AuthCallContext,
  ): Promise<void> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    if (!this.twoFactor) throw new UnauthorizedException({ code: '2FA_NOT_AVAILABLE' });
    if (!this.twoFactor.isEnrolled(user)) {
      // No-op; pretend success for idempotency.
      return;
    }
    await this.twoFactor.clear(user.id);
    await this.refreshTokens.revokeAllForUser(user.id);
    await this.auditor?.record({
      username: user.username,
      userId: user.id,
      event: '2fa.disabled',
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });
  }

  toMeDto(u: AuthUser) {
    return {
      id: u.id,
      username: u.username,
      displayName: u.displayName,
      departmentId: u.departmentId,
      departmentIds: u.departmentIds,
      roleKeys: u.roleKeys,
      permissions: Array.from(u.permissions),
      twoFactorEnrolled: !!u.twoFactorEnrolled,
    };
  }

  private signAccess(u: AuthUser): Promise<string> {
    const payload: AccessTokenClaims = {
      sub: String(u.id),
      username: u.username,
      roleKeys: u.roleKeys,
    };
    return this.jwt.signAsync(payload, { expiresIn: this.accessTtl });
  }
}
