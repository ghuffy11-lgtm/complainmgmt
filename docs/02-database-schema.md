# 02 — Database Schema

PostgreSQL 16. All tables use:

- `id BIGSERIAL PRIMARY KEY` (or `UUID` for tokens — see notes below).
- `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` — maintained by a trigger `set_updated_at()`.
- Soft delete is **not** used. Audit log is the historical record; deletes are real.
- Foreign keys are `ON DELETE RESTRICT` unless explicitly noted.
- Naming: `snake_case`, plural tables, singular columns, FK columns end in `_id`.

The migrations under `db/migrations/*.sql` are the source of truth; this document mirrors them.

## ER overview

```
users ──< user_roles >── roles ──< role_permissions >── permissions

complaints ──< complaint_field_values >── dynamic_fields
     │
     ├──< complaint_attachments
     ├──< complaint_assignment_history
     └──< complaint_audit_log

departments ──< complaints (assigned_department_id)
```

## Auth & RBAC

### `users`

| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| username | CITEXT UNIQUE NOT NULL | case-insensitive |
| email | CITEXT UNIQUE | optional, used for future notifications |
| display_name | TEXT NOT NULL | |
| password_hash | TEXT NOT NULL | bcrypt (`$2b$…`) — empty string forbidden |
| auth_provider | TEXT NOT NULL DEFAULT 'local' | `local` \| `ldap` (future) |
| is_active | BOOLEAN NOT NULL DEFAULT TRUE | |
| last_login_at | TIMESTAMPTZ | |
| failed_login_count | INTEGER NOT NULL DEFAULT 0 | for lockout |
| locked_until | TIMESTAMPTZ | |
| created_at, updated_at | TIMESTAMPTZ | |

### `roles`

| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| key | TEXT UNIQUE NOT NULL | machine name, e.g. `supervisor` |
| name | TEXT NOT NULL | display name |
| description | TEXT | |
| is_system | BOOLEAN NOT NULL DEFAULT FALSE | seeded roles cannot be deleted |
| created_at, updated_at | TIMESTAMPTZ | |

### `permissions`

| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| resource | TEXT NOT NULL | e.g. `complaint`, `complaint.field:investigation`, `admin.users` |
| action | TEXT NOT NULL | `read` \| `create` \| `update` \| `delete` \| `assign` \| `override` \| `manage` |
| description | TEXT | |
| | UNIQUE (resource, action) | |

### `user_roles`

| Column | Type | Notes |
|---|---|---|
| user_id | BIGINT FK users.id ON DELETE CASCADE | |
| role_id | BIGINT FK roles.id ON DELETE CASCADE | |
| assigned_by | BIGINT FK users.id | nullable for seeded |
| assigned_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| | PRIMARY KEY (user_id, role_id) | |

### `role_permissions`

| Column | Type | Notes |
|---|---|---|
| role_id | BIGINT FK roles.id ON DELETE CASCADE | |
| permission_id | BIGINT FK permissions.id ON DELETE CASCADE | |
| | PRIMARY KEY (role_id, permission_id) | |

### `auth_refresh_tokens`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK DEFAULT gen_random_uuid() | |
| user_id | BIGINT FK users.id ON DELETE CASCADE | |
| token_hash | TEXT NOT NULL | sha256 of opaque token; raw token never stored |
| issued_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| expires_at | TIMESTAMPTZ NOT NULL | |
| revoked_at | TIMESTAMPTZ | |
| replaced_by | UUID FK auth_refresh_tokens.id | for rotation chain |
| user_agent | TEXT | |
| ip | INET | |

Index: `(user_id, revoked_at)` for active-session lookup.

## Departments

### `departments`

| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| key | TEXT UNIQUE NOT NULL | e.g. `pharmacy` |
| name | TEXT NOT NULL | |
| is_active | BOOLEAN NOT NULL DEFAULT TRUE | |
| created_at, updated_at | TIMESTAMPTZ | |

## Dynamic form

### `dynamic_fields`

Defines complaint fields at runtime.

| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| key | TEXT UNIQUE NOT NULL | stable machine key, e.g. `patient_complaint` |
| label | TEXT NOT NULL | display label |
| type | TEXT NOT NULL | `text` \| `number` \| `date` \| `dropdown` \| `file` |
| is_required | BOOLEAN NOT NULL DEFAULT FALSE | |
| is_active | BOOLEAN NOT NULL DEFAULT TRUE | |
| sort_order | INTEGER NOT NULL DEFAULT 0 | |
| validation | JSONB NOT NULL DEFAULT '{}' | `{ min, max, regex, maxLength, ... }` |
| visibility | JSONB NOT NULL DEFAULT '{"roles":"*"}' | `{"roles":["employee","supervisor"]}` or `*` |
| locking | TEXT NOT NULL DEFAULT 'none' | `none` \| `first_writer_wins` |
| is_system | BOOLEAN NOT NULL DEFAULT FALSE | system fields cannot be deleted, only deactivated |
| created_at, updated_at | TIMESTAMPTZ | |

