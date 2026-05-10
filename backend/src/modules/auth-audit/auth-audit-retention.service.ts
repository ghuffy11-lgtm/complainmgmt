import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { AuthAuditLogEntity } from './entities/auth-audit-log.entity';
import { SystemSettingEntity } from '../admin/system-settings.entity';

/**
 * Nightly cleanup of stale `auth_audit_log` rows.
 *
 * The retention window is configured by the `auth_audit.retention_days`
 * key in `system_settings` (seeded to 365 by migration 0028; admins
 * can change it via the Settings page). A value of 0 disables deletion
 * — the table grows forever — so operators with regulatory archival
 * requirements can opt out without code changes.
 *
 * Scheduled for 03:00 UTC nightly: low-traffic for our deploy and not
 * colliding with the existing daily backup window.
 *
 * Privilege note: the `auth_audit_log` table is set up for a prod-style
 * privilege split (see 0022, 0009) where the application role has only
 * INSERT/SELECT. In dev (where the app role owns the table) the DELETE
 * succeeds via owner privileges. In prod with the split applied, the
 * operator must grant DELETE to the app role OR run a separate
 * maintenance job. Either way this service logs what it did so the
 * effect is auditable from the application logs.
 */
@Injectable()
export class AuthAuditRetentionService {
  private readonly log = new Logger(AuthAuditRetentionService.name);

  constructor(
    @InjectRepository(AuthAuditLogEntity)
    private readonly audit: Repository<AuthAuditLogEntity>,
    @InjectRepository(SystemSettingEntity)
    private readonly settings: Repository<SystemSettingEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /** 03:00 UTC nightly. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, { name: 'auth-audit-retention', timeZone: 'UTC' })
  async runScheduled(): Promise<void> {
    await this.run().catch((err) => {
      this.log.error({ err }, 'auth-audit retention job failed');
    });
  }

  /** Exposed for ad-hoc invocation (tests, manual runs). */
  async run(): Promise<{ deleted: number; days: number } | { skipped: 'disabled' | 'unset' }> {
    const days = await this.resolveRetentionDays();
    if (days === null) return { skipped: 'unset' };
    if (days <= 0) return { skipped: 'disabled' };
    const cutoff = new Date(Date.now() - days * 86_400_000);
    // The append-only BEFORE DELETE trigger from migration 0022 (loosened
    // in 0029) raises 'auth_audit_log is append-only' unless the caller
    // sets `app.allow_audit_delete = 'true'` for the current transaction.
    // SET LOCAL keeps the flag scoped — it never leaks across
    // connections or to subsequent transactions on the same connection.
    const deleted = await this.dataSource.transaction(async (em) => {
      await em.query("SET LOCAL app.allow_audit_delete = 'true'");
      const result = await em.delete(AuthAuditLogEntity, { occurredAt: LessThan(cutoff) });
      return result.affected ?? 0;
    });
    if (deleted > 0) {
      this.log.log(
        { deleted, retentionDays: days, cutoff: cutoff.toISOString() },
        'auth-audit retention pruned old rows',
      );
    }
    return { deleted, days };
  }

  private async resolveRetentionDays(): Promise<number | null> {
    const row = await this.settings.findOne({ where: { key: 'auth_audit.retention_days' } });
    if (!row) return null;
    const v = row.value;
    if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.floor(v));
    if (typeof v === 'string' && /^\d+$/.test(v)) return parseInt(v, 10);
    this.log.warn({ value: v }, 'invalid auth_audit.retention_days; treating as unset');
    return null;
  }
}
