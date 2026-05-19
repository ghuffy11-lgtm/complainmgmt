# 03 — API Design

All endpoints are prefixed with `/api`. JSON in, JSON out. Authenticated requests carry `Authorization: Bearer <access_token>`.

## Conventions

- **Errors:** `4xx`/`5xx` body shape:
  ```json
  { "error": "Forbidden", "code": "RBAC_DENIED", "details": {...}, "traceId": "..." }
  ```
- **Pagination:** query `?page=1&pageSize=25`; response envelope `{ data: [], meta: { page, pageSize, total } }`.
- **Filtering:** explicit per-endpoint query params. Bracketed keys (`?fv[mobile_number]=555`) are used for the dynamic-field-value filter on the complaints list.
- **Sort:** `?sort=created_at:desc` (whitelisted columns only).
- **Idempotency on writes:** clients may send `Idempotency-Key` header on `POST` (stored for 24h).

## Auth

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| POST | `/auth/login` | `{username, password}` | `{accessToken, refreshToken, user}` OR `{twoFactorRequired: true, challengeToken}` (see 2FA below) |
| POST | `/auth/refresh` | `{refreshToken}` | `{accessToken, refreshToken}` (rotated) |
| POST | `/auth/logout` | `{refreshToken}` | `204` |
| GET  | `/auth/me` | — | current user + effective permissions + active department memberships + `twoFactorEnrolled` |
| POST | `/auth/change-password` | `{currentPassword, newPassword}` | `204` |
| POST | `/auth/2fa/setup` | — (auth required) | `{provisionalSecret, otpauthUrl, qrSvg}` — does not persist |
| POST | `/auth/2fa/enable` | `{provisionalSecret, code}` | `{enrolled: true, backupCodes: [...10]}` — codes shown ONCE |
| POST | `/auth/2fa/verify` | `{challengeToken, code}` (public) | `{accessToken, refreshToken, user}` (same shape as no-2FA login) |
| POST | `/auth/2fa/disable` | `{currentPassword}` | `204` (force-logs-out all sessions) |

Login is rate-limited (5/min/IP). The lockout policy (max failures, window minutes) is read from `system_settings` keys `lockout.max_failed_logins` (default 5) and `lockout.duration_minutes` (default 15). Both password failures (`failed_login_count`) and 2FA-code failures (`failed_2fa_count`) feed the same `users.locked_until` field — once tripped, the user can't bypass via either route.

### Two-factor authentication (TOTP)

When a user has 2FA enrolled, `/auth/login` returns a 5-minute single-use challenge token instead of a session. The client posts that token to `/auth/2fa/verify` along with either a 6-digit TOTP from the user's authenticator app **or** a backup code. Backup codes are formatted `XXXXX-XXXXX` and dashes/spaces are tolerated; each is single-use.

Server-side encryption: TOTP secrets are encrypted at rest with AES-256-GCM using a key from `TOTP_ENCRYPTION_KEY` (env var, base64-encoded 32 bytes). Without it, the 2FA endpoints respond with `503 TOTP_NOT_CONFIGURED`. Generate one with `openssl rand -base64 32`.

Mandatory enforcement: users with the `admin` role cannot use the system without enrolling. Once their password is verified, every authenticated request is rejected with `412 MUST_ENROLL_2FA` until they finish enrollment. The frontend pops a forced-enrollment dialog in response.

Error codes the frontend cares about:

| Code | HTTP | Meaning |
|---|---|---|
| `2FA_CHALLENGE_INVALID` | 401 | Challenge token expired, malformed, or already consumed — restart login. |
| `2FA_CODE_INVALID` | 401 | Wrong TOTP / backup code — try again. |
| `2FA_NOT_CONFIGURED` | 503 | Server is missing `TOTP_ENCRYPTION_KEY`. |
| `2FA_ALREADY_ENROLLED` | 409 | User tried to call `/setup` while already enrolled. |
| `MUST_ENROLL_2FA` | 412 | Admin user must finish enrollment first. |
| `ACCOUNT_LOCKED` | 403 | Lockout window in force; payload includes `until`. |

