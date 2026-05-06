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
| POST | `/auth/login` | `{username, password}` | `{accessToken, refreshToken, user}` |
| POST | `/auth/refresh` | `{refreshToken}` | `{accessToken, refreshToken}` (rotated) |
| POST | `/auth/logout` | `{refreshToken}` | `204` |
| GET  | `/auth/me` | — | current user + effective permissions + active department memberships |
| POST | `/auth/change-password` | `{currentPassword, newPassword}` | `204` |

Login is rate-limited (5/min/IP) and tracks `failed_login_count` per user; after N failures the user is temporarily locked.

The `user` payload (and `/auth/me` response) shape:

```jsonc
{
  "id": 1,
  "username": "sjohnson",
  "displayName": "Sarah Johnson",
  "departmentId": "3",            // primary / "home" department, may be null
  "departmentIds": ["3", "5"],    // every active department membership
  "roleKeys": ["supervisor"],
  "permissions": ["complaint:read", "complaint:update", ...]
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
