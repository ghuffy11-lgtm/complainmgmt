import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto, ResetPasswordDto, SetUserRolesDto, UpdateUserDto } from './dto/create-user.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.type';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions('admin.users:read')
  async list(
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '25',
    @Query('departmentId') departmentId?: string,
    @Query('isActive') isActive?: string,
  ) {
    const [data, total] = await this.users.list(parseInt(page, 10), parseInt(pageSize, 10), {
      departmentId,
      isActive:
        isActive === 'true' ? true : isActive === 'false' ? false : undefined,
    });
    const memberships = await this.users.listMembershipsByUser(data.map((u) => String(u.id)));
    return {
      data: data.map((u) => this.toDto(u, memberships.get(String(u.id)) ?? [])),
      meta: { page: Number(page), pageSize: Number(pageSize), total },
    };
  }

  @Post()
  @RequirePermissions('admin.users:manage')
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    const u = await this.users.create(dto, String(actor.id));
    return this.toDto(u, await this.users.getMemberships(String(u.id)));
  }

  @Get(':id')
  @RequirePermissions('admin.users:read')
  async get(@Param('id') id: string) {
    const u = await this.users.findById(id);
    return this.toDto(u, await this.users.getMemberships(id));
  }

  @Patch(':id')
  @RequirePermissions('admin.users:manage')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const u = await this.users.update(id, dto);
    return this.toDto(u, await this.users.getMemberships(id));
  }

  @Post(':id/roles')
  @RequirePermissions('admin.users:manage')
  @HttpCode(204)
  async setRoles(
    @Param('id') id: string,
    @Body() dto: SetUserRolesDto,
    @CurrentUser() actor: AuthUser,
  ): Promise<void> {
    await this.users.setRoles(id, dto.roleIds, String(actor.id));
  }

  @Post(':id/reset-password')
  @RequirePermissions('admin.users:manage')
  @HttpCode(204)
  async resetPassword(@Param('id') id: string, @Body() dto: ResetPasswordDto): Promise<void> {
    await this.users.resetPassword(id, dto);
  }

  private toDto = (
    u: import('../auth/entities/user.entity').UserEntity,
    departmentIds: string[],
  ) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    isActive: u.isActive,
    authProvider: u.authProvider,
    departmentId: u.departmentId,
    departmentIds,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  });
}
