import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { OriginsService } from './origins.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

class CreateOriginDto {
  @IsString() @MinLength(2) @MaxLength(60) @Matches(/^[a-z][a-z0-9_]*$/) key!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

class UpdateOriginDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

@Controller('origins')
export class OriginsController {
  constructor(private readonly svc: OriginsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Post()
  @RequirePermissions('admin.departments:manage')
  create(@Body() dto: CreateOriginDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('admin.departments:manage')
  update(@Param('id') id: string, @Body() dto: UpdateOriginDto) {
    return this.svc.update(id, dto);
  }
}
