import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubcategoryEntity } from './entities/subcategory.entity';
import { SubcategoriesService } from './subcategories.service';
import { SubcategoriesController } from './subcategories.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SubcategoryEntity])],
  providers: [SubcategoriesService],
  controllers: [SubcategoriesController],
  exports: [SubcategoriesService, TypeOrmModule],
})
export class SubcategoriesModule {}
