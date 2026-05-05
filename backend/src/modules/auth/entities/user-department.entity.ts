import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * User ↔ department membership. A user can belong to N departments;
 * `is_active = false` revokes access without deleting the historical row.
 *
 * The "primary" department remains on `users.department_id` (must be one of
 * the user's active memberships — enforced by a DB trigger; see migration
 * 0017).
 */
@Entity({ name: 'user_departments' })
@Index('idx_user_departments_user_active', ['userId'])
@Index('idx_user_departments_dept_active', ['departmentId'])
export class UserDepartmentEntity {
  @PrimaryColumn({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @PrimaryColumn({ name: 'department_id', type: 'bigint' })
  departmentId!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
