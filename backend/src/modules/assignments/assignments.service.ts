import { BadRequestException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { ComplaintEntity } from '../complaints/entities/complaint.entity';
import { DepartmentEntity } from '../departments/entities/department.entity';
import { UserEntity } from '../auth/entities/user.entity';
import { AssignmentHistoryEntity } from './entities/assignment-history.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user.type';

type AssignInput = {
  departmentId: string | null;
  userId?: string | null;
  note?: string;
};

@Injectable()
export class AssignmentsService {
  constructor(private readonly audit: AuditService) {}

  /**
   * Apply an assignment to a complaint already loaded inside the caller's
   * transaction. Mutates the complaint row, appends a history row, emits
   * the audit row.
   *
   * Returns true if anything actually changed; false on a no-op.
   */
  async apply(
    em: EntityManager,
    complaint: ComplaintEntity,
    input: AssignInput,
    actor: AuthUser,
  ): Promise<boolean> {
    const oldDept = complaint.assignedDepartmentId;
    const oldUser = complaint.assignedTo;
    const newDept = input.departmentId ?? null;
    const newUser = input.userId ?? null;

    if (oldDept === newDept && oldUser === newUser) return false;

    if (newDept) {
      const dept = await em
        .getRepository(DepartmentEntity)
        .findOne({ where: { id: newDept } });
      if (!dept || !dept.isActive) {
        throw new BadRequestException({ code: 'INVALID_DEPARTMENT' });
      }
    }
    if (newUser) {
      const u = await em.getRepository(UserEntity).findOne({ where: { id: newUser } });
      if (!u || !u.isActive) throw new BadRequestException({ code: 'INVALID_USER' });
    }

    complaint.assignedDepartmentId = newDept;
    complaint.assignedTo = newUser;
    complaint.assignedBy = String(actor.id);
    complaint.assignedAt = new Date();
    await em.getRepository(ComplaintEntity).save(complaint);

    await em.getRepository(AssignmentHistoryEntity).insert({
      complaintId: complaint.id,
      oldAssignedTo: oldUser,
      newAssignedTo: newUser,
      oldDepartmentId: oldDept,
      newDepartmentId: newDept,
      changedBy: String(actor.id),
      note: input.note ?? null,
    });

    await this.audit.recordChange({
      em,
      complaintId: complaint.id,
      fieldKey: '__assignment__',
      action: 'assign',
      oldValue: { departmentId: oldDept, userId: oldUser },
      newValue: { departmentId: newDept, userId: newUser },
      actorId: String(actor.id),
      note: input.note,
    });

    return true;
  }
}