The `user` payload (and `/auth/me` response) shape:

```jsonc
{
  "id": 1,
  "username": "sjohnson",
  "displayName": "Sarah Johnson",
  "departmentId": "3",            // primary / "home" department, may be null
  "departmentIds": ["3", "5"],    // every active department membership
  "roleKeys": ["supervisor"],
  "permissions": ["complaint:read", "complaint:update", ...],
  "twoFactorEnrolled": false      // true once the user completes 2FA enrollment
}
```

## Branding (public)

> Unauthenticated — the login page reads this **before** sign-in to render the right name + logo. Cached client-side for 5 minutes; admin saves invalidate the cache.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/branding` | none | Returns `{organizationName, systemName, systemShortName, loginSubtitle, loginTagline, footerText, logoUrl, logoUpdatedAt}`. `logoUrl` is `null` when no logo has been uploaded. |
| GET | `/branding/logo` | none | Streams the logo bytes with proper `Content-Type` + `Last-Modified`. URL on the public payload includes a `?v=<updated_ms>` cache buster. |

## Users

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/users` | `admin.users:read` | paged list. Optional `?departmentId=` narrows to active members of that department; `?isActive=true|false` filters by activity. Used by the cascade picker on the assignment dialog. |
| POST | `/users` | `admin.users:manage` | create. Body accepts `departmentIds: string[]` (full membership set) and `departmentId` (primary, must be one of the membership set or backend rejects with `PRIMARY_NOT_MEMBER`). |
| GET | `/users/:id` | `admin.users:read` | Includes `departmentIds`. |
| PATCH | `/users/:id` | `admin.users:manage` | Same body shape; omit `departmentIds` to leave memberships unchanged. |
| POST | `/users/:id/roles` | `admin.users:manage` | `{roleIds:[…]}` replaces user's roles. Forces a re-login by revoking refresh tokens. |
| POST | `/users/:id/reset-password` | `admin.users:manage` | sets a new password |
| POST | `/users/:id/unlock` | `user:unlock` | clears `failed_login_count` + `locked_until`; idempotent. Audited as `account.unlocked_by_admin`. Returns `{unlocked: boolean}`. |
| POST | `/users/:id/reset-2fa` | `user:reset_2fa` | clears the user's TOTP secret + backup codes, force-logs-out their sessions; idempotent. Audited as `2fa.reset_by_admin`. Returns `{wasEnrolled: boolean}`. |

There is also a read-only **Login activity** endpoint at `GET /admin/auth-audit` (gated by `auth_audit:read`) that returns the auth-audit log with filters `username`, `ip`, `event`, `success=true|false`, `from`, `to`, `page`, `pageSize`. Each row carries a resolved `userDisplayName` so the UI doesn't have to N+1 lookup names.

## Roles & Permissions

| Method | Path | Permission |
|---|---|---|
| GET | `/roles` | `admin.roles:read` |
| POST | `/roles` | `admin.roles:manage` |
| PATCH | `/roles/:id` | `admin.roles:manage` |
| DELETE | `/roles/:id` | `admin.roles:manage` (refuses on `is_system`) |
| POST | `/roles/:id/permissions` | `admin.roles:manage` (`{permissionIds:[…]}` replaces set) |
| GET | `/permissions` | `admin.roles:read` (catalog of all `(resource,action)` rows) |

## Departments

| Method | Path | Permission |
|---|---|---|
| GET | `/departments` | authenticated |
| POST | `/departments` | `admin.departments:manage` |
| PATCH | `/departments/:id` | `admin.departments:manage` |

