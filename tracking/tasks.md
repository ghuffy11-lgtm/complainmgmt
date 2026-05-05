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
