import { Injectable, UnauthorizedException, ForbiddenException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppConfig } from '../../config/configuration';
import { UserEntity } from './entities/user.entity';
import { AuthAuditService } from '../auth-audit/auth-audit.service';
import { LockoutPolicy } from './lockout-policy.service';
import {
  AuthCallContext,
  IAuthProvider,
  ProviderAuthResult,
} from './auth-provider.interface';

/**
 * A pre-computed bcrypt hash of an arbitrary string. Used to keep timing
 * roughly flat between the "user not found" / "wrong provider" / "account
 * locked" branches and the genuine wrong-password branch, defeating
 * trivial username-enumeration via response time.
 */
const DUMMY_HASH = '$2b$12$0123456789012345678901uPqXYZRleadingDummyHashAbcdEfghIj.';

@Injectable()
export class LocalAuthProvider implements IAuthProvider {
  readonly key = 'local' as const;

  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    cfg: ConfigService,
    @Optional() private readonly auditor?: AuthAuditService,
    @Optional() private readonly lockoutPolicy?: LockoutPolicy,
  ) {
    // Lockout thresholds now come from `system_settings` via
    // LockoutPolicy (T-445); the old hardcoded constants used to live
    // here. ConfigService is still injected because we may want
    // app-level config later (e.g. an LDAP provider).
    void cfg.get<AppConfig>('app');
  }

  async authenticate(
    username: string,
    password: string,
    ctx?: AuthCallContext,
  ): Promise<ProviderAuthResult> {
    if (!username || !password) {
      await bcrypt.compare(password || ' ', DUMMY_HASH);
      // No audit row when there's nothing to attribute it to.
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    const user = await this.users.findOne({ where: { username } });

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      await this.audit(username, null, 'login.unknown_user', ctx);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    // The user record exists but belongs to a different auth backend.
    // Use a dedicated code so the registry can fall through to the next
    // provider without conflating it with a wrong password.
    if (user.authProvider !== this.key) {
      await bcrypt.compare(password, DUMMY_HASH);
      await this.audit(username, user.id, 'login.wrong_provider', ctx, {
        provider: user.authProvider,
      });
      throw new UnauthorizedException({ code: 'WRONG_PROVIDER' });
    }

    if (!user.isActive) {
      await bcrypt.compare(password, DUMMY_HASH);
      await this.audit(username, user.id, 'login.inactive', ctx);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      // Keep timing flat with the success branch.
      await bcrypt.compare(password, DUMMY_HASH);
      await this.audit(username, user.id, 'login.account_locked', ctx, {
        lockedUntil: user.lockedUntil.toISOString(),
      });
      throw new ForbiddenException({ code: 'ACCOUNT_LOCKED', until: user.lockedUntil });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await this.recordFailure(user, ctx);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    await this.users.update(
      { id: user.id },
      { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    );
    // `login.success` is recorded by AuthService.login() once tokens have
    // been issued, so the audit row reflects "got access" not "password
    // verified". See auth.service.ts.

    // Return a fresh in-memory copy with the success-side fields applied so
    // callers don't see a stale lockedUntil/failedLoginCount on the same tick.
    return {
      user: { ...user, failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } as UserEntity,
    };
  }

  /**
   * Apply a failed-attempt update. When the count crosses the threshold,
   * set lockedUntil and reset the count so the user gets a fresh attempt
   * budget after the lockout window.
   */
  private async recordFailure(user: UserEntity, ctx?: AuthCallContext): Promise<void> {
    const policy = this.lockoutPolicy
      ? await this.lockoutPolicy.resolve()
      : { maxFailures: 5, windowMinutes: 15 };
    const failed = user.failedLoginCount + 1;
    if (failed >= policy.maxFailures) {
      const lockedUntil = new Date(Date.now() + policy.windowMinutes * 60_000);
      await this.users.update({ id: user.id }, { failedLoginCount: 0, lockedUntil });
      await this.audit(user.username, user.id, 'login.password_failed', ctx, {
        attempt: failed,
        threshold: policy.maxFailures,
      });
      await this.audit(user.username, user.id, 'account.locked', ctx, {
        lockedUntil: lockedUntil.toISOString(),
        windowMinutes: policy.windowMinutes,
        trigger: 'password',
      });
    } else {
      await this.users.update({ id: user.id }, { failedLoginCount: failed });
      await this.audit(user.username, user.id, 'login.password_failed', ctx, {
        attempt: failed,
        threshold: policy.maxFailures,
      });
    }
  }

  private async audit(
    username: string,
    userId: string | null,
    event: Parameters<AuthAuditService['record']>[0]['event'],
    ctx: AuthCallContext | undefined,
    detail?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.auditor) return;
    await this.auditor.record({
      username,
      userId,
      event,
      ip: ctx?.ip ?? null,
      userAgent: ctx?.userAgent ?? null,
      detail: detail ?? null,
    });
  }
}
