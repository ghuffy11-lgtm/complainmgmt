import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'user_backup_codes' })
@Index(['userId'])
export class UserBackupCodeEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'user_id', type: 'bigint' })
  userId!: string;

  /** bcrypt hash of the plaintext code — the plaintext is shown once
   *  at enrollment and then never again. */
  @Column({ name: 'code_hash', type: 'text' })
  codeHash!: string;

  /** Set on consumption; single-use semantics. */
  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
