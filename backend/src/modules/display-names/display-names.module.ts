import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserEntity } from '../auth/entities/user.entity';
import { DepartmentEntity } from '../departments/entities/department.entity';
import { DisplayNamesService } from './display-names.service';

/**
 * Global so audit + assignment history controllers can inject without
 * pulling in the whole UsersModule / DepartmentsModule.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, DepartmentEntity])],
  providers: [DisplayNamesService],
  exports: [DisplayNamesService],
})
export class DisplayNamesModule {}
