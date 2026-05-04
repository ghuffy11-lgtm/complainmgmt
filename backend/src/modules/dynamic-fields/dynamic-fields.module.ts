import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DynamicFieldEntity } from './entities/dynamic-field.entity';
import { DynamicFieldOptionEntity } from './entities/dynamic-field-option.entity';
import { DynamicFieldsService } from './dynamic-fields.service';
import {
  AdminDynamicFieldsController,
  DynamicFieldsController,
} from './dynamic-fields.controller';

@Module({
  imports: [TypeOrmModule.forFeature([DynamicFieldEntity, DynamicFieldOptionEntity])],
  providers: [DynamicFieldsService],
  controllers: [DynamicFieldsController, AdminDynamicFieldsController],
  exports: [DynamicFieldsService, TypeOrmModule],
})
export class DynamicFieldsModule {}
