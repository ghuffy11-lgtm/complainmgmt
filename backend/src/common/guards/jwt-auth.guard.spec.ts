import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from '../../modules/auth/auth.service';
import { AuthUser } from '../../modules/auth/auth-user.type';

function ctx(headers: Record<string, string> = {}): { req: { headers: Record<string, string>; user?: AuthUser }; ctx: ExecutionContext } {
  const req = { headers } as { headers: Record<string, string>; user?: AuthUser };
  const c = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
  return { req, ctx: c };
}

const fakeUser: AuthUser = {
  id: 1,
  username: 'alice',
  displayName: 'Alice',
  roleKeys: [],
  permissions: new Set(),
};

describe('JwtAuthGuard', () => {
  it('allows public endpoints with no token', async () => {
    const reflector = { getAllAndOverride: () => true } as unknown as Reflector;
    const auth = { verifyAccessToken: jest.fn() } as unknown as AuthService;
    const g = new JwtAuthGuard(auth, reflector);
    await expect(g.canActivate(ctx().ctx)).resolves.toBe(true);
  });

  it('rejects requests with no Authorization header', async () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const auth = { verifyAccessToken: jest.fn() } as unknown as AuthService;
    const g = new JwtAuthGuard(auth, reflector);
    await expect(g.canActivate(ctx().ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the verifier throws (invalid/expired token)', async () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const auth = {
      verifyAccessToken: jest.fn().mockRejectedValue(new Error('boom')),
    } as unknown as AuthService;
    const g = new JwtAuthGuard(auth, reflector);
    await expect(g.canActivate(ctx({ authorization: 'Bearer x.y.z' }).ctx)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('attaches AuthUser onto req.user on success', async () => {
    const reflector = { getAllAndOverride: () => false } as unknown as Reflector;
    const auth = { verifyAccessToken: jest.fn().mockResolvedValue(fakeUser) } as unknown as AuthService;
    const g = new JwtAuthGuard(auth, reflector);
    const { req, ctx: c } = ctx({ authorization: 'Bearer x.y.z' });
    await expect(g.canActivate(c)).resolves.toBe(true);
    expect(req.user).toBe(fakeUser);
  });
});
