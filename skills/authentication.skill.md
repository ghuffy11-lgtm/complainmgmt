# Skill — Authentication

## Purpose

Identify a caller and produce a credential the rest of the API trusts. Phase 1 implements **local** username+password auth; the same shape must accommodate **LDAP/AD** later without any changes to consumers.

## Inputs / outputs

```
login(username, password)         → { accessToken, refreshToken, user }
refresh(refreshToken)             → { accessToken, refreshToken }   // rotated
logout(refreshToken)              → void
verifyAccessToken(jwt)            → AuthUser | throws Unauthorized
changePassword(userId, oldPw, newPw) → void
```

`AuthUser` shape (attached to `req.user`):

```ts
type AuthUser = {
  id: number;
  username: string;
  displayName: string;
  /** Primary / "home" department, used to default form pickers + dashboard
   *  scope label. Null for users without a primary (admins/managers who
   *  span departments). */
  departmentId: string | null;
  /** Every active department the user belongs to. Drives `*.own:read`
   *  scoping in complaints + dashboard. Empty for users with no
   *  memberships. */
  departmentIds: string[];
  roleKeys: string[];
  permissions: Set<string>;   // resource:action
};
```

`departmentIds` is computed at materialise time from `user_departments WHERE is_active = TRUE`. Like `permissions`, it's frozen into the `AuthUser` snapshot so per-request scope checks are O(1) — changes to a user's memberships don't take effect until the next access-token refresh (or `/auth/me` re-materialise).

## Logic

### Login

1. Look up user by username (case-insensitive).
2. If `is_active === false` → `401 INVALID_CREDENTIALS` (don't leak which case).
3. If `locked_until > now` → `423 ACCOUNT_LOCKED`.
4. `bcrypt.compare(password, user.password_hash)`:
   - On failure: increment `failed_login_count`. If it crosses `lockout.max_failed_logins`, set `locked_until = now + lockout.duration_minutes`. Return `401 INVALID_CREDENTIALS`.
   - On success: zero `failed_login_count`, clear `locked_until`, set `last_login_at = now`.
5. Issue access JWT (`exp = now + JWT_ACCESS_TTL`, claims include `sub`, `roleKeys`).
6. Generate opaque refresh token (`crypto.randomBytes(48).toString('base64url')`); store its sha256 in `auth_refresh_tokens` with `user_agent`, `ip`.

### Refresh (rotation)

1. Hash the supplied token, look up the row.
2. Reject if missing, `revoked_at IS NOT NULL`, or `expires_at <= now`.
3. **Revoke** the old row (`revoked_at = now`), issue a new refresh token row, set `replaced_by` on the old row.
4. Issue a new access JWT.

This rotation chain detects token theft: if a stolen old token is used after rotation, it will already be revoked → `401`. Optionally, a chain-replay detection step revokes the entire chain.

### Logout

Hash the supplied refresh token, mark its row revoked. Access tokens remain valid until `exp`; clients are expected to drop them locally.

### Password hashing

`bcrypt.hash(password, BCRYPT_ROUNDS)`. Default cost 12. Never log raw passwords; never log hashes either.

### Provider abstraction

```ts
interface IAuthProvider {
  authenticate(username: string, password: string): Promise<{ providerUserId: string; profile: ProfileSnapshot }>;
}
```

`LocalAuthProvider` reads from `users.password_hash`. `LdapAuthProvider` (future) does an LDAP bind. The login orchestrator decides which provider based on `users.auth_provider`. The downstream issue-tokens path is provider-agnostic.

## Edge cases

- **Empty username/password** → 400, never let an empty bcrypt hash pass.
- **Password change while logged in elsewhere** → revoke all of the user's refresh tokens.
- **Admin password reset** → same behaviour as a user-initiated change, plus emit an audit row `password_reset_by_admin`.
- **Clock skew** → JWT `exp` validation uses no leeway; rely on rotation, not skew.
- **Replaying a token across IPs** → tracked in `user_agent`/`ip`, not blocked. Anomaly detection is roadmap.
- **Login rate-limit** — 5/min/IP at NGINX **and** at Nest throttler (defence in depth). Lockout kicks in per-user after `max_failed_logins`.
- **Username enumeration** — the same generic error message and a constant-time compare path for the "user not found" branch (run a dummy bcrypt to keep timing flat).

## Reusability notes

- `IAuthProvider` is the single extension point for swapping/adding auth backends.
- `verifyAccessToken` is what the JwtAuthGuard calls — every other guard (PermissionsGuard, etc.) reads `req.user` and never re-verifies.
- The refresh-token table is also the audit trail for sessions; admin "force logout" = `UPDATE auth_refresh_tokens SET revoked_at = NOW() WHERE user_id = …`.
