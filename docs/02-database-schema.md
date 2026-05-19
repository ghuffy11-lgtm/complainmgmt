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
  │
  └──< user_departments >── departments

complaints ──< complaint_field_values >── dynamic_fields
     │
     ├──< complaint_attachments
     ├──< complaint_assignment_history
     └──< complaint_audit_log

departments ──< complaints (assigned_department_id, NOT NULL at create-time)

branding_assets (single-row store: kind='logo')
system_settings (key/value, including branding.* keys)
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
| **department_id** | BIGINT FK departments.id | **Primary** ("home") department. Defaults form pickers + dashboard scope label. Constrained by trigger `users_primary_dept_must_be_member` to be one of the user's active memberships. Nullable for admins/managers who span departments. |
| last_login_at | TIMESTAMPTZ | |
| failed_login_count | INTEGER NOT NULL DEFAULT 0 | for lockout |
| locked_until | TIMESTAMPTZ | |
| created_at, updated_at | TIMESTAMPTZ | |

### `user_departments`  *(migration 0017)*

The user-to-department join table. Lets a user belong to N departments — supervisors covering multiple wards, employees floating between roles.

| Column | Type | Notes |
|---|---|---|
| user_id | BIGINT FK users.id ON DELETE CASCADE | |
| department_id | BIGINT FK departments.id | |
| is_active | BOOLEAN NOT NULL DEFAULT TRUE | revoke without deleting (preserves audit references) |
| created_at, updated_at | TIMESTAMPTZ | |
| | PRIMARY KEY (user_id, department_id) | |

Indexes: partial on `(user_id) WHERE is_active`, partial on `(department_id) WHERE is_active`.

A trigger refuses to set `users.department_id` to a department the user isn't an active member of — keeps the "primary" invariant honest from any code path.

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
| resource | TEXT NOT NULL | e.g. `complaint`, `complaint.own`, `complaint.field:investigation`, `admin.users` |
| action | TEXT NOT NULL | `read` \| `create` \| `update` \| `delete` \| `assign` \| `override` \| `manage` \| `reopen` |
| description | TEXT | |
| | UNIQUE (resource, action) | |

Notable resources:
- `complaint:read` — see all complaints (admin / manager).
- `complaint.own:read` — see only complaints in the caller's active department memberships **OR** complaints they created (creator-always-sees). Granted to supervisor + employee.
- `complaint.field:<key>:read|write|override` — per-field permissions provisioned automatically when a field is created. `:*` wildcards supported.
- `admin.settings:manage` — gates the branding admin endpoints too.

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
| **is_searchable** | BOOLEAN NOT NULL DEFAULT FALSE | When true, the complaints list auto-renders a per-field filter input (`?fv[<key>]=…`). Only meaningful for `text` / `number` / `dropdown`; `date` and `file` ignore this flag. |
| sort_order | INTEGER NOT NULL DEFAULT 0 | |
| validation | JSONB NOT NULL DEFAULT '{}' | See "Validation block" below |
| visibility | JSONB NOT NULL DEFAULT '{"roles":"*"}' | `{"roles":["employee","supervisor"]}` or `*` |
| locking | TEXT NOT NULL DEFAULT 'none' | `none` \| `first_writer_wins` |
| is_system | BOOLEAN NOT NULL DEFAULT FALSE | system fields cannot be deleted, only deactivated |
| created_at, updated_at | TIMESTAMPTZ | |

#### Validation block

Stored as JSONB. Type-specific keys:

| Type | Keys | Effect |
|---|---|---|
| `text` | `maxLength`, `regex` | length cap; arbitrary regex (compile-time validated) |
| `number` | `min`, `max` | numeric value bounds |
| `number` | `digits` | exact digit count, e.g. `{"digits": 8}` for an 8-digit phone |
| `number` | `minDigits`, `maxDigits` | digit-count range, e.g. `{"minDigits":9, "maxDigits":10}` |
| `date` | `min`, `max` | YYYY-MM-DD bounds |
| `dropdown` | — | constraints come from the option list |

