import { Controller, Get, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@Controller('audit')
export class AuditController {
  constructor(@InjectRepository(AuditLogEntity) private readonly repo: Repository<AuditLogEntity>) {}

  @Get()
  @RequirePermissions('audit:read')
  async list(
    @Query('complaintId') complaintId?: string,
    @Query('actorId') actorId?: string,
    @Query('fieldKey') fieldKey?: string,
    @Query('action') action?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    const qb = this.repo.createQueryBuilder('a').orderBy('a.occurred_at', 'DESC').addOrderBy('a.id', 'DESC');
    if (complaintId) qb.andWhere('a.complaint_id = :complaintId', { complaintId });
    if (actorId) qb.andWhere('a.actor_id = :actorId', { actorId });
    if (fieldKey) qb.andWhere('a.field_key = :fieldKey', { fieldKey });
    if (action) qb.andWhere('a.action = :action', { action });
    const p = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
    qb.skip((p - 1) * ps).take(ps);
    const [data, total] = await qb.getManyAndCount();
    return { data, meta: { page: p, pageSize: ps, total } };
  }
}
