import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Brackets } from 'typeorm';
import { AuthAuditEvent, AuthAuditLogEntity } from './entities/auth-audit-log.entity';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { DisplayNamesService } from '../display-names/display-names.service';

const SUCCESS_EVENTS: AuthAuditEvent[] = ['login.success', 'login.2fa_success'];
const FAILURE_EVENTS: AuthAuditEvent[] = [
  'login.password_failed',
  'login.unknown_user',
  'login.account_locked',
  'login.inactive',
  'login.wrong_provider',
  'login.2fa_failed',
];

@Controller('admin/auth-audit')
export class AuthAuditController {
  constructor(
    @InjectRepository(AuthAuditLogEntity) private readonly repo: Repository<AuthAuditLogEntity>,
    private readonly names: DisplayNamesService,
  ) {}

  /**
   * GET /admin/auth-audit
   *
   * Filters (all optional):
   *   - username        exact match (case-sensitive — usernames are stored as entered)
   *   - ip              exact match
   *   - event           single event key OR comma-separated list
   *   - success         shortcut: 'true' → success events only, 'false' → failure events only
   *                     ignored if `event` is also provided
   *   - from / to       ISO date or datetime, inclusive on `occurred_at`
   *   - page / pageSize default 1 / 100, pageSize capped at 500
   *
   * Returns: { data: [...rows with actorDisplayName], meta: { page, pageSize, total } }
   *
   * The Login Activity admin page (T-404) consumes this endpoint.
   */
  @Get()
  @RequirePermissions('auth_audit:read')
  async list(
    @Query('username') username?: string,
    @Query('ip') ip?: string,
    @Query('event') event?: string,
    @Query('success') success?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '100',
  ) {
    const qb = this.repo
      .createQueryBuilder('a')
      .orderBy('a.occurred_at', 'DESC')
      .addOrderBy('a.id', 'DESC');

    if (username) qb.andWhere('a.username = :username', { username });
    if (ip) qb.andWhere('a.ip = :ip::inet', { ip });

    if (event) {
      const list = event.split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length === 1) qb.andWhere('a.event = :event', { event: list[0] });
      else if (list.length > 1) qb.andWhere('a.event IN (:...events)', { events: list });
    } else if (success === 'true') {
      qb.andWhere('a.event IN (:...successEvents)', { successEvents: SUCCESS_EVENTS });
    } else if (success === 'false') {
      qb.andWhere('a.event IN (:...failureEvents)', { failureEvents: FAILURE_EVENTS });
    }

    if (from || to) {
      qb.andWhere(
        new Brackets((b) => {
          if (from) b.andWhere('a.occurred_at >= :from', { from });
          if (to) b.andWhere('a.occurred_at <= :to', { to });
        }),
      );
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.min(500, Math.max(1, parseInt(pageSize, 10) || 100));
    qb.skip((p - 1) * ps).take(ps);

    const [rows, total] = await qb.getManyAndCount();

    // Resolve user_id → display name where present. The audit row records
    // `username` directly so display name is purely a UX nicety.
    const userIds = Array.from(
      new Set(rows.map((r) => r.userId).filter((v): v is string => v != null)),
    );
    const nameMap = userIds.length > 0 ? await this.names.usersByIds(userIds) : new Map();

    const data = rows.map((r) => ({
      id: r.id,
      occurredAt: r.occurredAt,
      username: r.username,
      userId: r.userId,
      userDisplayName: r.userId ? (nameMap.get(r.userId)?.displayName ?? null) : null,
      event: r.event,
      ip: r.ip,
      userAgent: r.userAgent,
      detail: r.detail ?? null,
    }));

    return { data, meta: { page: p, pageSize: ps, total } };
  }
}
