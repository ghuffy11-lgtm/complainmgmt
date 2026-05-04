import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AuditAction, AuditLogEntity } from './entities/audit-log.entity';

export type AuditChange = {
  em: EntityManager;
  complaintId: string | null;
  fieldKey: string | null;
  action: AuditAction;
  oldValue: unknown;
  newValue: unknown;
  actorId: string | null;
  note?: string;
};

type AuditInsertRow = {
  complaintId: string | null;
  fieldKey: string | null;
  action: AuditAction;
  oldValue: unknown;
  newValue: unknown;
  actorId: string | null;
  note: string | null;
};

@Injectable()
export class AuditService {
  /**
   * Single source of truth for audit writes. EVERY mutating service should
   * call this exactly once per change, inside the same transaction.
   */
  async recordChange(c: AuditChange): Promise<void> {
    const row: AuditInsertRow = {
      complaintId: c.complaintId,
      fieldKey: c.fieldKey,
      action: c.action,
      oldValue: c.oldValue ?? null,
      newValue: c.newValue ?? null,
      actorId: c.actorId,
      note: c.note ?? null,
    };
    // QueryDeepPartialEntity recurses through the `unknown` JSONB columns and
    // produces a type ({} | null) that doesn't structurally match. The
    // column accepts any JSON-encodable value at runtime, so we cast at the
    // edge — this is a TypeORM typing nuance, not a correctness issue.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await c.em.getRepository(AuditLogEntity).insert(row as any);
  }

  async recordChanges(em: EntityManager, list: Omit<AuditChange, 'em'>[]): Promise<void> {
    if (list.length === 0) return;
    const rows: AuditInsertRow[] = list.map((c) => ({
      complaintId: c.complaintId,
      fieldKey: c.fieldKey,
      action: c.action,
      oldValue: c.oldValue ?? null,
      newValue: c.newValue ?? null,
      actorId: c.actorId,
      note: c.note ?? null,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await em.getRepository(AuditLogEntity).insert(rows as any);
  }
}
