import { UserEntity } from './entities/user.entity';

export type ProviderAuthResult = {
  user: UserEntity;
};

/**
 * Optional client metadata passed through the auth chain so providers can
 * attach IP / User-Agent to audit-log writes without re-deriving them from
 * the request. Threaded from `AuthController.ctx(req)` →
 * `AuthService.login` → `AuthProviderRegistry.tryAuthenticate` → provider.
 */
export type AuthCallContext = {
  ip?: string | null;
  userAgent?: string | null;
};

/**
 * Authentication backend abstraction. Phase 1 has only LocalAuthProvider;
 * an LdapAuthProvider can be added without changes to the rest of the system.
 */
export interface IAuthProvider {
  readonly key: 'local' | 'ldap';
  authenticate(
    username: string,
    password: string,
    ctx?: AuthCallContext,
  ): Promise<ProviderAuthResult>;
}
