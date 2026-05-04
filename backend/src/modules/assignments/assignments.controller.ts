import { Controller, Get, Param } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignmentHistoryEntity } from './entities/assignment-history.entity';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

/**
 * Per-complaint assignment history. Read-only; rows are written by
 * AssignmentsService.apply() inside the create/assign transactions.
 */
@Controller('complaints/:complaintId/assignments')
export class AssignmentsController {
  constructor(
    @InjectRepository(AssignmentHistoryEntity)
    private readonly history: Repository<AssignmentHistoryEntity>,
  ) {}

  @Get()
  @RequirePermissions('complaint:read')
  list(@Param('complaintId') complaintId: string) {
    return this.history.find({
      where: { complaintId },
      order: { changedAt: 'DESC', id: 'DESC' },
    });
  }
}
