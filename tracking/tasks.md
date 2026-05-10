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

## E15 — Post-1.0 UX feedback (in-flight user testing)

Real-world findings during the first hands-on session. Tracked in batches.

### Batch A — display names + friendly activity + create-time routing

- [DONE]   T-200 — Loosen create-time RBAC so any `complaint:create` user can route a new complaint (E15)
  *`complaint:assign` now gates *re*assignment only. Audit + history still record the actor. See `skills/rbac.skill.md` § "Create-time routing exception".*
- [DONE]   T-201 — `DisplayNamesService` + audit/history enrichment (E15)
  *Global module batch-resolves user/department ids to "DisplayName (username)" / dept name. Eliminates N+1 lookups; adds `actorName`, `oldAssignedToName`, `newAssignedToName`, `oldDepartmentName`, `newDepartmentName`, `changedByName` on the read endpoints.*
- [DONE]   T-202 — Friendly activity timeline (E15)
  *`AuditTimeline` rewritten: each row is a one-line sentence ("Created complaint CMP-2026-…", "Changed status: open → in_progress", "Override on locked field 'Patient Complaint'") with relative timestamps and a "Details" expander for the raw old/new payload. Uses `fieldsByKey` to resolve dynamic-field labels.*

### Batch B — `complaint_date` as a first-class column

- [DONE]   T-210 — Migration: add `complaints.complaint_date DATE` (nullable for legacy rows) (E15)
  *Migration `0010_complaint_date.sql`. Partial index `idx_complaints_complaint_date WHERE complaint_date IS NOT NULL` so range filters are efficient without bloating the index for unset rows.*
- [DONE]   T-211 — DTO + service: accept on create + update + emit audit (E15)
  *`CreateComplaintDto.complaintDate` (YYYY-MM-DD, validated by `@Matches`). `UpdateComplaintDto.complaintDate` accepts string | null (null clears). `update()` runs the date branch in the same pessimistic-locked transaction as field-value writes and emits `action='update'` with synthetic `field_key='__complaint_date__'`.*
- [DONE]   T-212 — UI: date picker on create + detail; replace "Created" column on the list with "Complaint Date" (E15)
  *Create form defaults to today + caps at today (no future-dating). Detail page edits inline via `complaintDateM`. List column "Complaint date" replaces "Created"; null dates render as — with a tooltip exposing the system creation timestamp.*
- [DONE]   T-213 — List filter: date range (E15)
  *`GET /complaints` accepts `dateFrom`/`dateTo` (YYYY-MM-DD, inclusive). Two date inputs in the list toolbar. Rows with null `complaint_date` never match a range filter — intentional.*
- [DONE]   T-214 — Dashboard: time-series chart over `complaint_date` (E15)
  *New `GET /dashboard/by-date?days=N` (clamped 1..365). Inline SVG line+area chart on the dashboard with 30 / 90 / 365 day windows; client zero-fills missing days. Will be replaced with recharts in Batch E.*

### Batch C — closed/resolved state freeze

- [DONE]   T-220 — Add `complaint:reopen` permission (seeded for admin) (E15)
  *Migration `0011_complaint_reopen.sql` inserts the permission and grants it to the `admin` role only. Operators can extend to supervisor (or any other) via the role-grid editor — the migration is idempotent on rerun.*
- [DONE]   T-221 — Service: refuse mutations on closed/resolved unless caller has `complaint:reopen` (E15)
  *`complaint-freeze.ts` exposes `assertEditable` (refuses with 409 `COMPLAINT_FROZEN`) and `classifyStatusTransition` (returns `noop`/`reopen`/`update`, throws 409 `RBAC_DENIED_REOPEN` if the caller lacks the permission). Wired into `ComplaintsService.update/setPriority/assign` and `AttachmentsService.upload/remove`. Reopen is a *status-transition* permission — holders can't bypass the freeze and edit fields directly; they must reopen first.*
