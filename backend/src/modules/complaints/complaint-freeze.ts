import { ConflictException } from '@nestjs/common';
import { ComplaintEntity, ComplaintStatus } from './entities/complaint.entity';
import { hasPermission } from '../permissions/permission-resolver';
import { AuthUser } from '../auth/auth-user.type';

/**
 * Statuses in which a complaint is treated as terminal — no field edits, no
 * status/priority changes, no assignment changes, no attachment uploads or
 * deletes. Holders of `complaint:reopen` can transition the status out of
 * one of these states (which lifts the freeze for subsequent edits); they
 * cannot bypass the freeze and edit fields directly.
 */
export const FROZEN_STATES: ReadonlyArray<ComplaintStatus> = ['closed', 'resolved'];

export function isFrozen(c: Pick<ComplaintEntity, 'status'>): boolean {
  return (FROZEN_STATES as readonly string[]).includes(c.status);
}

/**
 * Throws `409 COMPLAINT_FROZEN` when the complaint is in a frozen status.
 *
 * Use this on every mutation path EXCEPT the status-change endpoint —
 * `complaint:reopen` is a status-transition permission, not a free pass to
 * edit. The caller's flow is: reopen → edit → close again, with each step
 * audited.
 */
export function assertEditable(c: Pick<ComplaintEntity, 'status'>, _actor: AuthUser): void {
  if (isFrozen(c)) {
    throw new ConflictException({
      code: 'COMPLAINT_FROZEN',
      status: c.status,
      hint: 'Reopen the complaint before editing it.',
    });
  }
}

/**
 * For the status-change endpoint specifically. Returns whether this is a
 * `reopen` (transition out of a frozen state) or a regular `update`.
 *
 * Throws `403 RBAC_DENIED` when reopen is needed but the caller doesn't
 * hold `complaint:reopen`.
 *
 * Returns null when the transition is a no-op (current === next).
 */
export function classifyStatusTransition(
  current: ComplaintStatus,
  next: ComplaintStatus,
  actor: AuthUser,
): { kind: 'noop' } | { kind: 'reopen' } | { kind: 'update' } {
  if (current === next) return { kind: 'noop' };
  if ((FROZEN_STATES as readonly string[]).includes(current)) {
    if (!hasPermission(actor.permissions, 'complaint:reopen')) {
      throw new ConflictException({
        code: 'RBAC_DENIED_REOPEN',
        currentStatus: current,
        missing: ['complaint:reopen'],
      });
    }
    return { kind: 'reopen' };
  }
  return { kind: 'update' };
}
