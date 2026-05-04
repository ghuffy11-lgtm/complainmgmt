import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { AuthUser } from '../../modules/auth/auth-user.type';

function ctxFor(user?: AuthUser): ExecutionContext {
  const req = { user } as { user?: AuthUser };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function reflector(opts: { all?: string[]; any?: string[] }): Reflector {
  return {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === 'requiredPermissions') return opts.all;
      if (key === 'requiredAnyPermissions') return opts.any;
      return undefined;
    }),
  } as unknown as Reflector;
}

const userWith = (perms: string[]): AuthUser => ({
  id: 1,
  username: 'alice',
  displayName: 'Alice',
  roleKeys: [],
  permissions: new Set(perms),
});

describe('PermissionsGuard', () => {
  it('allows when no metadata is set', () => {
    const g = new PermissionsGuard(reflector({}));
    expect(g.canActivate(ctxFor(userWith([])))).toBe(true);
  });

  it('denies when no AuthUser is attached', () => {
    const g = new PermissionsGuard(reflector({ all: ['complaint:read'] }));
    expect(() => g.canActivate(ctxFor(undefined))).toThrow(ForbiddenException);
  });

  it('AND-gates @RequirePermissions: every permission required', () => {
    const g = new PermissionsGuard(reflector({ all: ['complaint:read', 'complaint:update'] }));
    expect(() => g.canActivate(ctxFor(userWith(['complaint:read'])))).toThrow(ForbiddenException);
    expect(g.canActivate(ctxFor(userWith(['complaint:read', 'complaint:update'])))).toBe(true);
  });

  it('OR-gates @RequireAnyPermission: any permission satisfies', () => {
    const g = new PermissionsGuard(reflector({ any: ['admin.users:manage', 'admin.roles:manage'] }));
    expect(g.canActivate(ctxFor(userWith(['admin.roles:manage'])))).toBe(true);
    expect(() => g.canActivate(ctxFor(userWith(['complaint:read'])))).toThrow(ForbiddenException);
  });

  it('honours wildcard permissions through the resolver', () => {
    const g = new PermissionsGuard(reflector({ all: ['complaint.field:investigation:write'] }));
    expect(g.canActivate(ctxFor(userWith(['complaint.field:*:write'])))).toBe(true);
  });

  it('combines AND + OR when both decorators are set', () => {
    const g = new PermissionsGuard(
      reflector({ all: ['complaint:read'], any: ['admin.users:manage', 'admin.roles:manage'] }),
    );
    expect(g.canActivate(ctxFor(userWith(['complaint:read', 'admin.roles:manage'])))).toBe(true);
    expect(() =>
      g.canActivate(ctxFor(userWith(['complaint:read']))),
    ).toThrow(ForbiddenException);
  });
});
