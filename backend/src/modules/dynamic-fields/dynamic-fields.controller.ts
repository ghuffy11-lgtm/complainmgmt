import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { DynamicFieldsService } from './dynamic-fields.service';
import {
  CreateFieldDto,
  ReplaceOptionsDto,
  UpdateFieldDto,
} from './dto/upsert-field.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.type';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

/** Public schema: the form the current user is allowed to see. */
@Controller('dynamic-fields')
export class DynamicFieldsController {
  constructor(private readonly svc: DynamicFieldsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.listForUser(user);
  }
}

/** Admin: full CRUD over the schema and dropdown options. */
@Controller('admin/dynamic-fields')
export class AdminDynamicFieldsController {
  constructor(private readonly svc: DynamicFieldsService) {}

  @Get()
  @RequirePermissions('admin.fields:manage')
  list() {
    return this.svc.fullSchema();
  }

  @Get(':id')
  @RequirePermissions('admin.fields:manage')
  get(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  @Post()
  @RequirePermissions('admin.fields:manage')
  create(@Body() dto: CreateFieldDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('admin.fields:manage')
  update(@Param('id') id: string, @Body() dto: UpdateFieldDto) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('admin.fields:manage')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.svc.remove(id);
  }

  @Post(':id/options')
  @RequirePermissions('admin.fields:manage')
  replaceOptions(@Param('id') id: string, @Body() dto: ReplaceOptionsDto) {
    return this.svc.replaceOptions(id, dto.options);
  }
}
