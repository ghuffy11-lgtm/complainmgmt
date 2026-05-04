import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { RoleEntity } from './entities/role.entity';
import { PermissionEntity } from './entities/permission.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { AuthUser } from '../auth/auth-user.type';

@Injectable()
export class PermissionsService {
  constructor(
    @InjectRepository(RoleEntity) private readonly roles: Repository<RoleEntity>,
    @InjectRepository(PermissionEntity) private readonly perms: Repository<PermissionEntity>,
    @InjectRepository(RolePermissionEntity) private readonly rolePerms: Repository<RolePermissionEntity>,
    @InjectRepository(UserRoleEntity) private readonly userRoles: Repository<UserRoleEntity>,
    private readonly dataSource: DataSource,
  ) {}

  /** Build the full AuthUser snapshot used by guards and services. */
  async materialize(user: UserEntity): Promise<AuthUser> {
    const rows = await this.dataSource.query<{ resource: string; action: string; role_key: string }[]>(
      `SELECT DISTINCT p.resource, p.action, r.key AS role_key
         FROM user_roles ur
         JOIN roles r              ON r.id = ur.role_id
         JOIN role_permissions rp  ON rp.role_id = r.id
         JOIN permissions p        ON p.id = rp.permission_id
        WHERE ur.user_id = $1`,
      [user.id],
    );
    const permissions = new Set<string>();
    const roleKeys = new Set<string>();
    for (const r of rows) {
      permissions.add(`${r.resource}:${r.action}`);
      roleKeys.add(r.role_key);
    }
    return {
      id: Number(user.id),
      username: user.username,
      displayName: user.displayName,
      roleKeys: Array.from(roleKeys),
      permissions,
    };
  }

  listAllPermissions(): Promise<PermissionEntity[]> {
    return this.perms.find({ order: { resource: 'ASC', action: 'ASC' } });
  }

  listAllRoles(): Promise<RoleEntity[]> {
    return this.roles.find({ order: { name: 'ASC' } });
  }

  /** Replace a role's permission set atomically. */
  async setRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      await em.delete(RolePermissionEntity, { roleId });
      if (permissionIds.length === 0) return;
      await em.insert(
        RolePermissionEntity,
        permissionIds.map((permissionId) => ({ roleId, permissionId })),
      );
    });
  }

  /** Replace a user's role set atomically. */
  async setUserRoles(userId: string, roleIds: string[], assignedBy: string | null): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      await em.delete(UserRoleEntity, { userId });
      if (roleIds.length === 0) return;
      await em.insert(
        UserRoleEntity,
        roleIds.map((roleId) => ({ userId, roleId, assignedBy })),
      );
    });
  }
}
