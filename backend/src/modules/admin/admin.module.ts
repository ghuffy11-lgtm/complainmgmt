import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemSettingEntity } from './system-settings.entity';
import { AdminSettingsController } from './admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SystemSettingEntity])],
  controllers: [AdminSettingsController],
  exports: [TypeOrmModule],
})
export class AdminModule {}