- [DONE]   T-222 — UI: lock indicator on detail page; "Reopen" button for users with the permission (E15)
  *Yellow "🔒 read-only" banner on closed/resolved detail pages. Status/priority/complaint-date/department selects all disabled. A "Reopen…" button appears only for users with `complaint:reopen`; opens `ReopenDialog` (target status picker + optional note that lands on the audit row).*
- [DONE]   T-223 — Audit: distinct `reopen` action so timeline calls it out (E15)
  *Migration `0011` extends the `complaint_audit_log.action` CHECK to include `reopen`. `setStatus` emits `action='reopen'` (vs `'update'`) when the previous status was frozen and the new one differs. Timeline renders "Reopened: closed → open" with a danger-color dot.*

### Batch D — attachments UX (image + PDF only)

- [DONE]   T-230 — Stage attachments in the create form, upload after the complaint id is returned (E15)
  *Create form has a drag-drop queue (≤3 files, each ≤2MB, image/PDF only via `accept` attr). On submit: POST /complaints → for-each upload → navigate. Warning-and-continue on per-file failure (named in the toast); the complaint still lands. Atomic create+upload was considered and rejected — needs a multipart create endpoint, see `skills/file-upload.skill.md` for the design note.*
- [DONE]   T-231 — Attachment viewer modal (image inline, PDF via `<embed>`) (E15)
  *`AttachmentViewer` modal: filename click opens it. Images via `<img>` (max 70vh), PDFs via `<embed>` (~70vh). Auth-aware blob fetch; URL revoked on close. Separate "Download" button on each row stays for direct-download workflows. "Preview unavailable" branch is defence-in-depth for operators who broaden the allow-list.*
- [DONE]   T-232 — System allow-list narrowed to image + PDF (E15)
  *Migration `0012_attachments_image_pdf_only.sql` UPDATEs `system_settings.attachments.allowed_mime_types`; `AttachmentsService.DEFAULT_ALLOWED_MIME` mirrors. Operators may still broaden via Admin → Settings — not a hardcoded ceiling.*

### Batch E — dashboard polish

- [DONE]   T-240 — Add `recharts`; replace inline-SVG viz with real charts (E15)
  *`recharts ^2.12` added. AreaChart for trend, PieChart for status, BarChart for priority/department/aging, dual-axis BarChart for resolution latency. Colour mapping per enum so the same value reads consistently across panels.*
- [DONE]   T-241 — Manager-grade dashboard: trend, open critical, resolution latency, aging (E15)
  *Two new endpoints:
    * `GET /dashboard/aging` — buckets `0-1d / 1-7d / 7-30d / 30d+` over status ∈ {open, in_progress}, returned in fixed order;
    * `GET /dashboard/resolution-latency?days=N` — count + avg/median/p95 (linear-interpolated, hours) + per-week histogram of resolutions. Latency is derived from the audit log's `__status__` transition rows, so it's accurate even if `complaints.updated_at` was bumped by an unrelated edit.
   `summary` extended with `open`. Dashboard restructured: KPI strip · trend (with 30/90/365 toggle) · status-pie + priority-bar · department-bar (horizontal) + aging-bar · resolution-latency stats + per-week dual-axis chart.*

### Batch F — theme refresh

- [DONE]   T-250 — Visual refresh: palette, typography, spacing, hover/focus states across the app (E15)
  *Refined CSS design tokens — slate-tuned palette, 8-level type scale, 3-tier elevation, motion tokens, consistent focus ring; preserved every existing variable name so inline-style call-sites kept working. Branded sidebar with gradient mark, inline-SVG icons, active-state left accent, user block at the bottom. Polished login (gradient backdrop + brand mark). `Button` primitive rewritten with hover/active/focus/disabled transitions and an `icon` prop. New `Skeleton` loader, used on the complaints list. Modal + toast got subtle entrance animations. `prefers-reduced-motion` respected. New `Icons.tsx` (~16 hand-rolled inline SVGs, no icon-library dependency).*

