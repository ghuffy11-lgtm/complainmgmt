# 03 — API Design

All endpoints are prefixed with `/api`. JSON in, JSON out. Authenticated requests carry `Authorization: Bearer <access_token>`.

## Conventions

- **Errors:** `4xx`/`5xx` body shape:
  ```json
  { "error": "Forbidden", "code": "RBAC_DENIED", "details": {...}, "traceId": "..." }
  ```
- **Pagination:** query `?page=1&pageSize=25`; response envelope `{ data: [], meta: { page, pageSize, total } }`.
- **Filtering:** explicit per-endpoint query params (no `?filter=` magic strings).
- **Sort:** `?sort=created_at:desc` (whitelisted columns only).
- **Idempotency on writes:** clients may send `Idempotency-Key` header on `POST` (stored for 24h).

## Auth

| Method | Path | Body / Query | Returns |
|---|---|---|---|
| POST | `/auth/login` | `{username, password}` | `{accessToken, refreshToken, user}` |
| POST | `/auth/refresh` | `{refreshToken}` | `{accessToken, refreshToken}` (rotated) |
| POST | `/auth/logout` | `{refreshToken}` | `204` |
| GET  | `/auth/me` | — | current user + effective permissions |
| POST | `/auth/change-password` | `{currentPassword, newPassword}` | `204` |

Login is rate-limited (5/min/IP) and tracks `failed_login_count` per user; after N failures the user is temporarily locked.

## Users

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/users` | `admin.users:read` | paged list |
| POST | `/users` | `admin.users:manage` | create |
| GET | `/users/:id` | `admin.users:read` | |
| PATCH | `/users/:id` | `admin.users:manage` | update profile/active flag |
| POST | `/users/:id/roles` | `admin.users:manage` | `{roleIds:[…]}` replaces user's roles |
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
| POST | `/admin/dynamic-fields` | `admin.fields:manage` | create |
| PATCH | `/admin/dynamic-fields/:id` | `admin.fields:manage` | edit |
| DELETE | `/admin/dynamic-fields/:id` | `admin.fields:manage` | refuses on `is_system` (deactivates instead) |
| POST | `/admin/dynamic-fields/:id/options` | `admin.fields:manage` | replace dropdown options |

## Complaints

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/complaints` | `complaint:read` | filters: `status`, `priority`, `assignedTo`, `departmentId`, `q`, date range |
| GET | `/complaints/:id` | `complaint:read` | full record + dynamic values + attachments meta |
| POST | `/complaints` | `complaint:create` | body validated against current dynamic field schema |
| PATCH | `/complaints/:id` | `complaint:update` | partial update; per-field write permission checked |
| PATCH | `/complaints/:id/status` | `complaint:update` | `{status}` |
| PATCH | `/complaints/:id/priority` | `complaint:update` | `{priority}` |
| POST | `/complaints/:id/assign` | `complaint:assign` | `{departmentId, userId?, note?}` |
| POST | `/complaints/:id/lock-override` | `complaint.field:<key>:override` | `{fieldKey, value, note}` (supervisor/admin) |
| GET | `/complaints/:id/audit` | `complaint:read` + `audit:read` | per-complaint audit trail |
| GET | `/complaints/:id/assignments` | `complaint:read` | assignment history |

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

## Attachments

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/complaints/:id/attachments` | `complaint:read` | metadata only |
| POST | `/complaints/:id/attachments` | `complaint:update` | multipart; rejects if count ≥ 3 or size > 2 MB |
| GET | `/complaints/:id/attachments/:attId/download` | `complaint:read` | streams `Content-Disposition: attachment` |
| DELETE | `/complaints/:id/attachments/:attId` | `complaint:update` (own) or `complaint:manage` |

Server validates MIME via magic-byte sniffing; client-supplied `Content-Type` is ignored.

## Audit

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/audit` | `audit:read` | filters: `complaintId`, `actorId`, `from`, `to`, `fieldKey`, `action` |

## Dashboard

| Method | Path | Permission |
|---|---|---|
| GET | `/dashboard/summary` | `dashboard:read` |
| GET | `/dashboard/by-status` | `dashboard:read` |
| GET | `/dashboard/by-priority` | `dashboard:read` |
| GET | `/dashboard/by-department` | `dashboard:read` |

## Admin: system

| Method | Path | Permission |
|---|---|---|
| GET | `/admin/settings` | `admin.settings:manage` |
| PATCH | `/admin/settings` | `admin.settings:manage` |

## Default permission matrix (seeded)

| Resource:Action | admin | manager | supervisor | employee |
|---|:-:|:-:|:-:|:-:|
| `complaint:read` | ✔ | ✔ | ✔ | ✔ (own/dept) |
| `complaint:create` | ✔ | — | ✔ | ✔ |
| `complaint:update` | ✔ | — | ✔ | ✔ (own, non-locked) |
| `complaint:assign` | ✔ | ✔ | ✔ | — |
| `complaint.field:*:write` | ✔ | — | ✔ | ✔ |
| `complaint.field:*:override` | ✔ | — | ✔ | — |
| `audit:read` | ✔ | ✔ | ✔ | — |
| `dashboard:read` | ✔ | ✔ | ✔ | — |
| `admin.users:manage` | ✔ | — | — | — |
| `admin.roles:manage` | ✔ | — | — | — |
| `admin.fields:manage` | ✔ | — | — | — |
| `admin.departments:manage` | ✔ | — | — | — |
| `admin.settings:manage` | ✔ | — | — | — |

This is **seeded** state — admins can change any of it via the admin panel.

## OpenAPI

The backend serves `/api/docs` (Swagger UI) in non-production builds. The JSON spec is at `/api/docs-json` and is checked into the repo on each release as `docs/openapi.json`.
