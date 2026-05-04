import { Body, Controller, Get, Patch } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsObject } from 'class-validator';
import { SystemSettingEntity } from './system-settings.entity';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth-user.type';

class UpdateSettingsDto {
  @IsObject()
  values!: Record<string, unknown>;
}

@Controller('admin/settings')
export class AdminSettingsController {
  constructor(@InjectRepository(SystemSettingEntity) private readonly repo: Repository<SystemSettingEntity>) {}

  @Get()
  @RequirePermissions('admin.settings:manage')
  async list() {
    const rows = await this.repo.find();
    return rows.reduce<Record<string, unknown>>((acc, r) => ((acc[r.key] = r.value), acc), {});
  }

  @Patch()
  @RequirePermissions('admin.settings:manage')
  async update(@Body() dto: UpdateSettingsDto, @CurrentUser() actor: AuthUser) {
    for (const [key, value] of Object.entries(dto.values)) {
      const row = (await this.repo.findOne({ where: { key } })) ?? this.repo.create({ key });
      row.value = value;
      row.updatedBy = String(actor.id);
      await this.repo.save(row);
      // TODO(T-081): emit AuditService.recordChange action='settings_changed' with field_key=key.
    }
    return { ok: true };
  }
}
