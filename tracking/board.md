# Board (current state)

Updated: 2026-05-11

| To Do | In Progress | Review | Done |
|---|---|---|---|
| E18 — Email notifications (**paused — operator testing**) | — | — | T-001..T-125 (1.0) |
| T-130 `INotificationTransport` real impl (folded into E18) |  |  | T-200..T-250 (E15 — UX feedback) |
| Future: LDAP provider |  |  | T-300..T-330 (E16 — round-2 UX) |
| Future: S3 attachment store |  |  | T-400..T-406 (E17 Batch A — auth audit + tripwire + retention) |
| Future: log shipping / metrics |  |  | T-410..T-414 (E17 Batch B — unlock tooling) |
| Future: container digest pinning |  |  | T-420..T-430 (E17 Batch C — TOTP + backup codes) |
| Future: dark-mode (tokens already in place) |  |  | T-440..T-447 (E17 Batch D — reset + enforcement + thresholds) |
|  |  |  | T-450, T-451, T-460, T-461 (E17 hot fixes + build hygiene) |

## Recently moved

- 2026-05-11 — Docs catch-up: new `docs/11-operations-cookbook.md` (auth audit / 2FA recovery / append-only triggers / permission gotchas / troubleshooting), new **Development workflow** section in `docs/06-developer-onboarding.md` codifying dev-first deploy gate + no-`Co-Authored-By` policy, runbook cross-link, README index. E18 (email notifications) marked **paused** pending operator testing; plan retained at `/root/.claude/plans/quizzical-booping-owl.md`.
- 2026-05-11 — Ad-hoc operator work on prod: 46 departments bulk-imported (DIETETICS / CAFETERIA typo corrections applied post-import), `hod` role on dev de-duplicated (`complaint:read` removed in favor of `complaint.own:read`), migration `0030_complaint_audit_allow_cascade_delete.sql` applied to both envs so complaints can be cleaned up via `SET LOCAL app.allow_audit_delete`, one test complaint deleted from prod.
- 2026-05-11 — NFS-backed nightly backup configured on prod: `/mnt/lxbackup/cts/` mounted from `10.1.27.220:/volume1/LXBackup`, root crontab at 02:00 UTC running `BACKUP_DIR=/var/lib/docker/cts-backups MIRROR_DIR=/mnt/lxbackup/cts …`. `scripts/backup.sh` gained `MIRROR_DIR` + `MIRROR_RETAIN_DAYS`. Documented in `docs/04-deployment-guide.md` § Backup.
- 2026-05-10 — E17 Batch A polish (T-405, T-406) + T-460 build hygiene shipped: tripwire endpoint + Login Activity panel for IPs with ≥10 failures in 24h, nightly retention cron at 03:00 UTC reading `auth_audit.retention_days` from `system_settings` (default 365), Dockerfile switched to lockfile + `npm ci` so native-module prebuilds are reproducible. **E17 done.**
- 2026-05-10 — E17 Batch D (T-440..T-447) shipped: `user:reset_2fa` permission + admin reset endpoint + UI button, `TwoFactorRequiredGuard` enforcing mandatory 2FA for admin role (with frontend force-enrollment dialog), `failed_2fa_count` participates in the same lockout window as password failures, `LockoutPolicy` service moves thresholds out of hardcoded constants and into `system_settings` (cache-invalidated on save), API docs updated, new `scripts/smoke-test-2fa.sh` walks the full 11-step happy path with stdlib-only TOTP computation. **E17 done modulo Batch A polish (T-405/T-406).**
- 2026-05-10 — E17 Batch C (T-420..T-430) shipped: TOTP-based 2FA. New schema (`totp_secret_enc`, `totp_enrolled_at`, `failed_2fa_count`, `user_backup_codes`), AES-256-GCM `SecretCipher`, `TwoFactorService` with otplib + qrcode, four endpoints (`/auth/2fa/{setup,enable,verify,disable}`), login flow split with single-use challenge JWTs, 3-step enrollment wizard with backup-code download/copy/print, login-page code prompt with TOTP↔backup-code toggle. `TOTP_ENCRYPTION_KEY` added to `.env` + compose. Backend + frontend rebuilt and live; verified routes mounted, audit pipe still emitting `login.password_failed` for non-2FA users.
- 2026-05-10 — E17 Batch B (T-410..T-414) shipped: `user:unlock` permission, `POST /users/:id/unlock` endpoint emitting `account.unlocked_by_admin`, "Unlock" button + lock badge on Users admin page, `scripts/unlock-user.sh` break-glass with runbook entry. Backend + frontend rebuilt and live.
- 2026-05-10 — E17 Batch A core (T-400..T-404) shipped: `auth_audit_log` table + `auth_audit:read` permission + `AuthAuditService` + login-flow instrumentation + `GET /admin/auth-audit` + Login Activity admin page. Backend + frontend rebuilt; verified end-to-end against live stack. Remaining: T-405 (IP tripwire panel) and T-406 (retention job).
- 2026-05-10 — E17 launched. Batch A → In Progress.
- 2026-05-04 — T-001/T-010/T-016/T-030/T-040/T-060/T-070/T-080/T-110 → **Done** (foundation pass).
- 2026-05-04 — T-002..T-013 → **Done** (Sprint 1 — auth + RBAC).
- 2026-05-04 — T-031..T-033/T-041..T-044/T-050/T-051/T-061/T-081/T-083 → **Done** (Sprint 2 — dynamic fields + complaints lifecycle).
- 2026-05-04 — T-062/T-071..T-073/T-082 → **Done** (Sprint 3 — attachments + audit hardening + history).
- 2026-05-04 — T-034/T-035/T-045/T-052/T-063/T-074/T-084/T-092/T-100..T-106 → **Done** (Sprint 4 — frontend).
- 2026-05-04 — T-111..T-114/T-120..T-125 → **Done** (Sprint 5 — ops + testing + OWASP review).
- 2026-05-04 — T-200..T-202 → **Done** (E15 Batch A — display names + friendly activity + create-time routing).
- 2026-05-04 — T-210..T-214 → **Done** (E15 Batch B — `complaint_date` as a first-class field).
- 2026-05-04 — T-220..T-223 → **Done** (E15 Batch C — closed/resolved freeze + `complaint:reopen`).
- 2026-05-04 — T-230..T-232 → **Done** (E15 Batch D — image+PDF policy, attach-on-create, viewer modal).
- 2026-05-04 — T-240..T-241 → **Done** (E15 Batch E — recharts + manager analytics).
- 2026-05-04 — T-250 → **Done** (E15 Batch F — visual theme refresh).

