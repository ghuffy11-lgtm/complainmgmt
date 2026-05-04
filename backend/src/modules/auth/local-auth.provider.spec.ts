import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { LocalAuthProvider } from './local-auth.provider';
import { UserEntity } from './entities/user.entity';

type Mut = Partial<UserEntity>;

function makeUser(overrides: Mut = {}): UserEntity {
  const u = {
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
  } as UserEntity;
  return Object.assign(u, overrides);
}

function makeRepo(initial: UserEntity | null) {
  let user = initial;
  const updates: Array<Partial<UserEntity>> = [];
  return {
    findOne: jest.fn(async () => user),
    update: jest.fn(async (_where: unknown, patch: Partial<UserEntity>) => {
      updates.push(patch);
      if (user) user = { ...user, ...patch } as UserEntity;
      return { affected: 1 };
    }),
    _user: () => user,
    _updates: () => updates,
  };
}

const cfgStub = { get: jest.fn(() => ({})) } as unknown as ConfigService;

describe('LocalAuthProvider', () => {
  it('rejects empty credentials', async () => {
    const repo = makeRepo(null);
    const p = new LocalAuthProvider(repo as never, cfgStub);
    await expect(p.authenticate('', '')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects unknown user with INVALID_CREDENTIALS (no enumeration)', async () => {
    const repo = makeRepo(null);
    const p = new LocalAuthProvider(repo as never, cfgStub);
    await expect(p.authenticate('bob', 'pw')).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
  });

  it('signals WRONG_PROVIDER for users belonging to a different backend', async () => {
    const repo = makeRepo(makeUser({ authProvider: 'ldap' }));
    const p = new LocalAuthProvider(repo as never, cfgStub);
    await expect(p.authenticate('alice', 'pw')).rejects.toMatchObject({
      response: { code: 'WRONG_PROVIDER' },
    });
  });

  it('rejects deactivated users with INVALID_CREDENTIALS (no leak)', async () => {
    const repo = makeRepo(makeUser({ isActive: false }));
    const p = new LocalAuthProvider(repo as never, cfgStub);
    await expect(p.authenticate('alice', 'pw')).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
  });

  it('rejects with ACCOUNT_LOCKED when lockedUntil is in the future', async () => {
    const future = new Date(Date.now() + 60_000);
    const repo = makeRepo(makeUser({ lockedUntil: future }));
    const p = new LocalAuthProvider(repo as never, cfgStub);
    await expect(p.authenticate('alice', 'pw')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts a valid password and clears failure counters', async () => {
    const hash = await bcrypt.hash('s3cret-pass', 4);
    const repo = makeRepo(makeUser({ passwordHash: hash, failedLoginCount: 2 }));
    const p = new LocalAuthProvider(repo as never, cfgStub);
    const result = await p.authenticate('alice', 's3cret-pass');
    expect(result.user.username).toBe('alice');
    const updates = repo._updates();
    const success = updates[updates.length - 1];
    expect(success.failedLoginCount).toBe(0);
    expect(success.lockedUntil).toBeNull();
    expect(success.lastLoginAt).toBeInstanceOf(Date);
  });

  it('increments failedLoginCount on wrong password (under threshold)', async () => {
    const hash = await bcrypt.hash('right', 4);
    const repo = makeRepo(makeUser({ passwordHash: hash, failedLoginCount: 1 }));
    const p = new LocalAuthProvider(repo as never, cfgStub);
    await expect(p.authenticate('alice', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    const updates = repo._updates();
    expect(updates[0]).toEqual({ failedLoginCount: 2 });
  });

  it('locks the account after the Nth failure and resets the counter', async () => {
    const hash = await bcrypt.hash('right', 4);
    // 4 prior failures + this one = 5 → triggers lockout (default maxFailures = 5)
    const repo = makeRepo(makeUser({ passwordHash: hash, failedLoginCount: 4 }));
    const p = new LocalAuthProvider(repo as never, cfgStub);
    await expect(p.authenticate('alice', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    const updates = repo._updates();
    expect(updates[0].failedLoginCount).toBe(0);
    expect(updates[0].lockedUntil).toBeInstanceOf(Date);
    expect(updates[0].lockedUntil!.getTime()).toBeGreaterThan(Date.now());
  });
});
