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
    const [permRows, deptRows] = await Promise.all([
      this.dataSource.query<{ resource: string; action: string; role_key: string }[]>(
        `SELECT DISTINCT p.resource, p.action, r.key AS role_key
           FROM user_roles ur
           JOIN roles r              ON r.id = ur.role_id
           JOIN role_permissions rp  ON rp.role_id = r.id
           JOIN permissions p        ON p.id = rp.permission_id
          WHERE ur.user_id = $1`,
        [user.id],
      ),
      this.dataSource.query<{ department_id: string }[]>(
        `SELECT department_id FROM user_departments
          WHERE user_id = $1 AND is_active = TRUE`,
        [user.id],
      ),
    ]);
    const permissions = new Set<string>();
    const roleKeys = new Set<string>();
    for (const r of permRows) {
      permissions.add(`${r.resource}:${r.action}`);
      roleKeys.add(r.role_key);
    }
    return {
      id: Number(user.id),
      username: user.username,
      displayName: user.displayName,
      departmentId: user.departmentId,
      departmentIds: deptRows.map((d) => String(d.department_id)),
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

  /** Replace a user's role set atomically. Pass an existing EntityManager
   *  to enlist in the caller's transaction (e.g. UsersService.create has
   *  to hand its `em` in so the role rows see the still-uncommitted user
   *  row — without that, the FK fires). When called standalone (from
   *  users-controller's POST /:id/roles), it spins its own transaction. */
  async setUserRoles(
    userId: string,
    roleIds: string[],
    assignedBy: string | null,
    em?: import('typeorm').EntityManager,
  ): Promise<void> {
    const work = async (m: import('typeorm').EntityManager) => {
      await m.delete(UserRoleEntity, { userId });
      if (roleIds.length === 0) return;
      await m.insert(
        UserRoleEntity,
        roleIds.map((roleId) => ({ userId, roleId, assignedBy })),
      );
    };
    if (em) return work(em);
    await this.dataSource.transaction(work);
  }
}