## Dynamic fields

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/dynamic-fields` | authenticated | returns currently-active schema (filtered by role visibility) |
| GET | `/admin/dynamic-fields` | `admin.fields:manage` | full schema incl. inactive |
| POST | `/admin/dynamic-fields` | `admin.fields:manage` | create. Provisions per-field `complaint.field:<key>:read|write|override` permissions atomically. |
| PATCH | `/admin/dynamic-fields/:id` | `admin.fields:manage` | edit. `isSearchable` is editable for `text` / `number` / `dropdown` fields. |
| DELETE | `/admin/dynamic-fields/:id` | `admin.fields:manage` | refuses on `is_system` (deactivates instead) |
| POST | `/admin/dynamic-fields/:id/options` | `admin.fields:manage` | replace dropdown options |

### Validation block accepted on create/update

For `type='number'`, the validation JSON accepts:

| Key | Effect | Error code |
|---|---|---|
| `min` / `max` | numeric value bounds | `TOO_SMALL` / `TOO_LARGE` |
| `digits` | exact digit count (e.g. 8 for an 8-digit phone) | `WRONG_DIGIT_COUNT` |
| `minDigits` / `maxDigits` | digit-count range | `TOO_FEW_DIGITS` / `TOO_MANY_DIGITS` |

For `type='text'`: `maxLength` (`TOO_LONG`), `regex` (`PATTERN_MISMATCH`).
For `type='date'`: `min` / `max` ISO bounds (`TOO_EARLY` / `TOO_LATE`).

## Complaints

> **Frozen states.** When `status ∈ {closed, resolved}`, every mutation
> endpoint below — and attachment uploads/deletes — refuses with `409
> COMPLAINT_FROZEN`. The only way to transition out is `PATCH .../status`
> with the `complaint:reopen` permission, which emits a distinct
> `action='reopen'` audit row.

> **Visibility scope.** Callers with `complaint:read` see everything.
> Callers with only `complaint.own:read` see complaints in their active
> department memberships **OR** complaints they created (creator-always-sees).
> Detail returns **404 (not 403)** for cross-dept reads to avoid leaking
> existence of complaints in other departments.

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/complaints` | `complaint:read` OR `complaint.own:read` | Filters: `status`, `priority`, `assignedTo`, `departmentId`, `q`, `dateFrom` / `dateTo` (inclusive YYYY-MM-DD on `complaint_date`), and `fv[<key>]=<value>` (one or more — see below). |
| GET | `/complaints/:id` | `complaint:read` OR `complaint.own:read` | full record + dynamic values + attachments meta |
| POST | `/complaints` | `complaint:create` | body validated against current dynamic field schema. **`departmentId` is mandatory** — every complaint enters the system already routed. May include `assignedTo` for first-time routing (no `complaint:assign` needed); the assignee must be an active member of `departmentId` (`USER_NOT_IN_DEPARTMENT`). May include `complaintDate` (YYYY-MM-DD) for backdating. |
| PATCH | `/complaints/:id` | `complaint:update` | partial update; per-field write permission checked. May include `values` (dynamic fields) and/or `complaintDate` (string to set, `null` to clear). Visibility scope applies — scoped users get 404 for cross-dept rows. |
| PATCH | `/complaints/:id/status` | `complaint:update` | `{status, note?}`. Transitioning out of `closed`/`resolved` additionally requires `complaint:reopen` and emits an audit row with `action='reopen'`. The optional `note` lands on the audit row. |
| PATCH | `/complaints/:id/priority` | `complaint:update` | `{priority}` |
| POST | `/complaints/:id/assign` | `complaint:assign` | `{departmentId, userId?, note?}`. Assignee must be a member of the target department. |
| POST | `/complaints/:id/lock-override` | `complaint.field:<key>:override` | `{fieldKey, value, note}` (supervisor/admin) |
| GET | `/complaints/:id/audit` | `complaint:read` OR `complaint.own:read` + `audit:read` | per-complaint audit trail |
| GET | `/complaints/:id/assignments` | `complaint:read` OR `complaint.own:read` | assignment history |

### Per-field permission resolution

When PATCHing a complaint, for every field in the request body the service computes:

```
canWrite = perms.has("complaint.field:<key>:write")
        || perms.has("complaint.field:*:write")
isLocked = field.locking == 'first_writer_wins' && fv.owner_user_id != null && fv.owner_user_id != actor.id
canOverride = perms.has("complaint.field:<key>:override")
            || perms.has("complaint.field:*:override")
```

