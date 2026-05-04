import { Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'role_permissions' })
export class RolePermissionEntity {
  @PrimaryColumn({ name: 'role_id', type: 'bigint' })
  roleId!: string;

  @PrimaryColumn({ name: 'permission_id', type: 'bigint' })
  permissionId!: string;
}
