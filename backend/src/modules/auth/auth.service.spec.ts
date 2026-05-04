import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { AuthProviderRegistry } from './auth-provider.registry';
import { RefreshTokenService } from './refresh-token.service';
import { PermissionsService } from '../permissions/permissions.service';
import { UserEntity } from './entities/user.entity';
import { AuthUser } from './auth-user.type';

const cfg = {
  get: () => ({ bcryptRounds: 4, jwt: { accessTtl: 60, refreshTtl: 3600, secret: 'x' } }),
} as unknown as ConfigService;

function makeUser(overrides: Partial<UserEntity> = {}): UserEntity {
  return {
    id: '1',
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
    ...overrides,
  } as UserEntity;
}

function makeAuthUser(): AuthUser {
  return {
    id: 1,
    username: 'alice',
    displayName: 'Alice',
    roleKeys: ['employee'],
    permissions: new Set(['complaint:read']),
  };
}

describe('AuthService', () => {
  const usersRepo = {
    findOne: jest.fn(),
    update: jest.fn(async () => ({ affected: 1 })),
  };
  const registry = { tryAuthenticate: jest.fn() } as unknown as AuthProviderRegistry;
  const jwt = {
    signAsync: jest.fn(async () => 'jwt.signed.token'),
    verifyAsync: jest.fn(async () => ({ sub: '1', username: 'alice', roleKeys: ['employee'] })),
  } as unknown as JwtService;
  const refresh = {
    issue: jest.fn(async () => 'refresh-token-raw'),
    rotate: jest.fn(async () => ({ userId: '1', raw: 'refresh-token-raw-2' })),
    revoke: jest.fn(async () => undefined),
    revokeAllForUser: jest.fn(async () => undefined),
  } as unknown as RefreshTokenService;
  const perms = { materialize: jest.fn(async () => makeAuthUser()) } as unknown as PermissionsService;

  const svc = new AuthService(registry, jwt, refresh, perms, usersRepo as never, cfg);

  beforeEach(() => jest.clearAllMocks());

  describe('login', () => {
    it('routes through the registry, mints both tokens, returns me-shape', async () => {
      (registry.tryAuthenticate as jest.Mock).mockResolvedValueOnce({ user: makeUser() });
      const r = await svc.login({ username: 'alice', password: 'pw' }, { ip: '1.2.3.4' });
      expect(registry.tryAuthenticate).toHaveBeenCalledWith('alice', 'pw');
      expect(r.accessToken).toBe('jwt.signed.token');
      expect(r.refreshToken).toBe('refresh-token-raw');
      expect(r.user.permissions).toEqual(['complaint:read']);
    });

    it('propagates registry errors', async () => {
      (registry.tryAuthenticate as jest.Mock).mockRejectedValueOnce(
        new UnauthorizedException({ code: 'INVALID_CREDENTIALS' }),
      );
      await expect(svc.login({ username: 'a', password: 'b' }, {})).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotates tokens and re-materializes permissions', async () => {
      (usersRepo.findOne as jest.Mock).mockResolvedValueOnce(makeUser());
      const r = await svc.refresh('old-raw', {});
      expect(refresh.rotate).toHaveBeenCalledWith('old-raw', {});
      expect(r.refreshToken).toBe('refresh-token-raw-2');
      expect(perms.materialize).toHaveBeenCalled();
    });

    it('rejects when the user is disabled', async () => {
      (usersRepo.findOne as jest.Mock).mockResolvedValueOnce(makeUser({ isActive: false }));
      await expect(svc.refresh('old-raw', {})).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes the supplied refresh token', async () => {
      await svc.logout('raw');
      expect(refresh.revoke).toHaveBeenCalledWith('raw');
    });
  });

  describe('verifyAccessToken', () => {
    it('returns AuthUser when token is valid and user is active', async () => {
      (usersRepo.findOne as jest.Mock).mockResolvedValueOnce(makeUser());
      const u = await svc.verifyAccessToken('jwt');
      expect(u.username).toBe('alice');
      expect(u.permissions.has('complaint:read')).toBe(true);
    });

    it('rejects when the token decodes but the user is gone', async () => {
      (usersRepo.findOne as jest.Mock).mockResolvedValueOnce(null);
      await expect(svc.verifyAccessToken('jwt')).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects when the user is deactivated', async () => {
      (usersRepo.findOne as jest.Mock).mockResolvedValueOnce(makeUser({ isActive: false }));
      await expect(svc.verifyAccessToken('jwt')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('changePassword', () => {
    it('rotates the hash and force-logs-out every session', async () => {
      const hash = await bcrypt.hash('current-pass-1', 4);
      (usersRepo.findOne as jest.Mock).mockResolvedValueOnce(makeUser({ passwordHash: hash }));
      await svc.changePassword('1', { currentPassword: 'current-pass-1', newPassword: 'next-pass-1234' });
      expect(usersRepo.update).toHaveBeenCalled();
      expect(refresh.revokeAllForUser).toHaveBeenCalledWith('1');
    });

    it('rejects when the current password is wrong', async () => {
      const hash = await bcrypt.hash('actual-1', 4);
      (usersRepo.findOne as jest.Mock).mockResolvedValueOnce(makeUser({ passwordHash: hash }));
      await expect(
        svc.changePassword('1', { currentPassword: 'wrong-one', newPassword: 'next-pass-1234' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refresh.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('rejects passwords below the minimum length', async () => {
      const hash = await bcrypt.hash('current-pass-1', 4);
      (usersRepo.findOne as jest.Mock).mockResolvedValueOnce(makeUser({ passwordHash: hash }));
      await expect(
        svc.changePassword('1', { currentPassword: 'current-pass-1', newPassword: 'short' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
