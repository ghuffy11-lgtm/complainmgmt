import { Controller, Get, Param, Query } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogEntity } from './entities/audit-log.entity';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { DisplayNamesService } from '../display-names/display-names.service';
import { enrichAuditRows } from './enrich-audit';

/**
 * Per-complaint audit timeline. Mirrors the global /audit endpoint but
 * scoped to a single complaint, so the UI can render a per-record history
 * without needing audit:read on the global feed.
 *
 * Permissions: complaint:read is sufficient — if the user can read the
 * complaint, they can see its history. (The global /audit endpoint still
 * requires the broader `audit:read`.)
 */
@Controller('complaints/:complaintId/audit')
export class ComplaintAuditController {
  constructor(
    @InjectRepository(AuditLogEntity) private readonly repo: Repository<AuditLogEntity>,
    private readonly names: DisplayNamesService,
  ) {}

  @Get()
  @RequirePermissions('complaint:read')
  async list(
    @Param('complaintId') complaintId: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const ps = Math.min(200, Math.max(1, parseInt(pageSize, 10) || 50));
    const [rows, total] = await this.repo.findAndCount({
      where: { complaintId },
      order: { occurredAt: 'DESC', id: 'DESC' },
      skip: (p - 1) * ps,
      take: ps,
    });
    const data = await enrichAuditRows(rows, this.names);
    return { data, meta: { page: p, pageSize: ps, total } };
  }
}
