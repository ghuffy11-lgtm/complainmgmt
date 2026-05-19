import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OriginEntity } from './entities/origin.entity';
import { OriginsService } from './origins.service';
import { OriginsController } from './origins.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OriginEntity])],
  providers: [OriginsService],
  controllers: [OriginsController],
  exports: [OriginsService, TypeOrmModule],
})
export class OriginsModule {}
