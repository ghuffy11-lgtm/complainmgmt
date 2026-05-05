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
 */
export async function enrichAuditRows(
  rows: AuditLogEntity[],
  names: DisplayNamesService,
): Promise<EnrichedAuditEntry[]> {
  const users = await names.usersByIds(rows.map((r) => r.actorId));
  return rows.map((r) => {
    const u = r.actorId ? users.get(r.actorId) : undefined;
    return {
      id: r.id,
      complaintId: r.complaintId,
      fieldKey: r.fieldKey,
      action: r.action,
      oldValue: r.oldValue,
      newValue: r.newValue,
      actorId: r.actorId,
      actorName: u ? `${u.displayName} (${u.username})` : null,
      occurredAt: r.occurredAt,
      note: r.note,
    };
  });
}
