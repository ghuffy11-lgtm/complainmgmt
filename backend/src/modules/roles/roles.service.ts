import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleEntity } from '../permissions/entities/role.entity';
import { RolePermissionEntity } from '../permissions/entities/role-permission.entity';
import { PermissionsService } from '../permissions/permissions.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/upsert-role.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RoleEntity) private readonly roles: Repository<RoleEntity>,
    @InjectRepository(RolePermissionEntity) private readonly rolePerms: Repository<RolePermissionEntity>,
    private readonly permissions: PermissionsService,
  ) {}

  list() {
    return this.permissions.listAllRoles();
  }

  /** Permission IDs currently granted to the role. Used by the editor to
   *  pre-populate the grid so admins see what's already on. */
  async getPermissionIds(roleId: string): Promise<string[]> {
    const exists = await this.roles.findOne({ where: { id: roleId } });
    if (!exists) throw new NotFoundException({ code: 'ROLE_NOT_FOUND' });
    const rows = await this.rolePerms.find({ where: { roleId } });
    return rows.map((r) => r.permissionId);
  }

  async create(dto: CreateRoleDto): Promise<RoleEntity> {
    const exists = await this.roles.findOne({ where: { key: dto.key } });
    if (exists) throw new ConflictException({ code: 'ROLE_KEY_TAKEN' });
    const role = this.roles.create({ ...dto, isSystem: false });
    return this.roles.save(role);
  }

  async update(id: string, dto: UpdateRoleDto): Promise<RoleEntity> {
    const role = await this.roles.findOne({ where: { id } });
    if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND' });
    Object.assign(role, dto);
    return this.roles.save(role);
  }

  async remove(id: string): Promise<void> {
    const role = await this.roles.findOne({ where: { id } });
    if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND' });
    if (role.isSystem) throw new BadRequestException({ code: 'ROLE_IS_SYSTEM' });
    await this.roles.delete({ id });
  }

  setPermissions(id: string, permissionIds: string[]) {
    return this.permissions.setRolePermissions(id, permissionIds);
  }
}