## E16 — Round-2 UX feedback (post-Batch-F testing)

- [DONE]   T-300 — Roles editor pre-populates current grants (E16)
  *New `GET /roles/:id/permissions`. RoleEditor loads on selection, pre-checks granted perms, shows a "unsaved changes" hint, disables Save until dirty. Fixes the "select one perm, all others wiped" bug — and incidentally restored the seeded grants that earlier testing had mangled.*
- [DONE]   T-301 — Attachment delete: only owner OR `complaint.attachment:delete_any` (E16)
  *New permission seeded for admin + supervisor (migration `0013`). Old rule (owner OR `complaint:update`) let any employee wipe another employee's evidence.*
- [DONE]   T-302 — Confirmed supervisor field-unlock works via `complaint.field:*:override` (E16)
  *Already in the seed; the user couldn't see it because of T-300. Documented in `skills/rbac.skill.md` § Frozen-state permission and verified via DB query.*
- [DONE]   T-310 — Dashboard click-throughs (E16)
  *KPI cards link to filtered `/complaints` views; pie + bar legends become click-through lists. Complaints list reads filters from the URL, so `?status=open&priority=critical` lands on a pre-filtered view.*
- [DONE]   T-320 — `users.department_id` + scoped user dashboard (E16)
  *Migration `0014`: adds `users.department_id` (nullable FK) and `dashboard.own:read` permission (seeded for supervisor + employee). All `/dashboard/*` endpoints accept optional `?departmentId=…`; the server forces it to the caller's home department for scoped-only users. Frontend renders a slimmer "user dashboard" (status, priority, aging, trend — no resolution latency or by-department) for users without `dashboard:read`. Admin user form gets a "Home department" picker, list shows the column.*
- [DONE]   T-330 — Theme spec for Lovable AI handover (E16)
  *`docs/09-theme-spec-for-lovable.md` — self-contained markdown the user can paste into Lovable. Covers product context, tone, brand identity, all 10 screens with pattern requirements, hard constraints (CSS variable + class name preservation, route paths, permission-gated controls), density principles, and iconography rules.*

## E17 — Authentication hardening (auth audit + unlock + 2FA)

Triggered by an admin-account lockout that needed raw SQL to recover. Batches ship in order: A first (visibility), B next (recovery), C+D last (2FA itself).

### Batch A — Auth audit log + Login Activity admin page

- [DONE]   T-400 — Migration: `auth_audit_log` table + indexes (E17)
  *Migration `0022_auth_audit_log.sql`. Columns: `id bigserial PK`, `occurred_at timestamptz default now()`, `username text NOT NULL`, `user_id bigint NULL` (FK → `users(id)` ON DELETE SET NULL), `event text NOT NULL` (CHECK constraint over 15 v1 events), `ip inet NULL`, `user_agent text NULL`, `detail jsonb NULL`. Five indexes: `(occurred_at desc)`, `(username, occurred_at desc)`, `(user_id, occurred_at desc)` partial, `(ip, occurred_at desc)` partial, `(event, occurred_at desc)`. Append-only enforced via `block_auth_audit_modification()` BEFORE UPDATE/DELETE triggers (mirrors `complaint_audit_log`); privilege-level lockdown REVOKEs UPDATE/TRUNCATE/DELETE-from-PUBLIC, GRANTs INSERT/SELECT — retention cleanup runs as table owner. Applied to running prod DB inside a transaction; verified UPDATE + DELETE both blocked.*
- [DONE]   T-401 — `AuthAuditService.log(event, ctx)` + module wiring (E17)
  *New `backend/src/modules/auth-audit/` module — entity `AuthAuditLogEntity`, service `AuthAuditService.record({ username, userId?, event, ip?, userAgent?, detail? })`, `@Global` module. Insert-only by design (read endpoint comes in T-403). Service `record()` swallows DB failures with a Logger warning so an audit-store outage cannot break the login flow. `AuthAuditEvent` union mirrors the DB CHECK constraint so a typo fails at compile time. Wired into `app.module.ts` ahead of `AuthModule`. Type-checks cleanly; not yet observable at runtime — instrumentation lands in T-402, after which we rebuild the backend image once.*