Mixing is allowed (`{"digits":8, "min":1}`). Validation runs server-side in `validateValues()`; the client mirrors the same checks for UX.

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
| created_by | BIGINT FK users.id | used by the `complaint.own:read` creator-OR rule |
| assigned_department_id | BIGINT FK departments.id | Nullable in the column, but **mandatory** at the API on create — every complaint enters the system already routed. |
| assigned_to | BIGINT FK users.id | nullable. Validated to be an active member of `assigned_department_id` at write time (`USER_NOT_IN_DEPARTMENT`). |
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

The `?fv[<key>]=<value>` filter on the list endpoint runs an `EXISTS` subquery against this table per filter — `value_number::text ILIKE '%…%'` for numeric fields, `value_text ILIKE` for text, exact match on `value_option_id` for dropdowns. Only fields with `is_searchable=true` are accepted.

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

A trigger enforces ≤ 5 attachments per `complaint_id` (raised from 3 in migration 0021). Allowed MIME set is image/png, image/jpeg, application/pdf (sniffed, not trusted from the request header).

## Audit

### `complaint_audit_log`

Append-only.

| Column | Type | Notes |
|---|---|---|
| id | BIGSERIAL PK | |
| complaint_id | BIGINT FK complaints.id ON DELETE CASCADE | |
| field_key | TEXT | NULL for whole-complaint actions (`create`); synthetic `__status__`, `__priority__`, `__assignment__`, `__attachment__`, `__complaint_date__`, `__settings__` for non-field changes; the field's `key` for dynamic field updates. |
| action | TEXT NOT NULL | `create` \| `update` \| `delete` \| `assign` \| `lock_override` \| `reopen` \| `attachment.added` \| `attachment.removed` \| `password_reset_by_admin` \| `role_permissions_changed` \| `settings_changed` |
| old_value | JSONB | |
| new_value | JSONB | |
| actor_id | BIGINT FK users.id | |
| occurred_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| note | TEXT | optional context (operators can add a note when reopening, etc.) |

`REVOKE UPDATE, DELETE ON complaint_audit_log FROM <app role>` — application code uses an INSERT-only role for this table to make tampering harder. BEFORE-UPDATE/DELETE triggers also raise to backstop.

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

Singleton key/value store for tunables admins may want to edit at runtime.

| Column | Type | Notes |
|---|---|---|
| key | TEXT PK | |
| value | JSONB NOT NULL | |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | |
| updated_by | BIGINT FK users.id | |

Notable seeded keys:

| Key | Purpose |
|---|---|
| `branding.organization_name` | Header strip + footer organisation label |
| `branding.system_name` | Browser tab title, sidebar subtitle, login heading |
| `branding.system_short_name` | Sidebar mark + footer shortcode |
| `branding.login_subtitle` | Subtitle on the login card |
| `branding.login_tagline` | Prompt line above the login form |
| `branding.footer_text` | Right-of-org-name footer text |

The Branding admin UI (Admin → Settings) writes these via `POST /api/admin/branding`, which goes through the same row-level audit as the raw settings editor.

## Branding assets

### `branding_assets`  *(migration 0019)*

Single-row-per-kind store for branding binary assets — bytes live here so jsonb settings stay lean.

| Column | Type | Notes |
|---|---|---|
| kind | TEXT PK | `'logo'` is the only kind today; room for `'favicon'` etc. |
| mime | TEXT NOT NULL | `image/png` \| `image/jpeg` \| `image/webp` \| `image/svg+xml` |
| bytes | BYTEA NOT NULL | the image |
| size_bytes | INTEGER NOT NULL | capped at 1048576 (1 MB) at the API |
| updated_at | TIMESTAMPTZ NOT NULL DEFAULT NOW() | served as `Last-Modified` + used as cache-busting `?v=…` token on the public URL |
| updated_by | BIGINT FK users.id | |

