import { Controller, ForbiddenException, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { ComplaintEntity } from '../complaints/entities/complaint.entity';
import { RequireAnyPermission } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.type';
import { hasPermission } from '../permissions/permission-resolver';

/**
 * Dashboard endpoints support two access tiers:
 *
 *   * `dashboard:read`     — full picture (all departments). Manager/admin.
 *   * `dashboard.own:read` — scoped to the caller's `departmentId`. Granted
 *                            to supervisor + employee. The endpoint forces
 *                            the filter regardless of any client query
 *                            param, so non-managers can't peek across.
 *
 * Callers with `dashboard:read` may *optionally* request a specific
 * department via `?departmentId=…` to narrow the full dashboard.
 */
@Controller('dashboard')
export class DashboardController {
  constructor(@InjectRepository(ComplaintEntity) private readonly complaints: Repository<ComplaintEntity>) {}

  /** Resolves the effective department filter for the request. Throws when
   *  a scoped user has no home department to scope to. */
  private resolveScope(actor: AuthUser, requested?: string): string | null {
    const hasFullAccess = hasPermission(actor.permissions, 'dashboard:read');
    if (hasFullAccess) {
      return requested && requested.trim() ? requested : null;
    }
    if (!actor.departmentId) {
      throw new ForbiddenException({
        code: 'NO_HOME_DEPARTMENT',
        hint: 'Ask an admin to set your home department.',
      });
    }
    return actor.departmentId;
  }

  /** Apply the scope to a query builder. */
  private scoped<T extends ComplaintEntity>(
    qb: SelectQueryBuilder<T>,
    deptId: string | null,
  ): SelectQueryBuilder<T> {
    if (deptId !== null) qb.andWhere('c.assigned_department_id = :scopeDept', { scopeDept: deptId });
    return qb;
  }

  @Get('summary')
  @RequireAnyPermission('dashboard:read', 'dashboard.own:read')
  async summary(@CurrentUser() actor: AuthUser, @Query('departmentId') departmentId?: string) {
    const dept = this.resolveScope(actor, departmentId);
    const total = await this.scoped(this.complaints.createQueryBuilder('c'), dept).getCount();
    const open = await this.scoped(
      this.complaints.createQueryBuilder('c').where('c.status IN (:...active)', { active: ['open', 'in_progress'] }),
      dept,
    ).getCount();
    const high = await this.scoped(
      this.complaints.createQueryBuilder('c').where('c.priority IN (:...hi)', { hi: ['high', 'critical'] }),
      dept,
    ).getCount();
    return { total, open, highPriority: high, scopedToDepartmentId: dept };
  }

  @Get('by-status')
  @RequireAnyPermission('dashboard:read', 'dashboard.own:read')
  byStatus(@CurrentUser() actor: AuthUser, @Query('departmentId') departmentId?: string) {
    const dept = this.resolveScope(actor, departmentId);
    return this.scoped(
      this.complaints.createQueryBuilder('c')
        .select('c.status', 'status').addSelect('COUNT(*)::int', 'count')
        .groupBy('c.status'),
      dept,
    ).getRawMany<{ status: string; count: number }>();
  }

  @Get('by-priority')
  @RequireAnyPermission('dashboard:read', 'dashboard.own:read')
  byPriority(@CurrentUser() actor: AuthUser, @Query('departmentId') departmentId?: string) {
    const dept = this.resolveScope(actor, departmentId);
    return this.scoped(
      this.complaints.createQueryBuilder('c')
        .select('c.priority', 'priority').addSelect('COUNT(*)::int', 'count')
        .groupBy('c.priority'),
      dept,
    ).getRawMany<{ priority: string; count: number }>();
  }

  @Get('by-department')
  @RequireAnyPermission('dashboard:read', 'dashboard.own:read')
  byDepartment(@CurrentUser() actor: AuthUser, @Query('departmentId') departmentId?: string) {
    const dept = this.resolveScope(actor, departmentId);
    return this.scoped(
      this.complaints.createQueryBuilder('c')
        .select('c.assigned_department_id', 'departmentId').addSelect('COUNT(*)::int', 'count')
        .groupBy('c.assigned_department_id'),
      dept,
    ).getRawMany<{ departmentId: string | null; count: number }>();
  }

  @Get('by-date')
  @RequireAnyPermission('dashboard:read', 'dashboard.own:read')
  async byDate(
    @CurrentUser() actor: AuthUser,
    @Query('days') daysParam = '90',
    @Query('departmentId') departmentId?: string,
  ) {
    const dept = this.resolveScope(actor, departmentId);
    const days = Math.min(365, Math.max(1, parseInt(daysParam, 10) || 90));
    const rows = await this.scoped(
      this.complaints.createQueryBuilder('c')
        .select(`to_char(c.complaint_date, 'YYYY-MM-DD')`, 'date')
        .addSelect('COUNT(*)::int', 'count')
        .where('c.complaint_date IS NOT NULL')
        .andWhere(`c.complaint_date >= CURRENT_DATE - :days * INTERVAL '1 day'`, { days })
        .groupBy('c.complaint_date')
        .orderBy('c.complaint_date', 'ASC'),
      dept,
    ).getRawMany<{ date: string; count: number }>();
    return { days, data: rows };
  }

  @Get('aging')
  @RequireAnyPermission('dashboard:read', 'dashboard.own:read')
  async aging(@CurrentUser() actor: AuthUser, @Query('departmentId') departmentId?: string) {
    const dept = this.resolveScope(actor, departmentId);
    const rows = await this.scoped(
      this.complaints.createQueryBuilder('c')
        .select(
          `CASE
              WHEN AGE(NOW(), c.created_at) < INTERVAL '1 day'  THEN '0-1d'
              WHEN AGE(NOW(), c.created_at) < INTERVAL '7 days' THEN '1-7d'
              WHEN AGE(NOW(), c.created_at) < INTERVAL '30 days' THEN '7-30d'
              ELSE '30d+'
           END`,
          'bucket',
        )
        .addSelect('COUNT(*)::int', 'count')
        .where('c.status IN (:...active)', { active: ['open', 'in_progress'] })
        .groupBy('bucket'),
      dept,
    ).getRawMany<{ bucket: string; count: number }>();

    const ORDER = ['0-1d', '1-7d', '7-30d', '30d+'];
    const byBucket = new Map(rows.map((r) => [r.bucket, r.count]));
    return ORDER.map((b) => ({ bucket: b, count: byBucket.get(b) ?? 0 }));
  }

  @Get('resolution-latency')
  @RequireAnyPermission('dashboard:read', 'dashboard.own:read')
  async resolutionLatency(
    @CurrentUser() actor: AuthUser,
    @Query('days') daysParam = '90',
    @Query('departmentId') departmentId?: string,
  ) {
    const dept = this.resolveScope(actor, departmentId);
    const days = Math.min(365, Math.max(1, parseInt(daysParam, 10) || 90));

    const params: unknown[] = [days];
    let scopeClause = '';
    if (dept !== null) {
      scopeClause = ' AND c.assigned_department_id = $2';
      params.push(dept);
    }

    const perComplaint = await this.complaints.manager.query<
      Array<{ hours: number; resolved_week: string }>
    >(
      `WITH resolutions AS (
         SELECT
           c.id, c.created_at,
           MIN(a.occurred_at) AS resolved_at
         FROM complaints c
         JOIN complaint_audit_log a
           ON a.complaint_id = c.id
          AND a.field_key = '__status__'
          AND a.new_value::text = ('"' || c.status || '"')
         WHERE c.status IN ('resolved', 'closed')${scopeClause}
         GROUP BY c.id, c.created_at
       )
       SELECT
         EXTRACT(EPOCH FROM (resolved_at - created_at)) / 3600.0 AS hours,
         to_char(date_trunc('week', resolved_at), 'YYYY-MM-DD') AS resolved_week
       FROM resolutions
       WHERE resolved_at >= CURRENT_DATE - $1 * INTERVAL '1 day'`,
      params,
    );

    if (perComplaint.length === 0) {
      return { days, count: 0, avgHours: null, medianHours: null, p95Hours: null, perWeek: [] };
    }

    const hours = perComplaint.map((r) => Number(r.hours)).sort((a, b) => a - b);
    const avg = hours.reduce((s, h) => s + h, 0) / hours.length;
    const median = pct(hours, 0.5);
    const p95 = pct(hours, 0.95);

    const byWeek = new Map<string, number[]>();
    for (const row of perComplaint) {
      const wk = row.resolved_week;
      const arr = byWeek.get(wk) ?? [];
      arr.push(Number(row.hours));
      byWeek.set(wk, arr);
    }
    const perWeek = [...byWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, h]) => ({
        week,
        count: h.length,
        avgHours: round1(h.reduce((s, x) => s + x, 0) / h.length),
      }));

    return {
      days,
      count: hours.length,
      avgHours: round1(avg),
      medianHours: round1(median),
      p95Hours: round1(p95),
      perWeek,
    };
  }
}

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
