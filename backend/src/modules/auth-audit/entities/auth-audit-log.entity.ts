import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type AuthAuditEvent =
  | 'login.success'
  | 'login.password_failed'
  | 'login.unknown_user'
  | 'login.account_locked'
  | 'login.inactive'
  | 'login.wrong_provider'
  | 'login.2fa_success'
  | 'login.2fa_failed'
  | 'account.locked'
  | 'account.unlocked_by_admin'
  | '2fa.enrolled'
  | '2fa.disabled'
  | '2fa.reset_by_admin'
  | 'logout'
  | 'password_changed';

@Entity({ name: 'auth_audit_log' })
export class AuthAuditLogEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @CreateDateColumn({ name: 'occurred_at', type: 'timestamptz' })
  occurredAt!: Date;

  @Column({ type: 'text' })
  username!: string;

  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId!: string | null;

  @Column({ type: 'text' })
  event!: AuthAuditEvent;

  // Stored as Postgres `inet`. TypeORM round-trips it as a string.
  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  detail!: unknown;
}
