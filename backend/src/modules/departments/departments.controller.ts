import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { DepartmentsService } from './departments.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

class CreateDepartmentDto {
  @IsString() @MinLength(2) @MaxLength(60) @Matches(/^[a-z][a-z0-9_]*$/) key!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
}

class UpdateDepartmentDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly svc: DepartmentsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Post()
  @RequirePermissions('admin.departments:manage')
  create(@Body() dto: CreateDepartmentDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('admin.departments:manage')
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    return this.svc.update(id, dto);
  }
}
