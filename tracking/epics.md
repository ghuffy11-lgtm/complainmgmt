# Epics

Top-level work streams. Each epic decomposes into Features (one heading deeper, in `tasks.md`).

## E1 — Authentication & Session Management
Local auth with bcrypt; JWT access + DB-backed rotating refresh tokens; pluggable provider for future LDAP. Lockout, password change, force-logout.

## E2 — Authorization (RBAC)
Dynamic roles + permissions with field-level granularity and override semantics. Permission catalog auto-extends as dynamic fields are added.

## E3 — User & Department Management
Admin CRUD over users, departments. Activation/deactivation. Role assignment.

## E4 — Dynamic Form System
Admin-defined complaint fields (text/number/date/dropdown/file) with validation, visibility, locking. Form rendered from schema; no client-side hardcoding.

## E5 — Complaint Lifecycle
Create / read / update / status / priority. Per-field write checks. Reference number generation.

## E6 — Field Locking & Override
First-writer-wins ownership for flagged fields with audited overrides.

## E7 — Assignment & History
Single department + optional user assignment, with full history.

## E8 — Attachments
Up to 3 files × 2 MB each, stored in DB via pluggable `IAttachmentStore`. MIME sniffing and allow-list.

## E9 — Audit Trail
Append-only log of every field change; queryable with filters; INSERT-only DB grants.

## E10 — Dashboard & Reporting
Aggregates: status, priority, department breakdowns; manager-level visibility.

## E11 — Admin Panel (UI)
Single panel surfacing E2/E3/E4 + system settings + audit search.

## E12 — Deployment & Operations
Docker Compose stack, NGINX TLS, backup/restore, healthchecks, hardening checklist.

## E13 — Testing & Hardening
Unit + integration + e2e + load + OWASP review. CI pipeline.

## E14 — Future-Ready Interfaces *(scaffold only in phase 1)*
`IAuthProvider`, `INotificationTransport`, `IAttachmentStore` defined and consumed; only the phase-1 implementations exist.

## E17 — Authentication Hardening
Round-2 auth work driven by an admin-account lockout incident. Adds an audit trail for every authentication event, an in-app way to recover a locked user (so SQL is never the only path), and TOTP-based 2FA for the admin role.

### Batch A — Auth audit log + Login Activity admin page
Today the system has no record of who logged in, when, from which IP, or who failed — the existing `complaint_audit_log` is complaint-scoped only. This batch adds a dedicated `auth_audit_log` table (separate from `complaint_audit_log` so retention and access can differ), populates it from every branch in `LocalAuthProvider` and the new 2FA endpoints, and surfaces it as a filterable "Login Activity" page in the admin panel.

- Events: `login.success`, `login.password_failed`, `login.unknown_user`, `login.account_locked`, `login.inactive`, `login.2fa_failed`, `login.2fa_success`, `account.locked`, `account.unlocked_by_admin`, `2fa.enrolled`, `2fa.disabled`, `2fa.reset_by_admin`, `logout`, `password_changed`.
- Captures `username` (always, even when user not found), `user_id` (nullable), `ip` (`inet`), `user_agent`, `detail` (jsonb).
- Indexes on `(occurred_at desc)`, `(username, occurred_at)`, `(ip, occurred_at)`.
- Admin page: filter by username / IP / event / date range; default 7-day window; "recent failures by IP ≥10/24h" tripwire panel.
- Retention: configurable in `system_settings` (default 365 days), nightly cleanup job.
- Reuses the IP/UA capture already in `auth.controller.ts` (currently only persisted on refresh-token rows).

### Batch B — Unlock-user tooling (break-glass + admin button)
Direct fix for the incident — make a locked user recoverable without raw SQL, *and* from the host shell when no admin can log in.

- New permission `user:unlock` (seeded for admin only).
- New `POST /admin/users/:id/unlock` — clears `failed_login_count` + `locked_until`; emits `account.unlocked_by_admin` audit row.
- "Unlock" button on the Users admin page, only visible when the row is currently locked.
- `scripts/unlock-user.sh <username>` — host-side helper that runs the same SQL via `docker compose exec db`. Documented in `docs/10-production-runbook.md`.

### Batch C — TOTP enrollment + login challenge + backup codes
Mandatory 2FA for users with the admin role; everyone else is unaffected for v1. Method is RFC-6238 TOTP via `otplib`, recovery via 10 single-use backup codes hashed at rest.

- Schema: add `totp_secret_enc` (AES-GCM, key from env), `totp_enrolled_at`, `failed_2fa_count` to `users`; new `user_backup_codes(user_id, code_hash, used_at)`.
- Endpoints:
  - `POST /auth/2fa/setup` — provisional secret + QR (otpauth URL).
  - `POST /auth/2fa/enable` — confirms with first code, generates 10 backup codes, returns them once in plaintext.
  - `POST /auth/2fa/verify` — exchanges a 5-min single-use challenge token + 6-digit code (or backup code) for a session JWT.
  - `POST /auth/2fa/disable` — own account, requires password re-entry (admin-role users cannot disable while admin).
- Login flow: password OK → if 2FA enrolled, return `{ challengeToken }` instead of session; UI shows code prompt; verify endpoint issues the real session.
- Clock-drift tolerance: ±1 step (±30s).
- Frontend: enrollment dialog under Profile; code prompt screen; "save your backup codes" download/print step.

### Batch D — 2FA reset + extended lockout counters
Closes the loop on recovery and brute-force protection for the second factor.

- New permission `user:reset_2fa` (admin only). `POST /admin/users/:id/reset-2fa` clears the secret + all backup codes; user must re-enroll on next login. Audited.
- "Reset 2FA" action on the Users admin page (visible only when target has `totp_enrolled_at IS NOT NULL`).
- `failed_2fa_count` shares the existing `locked_until` field — same 5-tries / 15-min window — so brute-forcing the 6-digit code is rate-limited to the same budget as password attempts.
- Lockout thresholds (`maxFailures`, `lockoutMinutes`) move from hardcoded constants to `system_settings`, addressing the existing `TODO(roadmap)` in `local-auth.provider.ts`.

## E18 — Email notifications  *(paused — operator testing)*
Send plain-text emails with deep links on four complaint events: new complaint filed, assign / re-assign, status change, reopen. Per-user opt-in stored in `user_notification_prefs`. Transport via the clinic's SMTP server, creds in `.env` (not in DB). Design + file-by-file plan recorded in the held plan file at `/root/.claude/plans/quizzical-booping-owl.md`; will resume when the user reopens the task. **Phase A (plumbing + opt-in UI, NullTransport logs only)** ships first; **Phase B (SmtpNotificationTransport)** flips on real delivery once SMTP creds are configured.
