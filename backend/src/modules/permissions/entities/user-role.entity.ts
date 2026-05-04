import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'user_roles' })
export class UserRoleEntity {
  @PrimaryColumn({ name: 'user_id', type: 'bigint' })
  userId!: string;

  @PrimaryColumn({ name: 'role_id', type: 'bigint' })
  roleId!: string;

  @Column({ name: 'assigned_by', type: 'bigint', nullable: true })
  assignedBy!: string | null;

  @Column({ name: 'assigned_at', type: 'timestamptz', default: () => 'NOW()' })
  assignedAt!: Date;
}