- [DONE]   T-402 — Instrument every login branch (E17)
  *`AuthCallContext` (ip + userAgent) added to `IAuthProvider.authenticate` and threaded through `AuthProviderRegistry.tryAuthenticate`. `LocalAuthProvider` now emits per-branch audit rows: `login.unknown_user`, `login.wrong_provider`, `login.inactive`, `login.account_locked`, `login.password_failed` (with attempt + threshold detail), and `account.locked` when `recordFailure` crosses the threshold. `AuthService` audits `login.success` after tokens are issued (so the audit reflects "got access", not just "password verified"), `password_changed` on successful change, and `logout` after revoking a refresh token. `RefreshTokenService.revoke` now returns the userId of what it revoked (or null) so logout can audit cleanly. Specs updated for new constructor signatures + new behaviours; all four T-402-affected suites pass. Type-check clean. Backend rebuild required to activate.*
- [DONE]   T-403 — Admin endpoint: `GET /admin/auth-audit` (E17)
  *New `AuthAuditController` at `/admin/auth-audit`. Filters: `username` (exact), `ip` (cast to inet, hits the partial index), `event` (single OR comma-separated `IN`), `success=true|false` (resolves to two pre-built event groups), `from` / `to` (occurred_at range, inclusive, wrapped in a Brackets so they AND together cleanly). Pagination: `page` / `pageSize` matching `audit.controller.ts` style (default 1 / 100, capped at 500). Response `{ data, meta: { page, pageSize, total } }`. Each row carries `userDisplayName` resolved via `DisplayNamesService.usersByIds()` (single batched lookup per page, not N+1). Gated by `@RequirePermissions('auth_audit:read')`. Migration `0023_auth_audit_read_perm.sql` provisions the permission and grants it to admin only — applied to running prod DB.*
- [DONE]   T-404 — Admin UI: "Login Activity" page (E17)
  *New `frontend/src/pages/admin/AdminLoginActivityPage.tsx` mounted at `/admin/login-activity`. Tab in `AdminShell` gated on `has('auth_audit:read')`; route is part of the admin shell's `requireAnyPermission` set. Filters mirror the API: username (text), IP (text), event (Select with friendly labels for all 15 event types), success shortcut (Select; disabled when a specific event is selected to keep the URL semantically clean), date from / to (DateInput). Each row shows timestamp, username + display name (when different), coloured event Badge (success / warn / danger / primary by event class), IP, short user-agent label. Click row to expand: full timestamp, user_id, full UA, pretty-printed `detail` JSON. Empty + loading states handled. Pagination matches `AdminAuditPage` style. Service `auth-audit.service.ts` types every response field. Frontend tsc clean.*
- [DONE]   T-405 — "Recent failures by IP" tripwire panel (E17)
  *New `GET /admin/auth-audit/tripwire?threshold=10&windowHours=24` (gated by `auth_audit:read`). Single SQL aggregate over the failure-event subset, `GROUP BY ip HAVING COUNT(*) >= threshold ORDER BY count DESC`, capped at 50 rows. Threshold and window are clamped to sane ranges so an admin can't accidentally DoS the query. Frontend renders a danger-tinted strip above the table on the Login Activity page when the result is non-empty; each IP is a clickable chip that pre-fills the IP filter and `success=false`. Auto-refreshes every 60s while the page is open.*
