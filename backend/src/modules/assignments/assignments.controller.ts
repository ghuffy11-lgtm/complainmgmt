import { Controller, Get, Param } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AssignmentHistoryEntity } from './entities/assignment-history.entity';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { DisplayNamesService } from '../display-names/display-names.service';

/**
 * Per-complaint assignment history. Read-only; rows are written by
 * AssignmentsService.apply() inside the create/assign transactions.
 *
 * Response is enriched with `*Name` fields so the UI can render the timeline
 * without a second round trip per row. Display strings are
 * "DisplayName (username)" so admins disambiguating two people with the
 * same display name still get the username.
 */
@Controller('complaints/:complaintId/assignments')
export class AssignmentsController {
  constructor(
    @InjectRepository(AssignmentHistoryEntity)
    private readonly history: Repository<AssignmentHistoryEntity>,
    private readonly names: DisplayNamesService,
  ) {}

  @Get()
  @RequirePermissions('complaint:read')
  async list(@Param('complaintId') complaintId: string) {
    const rows = await this.history.find({
      where: { complaintId },
      order: { changedAt: 'DESC', id: 'DESC' },
    });

    const userIds = rows.flatMap((r) => [r.oldAssignedTo, r.newAssignedTo, r.changedBy]);
    const deptIds = rows.flatMap((r) => [r.oldDepartmentId, r.newDepartmentId]);
    const [users, depts] = await Promise.all([
      this.names.usersByIds(userIds),
      this.names.departmentsByIds(deptIds),
    ]);

    return rows.map((r) => ({
      id: r.id,
      complaintId: r.complaintId,
      oldAssignedTo: r.oldAssignedTo,
      newAssignedTo: r.newAssignedTo,
      oldDepartmentId: r.oldDepartmentId,
      newDepartmentId: r.newDepartmentId,
      changedBy: r.changedBy,
      changedAt: r.changedAt,
      note: r.note,
      oldAssignedToName: nameOf(users.get(r.oldAssignedTo ?? '')),
      newAssignedToName: nameOf(users.get(r.newAssignedTo ?? '')),
      oldDepartmentName: depts.get(r.oldDepartmentId ?? '')?.name ?? null,
      newDepartmentName: depts.get(r.newDepartmentId ?? '')?.name ?? null,
      changedByName: nameOf(users.get(r.changedBy)),
    }));
  }
}

function nameOf(u: { displayName: string; username: string } | undefined): string | null {
  if (!u) return null;
  return `${u.displayName} (${u.username})`;
}