## Definition of Done

A task is **Done** only when:

1. Code merged to `main`, build green.
2. Unit and (where applicable) integration tests added.
3. Migration (if any) applies on a fresh DB.
4. API change reflected in `docs/03-api-design.md`.
5. Audit/RBAC/locking impacts verified by reviewer.

## Sprint focus

- **Sprint 1:** ✅ Auth + RBAC.
- **Sprint 2:** ✅ Dynamic fields CRUD + complaints lifecycle.
- **Sprint 3:** ✅ Attachments + audit hardening + history endpoints.
- **Sprint 4:** ✅ Frontend (workflows + admin).
- **Sprint 5:** ✅ Testing + ops.
- **E15 (UX feedback):** ✅ All six batches A–F done.
- **E16 (round-2 UX feedback):** ✅ Roles-editor pre-populate fix, attachment-delete split, dashboard click-throughs, user/department dashboard scope, theme handover doc.

**1.0 + two rounds of UX iteration + E17 (auth hardening) complete.**
Email notifications (E18) drafted and paused for operator testing;
plan retained at `/root/.claude/plans/quizzical-booping-owl.md`.
Remaining items (LDAP, S3, log shipping, container pinning, dark-mode)
are explicitly post-1.0 and tracked in `docs/07-roadmap.md`. Next
direction is the user's call.
