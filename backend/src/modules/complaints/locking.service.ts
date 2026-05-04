import { ConflictException, Injectable } from '@nestjs/common';
import { hasPermission } from '../permissions/permission-resolver';
import { AuthUser } from '../auth/auth-user.type';
import { DynamicFieldEntity } from '../dynamic-fields/entities/dynamic-field.entity';
import { ComplaintFieldValueEntity } from './entities/complaint-field-value.entity';

export type LockDecision =
  | { kind: 'allow' }
  | { kind: 'allow_with_override' }       // value will be written + audited as lock_override
  | { kind: 'allow_takes_ownership' };    // first non-empty write — caller stamps owner_user_id

@Injectable()
export class LockingService {
  /**
   * Decide whether `actor` can write `incoming` to `field` on this complaint.
   *
   * Returns a tagged union so the caller knows whether to:
   *   - just write,
   *   - write + emit a `lock_override` audit row,
   *   - write + claim ownership for the actor.
   *
   * Throws ConflictException(FIELD_LOCKED) when the field is locked by someone
   * else and the actor has no override permission.
   *
   * Pure logic — caller supplies the existing field-value row (may be null/unset)
   * so the function works inside any transaction without needing its own EM.
   */
  decide(args: {
    field: DynamicFieldEntity;
    existing: ComplaintFieldValueEntity | null;
    incomingIsBlank: boolean;
    actor: AuthUser;
  }): LockDecision {
    const { field, existing, incomingIsBlank, actor } = args;

    if (field.locking !== 'first_writer_wins') return { kind: 'allow' };

    // Field has no current owner → first non-blank write claims ownership.
    if (!existing?.ownerUserId) {
      return incomingIsBlank ? { kind: 'allow' } : { kind: 'allow_takes_ownership' };
    }

    // Owner editing their own value (including clearing it) — no override needed.
    if (String(existing.ownerUserId) === String(actor.id)) {
      return { kind: 'allow' };
    }

    // Locked by someone else.
    const overridePerm =
      hasPermission(actor.permissions, `complaint.field:${field.key}:override`) ||
      hasPermission(actor.permissions, 'complaint.field:*:override');

    if (!overridePerm) {
      throw new ConflictException({
        code: 'FIELD_LOCKED',
        fieldKey: field.key,
        ownerUserId: existing.ownerUserId,
      });
    }
    return { kind: 'allow_with_override' };
  }
}
