import { Injectable, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AppConfig } from '../../config/configuration';
import { UserEntity } from './entities/user.entity';
import { IAuthProvider, ProviderAuthResult } from './auth-provider.interface';

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
  private readonly maxFailures: number;
  private readonly lockoutMinutes: number;

  constructor(
    @InjectRepository(UserEntity) private readonly users: Repository<UserEntity>,
    cfg: ConfigService,
  ) {
    // TODO(roadmap): pull these from system_settings instead of hard-coding.
    void cfg.get<AppConfig>('app');
    this.maxFailures = 5;
    this.lockoutMinutes = 15;
  }

  async authenticate(username: string, password: string): Promise<ProviderAuthResult> {
    if (!username || !password) {
      await bcrypt.compare(password || ' ', DUMMY_HASH);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    const user = await this.users.findOne({ where: { username } });

    if (!user) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    // The user record exists but belongs to a different auth backend.
    // Use a dedicated code so the registry can fall through to the next
    // provider without conflating it with a wrong password.
    if (user.authProvider !== this.key) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw new UnauthorizedException({ code: 'WRONG_PROVIDER' });
    }

    if (!user.isActive) {
      await bcrypt.compare(password, DUMMY_HASH);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      // Keep timing flat with the success branch.
      await bcrypt.compare(password, DUMMY_HASH);
      throw new ForbiddenException({ code: 'ACCOUNT_LOCKED', until: user.lockedUntil });
    }

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await this.recordFailure(user);
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }

    await this.users.update(
      { id: user.id },
      { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    );
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
  private async recordFailure(user: UserEntity): Promise<void> {
    const failed = user.failedLoginCount + 1;
    if (failed >= this.maxFailures) {
      await this.users.update(
        { id: user.id },
        {
          failedLoginCount: 0,
          lockedUntil: new Date(Date.now() + this.lockoutMinutes * 60_000),
        },
      );
    } else {
      await this.users.update({ id: user.id }, { failedLoginCount: failed });
    }
  }
}
