import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SystemSettingEntity } from '../admin/system-settings.entity';

/**
 * Resolves the lockout policy (max failures, lockout window) from
 * `system_settings`, replacing the hardcoded constants that used to
 * live in `LocalAuthProvider`. Both password failures and 2FA failures
 * share the same thresholds and the same `users.locked_until` field.
 *
 * Reads are cached for a short TTL so a busy login spike doesn't fan
 * out into N extra SELECTs. Cache is invalidated by time only — admins
 * who change the settings will see the new values within ~30 s; for
 * "right now" they can restart the backend container.
 */
@Injectable()
export class LockoutPolicy {
  private readonly log = new Logger(LockoutPolicy.name);
  private readonly TTL_MS = 30_000;
  private cached: { at: number; maxFailures: number; windowMinutes: number } | null = null;

  /** Sensible defaults if the keys aren't set (or fail to parse). */
  private static readonly DEFAULT_MAX_FAILURES = 5;
  private static readonly DEFAULT_WINDOW_MINUTES = 15;

  constructor(
    @InjectRepository(SystemSettingEntity)
    private readonly settings: Repository<SystemSettingEntity>,
  ) {}

  async resolve(): Promise<{ maxFailures: number; windowMinutes: number }> {
    const now = Date.now();
    if (this.cached && now - this.cached.at < this.TTL_MS) {
      return { maxFailures: this.cached.maxFailures, windowMinutes: this.cached.windowMinutes };
    }
    const rows = await this.settings.find({
      where: [{ key: 'lockout.max_failed_logins' }, { key: 'lockout.duration_minutes' }],
    });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const maxFailures = this.parsePositiveInt(
      byKey.get('lockout.max_failed_logins'),
      LockoutPolicy.DEFAULT_MAX_FAILURES,
      'lockout.max_failed_logins',
    );
    const windowMinutes = this.parsePositiveInt(
      byKey.get('lockout.duration_minutes'),
      LockoutPolicy.DEFAULT_WINDOW_MINUTES,
      'lockout.duration_minutes',
    );
    this.cached = { at: now, maxFailures, windowMinutes };
    return { maxFailures, windowMinutes };
  }

  /** When the admin saves the Settings page, call this to make new
   *  thresholds take effect on the very next login. */
  invalidate(): void {
    this.cached = null;
  }

  private parsePositiveInt(value: unknown, fallback: number, label: string): number {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      const n = parseInt(value, 10);
      if (n > 0) return n;
    }
    if (value !== undefined) {
      this.log.warn({ key: label, value }, 'invalid setting value; using default');
    }
    return fallback;
  }
}
