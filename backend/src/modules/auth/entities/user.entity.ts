import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'users' })
export class UserEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'citext' })
  username!: string;

  @Index({ unique: true })
  @Column({ type: 'citext', nullable: true })
  email!: string | null;

  @Column({ name: 'display_name', type: 'text' })
  displayName!: string;

  /**
   * The user's "home" department, used by the scoped user dashboard. Nullable
   * for admins / managers / users who legitimately span departments.
   */
  @Column({ name: 'department_id', type: 'bigint', nullable: true })
  departmentId!: string | null;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  @Column({ name: 'auth_provider', type: 'text', default: 'local' })
  authProvider!: 'local' | 'ldap';

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'failed_login_count', type: 'int', default: 0 })
  failedLoginCount!: number;

  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
