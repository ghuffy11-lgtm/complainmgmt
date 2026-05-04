import { ConflictException } from '@nestjs/common';
import { LockingService } from './locking.service';
import { DynamicFieldEntity } from '../dynamic-fields/entities/dynamic-field.entity';
import { ComplaintFieldValueEntity } from './entities/complaint-field-value.entity';
import { AuthUser } from '../auth/auth-user.type';

const svc = new LockingService();

const lockingField: DynamicFieldEntity = {
  id: '1',
  key: 'patient_complaint',
  type: 'text',
  locking: 'first_writer_wins',
  isActive: true,
  isRequired: false,
  sortOrder: 0,
  validation: {},
  visibility: { roles: '*' },
  isSystem: true,
  label: 'Patient Complaint',
  createdAt: new Date(),
  updatedAt: new Date(),
} as DynamicFieldEntity;

const nonLockingField: DynamicFieldEntity = { ...lockingField, key: 'note', locking: 'none' } as DynamicFieldEntity;

const owner: ComplaintFieldValueEntity = {
  id: '1',
  complaintId: '10',
  fieldId: '1',
  valueText: 'first writer wrote this',
  valueNumber: null,
  valueDate: null,
  valueOptionId: null,
  ownerUserId: '7',
  lockedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
} as ComplaintFieldValueEntity;

function user(id: number, perms: string[] = []): AuthUser {
  return { id, username: 'u', displayName: 'U', roleKeys: [], permissions: new Set(perms) };
}

describe('LockingService.decide', () => {
  it('allows freely when locking is "none"', () => {
    expect(
      svc.decide({ field: nonLockingField, existing: null, incomingIsBlank: false, actor: user(1) }),
    ).toEqual({ kind: 'allow' });
  });

  it('allows + claims ownership on the first non-blank write', () => {
    expect(
      svc.decide({ field: lockingField, existing: null, incomingIsBlank: false, actor: user(1) }),
    ).toEqual({ kind: 'allow_takes_ownership' });
  });

  it('allows blank writes without claiming ownership', () => {
    expect(
      svc.decide({ field: lockingField, existing: null, incomingIsBlank: true, actor: user(1) }),
    ).toEqual({ kind: 'allow' });
  });

  it('allows the owner to edit (or clear) their own value', () => {
    expect(
      svc.decide({ field: lockingField, existing: owner, incomingIsBlank: false, actor: user(7) }),
    ).toEqual({ kind: 'allow' });
    expect(
      svc.decide({ field: lockingField, existing: owner, incomingIsBlank: true, actor: user(7) }),
    ).toEqual({ kind: 'allow' });
  });

  it('rejects a non-owner without override permission', () => {
    expect(() =>
      svc.decide({ field: lockingField, existing: owner, incomingIsBlank: false, actor: user(2) }),
    ).toThrow(ConflictException);
  });

  it('allows a non-owner with field-specific override permission', () => {
    const actor = user(2, ['complaint.field:patient_complaint:override']);
    expect(
      svc.decide({ field: lockingField, existing: owner, incomingIsBlank: false, actor }),
    ).toEqual({ kind: 'allow_with_override' });
  });

  it('allows a non-owner with the wildcard override permission', () => {
    const actor = user(2, ['complaint.field:*:override']);
    expect(
      svc.decide({ field: lockingField, existing: owner, incomingIsBlank: false, actor }),
    ).toEqual({ kind: 'allow_with_override' });
  });
});
