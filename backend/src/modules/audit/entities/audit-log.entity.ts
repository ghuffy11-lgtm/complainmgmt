import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type AuditAction =
  | 'create'
  | 'update'
  | 'delete'
  | 'assign'
  | 'lock_override'
  | 'attachment.added'
  | 'attachment.removed'
  | 'password_reset_by_admin'
  | 'role_permissions_changed'
  | 'settings_changed'
  | 'reopen';

@Entity({ name: 'complaint_audit_log' })
export class AuditLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'complaint_id', type: 'bigint', nullable: true })
  complaintId!: string | null;

  @Column({ name: 'field_key', type: 'text', nullable: true })
  fieldKey!: string | null;

  @Column({ type: 'text' })
  action!: AuditAction;

  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue!: unknown;

  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue!: unknown;

  @Column({ name: 'actor_id', type: 'bigint', nullable: true })
  actorId!: string | null;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'text', nullable: true })
  note!: string | null;
}
