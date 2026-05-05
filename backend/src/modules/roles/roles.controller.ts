import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRoleDto } from './dto/upsert-role.dto';
import { SetPermissionsDto } from './dto/set-permissions.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @RequirePermissions('admin.roles:read')
  list() {
    return this.roles.list();
  }

  @Post()
  @RequirePermissions('admin.roles:manage')
  create(@Body() dto: CreateRoleDto) {
    return this.roles.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('admin.roles:manage')
  update(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.roles.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('admin.roles:manage')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.roles.remove(id);
  }

  /**
   * The permission IDs currently granted to a role. The role editor calls
   * this on selection so the grid can pre-populate — without it, admins
   * see an empty grid and accidentally wipe existing grants on save.
   */
  @Get(':id/permissions')
  @RequirePermissions('admin.roles:read')
  async getPermissions(@Param('id') id: string): Promise<{ permissionIds: string[] }> {
    return { permissionIds: await this.roles.getPermissionIds(id) };
  }

  @Post(':id/permissions')
  @RequirePermissions('admin.roles:manage')
  @HttpCode(204)
  async setPermissions(@Param('id') id: string, @Body() dto: SetPermissionsDto): Promise<void> {
    await this.roles.setPermissions(id, dto.permissionIds);
  }
}