The public `GET /api/branding/logo` streams this row's bytes; `GET /api/branding` returns a URL that includes `?v=<updated_at_ms>` so cached copies invalidate when an admin replaces the logo.

## Migration index

A flat list of all migrations under `db/migrations/`:

| # | File | What it does |
|---|---|---|
| 0001–0013 | foundation, RBAC, complaints, fields, attachments, audit | initial system bring-up |
| 0014 | `users_department.sql` | adds `users.department_id` (single primary) + `dashboard.own:read` permission |
| 0015 | `searchable_fields.sql` | adds `dynamic_fields.is_searchable` + seeds `mobile_number` (8-digit) and `file_id` (10-digit) |
| 0016 | `retire_legacy_mobile_fileid.sql` | deactivates the pre-0015 admin-created `mobile`/`fileid` fields |
| 0017 | `user_departments_multi.sql` | introduces `user_departments` join + the primary-membership trigger |
| 0018 | `complaint_own_read.sql` | provisions `complaint.own:read`, swaps it in for supervisor + employee in place of broad `complaint:read` |
| 0019 | `branding.sql` | `branding_assets` table + seeded `branding.*` settings |
| 0020 | `branding_theme.sql` | adds `branding.primary_color` setting (default `#2563eb`) for the theme picker |
| 0021 | `attachment_cap_5.sql` | raises the per-complaint attachment count cap from 3 to 5 |

## Seed data

The seed migration provisions:

- Roles: `admin`, `manager`, `supervisor`, `employee` (all `is_system = true` so they can't be deleted, but their permissions are editable).
- Permissions: full grid of `resource × action` for everything in scope.
- Role/permission mapping per the matrix in `docs/03-api-design.md` and `skills/rbac.skill.md`.
- An initial admin user **only** when `INITIAL_ADMIN_USERNAME` and `INITIAL_ADMIN_PASSWORD` are present in env (so production deploys can supply secrets).
- Dynamic fields:
  - System text fields (`patient_complaint`, `complaint_investigation`, `action_taken`, `pro`) — all `locking='first_writer_wins'`, `is_system=true`.
  - Searchable number fields (`mobile_number`, `file_id`) seeded by 0015 with `digits` validators and per-field permissions wired into the role grid.
- Departments: empty by default; admin populates per deployment.
- Branding settings: seeded with the previously hardcoded copy so a fresh deploy looks the same as the pre-0019 build until an admin edits them.


---

## Sub-categories & Origins (2026-05-19)

Two new tables shipped alongside the sub-category + origin feature
(migrations `0031` + `0032`):

### `department_subcategories`

Per-department refinement of complaint classification. Cascades off
`departments` (deleting a department wipes its subcat list). Selected
on complaint create when the chosen department has ≥1 active subcat.

| Column         | Type        | Notes                                  |
|----------------|-------------|----------------------------------------|
| id             | BIGSERIAL   | PK                                     |
| department_id  | BIGINT      | FK → departments(id) ON DELETE CASCADE |
| key            | TEXT        | UNIQUE within department               |
| name           | TEXT        |                                        |
| is_active      | BOOLEAN     | Inactive rows hidden from create form  |

### `complaint_origins`

Channel the complaint arrived through. Flat list; admin-managed via
Admin → Origins. Seeded with `social_media`, `verbal`,
`suggestion_box`.

| Column      | Type      | Notes                            |
|-------------|-----------|----------------------------------|
| id          | BIGSERIAL | PK                               |
| key         | TEXT      | UNIQUE                           |
| name        | TEXT      |                                  |
| is_active   | BOOLEAN   | Inactive rows hidden from picker |
| sort_order  | INT       | Lower sorts first; auto-defaults |

### `complaints` (new columns)

| Column         | Type   | Notes                                              |
|----------------|--------|----------------------------------------------------|
| subcategory_id | BIGINT | nullable; FK → department_subcategories(id)        |
| origin_id      | BIGINT | nullable in DB; required on create at the API tier |