- [DONE]   T-406 — Retention setting + nightly cleanup job (E17)
  *Migration `0028_auth_audit_retention.sql` seeds `auth_audit.retention_days = 365` so the key shows in the admin Settings page. New `AuthAuditRetentionService` registered under `@Cron(CronExpression.EVERY_DAY_AT_3AM, { timeZone: 'UTC' })`. Reads the setting; `<= 0` skips deletion, missing key skips with a warn. Wired via `ScheduleModule.forRoot()` in `app.module.ts` and `@nestjs/schedule@^4.0.0` added to deps. `docs/04-deployment-guide.md` explains the privilege caveat — the app role needs `DELETE` on `auth_audit_log` if running with the privilege split, or operators run the prune as a separate maintenance job. Verified by manually invoking the service against the live DB (returned `{ deleted: 0, days: 365 }` as expected — nothing yet old enough to prune).*

### Build hygiene shipped during Batch A polish

- [DONE]   T-460 — Backend Dockerfile uses lockfile + `npm ci` (E17, E12)
  *The Dockerfile previously copied only `package.json` and ran `npm install`, so each build resolved deps fresh — every rebuild was a coin flip on the prebuild CDN for native modules like bcrypt. One such flake bricked a Batch A polish rebuild. Now copies `package-lock.json` too and uses `npm ci` in both build and runtime stages. Backend lockfile regenerated to include `@nestjs/schedule` + transitives.*

### Batch B — Unlock-user tooling (break-glass + admin button)

- [DONE]   T-410 — Permission `user:unlock` + seed for admin (E17, E2)
  *Migration `0024_user_unlock_perm.sql` (renumbered from `0023` since T-403 consumed that). Adds `user:unlock`, grants to admin only. Applied to running prod DB.*
- [DONE]   T-411 — Endpoint: `POST /users/:id/unlock` (E17)
  *Mounted under the existing `users` controller, not `/admin/users` — keeping it on the resource keeps the URL consistent with the rest of `/users/:id/...`. `UsersService.unlock(id, actorId, ctx)` clears `failed_login_count` + `locked_until`, captures previous state in `detail`, and emits `account.unlocked_by_admin` via the auth audit. Idempotent: returns `{ unlocked: false }` without writing an audit row when the user wasn't actually locked, so the button can be safely re-clicked. `UserSummary` DTO gained `lockedUntil` + `failedLoginCount` so the row can render the lock badge without a second fetch.*
- [DONE]   T-412 — Admin UI: "Unlock" button on Users admin page (E17)
  *Button visible only when `isLocked(u)` AND caller has `user:unlock`. Confirmation modal explains what will happen, shows the current lock-until timestamp, and notes that the action is audited as `account.unlocked_by_admin`. Toast on success ("User unlocked" / "User was already unlocked"). Cache invalidation refreshes the row.*
- [DONE]   T-413 — `scripts/unlock-user.sh <username>` break-glass helper (E17)
  *Reads POSTGRES_USER/POSTGRES_DB from `.env`, runs the SQL via `docker compose exec -T db psql` with `psql -v` quoted parameter (SQL-injection-safe). Prints row state before and after, exits non-zero with a clear message if the user doesn't exist. Documented in `docs/10-production-runbook.md` § "Break-glass". Verified against three cases: no such user (exit 2), already-unlocked user (no-op, exit 0), injection attempt (rejected as no-such-user; users table intact).*
- [DONE]   T-414 — Surface lock state in the Users admin list (E17)
  *Locked rows now render a `badge-warn` "locked" pill in the status column with a `title` tooltip showing the lock-until timestamp. The lock pill takes precedence over active/inactive while locked.*

### Batch C — TOTP enrollment + login challenge + backup codes

- [DONE]   T-420 — Migration: 2FA columns + backup-codes table (E17)
  *Migration `0025_two_factor_auth.sql` (renumbered from `0024`). Adds `users.totp_secret_enc bytea NULL`, `users.totp_enrolled_at timestamptz NULL`, `users.failed_2fa_count int NOT NULL DEFAULT 0`. New `user_backup_codes(id, user_id FK, code_hash, used_at, created_at)` with index on `(user_id)`. All additions are guarded with `IF NOT EXISTS` so re-running is safe. Applied to running prod DB.*
