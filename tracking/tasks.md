# Tasks

Format: `[STATUS] ID — Title (Epic) — owner` followed by an outcome description.

`STATUS` is one of: `TODO`, `WIP`, `REVIEW`, `DONE`.

> The runtime task tracker (this repo's task system) holds the live state. This file is the durable backlog readable in a text editor.

---

## E1 — Authentication

- [DONE]   T-001 — Schema for users, refresh tokens (E1)
  *Migration `0001_init_auth_rbac.sql` creates `users` + `auth_refresh_tokens`.*
- [DONE]   T-002 — `LocalAuthProvider` + login flow (E1)
  *Bcrypt verify, lockout, constant-time enumeration defence, provider-key ownership check. Unit tests.*
- [DONE]   T-003 — JWT issue + verify (E1)
  *HS256, configurable TTL, signed via `JwtModule.registerAsync` with secret from env.*
- [DONE]   T-004 — Refresh token rotation + revoke (E1)
  *DB-backed; rotation is transactional with conditional UPDATE so concurrent refreshes can't both succeed.*
- [DONE]   T-005 — `change-password` endpoint + force-logout side-effect (E1)
  *Validates current password, updates hash, revokes all refresh tokens.*
- [DONE]   T-006 — Login rate-limit + per-user lockout (E1)
  *NestJS Throttler (5/min/IP), NGINX login zone, per-user lockout after 5 failed attempts (15 min).*
- [DONE]   T-007 — `IAuthProvider` interface + factory wiring (E1, E14)
  *`AuthProviderRegistry` iterates providers; `WRONG_PROVIDER` falls through; LDAP slot reserved.*

## E2 — Authorization

- [DONE]   T-010 — Schema for roles, permissions, joins (E2)
- [DONE]   T-011 — `PermissionsService.materialize(userId)` (E2)
  *Single SQL join over user_roles → roles → role_permissions → permissions; produces AuthUser snapshot. Unit tests cover empty roles, dedup, wildcards.*
- [DONE]   T-012 — `JwtAuthGuard` (E2)
  *Validates Bearer token, populates `req.user`, honours `@Public()`. Unit tests.*
- [DONE]   T-013 — `PermissionsGuard` + `@RequirePermissions()` decorator (E2)
  *AND via `@RequirePermissions`, OR via `@RequireAnyPermission`, wildcard-aware. Unit tests.*
- [TODO]   T-014 — Wildcard resolution for `complaint.field:*:write` (E2)
- [TODO]   T-015 — Auto-provision per-field permissions on dynamic field create (E2, E4)
- [DONE]   T-016 — Seed default role/permission grid (E2)

## E3 — Users & Departments

- [TODO]   T-020 — Users admin endpoints (CRUD + role assignment + reset pw) (E3)
- [TODO]   T-021 — Departments admin endpoints (E3)
- [TODO]   T-022 — Activation/deactivation cascade: revoke refresh tokens on deactivate (E3, E1)

## E4 — Dynamic Form

- [DONE]   T-030 — Schema: `dynamic_fields`, `dynamic_field_options`, `complaint_field_values` (E4)
- [DONE]   T-031 — `DynamicFieldsService` CRUD with key immutability rule (E4)
  *Auto-provisions `complaint.field:<key>:read|write|override` permissions on create; refuses to delete system fields and fields with values; replaceOptions preserves option ids for existing values.*
- [DONE]   T-032 — `validateValues()` shared validation function (E4)
  *Pure function in `dynamic-fields/validate-values.ts`; coerces text/number/date/dropdown; supports allowPartial for PATCH; comprehensive unit tests.*
- [DONE]   T-033 — Admin endpoints for fields + options (E4)
  *`/admin/dynamic-fields` (GET, POST, PATCH, DELETE) and `/admin/dynamic-fields/:id/options` (POST replace).*
- [DONE]   T-034 — Frontend renderer: schema → form (E4)
  *`DynamicFieldRenderer` covers text/number/date/dropdown/file from the live schema; lock indicator + per-field validation errors. Used by complaint create + detail.*
- [DONE]   T-035 — Admin UI: field editor + options editor (E4, E11)
  *`AdminFieldsPage` with create/edit modal honoring key/type immutability, plus a replace-options editor for dropdowns.*

## E5 — Complaint lifecycle

- [DONE]   T-040 — Schema: `complaints` (E5)
- [DONE]   T-041 — `ComplaintsService.create()` with reference-no generator (E5)
  *Atomic transaction: ref-number allocation (year-scoped sequence in 0008), complaint row, field values with first-writer ownership, audit row, optional initial assignment.*
- [DONE]   T-042 — `ComplaintsService.update()` with per-field permission check (E5, E2)
  *PATCH semantics; per-field write permission; SELECT … FOR UPDATE on the parent row; refuses to clear required fields; full audit trail.*
- [DONE]   T-043 — Status / priority endpoints (E5)
  *`PATCH /complaints/:id/status` and `:id/priority`; audit rows with synthetic field keys `__status__` / `__priority__`.*
- [DONE]   T-044 — List endpoint with filters (status, priority, assignedTo, department, q) (E5)
  *`GET /complaints` with the documented filters and pagination envelope.*
- [DONE]   T-045 — Frontend: list + detail + edit pages (E5)
  *List with status/priority/department/q filters + pagination; detail page with two-column layout (fields editor + state/history); create wizard. PATCH only sends changed fields.*

## E6 — Field locking

- [DONE]   T-050 — `LockingService.assertWritable()` + ownership apply (E6)
  *Pulled in alongside T-042; pure `decide()` returning `allow | allow_with_override | allow_takes_ownership`; comprehensive unit tests covering owner, non-owner, blank-clear, wildcard override.*
- [DONE]   T-051 — Override audit row distinct action (E6, E9)
  *Audit emits `action='lock_override'` (vs `'update'`) when override permission is exercised.*
- [DONE]   T-052 — Frontend: lock indicator + override dialog (E6)
  *Lock 🔒 indicator and disabled state on locked fields. Users with override permission see the field unlocked; backend distinguishes the resulting audit row as `lock_override`. The 409 FIELD_LOCKED response surfaces a toast for users without override.*

## E7 — Assignment

- [DONE]   T-060 — Schema: `complaint_assignment_history` (E7)
- [DONE]   T-061 — `AssignmentService.assign()` + `.assignInitial()` (E7)
  *Single `apply()` covers both create-time and update-time assignment. Validates active department and active user; writes history row + audit row inside the caller's transaction.*
- [DONE]   T-062 — History endpoint (E7)
  *`GET /complaints/:id/assignments` returning history newest-first; permission `complaint:read`.*
- [DONE]   T-063 — Frontend: assignment dialog + history view (E7)
  *`AssignmentDialog` with department + optional user pickers + note. History panel shows newest-first old → new transitions.*

## E8 — Attachments

- [DONE]   T-070 — Schema + ≤3 trigger + 2 MB CHECK (E8)
- [DONE]   T-071 — `IAttachmentStore` + `DbAttachmentStore` (E8, E14)
  *Interface in `attachment-store.interface.ts`; phase-1 impl reads from `complaint_attachments.content`. Forward-compatible with future S3 / FS stores.*
- [DONE]   T-072 — Upload/download/delete endpoints (E8)
  *Nested under `/complaints/:complaintId/attachments`. Multer memory-storage with edge size cap, parent-row pessimistic lock to serialize concurrent uploads, count cap (≤3) checked in service AND backed by trigger in 0004.*
- [DONE]   T-073 — MIME sniffing + allow-list + filename sanitize (E8)
  *`file-validation.ts`: server-side magic-byte sniff via `file-type`, UTF-8 fallback for plain text, allow-list pulled from `system_settings.attachments.allowed_mime_types`, filename sanitisation (path strip, control-char strip, NFC, length cap, placeholder fallback). Unit tests cover each.*
- [DONE]   T-074 — Frontend: drag-drop uploader + list (E8)
  *`AttachmentsPanel` with drag-drop zone, client-side 2 MB / 3-file pre-checks (server is still authoritative), Blob-URL download flow that respects the access-token interceptor.*

## E9 — Audit

- [DONE]   T-080 — Schema (E9)
- [DONE]   T-081 — `AuditService.recordChange()` + `.recordChanges()` (E9)
  *Used on every mutation in ComplaintsService, AssignmentsService and AttachmentsService. Always inside the caller's transaction.*
- [DONE]   T-082 — INSERT-only DB role (E9)
  *Migration `0009` revokes UPDATE/DELETE/TRUNCATE on `complaint_audit_log` from PUBLIC. Triggers in `0005` block modification at the row level. Production role-split (table owned by a non-app role; app role granted only INSERT/SELECT) documented in deployment guide.*
- [DONE]   T-083 — Audit query endpoint with filters (E9)
  *Global `GET /audit` (audit:read) and per-complaint `GET /complaints/:id/audit` (complaint:read).*
- [DONE]   T-084 — Frontend: per-complaint timeline + admin search (E9)
  *`AuditTimeline` shared component renders old → new diffs with action badges; per-complaint usage on the detail page, full search with filters on `AdminAuditPage`.*

## E10 — Dashboard

- [DONE]   T-090 — Aggregation queries (status, priority, department) (E10)
- [DONE]   T-091 — `/dashboard/*` endpoints (E10)
  *`/dashboard/summary`, `/by-status`, `/by-priority`, `/by-department`. Counts cast to int at the SQL layer.*
- [DONE]   T-092 — Frontend: dashboard page (charts + counts) (E10)
  *Summary cards + three breakdown panels with simple bar visualisations. Department names resolved from `/departments`.*

## E11 — Admin Panel UI

- [DONE]   T-100 — Admin shell + navigation + permission-gating (E11)
  *Top-level guard in `App.tsx` requires any admin/audit permission; the shell hides nav links the user can't use.*
- [DONE]   T-101 — Users page (E11, E3)
  *List, create, edit, role replacement, deactivate, password reset. Reset force-logs-out the target user via the existing backend side-effect.*
- [DONE]   T-102 — Roles page + permission grid editor (E11, E2)
  *Two-pane layout: role list ↔ permission grid grouped by resource. System roles can't be deleted.*
- [DONE]   T-103 — Departments page (E11, E3)
- [DONE]   T-104 — Dynamic fields page (E11, E4)
- [DONE]   T-105 — System settings page (E11)
  *JSON editors per setting; only changed keys are PATCHed.*
- [DONE]   T-106 — Audit search page (E11, E9)

## E12 — Deployment

- [DONE]   T-110 — Docker Compose stack + NGINX TLS scaffold (E12)
- [DONE]   T-111 — Real-cert path documented + tested (E12)
  *`scripts/verify-tls.sh <host>` probes /api/health, the cert chain, security headers, and the negotiated TLS versions. Production cert path documented in `docs/04-deployment-guide.md`.*
- [DONE]   T-112 — Backup + restore script (E12)
  *`scripts/backup.sh` (pg_dump → gzip, retention via `RETAIN_DAYS`) and `scripts/restore.sh` (gated by `I_KNOW_THIS_DESTROYS_DATA=1`).*
- [DONE]   T-113 — Healthcheck endpoint + NGINX upstream check (E12)
  *`/api/health` already in place. Docker-compose healthchecks added for `backend` (HTTP probe) and `nginx` (HTTPS probe). NGINX upstream blocks added with `max_fails=3 fail_timeout=10s` for passive failover.*
- [DONE]   T-114 — Hardening checklist run on staging (E12)
  *`scripts/preflight.sh` automates the checklist (env values, JWT_SECRET strength, db port exposure, cert sanity, HSTS). Pre-deploy checklist captured in `docs/08-security-review.md`.*

## E13 — Testing

- [DONE]   T-120 — Backend unit tests scaffolded (Jest) (E13)
  *12 spec files covering auth (provider, registry, refresh, service), RBAC (resolver, service, guards), validation, locking, file validation, reference number formatter.*
- [DONE]   T-121 — Backend integration tests against real Postgres (E13)
  *`test/global-setup.ts` drops/recreates schema and replays migrations against `TEST_DATABASE_URL`. `test/test-app.ts` boots the full Nest app + helpers (`seedAdminUser`, `resetUserData`). Specs: `auth.e2e-spec.ts` (login, refresh rotation, /me, change-pw force-logout) and `complaint-flow.e2e-spec.ts` (reference no, audit row, FIELD_LOCKED, lock_override).*
- [DONE]   T-122 — Frontend component tests (Vitest) (E13)
  *`permissions.test.ts` (the FE mirror of the BE resolver), `error-message.test.ts`, `DynamicFieldRenderer.test.tsx` (text/number/date/dropdown rendering, lock indicator, error display).*
- [DONE]   T-123 — Playwright e2e (E13)
  *`e2e/` workspace with Playwright config and a golden-path test (login → new complaint → see reference no). Skipped by default; opt-in via `E2E_ADMIN_PASSWORD` against a running stack.*
- [DONE]   T-124 — Load test: 100 concurrent users (E13)
  *`scripts/load-test.k6.js` ramps to 100 VUs, hits dashboard/list/fields under auth. Thresholds: `http_req_failed<1%`, `p(95)<300ms`.*
- [DONE]   T-125 — OWASP top-10 review notes (E13)
  *`docs/08-security-review.md` — A01..A10 mapping with status, controls, and residuals. Tied to specific test files and pre-deploy checklist.*

## E14 — Future-ready interfaces

- [TODO]   T-130 — `INotificationTransport` interface + null impl (E14)
- [TODO]   T-131 — `IAttachmentStore` interface (E14, done as part of T-071)
- [TODO]   T-132 — `IAuthProvider` interface (E14, done as part of T-007)
