import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { SubcategoriesService } from './subcategories.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

class CreateSubcategoryDto {
  @IsString() @MinLength(2) @MaxLength(60) @Matches(/^[a-z][a-z0-9_]*$/) key!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
}

class UpdateSubcategoryDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller()
export class SubcategoriesController {
  constructor(private readonly svc: SubcategoriesService) {}

  @Get('departments/:id/subcategories')
  list(@Param('id') id: string) {
    return this.svc.listForDepartment(id);
  }

  @Post('departments/:id/subcategories')
  @RequirePermissions('admin.departments:manage')
  create(@Param('id') id: string, @Body() dto: CreateSubcategoryDto) {
    return this.svc.create(id, dto);
  }

  @Get('subcategories')
  flat(@Query('departmentId') departmentId?: string, @Query('active') active?: string) {
    if (departmentId) return this.svc.listForDepartment(departmentId);
    return this.svc.listAll({
      active: active === 'true' ? true : active === 'false' ? false : undefined,
    });
  }

  @Patch('subcategories/:id')
  @RequirePermissions('admin.departments:manage')
  update(@Param('id') id: string, @Body() dto: UpdateSubcategoryDto) {
    return this.svc.update(id, dto);
  }
}
