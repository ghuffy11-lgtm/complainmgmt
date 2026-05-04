import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ComplaintEntity } from '../complaints/entities/complaint.entity';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Controller('dashboard')
export class DashboardController {
  constructor(@InjectRepository(ComplaintEntity) private readonly complaints: Repository<ComplaintEntity>) {}

  @Get('summary')
  @RequirePermissions('dashboard:read')
  async summary() {
    const total = await this.complaints.count();
    const high = await this.complaints.count({ where: [{ priority: 'high' }, { priority: 'critical' }] });
    return { total, highPriority: high };
  }

  @Get('by-status')
  @RequirePermissions('dashboard:read')
  byStatus() {
    return this.complaints
      .createQueryBuilder('c')
      .select('c.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('c.status')
      .getRawMany<{ status: string; count: number }>();
  }

  @Get('by-priority')
  @RequirePermissions('dashboard:read')
  byPriority() {
    return this.complaints
      .createQueryBuilder('c')
      .select('c.priority', 'priority')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('c.priority')
      .getRawMany<{ priority: string; count: number }>();
  }

  @Get('by-department')
  @RequirePermissions('dashboard:read')
  byDepartment() {
    return this.complaints
      .createQueryBuilder('c')
      .select('c.assigned_department_id', 'departmentId')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('c.assigned_department_id')
      .getRawMany<{ departmentId: string | null; count: number }>();
  }
}
