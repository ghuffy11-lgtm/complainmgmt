import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RoleEntity } from '../permissions/entities/role.entity';
import { PermissionsService } from '../permissions/permissions.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/upsert-role.dto';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(RoleEntity) private readonly roles: Repository<RoleEntity>,
    private readonly permissions: PermissionsService,
  ) {}

  list() {
    return this.permissions.listAllRoles();
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