A write is rejected with `403 RBAC_DENIED` if `!canWrite`, or `409 FIELD_LOCKED` if `isLocked && !canOverride`. Otherwise the value is applied; if locking is enabled and there was no owner, the actor becomes owner.

### Searchable field-value filter

`?fv[<field_key>]=<value>` filters the list by a dynamic field's value. Multiple `fv[...]` params combine with AND.

- Field must have `is_active=true` AND `is_searchable=true`, otherwise `400 BAD_FIELD_FILTER`.
- Match semantics depend on field type:
  - `text` → `value_text ILIKE '%<value>%'`
  - `number` → `value_number::text ILIKE '%<value>%'` (so partial digit matches work)
  - `dropdown` → exact match on `value_option_id`
- Implemented as `EXISTS` subqueries against `complaint_field_values` (one per filter) so the count path through `getManyAndCount` doesn't trip over the alias metadata that raw-table joins need.

## Attachments

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/complaints/:id/attachments` | `complaint:read` OR `complaint.own:read` | metadata only |
| POST | `/complaints/:id/attachments` | `complaint:update` | multipart; rejects if count ≥ 3 or size > 2 MB |
| GET | `/complaints/:id/attachments/:attId/download` | `complaint:read` OR `complaint.own:read` | streams `Content-Disposition: attachment` |
| DELETE | `/complaints/:id/attachments/:attId` | `complaint:update` (own) or `complaint:manage` |

Server validates MIME via magic-byte sniffing; client-supplied `Content-Type` is ignored.

## Audit

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/audit` | `audit:read` | filters: `complaintId`, `actorId`, `fieldKey`, `action`. Each row is enriched with `actorName`. |
| GET | `/complaints/:id/audit` | `complaint:read` OR `complaint.own:read` | per-complaint timeline, same enrichment. |
| GET | `/complaints/:id/assignments` | `complaint:read` OR `complaint.own:read` | history rows enriched with `oldAssignedToName`, `newAssignedToName`, `oldDepartmentName`, `newDepartmentName`, `changedByName`. |

## Dashboard

> **Scope.** Callers with `dashboard:read` see all departments and may pass `?departmentId=<id>` to drill into one. Callers with only `dashboard.own:read` are forced to their active department memberships (server ignores the query param). Callers with neither permission don't reach the endpoint.

| Method | Path | Permission |
|---|---|---|
| GET | `/dashboard/summary` | `dashboard:read` OR `dashboard.own:read` |
| GET | `/dashboard/by-status` | `dashboard:read` OR `dashboard.own:read` |
| GET | `/dashboard/by-priority` | `dashboard:read` OR `dashboard.own:read` |
| GET | `/dashboard/by-department` | `dashboard:read` OR `dashboard.own:read` |
| GET | `/dashboard/by-date?days=N` | `dashboard:read` OR `dashboard.own:read` | `N` clamped 1..365. Returns `{ days, data: [{ date, count }] }` for days with non-zero counts on `complaint_date`. Client zero-fills. |
| GET | `/dashboard/aging` | `dashboard:read` OR `dashboard.own:read` | Open-complaint age buckets returned in fixed order: `[{ bucket, count }]` where bucket ∈ `0-1d`, `1-7d`, `7-30d`, `30d+`. Status ∈ {open, in_progress}. |
| GET | `/dashboard/resolution-latency?days=N` | `dashboard:read` OR `dashboard.own:read` | `N` clamped 1..365. `{ count, avgHours, medianHours, p95Hours, perWeek: [{ week, count, avgHours }] }`. Latency derived from the audit log's `__status__` transitions, not `updated_at`. |

`summary` returns the active dept set as `scopedToDepartmentIds` (array, or `null` for full visibility) so the UI can render a "scope" label.

