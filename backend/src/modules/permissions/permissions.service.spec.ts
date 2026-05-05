import { PermissionsService } from './permissions.service';
import { UserEntity } from '../auth/entities/user.entity';

describe('PermissionsService.materialize', () => {
  function build(
    rows: { resource: string; action: string; role_key: string }[],
    deptIds: string[] = [],
  ) {
    // materialize() runs two queries via Promise.all — dispatch by SQL
    // fragment so the spec doesn't depend on call order.
    const dataSource = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('user_departments')) {
          return deptIds.map((id) => ({ department_id: id }));
        }
        return rows;
      }),
    } as never;
    return new PermissionsService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      dataSource,
    );
  }

  function user(): UserEntity {
    return {
      id: '7',
      username: 'alice',
      email: null,
      displayName: 'Alice',
      passwordHash: '',
      authProvider: 'local',
      isActive: true,
      lastLoginAt: null,
      failedLoginCount: 0,
      lockedUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as UserEntity;
  }

  it('flattens rows into resource:action strings, dedupes role keys', async () => {
    const svc = build([
      { resource: 'complaint', action: 'read', role_key: 'employee' },
      { resource: 'complaint', action: 'create', role_key: 'employee' },
      { resource: 'complaint', action: 'read', role_key: 'supervisor' }, // dup perm, two roles
    ]);
    const u = await svc.materialize(user());
    expect(u.id).toBe(7);
    expect([...u.permissions].sort()).toEqual(['complaint:create', 'complaint:read']);
    expect(u.roleKeys.sort()).toEqual(['employee', 'supervisor']);
  });

  it('returns an empty permission set when the user has no roles', async () => {
    const svc = build([]);
    const u = await svc.materialize(user());
    expect(u.permissions.size).toBe(0);
    expect(u.roleKeys).toEqual([]);
  });

  it('preserves wildcard resource entries verbatim', async () => {
    const svc = build([{ resource: 'complaint.field:*', action: 'write', role_key: 'supervisor' }]);
    const u = await svc.materialize(user());
    expect(u.permissions.has('complaint.field:*:write')).toBe(true);
  });

  it('populates active department memberships into departmentIds', async () => {
    const svc = build([], ['3', '7']);
    const u = await svc.materialize(user());
    expect(u.departmentIds).toEqual(['3', '7']);
  });
});