### `dynamic_field_options`

Dropdown values for `type='dropdown'`.

| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| field_id | BIGINT FK dynamic_fields.id ON DELETE CASCADE | |
| value | TEXT NOT NULL | persisted value |
| label | TEXT NOT NULL | display label |
| sort_order | INTEGER NOT NULL DEFAULT 0 | |
| is_active | BOOLEAN NOT NULL DEFAULT TRUE | |
| | UNIQUE (field_id, value) | |

## Complaints

### `complaints`

| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| reference_no | TEXT UNIQUE NOT NULL | e.g. `CMP-2026-000123` |
| status | TEXT NOT NULL DEFAULT 'open' | `open` \| `in_progress` \| `resolved` \| `closed` \| `rejected` |
| priority | TEXT NOT NULL DEFAULT 'normal' | `low` \| `normal` \| `high` \| `critical` |
| created_by | BIGINT FK users.id | |
| assigned_department_id | BIGINT FK departments.id | nullable until assigned |
| assigned_to | BIGINT FK users.id | nullable |
| assigned_by | BIGINT FK users.id | nullable |
| assigned_at | TIMESTAMPTZ | |
| complaint_date | DATE | nullable. Operator-supplied event date — distinct from `created_at` (insertion timestamp). |
| created_at, updated_at | TIMESTAMPTZ | |

Indexes: `status`, `priority`, `assigned_department_id`, `assigned_to`, `created_at DESC`, partial `complaint_date WHERE NOT NULL`.

### `complaint_field_values`

The dynamic payload — one row per (complaint, field).

| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| complaint_id | BIGINT FK complaints.id ON DELETE CASCADE | |
| field_id | BIGINT FK dynamic_fields.id ON DELETE RESTRICT | |
| value_text | TEXT | |
| value_number | NUMERIC | |
| value_date | DATE | |
| value_option_id | BIGINT FK dynamic_field_options.id | for dropdowns |
| owner_user_id | BIGINT FK users.id | first writer (locking) |
| locked_at | TIMESTAMPTZ | |
| created_at, updated_at | TIMESTAMPTZ | |
| | UNIQUE (complaint_id, field_id) | |

Exactly one of `value_text/number/date/option_id` is non-null, enforced by a CHECK constraint that matches the field's `type`.

## Attachments

### `complaint_attachments`

| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| complaint_id | BIGINT FK complaints.id ON DELETE CASCADE | |
| filename | TEXT NOT NULL | original name, sanitized |
| mime_type | TEXT NOT NULL | from server-side sniffing, not client claim |
| byte_size | INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 2097152) | 2 MB hard cap |
| content | BYTEA NOT NULL | the bytes |
| sha256 | BYTEA NOT NULL | for dedup/integrity |
| uploaded_by | BIGINT FK users.id NOT NULL | |
| uploaded_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |

A trigger enforces ≤ 3 attachments per `complaint_id`.

## Audit

### `complaint_audit_log`

Append-only.

| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| complaint_id | BIGINT FK complaints.id ON DELETE CASCADE | |
| field_key | TEXT | NULL for status/assignment changes; uses synthetic keys like `__status__`, `__assignment__` |
| action | TEXT NOT NULL | `create` \| `update` \| `delete` \| `assign` \| `lock_override` |
| old_value | JSONB | |
| new_value | JSONB | |
| actor_id | BIGINT FK users.id | |
| occurred_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| note | TEXT | optional context |

`REVOKE UPDATE, DELETE ON complaint_audit_log FROM <app role>` — application code uses an INSERT-only role for this table to make tampering harder.

## Assignment history

### `complaint_assignment_history`

| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| complaint_id | BIGINT FK complaints.id ON DELETE CASCADE | |
| old_assigned_to | BIGINT FK users.id | nullable |
| new_assigned_to | BIGINT FK users.id | nullable |
| old_department_id | BIGINT FK departments.id | nullable |
| new_department_id | BIGINT FK departments.id | nullable |
| changed_by | BIGINT FK users.id NOT NULL | |
| changed_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| note | TEXT | |

## System settings

### `system_settings`

Singleton key/value store for tunables admins may want to edit at runtime (timezone, complaint reference format, attachment caps if loosened).

| Column | Type | Notes |
|---|---|---|
| key | TEXT PK | |
| value | JSONB NOT NULL | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| updated_by | BIGINT FK users.id | |

## Seed data

Seed migration provisions:

- Roles: `admin`, `manager`, `supervisor`, `employee` (all `is_system = true` so they can't be deleted, but their permissions are editable).
- Permissions: full grid of `resource × action` for everything in scope.
- Role/permission mapping per the matrix in `docs/03-api-design.md` and `skills/rbac.skill.md`.
- An initial admin user **only** when `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD` are present in env (so production deploys can supply secrets).
- Dynamic fields: `patient_complaint`, `complaint_investigation`, `action_taken`, `pro` (all `text`, all `locking='first_writer_wins'`, all `is_system=true`).
- Departments: empty by default; admin populates per deployment.