## Admin: system

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/admin/settings` | `admin.settings:manage` | raw key/value JSON store, including `branding.*` keys |
| PATCH | `/admin/settings` | `admin.settings:manage` | low-level editor — Branding card uses dedicated endpoints below |
| POST | `/admin/branding` | `admin.settings:manage` | `{organizationName?, systemName?, …}` — partial patch, validates lengths |
| POST | `/admin/branding/logo` | `admin.settings:manage` | multipart `file=` — accepts PNG / JPEG / WebP / SVG up to 1 MB; sniffs bytes |
| DELETE | `/admin/branding/logo` | `admin.settings:manage` | clears the uploaded logo (frontend falls back to the shield icon) |

## Default permission matrix (seeded)

| Resource:Action | admin | manager | supervisor | employee |
|---|:-:|:-:|:-:|:-:|
| `complaint:read` (full) | ✔ | ✔ | — | — |
| `complaint.own:read` (own depts + own creations) | — | — | ✔ | ✔ |
| `complaint:create` | ✔ | — | ✔ | ✔ |
| `complaint:update` | ✔ | — | ✔ | ✔ (own, non-locked) |
| `complaint:assign` | ✔ | ✔ | ✔ | — |
| `complaint:reopen` | ✔ | — | — | — |
| `complaint.field:*:write` | ✔ | — | ✔ | ✔ |
| `complaint.field:*:override` | ✔ | — | ✔ | — |
| `audit:read` | ✔ | ✔ | ✔ | — |
| `dashboard:read` (full) | ✔ | ✔ | — | — |
| `dashboard.own:read` (own depts) | — | — | ✔ | ✔ |
| `admin.users:manage` | ✔ | — | — | — |
| `admin.roles:manage` | ✔ | — | — | — |
| `admin.fields:manage` | ✔ | — | — | — |
| `admin.departments:manage` | ✔ | — | — | — |
| `admin.settings:manage` | ✔ | — | — | — |

This is **seeded** state — admins can change any of it via the admin panel.

## OpenAPI

The backend serves `/api/docs` (Swagger UI) in non-production builds. The JSON spec is at `/api/docs-json` and is checked into the repo on each release as `docs/openapi.json`.

## Sub-categories & Origins (2026-05-19)

### Sub-categories

| Method | Path | Permission | Notes |
|---|---|---|---|
| `GET` | `/api/departments/:id/subcategories` | any auth'd | list active+inactive subcats for one dept |
| `POST` | `/api/departments/:id/subcategories` | `admin.departments:manage` | body `{ key, name }` (key lower-snake-case, unique per dept) |
| `GET` | `/api/subcategories?departmentId=&active=` | any auth'd | flat list used by the list-page filter |
| `PATCH` | `/api/subcategories/:id` | `admin.departments:manage` | body `{ name?, isActive? }` |

### Origins

| Method | Path | Permission | Notes |
|---|---|---|---|
| `GET` | `/api/origins` | any auth'd | full list ordered by `sort_order, name` |
| `POST` | `/api/origins` | `admin.departments:manage` | body `{ key, name, sortOrder? }` — defaults `sortOrder` to `max+10` |
| `PATCH` | `/api/origins/:id` | `admin.departments:manage` | body `{ name?, isActive?, sortOrder? }` |

### Dashboard

| Method | Path | Permission | Notes |
|---|---|---|---|
| `GET` | `/api/dashboard/by-origin` | `dashboard:read` / `dashboard.own:read` | returns `[{ originId, count }]`. `originId: null` is the legacy bucket. |

### Complaint payload deltas

`POST /api/complaints` and `PATCH /api/complaints/:id` accept two new fields:

- `subcategoryId?: string | null`
- `originId?: string`

`originId` is **required on create**; explicit `null` on PATCH is rejected. `subcategoryId` is required iff the chosen department has ≥1 active sub-category; rejected if the department has none. On a cross-department reassign (`POST /:id/assign`) the server clears any stale `subcategoryId` automatically.

Validation errors return `{ code: 'VALIDATION_FAILED', errors: { origin?: [...], subcategory?: [...] } }` with one of: `REQUIRED`, `NOT_ACTIVE`, `DEPT_MISMATCH_OR_INACTIVE`, `NOT_ALLOWED`, `NO_DEPARTMENT`.

Origin and sub-category changes record audit rows with `fieldKey: '__origin__'` / `'__subcategory__'`.
