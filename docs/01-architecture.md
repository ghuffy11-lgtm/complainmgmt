# 01 — System Architecture

## Goals

1. **Replace Excel** with a multi-user, auditable workflow.
2. **No hardcoding.** Roles, permissions, and complaint fields are defined at runtime by admins.
3. **Auditable.** Every field change is recorded with old/new values, actor, timestamp.
4. **Secure.** TLS in transit, bcrypt for passwords, RBAC + field-level locks for authorization.
5. **Modular.** Each module owns its data and exposes a stable API surface; modules consume each other only through services.
6. **Future-ready.** Auth, storage, and notifications are pluggable behind interfaces.

## High-level diagram

```
                 ┌──────────────────────────┐
   Browser ──▶   │  NGINX (TLS, gzip,       │  ──▶ /         frontend (static SPA)
                 │  rate limit, headers)    │  ──▶ /api/*    backend (NestJS)
                 └──────────────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │  PostgreSQL 16  │
                       └─────────────────┘
```

All services run inside a single Docker bridge network (`cts-net`).
Only NGINX exposes ports to the host. The backend and frontend are unreachable from outside the network.

## Logical modules

| # | Module | Responsibility |
|---|---|---|
| 1 | **Auth** | Local username/password, JWT issuance, refresh, password change. JWT carries `departmentIds[]` for scope-aware reads. LDAP-ready interface. |
| 2 | **Users** | User CRUD, profile, role assignment, activation/deactivation. Multi-department membership via `user_departments` join (each row carries `is_active`). `users.department_id` is the *primary*, kept consistent with the join by a BEFORE-INSERT/UPDATE trigger. |
| 3 | **Roles & Permissions** | Dynamic role definitions; permissions as `(resource, action)` tuples; role↔permission and user↔role joins. |
| 4 | **Departments** | Org units used for complaint assignment + (via memberships) for read scoping. |
| 5 | **Dynamic Fields** | Admin-managed complaint field schema (label, type, validation incl. `digits`/`minDigits`/`maxDigits`, dropdown options, role visibility, `is_searchable` flag). |
| 6 | **Complaints** | Complaint lifecycle, status, dynamic field values, locking metadata. Department-scoped reads via `complaint.own:read` + creator-OR. |
| 7 | **Field Locking** | First-writer-wins ownership of designated fields with supervisor/admin override. |
| 8 | **Assignment** | Single-department assignment with full assignment history; assignee must be an active member of the target department. |
| 9 | **Attachments** | Up to 5 files × 2 MB each per complaint, stored as `bytea`. |
| 10 | **Audit** | Append-only log of every field change across complaint records. |
| 11 | **Dashboard** | Aggregated counts/breakdowns. `dashboard:read` sees everything; `dashboard.own:read` scopes to the caller's active department memberships. |
| 12 | **Admin** | Endpoints/views to manage users, roles, permissions, fields, departments, settings. |
| 13 | **Branding** | Single-row `branding_assets` table for the logo + `branding.*` keys in `system_settings`. Public `/api/branding` (no auth) drives the login page; admin upload/replace/clear under `/api/admin/branding`. |
| 14 | **Notifications** *(scaffold only)* | Pluggable transport (email/webhook); event-driven. |

## Cross-cutting concerns

- **Configuration:** `@nestjs/config` + Joi validation (`src/config/`).
- **Database access:** TypeORM with explicit repositories; SQL migrations under `db/migrations` are the canonical schema. TypeORM `synchronize` is **never** enabled.
- **Validation:** `class-validator` DTOs at the controller boundary.
- **Error handling:** Global `HttpExceptionFilter` returns consistent `{ error, code, details, traceId }` shape.
- **Logging:** Pino structured logs with request-id correlation.
- **Security headers:** `helmet`, strict CSP at NGINX, HSTS once cert is real.
- **Rate limiting:** `@nestjs/throttler` on auth endpoints, NGINX rate limit zones for global.
- **Frontend stack:** Tailwind v4 with semantic CSS-variable tokens (`@theme` block) — re-skin via the `:root` block in `frontend/src/styles.css`. Icons via `lucide-react`. Modal/toast motion via the `motion` package (Framer Motion successor). Composable button-as-link via `@radix-ui/react-slot`.

## Authentication flow

1. Client `POST /api/auth/login` with username + password.
2. Backend `bcrypt.compare`, on success issues a short-lived **access** JWT and a long-lived opaque **refresh token** (stored hashed in `auth_refresh_tokens`).
3. Client puts the access token in `Authorization: Bearer …`.
4. Refresh: `POST /api/auth/refresh` rotates the refresh token (old token is revoked, new token issued).
5. Logout: `POST /api/auth/logout` revokes the current refresh token row.

The `IAuthProvider` interface lets us swap local-auth for LDAP without touching the rest of the app. See `skills/authentication.skill.md`.

## Authorization model

- **Permission** = `(resource, action)` e.g. `("complaint", "update")`, `("complaint.field:investigation", "write")`, `("admin.users", "manage")`.
- **Role** = named bag of permissions, created at runtime.
- **User** has 0..N roles. Effective permissions = union of roles' permissions.
- Field-level access is encoded as permissions of the form `complaint.field:<field_key>` with actions `read | write | override`.
- Override on a locked field is a separate permission so that a supervisor *role* can be configured per deployment.
- **Visibility scope** has two tiers:
  - `complaint:read` / `dashboard:read` → full visibility (admin / manager).
  - `complaint.own:read` / `dashboard.own:read` → narrowed to the caller's active department memberships, plus complaints they created (`created_by = me`). The list endpoint applies the scope server-side; detail returns 404 (not 403) for cross-dept reads to avoid leaking existence.

See `skills/rbac.skill.md`.

## Field locking

The four legacy fields (Patient Complaint, Complaint Investigation, Action Taken, PRO) are seeded as dynamic fields with `locking: first_writer_wins`. Any dynamic field can be configured the same way — locking is not hardcoded to those four. Locking metadata lives on `complaint_field_values` (`owner_user_id`, `locked_at`).

See `skills/field-locking.skill.md`.

## Audit trail

Every write to a complaint field flows through `AuditService.recordChange()`, producing a row in `complaint_audit_log` with `(complaint_id, field_key, old_value, new_value, actor_id, occurred_at, action)`. Direct repository writes that bypass the service are forbidden by code review and an integration test that asserts no field can be written outside the service path.

## Data flow: creating a complaint

```
React form  ─►  POST /api/complaints
                   │
                   ▼
          ComplaintsController
                   │ DTO validation (class-validator + dynamic field schema)
                   ▼
            ComplaintsService.create()
            ├── DynamicFieldService.validateValues()
            ├── ComplaintRepo.insert(core row)
            ├── ComplaintFieldValueRepo.insertMany(values)
            ├── AuditService.recordCreation()
            └── (optional) AssignmentService.assignInitial()
                   │
                   ▼
          Single DB transaction
```

All multi-table writes happen inside one transaction; failures roll back atomically.

## Deployment topology

Single host, three containers + one DB container behind NGINX. Horizontal scale path:

- Backend is stateless (refresh tokens in DB) → can scale to N replicas behind NGINX upstream.
- Postgres → managed service or replicated cluster.
- Attachments in DB simplifies day-1 ops; if size becomes a problem, the `IAttachmentStore` interface lets us move blobs to S3/NAS without API changes (see `skills/file-upload.skill.md`).

## Out of scope (phase 1)

- Email/SMS/Push notifications (interface defined, no implementation).
- LDAP/AD (interface defined).
- External attachment storage.
- Multi-tenancy.
