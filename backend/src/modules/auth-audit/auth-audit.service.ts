import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthAuditEvent, AuthAuditLogEntity } from './entities/auth-audit-log.entity';

export type AuthAuditContext = {
  username: string;
  userId?: string | null;
  event: AuthAuditEvent;
  ip?: string | null;
  userAgent?: string | null;
  detail?: Record<string, unknown> | null;
};

@Injectable()
export class AuthAuditService {
  private readonly log = new Logger(AuthAuditService.name);

  constructor(
    @InjectRepository(AuthAuditLogEntity)
    private readonly repo: Repository<AuthAuditLogEntity>,
  ) {}

  /**
   * Record an authentication-related event. NEVER throws — a failure to
   * persist the audit row must not break the login / 2FA / admin flow that
   * called us. We log a warning and move on; the row is lost but the user
   * can still authenticate. Append-only enforcement at the DB level means
   * we can't accidentally corrupt prior history.
   */
  async record(ctx: AuthAuditContext): Promise<void> {
    const row = {
      username: ctx.username,
      userId: ctx.userId ?? null,
      event: ctx.event,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      detail: ctx.detail ?? null,
    };
    try {
      // QueryDeepPartialEntity recurses through `detail: unknown` and
      // produces a type that doesn't structurally match. The column accepts
      // any JSON-encodable value at runtime. Same pattern as AuditService.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.repo.insert(row as any);
    } catch (err) {
      this.log.warn(
        { err, event: ctx.event, username: ctx.username },
        'auth_audit_log insert failed; continuing',
      );
    }
  }
}