- [DONE]   T-421 — Secret encryption helper (E17)
  *`backend/src/modules/auth/crypto/secret-cipher.ts` — AES-256-GCM wrapper. Key parsed from `TOTP_ENCRYPTION_KEY` (base64) at boot; must decode to exactly 32 bytes. Stored ciphertext is `nonce(12) || tag(16) || enc` glued as one Buffer. `isConfigured()` returns false when env not set; `requireKey()` throws `ServiceUnavailableException({ code: 'TOTP_NOT_CONFIGURED' })` so endpoints respond with 503 cleanly. `.env`, `.env.example`, and `docker-compose.yml` all updated with the new variable. Generated key for the live stack with `openssl rand -base64 32`.*
- [DONE]   T-422 — `TwoFactorService` (TOTP verify, backup-code verify, secret lifecycle) (E17)
  *`backend/src/modules/auth/two-factor.service.ts`. Wraps `otplib.authenticator` (30s step, 6 digits, ±1 step drift). `setup()` returns provisional secret + otpauth URL + inline SVG QR (via `qrcode`). `enable()` verifies first code, persists encrypted secret + 10 hashed backup codes inside a transaction. `clear()` for self-disable / admin reset. `verifyTotp()` decrypts and checks. `verifyAndConsumeBackupCode()` bcrypt-compares against unused codes; uses a conditional UPDATE (`used_at IS NULL` filter) to make consumption single-use under concurrency. Backup codes are 10 chars Crockford-base32 formatted as `XXXXX-XXXXX`. Includes the challenge-token issuer (T-425).*
- [DONE]   T-423 — Endpoint: `POST /auth/2fa/setup` (E17)
  *Authenticated; gated by `JwtAuthGuard`. Throttled at 10/min/IP. Returns `{ provisionalSecret, otpauthUrl, qrSvg }`. Provisional secret lives only in the response until `enable` is called — nothing persists. Rejects with 409 if user is already enrolled, 503 if cipher not configured.*
