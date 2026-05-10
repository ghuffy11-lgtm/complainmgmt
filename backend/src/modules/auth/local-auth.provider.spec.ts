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

function makeAuditor() {
  return { record: jest.fn(async () => undefined) };
}

describe('LocalAuthProvider', () => {
  it('rejects empty credentials', async () => {
    const repo = makeRepo(null);
    const auditor = makeAuditor();
    const p = new LocalAuthProvider(repo as never, cfgStub, auditor as never);
    await expect(p.authenticate('', '')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(auditor.record).not.toHaveBeenCalled();
  });

  it('rejects unknown user with INVALID_CREDENTIALS (no enumeration)', async () => {
    const repo = makeRepo(null);
    const auditor = makeAuditor();
    const p = new LocalAuthProvider(repo as never, cfgStub, auditor as never);
    await expect(p.authenticate('bob', 'pw', { ip: '1.2.3.4' })).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
    expect(auditor.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'login.unknown_user', username: 'bob', userId: null, ip: '1.2.3.4' }),
    );
  });

  it('signals WRONG_PROVIDER for users belonging to a different backend', async () => {
    const repo = makeRepo(makeUser({ authProvider: 'ldap' }));
    const auditor = makeAuditor();
    const p = new LocalAuthProvider(repo as never, cfgStub, auditor as never);
    await expect(p.authenticate('alice', 'pw')).rejects.toMatchObject({
      response: { code: 'WRONG_PROVIDER' },
    });
    expect(auditor.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'login.wrong_provider' }),
    );
  });

  it('rejects deactivated users with INVALID_CREDENTIALS (no leak)', async () => {
    const repo = makeRepo(makeUser({ isActive: false }));
    const auditor = makeAuditor();
    const p = new LocalAuthProvider(repo as never, cfgStub, auditor as never);
    await expect(p.authenticate('alice', 'pw')).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
    expect(auditor.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'login.inactive' }),
    );
  });

  it('rejects with ACCOUNT_LOCKED when lockedUntil is in the future', async () => {
    const future = new Date(Date.now() + 60_000);
    const repo = makeRepo(makeUser({ lockedUntil: future }));
    const auditor = makeAuditor();
    const p = new LocalAuthProvider(repo as never, cfgStub, auditor as never);
    await expect(p.authenticate('alice', 'pw')).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditor.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'login.account_locked' }),
    );
  });

  it('accepts a valid password and clears failure counters', async () => {
    const hash = await bcrypt.hash('s3cret-pass', 4);
    const repo = makeRepo(makeUser({ passwordHash: hash, failedLoginCount: 2 }));
    const auditor = makeAuditor();
    const p = new LocalAuthProvider(repo as never, cfgStub, auditor as never);
    const result = await p.authenticate('alice', 's3cret-pass');
    expect(result.user.username).toBe('alice');
    const updates = repo._updates();
    const success = updates[updates.length - 1];
    expect(success.failedLoginCount).toBe(0);
    expect(success.lockedUntil).toBeNull();
    expect(success.lastLoginAt).toBeInstanceOf(Date);
    // Provider does NOT emit login.success — that's AuthService's job, after
    // tokens are issued. Verify nothing was audited here.
    expect(auditor.record).not.toHaveBeenCalled();
  });

  it('increments failedLoginCount on wrong password (under threshold) and audits login.password_failed', async () => {
    const hash = await bcrypt.hash('right', 4);
    const repo = makeRepo(makeUser({ passwordHash: hash, failedLoginCount: 1 }));
    const auditor = makeAuditor();
    const p = new LocalAuthProvider(repo as never, cfgStub, auditor as never);
    await expect(p.authenticate('alice', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    const updates = repo._updates();
    expect(updates[0]).toEqual({ failedLoginCount: 2 });
    expect(auditor.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'login.password_failed', detail: { attempt: 2, threshold: 5 } }),
    );
  });

  it('locks the account after the Nth failure and audits both events', async () => {
    const hash = await bcrypt.hash('right', 4);
    // 4 prior failures + this one = 5 → triggers lockout (default maxFailures = 5)
    const repo = makeRepo(makeUser({ passwordHash: hash, failedLoginCount: 4 }));
    const auditor = makeAuditor();
    const p = new LocalAuthProvider(repo as never, cfgStub, auditor as never);
    await expect(p.authenticate('alice', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    const updates = repo._updates();
    expect(updates[0].failedLoginCount).toBe(0);
    expect(updates[0].lockedUntil).toBeInstanceOf(Date);
    expect(updates[0].lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    const events = auditor.record.mock.calls.map(
      (c) => (c as unknown as [{ event: string }])[0].event,
    );
    expect(events).toEqual(['login.password_failed', 'account.locked']);
  });
});
