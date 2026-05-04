import { UserEntity } from './entities/user.entity';

export type ProviderAuthResult = {
  user: UserEntity;
};

/**
 * Authentication backend abstraction. Phase 1 has only LocalAuthProvider;
 * an LdapAuthProvider can be added without changes to the rest of the system.
 */
export interface IAuthProvider {
  readonly key: 'local' | 'ldap';
  authenticate(username: string, password: string): Promise<ProviderAuthResult>;
}
