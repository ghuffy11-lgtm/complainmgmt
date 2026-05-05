import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PermissionsModule } from '../permissions/permissions.module';
import { UserDepartmentEntity } from '../auth/entities/user-department.entity';
import { DepartmentEntity } from '../departments/entities/department.entity';

@Module({
  imports: [
    PermissionsModule,
    // UserEntity is registered globally via AuthModule. UserDepartmentEntity
    // is needed here because UsersService writes membership rows; the
    // DepartmentEntity repo is used for input validation (existence + active).
    TypeOrmModule.forFeature([UserDepartmentEntity, DepartmentEntity]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
