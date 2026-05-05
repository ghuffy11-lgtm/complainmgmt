import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AssignmentHistoryEntity } from './entities/assignment-history.entity';
import { AssignmentsService } from './assignments.service';
import { AssignmentsController } from './assignments.controller';
import { DepartmentsModule } from '../departments/departments.module';
import { UserDepartmentEntity } from '../auth/entities/user-department.entity';

// TODO(T-063): frontend dialog + history view.

@Module({
  imports: [
    TypeOrmModule.forFeature([AssignmentHistoryEntity, UserDepartmentEntity]),
    DepartmentsModule,
  ],
  providers: [AssignmentsService],
  controllers: [AssignmentsController],
  exports: [AssignmentsService, TypeOrmModule],
})
export class AssignmentsModule {}