- [DONE]   T-424 — Endpoint: `POST /auth/2fa/enable` (E17)
  *Body validated by `EnableTwoFactorDto` (provisional secret 16-64 chars, code is exactly 6 digits via `@Matches`). On success: persists encrypted secret, sets `totp_enrolled_at`, generates and returns 10 plaintext backup codes (only time they're visible). Audits `2fa.enrolled` with IP/UA. Returns `{ enrolled: true, backupCodes }`.*
- [DONE]   T-425 — Challenge token (5-min single-use JWT) for 2FA step (E17)
  *`TwoFactorService.issueChallengeToken(userId)` and `consumeChallengeToken(token)`. Tokens carry `aud: '2fa-challenge'` so they can't be used as session tokens. Single-use enforced via in-process `consumedJti` map with auto-prune on each verify. 5-minute TTL via JwtModule's `expiresIn`. Multi-process deployments would need to move this to Redis/DB; documented inline.*
- [DONE]   T-426 — Login flow split: issue challenge when 2FA is enrolled (E17)
  *`AuthService.login()` now returns a discriminated union: `{ accessToken, refreshToken, user }` for users without 2FA, or `{ twoFactorRequired: true, challengeToken }` for enrolled users. The provider's password verification is unchanged; the branch happens at `AuthService` level after success. `login.success` audit only fires from `issueSession()` on the no-2FA path; the 2FA path audits `login.2fa_success` later.*
- [DONE]   T-427 — Endpoint: `POST /auth/2fa/verify` (E17)
  *Public (only credential is the challenge token). Throttled at 10/min/IP. `AuthService.completeTwoFactor(token, code, ctx)` consumes the challenge → loads the user → tries TOTP first, falls back to backup-code if TOTP doesn't match (so a user who pasted a backup code by mistake still gets through). On success: clears `failed_2fa_count`, mints session, audits `login.2fa_success` with `usedBackup` flag. On failure: increments `failed_2fa_count`, audits `login.2fa_failed`, throws 401 with `2FA_CODE_INVALID` (constant-time-ish — both branches go through the same code path before responding).*
- [DONE]   T-428 — Endpoint: `POST /auth/2fa/disable` (E17)
  *Authenticated. Requires `currentPassword` in body — re-asserts user is still in possession of the account. Clears the secret + all backup codes via `TwoFactorService.clear()`, then revokes all refresh tokens to force re-login (so any other browser tabs lose their session immediately). Audits `2fa.disabled`. Idempotent (no-op when not enrolled). Throttled tighter (5/min/IP). Admin-role enforcement (cannot self-disable as admin) is deferred to Batch D / T-443.*
- [DONE]   T-429 — Frontend: enrollment dialog under Profile (E17)
  *`TwoFactorEnrollDialog` 3-step wizard. Step 1: SVG QR rendered inline via `dangerouslySetInnerHTML` from server response, manual-entry key shown beneath for cases where scanning fails. Step 2: 6-digit code input (auto-strips non-digits, max 6). Step 3: backup codes panel with copy/download/print buttons and a required "I have saved these" checkbox before "Done" enables. Wired into `AppLayout` as a header button: "Set up 2FA" when not enrolled, "Two-factor: on" when enrolled (clicking opens the disable form). Disable form re-asserts password and force-logs-out.*
- [DONE]   T-430 — Frontend: 2FA prompt on login (E17)
  *`LoginPage` now switches to a code prompt when `/auth/login` returns `{ twoFactorRequired, challengeToken }`. 6-digit input with auto-strip + 0.3em letter-spacing for legibility, autocomplete="one-time-code" so iOS/Android offer to fill from SMS or authenticator. Toggle link "Use a backup code instead" swaps input mode (alphanumeric, 13-char max with dash). On expired challenge (`2FA_CHALLENGE_INVALID`) bounces back to password screen with a clear error. "Sign in as a different user" link cancels back to the password screen.*

### Batch D — 2FA reset + admin enforcement + tunable thresholds

- [DONE]   T-440 — Permission `user:reset_2fa` + seed for admin (E17, E2)
  *Migration `0026_user_reset_2fa_perm.sql` (renumbered from `0025`). Granted to admin only. Applied to running prod DB.*
- [DONE]   T-441 — Endpoint: `POST /users/:id/reset-2fa` (E17)
  *`UsersService.resetTwoFactor()` calls `TwoFactorService.clear()` then `RefreshTokenService.revokeAllForUser()` so the target's open sessions get bounced. Emits `2fa.reset_by_admin` with `detail.actorId`. Idempotent — `{ wasEnrolled: false }` and no audit row when the user wasn't enrolled. Mounted at `POST /users/:id/reset-2fa`, gated by `user:reset_2fa`.*
- [DONE]   T-442 — Admin UI: "Reset 2FA" action on Users admin page (E17)
  *Button shows only when target's `twoFactorEnrolled` AND caller has `user:reset_2fa`. Confirmation modal explains the user will need to re-enroll, that all sessions are signed out, and that the action is audited. Toast distinguishes "Reset" vs. "User was not enrolled" outcomes. `UserSummary` DTO gained `twoFactorEnrolled` (from `users.totp_enrolled_at`).*
- [DONE]   T-443 — Mandatory 2FA for admin-role users (E17)
  *New `TwoFactorRequiredGuard` registered globally (after `JwtAuthGuard`, before `PermissionsGuard`). Throws `412 MUST_ENROLL_2FA` for any authenticated request from a user with the admin role and no `twoFactorEnrolled`, except for an allow-list (`/auth/me`, `/auth/logout`, `/auth/change-password`, `/auth/2fa/setup`, `/auth/2fa/enable`). Frontend api-client interceptor catches 412 and dispatches a window event that AppLayout listens for; the enrollment dialog opens in `mandatory` mode (no Cancel, can't dismiss until enrolled). AppLayout also proactively pops the dialog when `/me` shows admin without 2FA, so it triggers on first render after login. Banner in the wizard explains why the dialog is mandatory.*
- [DONE]   T-444 — `failed_2fa_count` participates in lockout (E17)
  *`AuthService.completeTwoFactor()` failure branch now increments `failed_2fa_count` and, on threshold cross, sets `locked_until` (same shared field as password lockout). Audits `login.2fa_failed` always; `account.locked` (with `trigger: '2fa'` in detail) on the cross. Failure throws `403 ACCOUNT_LOCKED` once locked. Successful verify clears `failed_2fa_count`. Also added a guard at the top of `completeTwoFactor` so a user who got locked between password step and verify step receives `ACCOUNT_LOCKED` instead of being allowed to verify.*
- [DONE]   T-445 — Lockout thresholds move to `system_settings` (E17, E1)
  *New `LockoutPolicy` service reads `lockout.max_failed_logins` (default 5) and `lockout.duration_minutes` (default 15) from `system_settings`. Both already existed as keys in the seed; nothing else to migrate. 30-second TTL cache so a busy login spike doesn't fan out into N extra SELECTs. Cache invalidated on save via `AdminSettingsController` → `LockoutPolicy.invalidate()` whenever either key is touched, so new thresholds take effect on the very next login. Hardcoded constants in `LocalAuthProvider` removed; the existing `TODO(roadmap)` resolved.*
- [DONE]   T-446 — Update docs (E17)
  *`docs/03-api-design.md` — Auth section gained 4 new endpoints, the discriminated-union login response, error-code table for 2FA flows, lockout-source explanation referencing the system_settings keys. Users section gained `unlock` + `reset-2fa` rows and a pointer to the Login Activity endpoint. The break-glass script + admin "Unlock" path were already documented in `docs/10-production-runbook.md` from Batch B.*
- [DONE]   T-447 — Smoke test: 2FA happy path (E17, E13)
  *New `scripts/smoke-test-2fa.sh` walks all 11 steps: password login → setup → compute TOTP via inline Python → enable → logout → login (expect challenge) → fresh TOTP → verify (expect session) → /me check → self-disable → confirm plain login is back. Uses only `bash`, `curl`, `python3` (stdlib for TOTP — `hmac+base64+struct`); no `oathtool` dependency. Existing `smoke-test.sh` left untouched. Two cleanups during first run: (1) JSON-body construction now uses `jq -n --arg` (or stdlib Python fallback) instead of `printf %q`, which produces shell-quoted, not JSON-quoted, output and silently sent malformed bodies; (2) the "missing field" check now rejects literal `"null"` as well as Python's `"None"`, so a jq miss is caught immediately rather than carrying a `Bearer null` header through the rest of the script. Verified end-to-end against a temp `smoke-2fa-tmp` user; all 11 steps green.*

### Hot-fixes shipped alongside Batch C/D

- [DONE]   T-450 — QR code rendered too small to scan (E17)
  *qrcode 1.5.x emits SVG with only `viewBox` set when no `width` is passed. Browsers default to rendering such an SVG at the viewBox dimensions in CSS pixels (~31px), making the QR a tiny smudge. Fixed in `TwoFactorService.setup()` by passing `{ width: 240 }` to `QRCode.toString` so the `<svg>` carries explicit `width="240" height="240"`. Backend-only change.*
- [DONE]   T-451 — `auth_audit_log` append-only trigger blocked the FK cascade (E17)
  *`0022` declared `user_id ... ON DELETE SET NULL` so audit history outlives a deleted user. The append-only BEFORE UPDATE trigger then unconditionally rejected the UPDATE that the FK cascade emits — making it impossible to delete any user with audit history. Migration `0027_auth_audit_allow_fk_cascade.sql` rewrites `block_auth_audit_modification()` to permit exactly the FK-cascade shape (user_id non-null → null, every other column unchanged); arbitrary UPDATE is still raised against. Verified by re-deleting a user with 5 audit rows, then attempting an arbitrary UPDATE on the same rows (still blocked).*
