import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ComplaintEntity } from './entities/complaint.entity';
import { ComplaintFieldValueEntity } from './entities/complaint-field-value.entity';
import { ComplaintsService } from './complaints.service';
import { ComplaintsController } from './complaints.controller';
import { LockingService } from './locking.service';
import { ReferenceNumberService } from './reference-number.service';
import { DynamicFieldsModule } from '../dynamic-fields/dynamic-fields.module';
import { AssignmentsModule } from '../assignments/assignments.module';
import { SubcategoriesModule } from '../subcategories/subcategories.module';
import { OriginsModule } from '../origins/origins.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ComplaintEntity, ComplaintFieldValueEntity]),
    DynamicFieldsModule,
    AssignmentsModule,
    SubcategoriesModule,
    OriginsModule,
  ],
  providers: [ComplaintsService, LockingService, ReferenceNumberService],
  controllers: [ComplaintsController],
  exports: [ComplaintsService, TypeOrmModule],
})
export class ComplaintsModule {}
