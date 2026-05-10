import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto, ResetPasswordDto, SetUserRolesDto, UpdateUserDto } from './dto/create-user.dto';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.type';
import { PermissionsService } from '../permissions/permissions.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly permissions: PermissionsService,
  ) {}

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
    const ids = data.map((u) => String(u.id));
    const [memberships, roleIds] = await Promise.all([
      this.users.listMembershipsByUser(ids),
      this.permissions.listRoleIdsByUser(ids),
    ]);
    return {
      data: data.map((u) =>
        this.toDto(u, memberships.get(String(u.id)) ?? [], roleIds.get(String(u.id)) ?? []),
      ),
      meta: { page: Number(page), pageSize: Number(pageSize), total },
    };
  }

  @Post()
  @RequirePermissions('admin.users:manage')
  async create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    const u = await this.users.create(dto, String(actor.id));
    const [memberships, roleIds] = await Promise.all([
      this.users.getMemberships(String(u.id)),
      this.permissions.getRoleIdsForUser(String(u.id)),
    ]);
    return this.toDto(u, memberships, roleIds);
  }

  @Get(':id')
  @RequirePermissions('admin.users:read')
  async get(@Param('id') id: string) {
    const u = await this.users.findById(id);
    const [memberships, roleIds] = await Promise.all([
      this.users.getMemberships(id),
      this.permissions.getRoleIdsForUser(id),
    ]);
    return this.toDto(u, memberships, roleIds);
  }

  @Patch(':id')
  @RequirePermissions('admin.users:manage')
  async update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    const u = await this.users.update(id, dto);
    const [memberships, roleIds] = await Promise.all([
      this.users.getMemberships(id),
      this.permissions.getRoleIdsForUser(id),
    ]);
    return this.toDto(u, memberships, roleIds);
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

  @Post(':id/unlock')
  @RequirePermissions('user:unlock')
  @HttpCode(200)
  async unlock(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ): Promise<{ unlocked: boolean }> {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const result = await this.users.unlock(id, String(actor.id), {
      ip,
      userAgent: req.headers['user-agent'],
    });
    return { unlocked: result.unlocked };
  }

  @Post(':id/reset-2fa')
  @RequirePermissions('user:reset_2fa')
  @HttpCode(200)
  async resetTwoFactor(
    @Param('id') id: string,
    @CurrentUser() actor: AuthUser,
    @Req() req: Request,
  ): Promise<{ wasEnrolled: boolean }> {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    return this.users.resetTwoFactor(id, String(actor.id), {
      ip,
      userAgent: req.headers['user-agent'],
    });
  }

  private toDto = (
    u: import('../auth/entities/user.entity').UserEntity,
    departmentIds: string[],
    roleIds: string[],
  ) => ({
    id: u.id,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    isActive: u.isActive,
    authProvider: u.authProvider,
    departmentId: u.departmentId,
    departmentIds,
    roleIds,
    lastLoginAt: u.lastLoginAt,
    lockedUntil: u.lockedUntil,
    failedLoginCount: u.failedLoginCount,
    twoFactorEnrolled: !!u.totpEnrolledAt,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  });
}
