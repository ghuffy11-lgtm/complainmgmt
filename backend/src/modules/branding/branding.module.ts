import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrandingAssetEntity } from './branding-asset.entity';
import { SystemSettingEntity } from '../admin/system-settings.entity';
import { BrandingService } from './branding.service';
import { AdminBrandingController, PublicBrandingController } from './branding.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BrandingAssetEntity, SystemSettingEntity])],
  providers: [BrandingService],
  controllers: [PublicBrandingController, AdminBrandingController],
  exports: [BrandingService],
})
export class BrandingModule {}
