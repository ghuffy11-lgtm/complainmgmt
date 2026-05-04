import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AuthProviderRegistry } from './auth-provider.registry';
import { LocalAuthProvider } from './local-auth.provider';
import { IAuthProvider } from './auth-provider.interface';
import { UserEntity } from './entities/user.entity';

const fakeUser = { id: '1', username: 'alice' } as UserEntity;

function provider(key: 'local' | 'ldap', impl: IAuthProvider['authenticate']): IAuthProvider {
  return { key, authenticate: jest.fn(impl) } as IAuthProvider;
}

describe('AuthProviderRegistry', () => {
  it('returns a provider by key', () => {
    const local = provider('local', async () => ({ user: fakeUser })) as LocalAuthProvider;
    const reg = new AuthProviderRegistry(local);
    expect(reg.get('local')).toBe(local);
  });

  it('throws when no provider matches the key', () => {
    const local = provider('local', async () => ({ user: fakeUser })) as LocalAuthProvider;
    const reg = new AuthProviderRegistry(local);
    expect(() => reg.get('ldap')).toThrow(/No auth provider/);
  });

  it('returns the first successful provider', async () => {
    const local = provider('local', async () => ({ user: fakeUser })) as LocalAuthProvider;
    const reg = new AuthProviderRegistry(local);
    const r = await reg.tryAuthenticate('alice', 'pw');
    expect(r.user.username).toBe('alice');
  });

  it('falls through on WRONG_PROVIDER and ultimately rejects', async () => {
    const local = provider('local', async () => {
      throw new UnauthorizedException({ code: 'WRONG_PROVIDER' });
    }) as LocalAuthProvider;
    const reg = new AuthProviderRegistry(local);
    await expect(reg.tryAuthenticate('bob', 'pw')).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
  });

  it('propagates ACCOUNT_LOCKED instead of falling through', async () => {
    const local = provider('local', async () => {
      throw new ForbiddenException({ code: 'ACCOUNT_LOCKED', until: new Date() });
    }) as LocalAuthProvider;
    const reg = new AuthProviderRegistry(local);
    await expect(reg.tryAuthenticate('alice', 'pw')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('propagates plain INVALID_CREDENTIALS instead of falling through', async () => {
    const local = provider('local', async () => {
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
    }) as LocalAuthProvider;
    const reg = new AuthProviderRegistry(local);
    await expect(reg.tryAuthenticate('alice', 'pw')).rejects.toMatchObject({
      response: { code: 'INVALID_CREDENTIALS' },
    });
  });
});
