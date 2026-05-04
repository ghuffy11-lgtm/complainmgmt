import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RoleEntity } from './entities/role.entity';
import { PermissionEntity } from './entities/permission.entity';
import { UserRoleEntity } from './entities/user-role.entity';
import { RolePermissionEntity } from './entities/role-permission.entity';
import { PermissionsService } from './permissions.service';
import { PermissionsController } from './permissions.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([RoleEntity, PermissionEntity, UserRoleEntity, RolePermissionEntity])],
  providers: [PermissionsService],
  controllers: [PermissionsController],
  exports: [PermissionsService, TypeOrmModule],
})
export class PermissionsModule {}
