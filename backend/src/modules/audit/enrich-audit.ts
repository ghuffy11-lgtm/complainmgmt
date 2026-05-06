import { AuditLogEntity } from './entities/audit-log.entity';
import { DisplayNamesService } from '../display-names/display-names.service';

/**
 * Enriched audit row shape returned by the read endpoints.
 *
 * Adds `actorName` (resolved display name + username, e.g. "Administrator
 * (admin)") so the UI doesn't have to round-trip per row. The original
 * `actorId` is kept for downstream consumers that filter by it.
 */
export type EnrichedAuditEntry = {
  id: string;
  complaintId: string | null;
  fieldKey: string | null;
  action: string;
  oldValue: unknown;
  newValue: unknown;
  actorId: string | null;
  actorName: string | null;
  occurredAt: Date;
  note: string | null;
};

/**
 * Resolve every `actorId` in the page to a display string. One DB round-trip
 * for the whole batch, no N+1.
 *
 * For `assign` rows we also resolve the `departmentId` / `userId` referenced
 * inside `oldValue` / `newValue` and inject `departmentName` / `userName`
 * alongside the existing IDs — the timeline prefers names but falls back to
 * the IDs when a department or user has been removed.
 */
export async function enrichAuditRows(
  rows: AuditLogEntity[],
  names: DisplayNamesService,
): Promise<EnrichedAuditEntry[]> {
  const assignRows = rows.filter((r) => r.action === 'assign');
  const assignDeptIds: (string | null | undefined)[] = [];
  const assignUserIds: (string | null | undefined)[] = [];
  for (const r of assignRows) {
    const o = r.oldValue as { departmentId?: string | null; userId?: string | null } | null;
    const n = r.newValue as { departmentId?: string | null; userId?: string | null } | null;
    assignDeptIds.push(o?.departmentId, n?.departmentId);
    assignUserIds.push(o?.userId, n?.userId);
  }

  const [users, assignUsers, depts] = await Promise.all([
    names.usersByIds(rows.map((r) => r.actorId)),
    names.usersByIds(assignUserIds),
    names.departmentsByIds(assignDeptIds),
  ]);

  return rows.map((r) => {
    const u = r.actorId ? users.get(r.actorId) : undefined;
    return {
      id: r.id,
      complaintId: r.complaintId,
      fieldKey: r.fieldKey,
      action: r.action,
      oldValue: r.action === 'assign' ? withAssignNames(r.oldValue, depts, assignUsers) : r.oldValue,
      newValue: r.action === 'assign' ? withAssignNames(r.newValue, depts, assignUsers) : r.newValue,
      actorId: r.actorId,
      actorName: u ? `${u.displayName} (${u.username})` : null,
      occurredAt: r.occurredAt,
      note: r.note,
    };
  });
}

function withAssignNames(
  payload: unknown,
  depts: Map<string, { name: string; key: string }>,
  users: Map<string, { username: string; displayName: string }>,
): unknown {
  if (!payload || typeof payload !== 'object') return payload;
  const p = payload as { departmentId?: string | null; userId?: string | null };
  const dept = p.departmentId ? depts.get(String(p.departmentId)) : undefined;
  const user = p.userId ? users.get(String(p.userId)) : undefined;
  return {
    ...p,
    ...(dept ? { departmentName: dept.name } : {}),
    ...(user ? { userName: `${user.displayName} (${user.username})` } : {}),
  };
}
