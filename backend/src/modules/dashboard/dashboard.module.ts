import { Module } from '@nestjs/common';
import { ComplaintsModule } from '../complaints/complaints.module';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [ComplaintsModule],
  controllers: [DashboardController],
})
export class DashboardModule {}
