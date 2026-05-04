import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MulterModule } from '@nestjs/platform-express';
import * as multer from 'multer';
import { AttachmentEntity } from './entities/attachment.entity';
import { SystemSettingEntity } from '../admin/system-settings.entity';
import { AttachmentsService } from './attachments.service';
import { AttachmentsController } from './attachments.controller';
import { DbAttachmentStore } from './db-attachment-store';
import { AppConfig } from '../../config/configuration';

@Module({
  imports: [
    TypeOrmModule.forFeature([AttachmentEntity, SystemSettingEntity]),
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => {
        const max = cfg.get<AppConfig>('app')!.attachments.maxBytes;
        return {
          // Memory storage so the buffer is available for sniffing + hashing.
          // 2 MB is small; for larger limits switch to disk storage.
          storage: multer.memoryStorage(),
          // Edge cap: reject the request before it reaches the controller.
          limits: { fileSize: max, files: 1 },
        };
      },
    }),
  ],
  providers: [AttachmentsService, DbAttachmentStore],
  controllers: [AttachmentsController],
  exports: [AttachmentsService, TypeOrmModule],
})
export class AttachmentsModule {}
