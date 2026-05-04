import { Injectable, UnauthorizedException } from '@nestjs/common';
import { IAuthProvider, ProviderAuthResult } from './auth-provider.interface';
import { LocalAuthProvider } from './local-auth.provider';

/**
 * Registry of authentication backends. Phase 1 wires only LocalAuthProvider;
 * an LdapAuthProvider can be added by:
 *   1) implementing IAuthProvider with `key = 'ldap'`,
 *   2) constructor-injecting it here,
 *   3) adding it to `this.ordered`.
 *
 * The registry exposes two access patterns:
 *   - `get(key)` — pick a specific provider by key.
 *   - `tryAuthenticate(username, password)` — iterate registered providers in
 *     priority order, return the first successful result. Each provider is
 *     responsible for refusing users that don't belong to it (see
 *     LocalAuthProvider, which checks `users.auth_provider === 'local'`).
 *
 * The "iterate" pattern lets us coexist with LDAP-only users that may not yet
 * have a local row, without leaking which provider rejected which user.
 */
@Injectable()
export class AuthProviderRegistry {
  private readonly ordered: IAuthProvider[];
  private readonly byKey: Map<string, IAuthProvider>;

  constructor(local: LocalAuthProvider) {
    this.ordered = [local];
    this.byKey = new Map(this.ordered.map((p) => [p.key, p]));
  }

  get(key: string): IAuthProvider {
    const p = this.byKey.get(key);
    if (!p) throw new Error(`No auth provider registered for "${key}"`);
    return p;
  }

  list(): IAuthProvider[] {
    return [...this.ordered];
  }

  /**
   * Try each provider in order. The first one that returns a result wins.
   * If none accept, throw a generic INVALID_CREDENTIALS — never reveal which
   * provider rejected the attempt.
   */
  async tryAuthenticate(username: string, password: string): Promise<ProviderAuthResult> {
    for (const p of this.ordered) {
      try {
        return await p.authenticate(username, password);
      } catch (err) {
        // Re-throw "hard" errors (e.g. account locked) so the caller can show
        // the right message; only swallow "this isn't my user" rejections.
        if (isProviderRejectsThisUser(err)) continue;
        throw err;
      }
    }
    throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS' });
  }
}

/**
 * A provider signals "not my user" by throwing a 401 with code
 * `WRONG_PROVIDER`. Any other 401/403 is propagated.
 */
function isProviderRejectsThisUser(err: unknown): boolean {
  const e = err as { response?: { code?: string }; getResponse?: () => unknown };
  const body = e?.response ?? (typeof e?.getResponse === 'function' ? e.getResponse() : undefined);
  return !!body && (body as { code?: string }).code === 'WRONG_PROVIDER';
}
