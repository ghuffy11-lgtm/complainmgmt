# 11 — Operations cookbook

Operational know-how that's accumulated from real incidents. Each entry
is "what it is, why it exists, and what to do when X". Designed for the
person who walks into this system at 02:00 with a problem.

For everyday deploy / backup / rollback procedures see
`docs/10-production-runbook.md`. This file fills in the gaps around
auth, audit, permissions, and recovery.

---

## Auth audit log + "Login activity" admin page

Every authentication event is recorded in `auth_audit_log`. Visible
under **Admin → Login activity** (gated by the `auth_audit:read`
permission — admin role only by default).

**Events captured** (one row per event):

| Event | Fires when |
|---|---|
| `login.success` | password OK + 2FA OK (if enrolled) → session issued |
| `login.password_failed` | wrong password |
| `login.unknown_user` | username not found |
| `login.account_locked` | login attempt against a locked account |
| `login.inactive` | login attempt against `is_active = false` |
| `login.wrong_provider` | local password tried on a non-`local` account |
| `login.2fa_success` / `login.2fa_failed` | 2FA verify outcomes |
| `account.locked` | threshold crossed → lockout set |
| `account.unlocked_by_admin` | admin clicked Unlock |
| `2fa.enrolled` / `2fa.disabled` / `2fa.reset_by_admin` | 2FA lifecycle |
| `password_changed` | self-service change |
| `logout` | refresh-token revocation |

Each row carries `username` (always — even for unknown-user attempts),
`user_id` (nullable), `ip`, `user_agent`, and an event-specific
`detail` jsonb.

### Filters

The page supports `username` (exact), `ip` (exact), `event` (single
or comma-separated), a `success / failures only` shortcut, and a
date range. URL params round-trip so a filtered link is shareable.

### "Recent failures by IP" tripwire panel

Top of the page when there's something to surface: any IP with
**≥ 10 failure events in the last 24 hours**. Each IP is a clickable
chip that pre-fills the filter for that IP + failures-only. Refreshes
every 60s.

### Retention

`auth_audit.retention_days` (in `system_settings`, default 365)
controls when rows are pruned by the nightly `AuthAuditRetentionService`
cron at 03:00 UTC. Set to 0 to retain forever. Pruning DELETE is gated
on a session-local flag — see "Append-only audit tables" below.

---

## Unlocking a user

Five wrong passwords in a short window → 15-minute lockout. Three
recovery paths in order of preference:

1. **In-app Unlock button.** Admin → Users → row shows a `locked`
   badge → click **Unlock**. The user can immediately retry login.
   This emits an `account.unlocked_by_admin` row to `auth_audit_log`
   with the acting admin's id in `detail`. Requires the
   `user:unlock` permission (admin only by default).

2. **Break-glass script.** When *no* admin can log in — typically
   "the only admin is the one locked out":
   ```bash
   ssh cts-prod
   cd /opt/complainmgmt
   ./scripts/unlock-user.sh <username>
   ```
   Shell-level SQL via `psql -v` (injection-safe). Prints state
   before/after. The action is NOT captured in `auth_audit_log`
   because it bypasses the API — that's the cost of working when
   the API is unreachable.

3. **Raw SQL.** Last resort:
   ```sql
   UPDATE users
      SET failed_login_count = 0, locked_until = NULL
    WHERE username = '<username>';
   ```

The lockout thresholds (5 attempts / 15-minute window) come from
`system_settings` keys `lockout.max_failed_logins` and
`lockout.duration_minutes`. Edit them via **Admin → Settings**;
they take effect on the next login (30-second cache TTL).

---

## 2FA lifecycle

### Enrollment

- **Admin role users**: forced. The `TwoFactorRequiredGuard` returns
  `412 MUST_ENROLL_2FA` on any non-allow-listed request from an
  admin without `totp_enrolled_at`. The frontend interceptor catches
  the 412 and pops a non-dismissable enrollment wizard. Allow-listed
  paths: `/auth/me`, `/auth/logout`, `/auth/change-password`,
  `/auth/2fa/setup`, `/auth/2fa/enable`.
- **Non-admin users**: optional. Header **Set up 2FA** button opens
  the same wizard.

The wizard is 3 steps: QR + manual key → confirm 6-digit code →
display 10 single-use backup codes. Backup codes are shown **once**;
the user MUST save them off-system. The "I have saved my backup
codes" checkbox gates the **Done** button.

### Recovery (lost authenticator)

1. **User uses a backup code.** Each is single-use; "use a backup
   code instead" link on the login prompt swaps the input.
2. **Admin resets 2FA.** Admin → Users → row → **Reset 2FA**. Clears
   the secret + all backup codes, force-logs-out the user's
   sessions, emits `2fa.reset_by_admin`. User must re-enroll on
   next login.
3. **SQL break-glass.** Last resort when no admin can act:
   ```sql
   UPDATE users
      SET totp_secret_enc = NULL,
          totp_enrolled_at = NULL,
          failed_2fa_count = 0
    WHERE username = '<username>';
   DELETE FROM user_backup_codes WHERE user_id = (
     SELECT id FROM users WHERE username = '<username>'
   );
   ```

### TOTP_ENCRYPTION_KEY rotation

The 32-byte base64 key encrypts every TOTP secret at rest. **Rotating
this key invalidates every enrolled user's secret** — they all get
booted back to enrollment. Cost is the same regardless of how many
users you have. Treat like `JWT_SECRET`.

---

## Append-only audit tables and the session-flag escape hatch

`complaint_audit_log` and `auth_audit_log` both have a BEFORE
UPDATE/DELETE trigger that unconditionally raises
`<table> is append-only`. This protects against accidental
modification — but it also blocked **every legitimate** FK cascade and
retention prune until migrations 0027, 0029, and 0030 loosened it.

The current rule: **DELETE is allowed only when the caller has set a
session-local flag** for the current transaction:

```sql
BEGIN;
SET LOCAL app.allow_audit_delete = 'true';
DELETE FROM <table> WHERE …;
COMMIT;
```

`SET LOCAL` keeps the flag scoped to the transaction — it does NOT
leak across connections or to subsequent transactions on the same
connection. Arbitrary UPDATE is still blocked; only the specific
shape needed by FK SET-NULL cascades (single column changes, all
others unchanged) is allowed.

### Cleaning up test complaints

Operators routinely create test complaints to validate workflow,
then need to delete them. Because every complaint has audit rows by
day one, the cascade DELETE on `complaint_audit_log` needs the flag.

The same procedure works for any complaint that legitimately needs
to be removed (test data, duplicate, filed in error). For real
grievances, prefer `status = 'rejected'` or `'closed'` — deletion
loses history.

#### Quick procedure (one block)

```bash
ssh cts-prod
cd /opt/complainmgmt
./scripts/backup.sh                   # always snapshot first
docker compose exec -T db psql -U "$(grep ^POSTGRES_USER= .env | cut -d= -f2)" \
                                     -d "$(grep ^POSTGRES_DB= .env | cut -d= -f2)" <<'SQL'
BEGIN;
SET LOCAL app.allow_audit_delete = 'true';
-- Preview the cascade before pulling the trigger
SELECT id, reference_no FROM complaints WHERE reference_no = 'CMP-2026-000XXX';
DELETE FROM complaints WHERE reference_no = 'CMP-2026-000XXX';
COMMIT;
SQL
```

The cascade removes `complaint_field_values`, `complaint_audit_log`,
`complaint_assignment_history`, and `complaint_attachments` rows for
the deleted complaint(s).

#### Step-by-step (recommended for first-timers)

Each step is its own command so you can verify the result before
moving on.

**1. Connect to prod.**

```bash
ssh cts-prod
cd /opt/complainmgmt
```

If `ssh cts-prod` hangs, see [Troubleshooting](#troubleshooting-deletion)
below.

**2. Set a shell alias for the rest of the session** (saves typing).

```bash
PSQL="docker compose exec -T db psql -U $(grep ^POSTGRES_USER= .env | cut -d= -f2) -d $(grep ^POSTGRES_DB= .env | cut -d= -f2)"
```

**3. Find the complaint and inspect it** before deleting.

```bash
$PSQL <<'SQL'
SELECT id, reference_no, status, priority, created_by,
       assigned_department_id, created_at
  FROM complaints WHERE reference_no = 'CMP-2026-000XXX';

-- Show the form fields so you can confirm it's the right one
SELECT df.label,
       COALESCE(cfv.value_text, cfv.value_number::text,
                cfv.value_date::text,
                (SELECT label FROM dynamic_field_options
                  WHERE id = cfv.value_option_id)) AS value
  FROM complaint_field_values cfv
  JOIN dynamic_fields df ON df.id = cfv.field_id
 WHERE cfv.complaint_id = (SELECT id FROM complaints
                            WHERE reference_no = 'CMP-2026-000XXX')
 ORDER BY df.sort_order;
SQL
```

If the SELECT returns 0 rows, the reference number is wrong — STOP.
Do not run the DELETE.

**4. Take a snapshot.** Mandatory — your safety net.

```bash
./scripts/backup.sh
# Note the filename it prints; you'll need it if you have to roll back.
```

**5. Delete inside a flagged transaction.**

```bash
$PSQL <<'SQL'
BEGIN;
SET LOCAL app.allow_audit_delete = 'true';
DELETE FROM complaints WHERE reference_no = 'CMP-2026-000XXX';
COMMIT;
SQL
```

Expected output: `DELETE 1` then `COMMIT`. If you see `DELETE 0`,
the WHERE clause didn't match — the transaction commits with no
effect; no harm done.

**6. Verify it's gone.**

```bash
$PSQL -c "SELECT id, reference_no FROM complaints
           WHERE reference_no = 'CMP-2026-000XXX';"
# Expected: (0 rows)
```

#### Troubleshooting deletion

| Symptom | Cause | Fix |
|---|---|---|
| `ERROR: permission denied: complaint_audit_log delete blocked` (or similar trigger error) | `SET LOCAL app.allow_audit_delete = 'true'` is missing, or you ran the DELETE in a different transaction than the `SET LOCAL`. | Re-run the whole `BEGIN; SET LOCAL ...; DELETE ...; COMMIT;` block as one heredoc. `SET LOCAL` only applies inside the same transaction. |
| `ERROR: column "title" does not exist` (or any other column) | The schema doesn't have what you typed — `complaints` has no human-readable title, only `reference_no`. | Run `\d complaints` first to see the columns. The identifying field is always `reference_no` (e.g. `CMP-2026-000003`). |
| Preview SELECT returns 0 rows | Wrong `reference_no`, or the complaint was already deleted. | Don't run DELETE. List recent complaints to find the right one: `SELECT reference_no, status, created_at FROM complaints ORDER BY created_at DESC LIMIT 20;` |
| Preview SELECT returns more rows than expected | WHERE clause is too broad. | Narrow it down. Prefer `WHERE reference_no = '…'` (unique) over `WHERE created_by = …` or `WHERE status = '…'`. |
| `DELETE 0` instead of `DELETE 1` | WHERE didn't match anything — transaction commits with no effect. | Harmless. Check the reference number and try again. |
| `ssh cts-prod` hangs or "Permission denied" | Network from your workstation, or your SSH key isn't installed for the `claude` user on prod. | Confirm `~/.ssh/config` has a `Host cts-prod` entry pointing at 10.1.27.99. If a brand-new workstation, get your public key added to `claude@cts-prod:~/.ssh/authorized_keys` by an existing operator. |
| `docker compose exec` says `no such service: db` | Wrong directory, or the stack isn't running on this host. | `cd /opt/complainmgmt` and `docker compose ps` to confirm the `db` container is up. |
| `./scripts/backup.sh: Permission denied` | Running as a user that can't write to `backups/`. | Run as the `claude` user on prod (`sudo -iu claude` then `cd /opt/complainmgmt`). |
| You ran DELETE but forgot `COMMIT;` | The transaction is still open — your psql session is holding a lock. | Type `COMMIT;` in the same session, or `ROLLBACK;` to undo. If you closed psql without committing, the deletion never happened. |
| Need to undo a delete | Backup exists from step 4. | Restore from `backups/cts-<timestamp>.sql.gz` per `docs/10-production-runbook.md` § Rollback. The whole DB rolls back to the snapshot time, so any unrelated edits made after the backup are also lost — coordinate before restoring. |
| `app.allow_audit_delete` setting "does not exist" | You're connected to a DB that hasn't run migration `0030` yet. | Check you're on prod (`ssh cts-prod`), not a stale local copy. Run `\dx` and `SELECT version()` to confirm. |

### Migrations that own this pattern

- `0022` — added `auth_audit_log` with the trigger.
- `0027` — loosened `auth_audit_log` UPDATE trigger to allow the FK
  `ON DELETE SET NULL` cascade from `users`.
- `0029` — loosened `auth_audit_log` DELETE trigger via the session
  flag (enables the retention cron).
- `0030` — same pattern applied to `complaint_audit_log` (enables
  complaint deletion).

---

## Permission-grant gotchas

### Broad vs scoped: the broad one always wins

| If a role has… | The user… |
|---|---|
| `dashboard:read` (broad) | sees every department's dashboard, regardless of department membership |
| `dashboard.own:read` (scoped) | sees only their own departments' dashboard |
| **Both** | gets the broad behavior — the scoping is silently skipped |

Same pattern for `complaint:read` vs `complaint.own:read`.

**Common symptom**: "User X with the `hod` role can still see other
departments." Cause: either the `hod` role was granted both
permissions, or the user has multiple roles and one of them
(e.g. `coordinator`) granted the broad one. **Diagnose** via:

```sql
SELECT DISTINCT p.resource || ':' || p.action AS permission
  FROM users u
  JOIN user_roles ur ON ur.user_id = u.id
  JOIN role_permissions rp ON rp.role_id = ur.role_id
  JOIN permissions p ON p.id = rp.permission_id
 WHERE u.username = '<username>'
 ORDER BY 1;
```

If both `:read` and `.own:read` appear, **untick the broad one** in
**Admin → Roles → <role> → permissions grid**. The change takes effect
on the user's next request (permissions resolve fresh per request, no
re-login needed).

### Edit User modal — the role checkboxes are authoritative

Post-`05903d0` (2026-05-10), the **Edit User** modal pre-checks the
user's current roles and treats the checkbox state as authoritative
on save. **Unticking a role and saving will remove that role.**
Before that commit, empty checkboxes meant "no change" — that
semantics is gone.

If an operator on an old cached frontend sees empty checkboxes,
**hard-refresh** to pick up the new build.

---

## Roles editor mental model

- **`complaint.own:read`** = "see complaints assigned to one of my
  active departments, plus complaints I created." Resolved at
  request time via `complaints.assigned_department_id IN (my
  department ids)` plus `created_by = me`.
- **`complaint:read`** = "see every complaint." Wins over the
  `.own:read` variant when both are present.
- **`complaint.field:*:read`** = wildcard read on every dynamic
  field. The per-field flavor (`complaint.field:<key>:read`) is
  intended for cases where you want to grant a single field;
  granting the wildcard makes per-field grants redundant.
- **`complaint.field:<key>:override`** = the user can click
  "Unlock" on a locked field even if they're not the original
  writer. The override action is captured as a `lock_override`
  audit row.
- **`audit:read`** vs **`auth_audit:read`** = the first reads the
  complaint audit timeline; the second reads `auth_audit_log` (the
  Login Activity page).

---

## NFS-backed backup runbook (cross-reference)

The full procedure (mount, cron line, retention) lives in
`docs/04-deployment-guide.md` § Backup. Operator daily checklist:

```bash
ssh cts-prod
sudo tail -20 /var/log/cts-backup.log     # last night's run
sudo ls -la /mnt/lxbackup/cts/ | tail -5  # off-host copy present
```

If the share is unreachable, the **local** backup at
`/var/lib/docker/cts-backups/` still happens — the cron log records
the mirror failure but exits 0. Investigate the share, then re-run
the cron command manually as root once it's back.

---

## Department naming convention

The Hadi Clinic deployment uses:

- **`name`**: ALL CAPS display string (e.g. `MEDICAL IMAGING & INTERVENTIONAL RADIOLOGY`).
- **`key`**: lower-snake-case slug (e.g. `medical_imaging_interventional_radiology`).
  The `&` is dropped; non-alphanumeric chars collapse to `_`; leading
  digit is prefixed with `d_`.

All foreign keys point at `departments.id` (not `key`), so renaming
either field is purely cosmetic — no FK breakage. Bulk imports go via
a single transaction with `INSERT INTO departments (key, name,
is_active)`; existing rows can be relabeled with `UPDATE departments
SET key = …, name = … WHERE id = …`.

---

## Sub-departments

Sub-departments are optional per-department refinements (e.g. *IT → Network, Application*). When at least one active sub-department exists for a department, the create-complaint form requires a selection; departments with zero active sub-departments skip the field entirely.

### Adding sub-departments

**Admin → Sub-departments** — pick a department from the top picker, then **New sub-department**. Fields:

| Field | Notes |
|---|---|
| Key | Lower-snake-case slug, e.g. `network`. Immutable after creation. |
| Name | Display label. |

### Deactivating a sub-department

Deactivating hides the sub-department from the create form but keeps showing it on existing complaints that already reference it. The complaint's sub-department label stays correct even after deactivation.

If you deactivate the **last** active sub-department for a department, new complaints for that department skip the sub-department step immediately (no restart needed — checked on every create).

### Backfilling old complaints

Complaints created before sub-departments were configured have `subcategory_id = NULL`. The detail page shows the sub-department dropdown empty; staff can fill it in as they access each complaint. There is no forced backfill — the field is only required at create time.

To find complaints missing a sub-department in a specific department:

```sql
SELECT id, reference_no, status
  FROM complaints
 WHERE assigned_department_id = <dept_id>
   AND subcategory_id IS NULL
   AND status NOT IN ('closed', 'resolved')
 ORDER BY id;
```

### Migrations

- `0031_department_subcategories.sql` — creates `department_subcategories` table and adds `complaints.subcategory_id FK`.

---

## Origins of complaint

Origins describe the channel a complaint arrived through. Three are seeded at install: *Social media*, *Verbal*, *Suggestion box*. Required on every new complaint.

### Managing origins

**Admin → Origins** — add, edit sort order, deactivate.

Deactivating an origin hides it from the create-complaint picker and from the dashboard (unless its complaint count is > 0, in which case the card stays). The `(Unknown)` filter on the complaints list catches complaints whose origin was never set (pre-feature data).

### Backfilling old complaints

All complaints created before this feature was deployed have `origin_id = NULL`. They appear in the complaints list under the `(Unknown)` origin filter on the list page. The detail page shows the origin dropdown empty — staff can set it when they access each complaint.

To bulk-assign a default origin to all unset complaints (e.g. "Verbal" has id=2):

```sql
-- Preview first
SELECT COUNT(*) FROM complaints WHERE origin_id IS NULL;

-- Bulk set (run inside a transaction)
BEGIN;
UPDATE complaints SET origin_id = 2 WHERE origin_id IS NULL;
-- Verify
SELECT COUNT(*) FROM complaints WHERE origin_id IS NULL;
COMMIT;
```

This does NOT emit audit rows for the change. If you need an audit trail, patch each complaint via the API instead.

### Migrations

- `0032_complaint_origins.sql` — creates `complaint_origins` table (seeded with 3 defaults) and adds `complaints.origin_id FK`.

---

## Troubleshooting

Symptom → cause → fix, in operator language. Every entry corresponds
to a real incident.

### "Admin can't log in"
5 failed attempts → 15-minute lockout. Fix via the in-app **Unlock**
button (another admin) or `scripts/unlock-user.sh` (no admin
available). See "Unlocking a user" above.

### "Backend crashed after rebuild: `INITIAL_ADMIN_PASSWORD is not allowed to be empty`"
Joi schema rejected an empty string from the compose
`${INITIAL_ADMIN_PASSWORD:-}` default. Fix: append any 10+ char
placeholder to `.env`; never read because the bootstrap only runs
when no admin exists. Permanent fix in commit `4e1b5bc` (schema now
accepts empty).

### "QR code at 2FA enrollment is a tiny smudge"
qrcode library emitted SVG without `width`/`height`. Permanent fix
sets `{ width: 240 }` in `backend/src/modules/auth/two-factor.service.ts`.
If it recurs, that's the line to check.

### "User can see other departments' dashboard / complaints though I gave them `dashboard.own:read` / `complaint.own:read`"
They also have the broad `dashboard:read` / `complaint:read`. See
"Permission-grant gotchas" above. Untick the broad one in
**Admin → Roles**.

### "Role checkboxes empty when I open Edit User"
That's the pre-`05903d0` behavior; you're on an old cached frontend.
Hard-refresh (Ctrl+Shift+R / Cmd+Shift+R).

### "Can't delete a complaint or user — `is append-only`"
The audit-log trigger blocks the FK cascade. Use the
`SET LOCAL app.allow_audit_delete = 'true'` flag inside the
transaction. See "Append-only audit tables" above.

### "NFS share full / unreachable at backup time"
Local backup still succeeds; `/var/log/cts-backup.log` records the
mirror failure but the script exits 0. Investigate the share, then
re-run the cron command manually as root once it's back.

### "Login Activity panel shows no IP tripwire"
Threshold is ≥ 10 failures in 24h. If you genuinely have fewer than
10 failures from any single IP, the panel correctly hides — that's
not a bug, that's "nothing to surface."

### "Dashboard 'By department' chart is unreadable / squished"
Pre-`f4d1bf6` it was fixed-height (180 px) regardless of how many
departments existed. Hard-refresh on a post-deploy frontend; the
chart now scales with row count.

### "Read-only complaint fields visually merge for non-editor users"
Same — pre-`f4d1bf6` bug: the read-view text branch rendered as a
plain `<div>` paragraph with no border. Hard-refresh; the new build
wraps each value in a field-shaped container.

### "I assigned the `hod` role to a user but they still see everything"
Two possibilities — check both:
1. The role itself has both broad and scoped permissions
   (see "Broad vs scoped" above).
2. The user was never actually assigned to the role. Open
   **Admin → Users → Edit <user>** and verify `hod` is ticked.
   If you ticked `hod` but didn't save, or the save 401'd
   silently, the assignment didn't take.

### "`auth_audit_log` retention cron logs `is append-only`"
Pre-`0029` migration. Apply `0029_auth_audit_allow_retention_delete.sql`
to add the flag escape hatch, or the cron will never actually prune.
The service already sets the flag — it just needs the trigger to honor
it.

### "Admin user is force-redirected to a 2FA enrollment dialog and can't dismiss it"
That's the `TwoFactorRequiredGuard` working as designed for
admin-role users. Complete enrollment. If the admin doesn't have an
authenticator app handy and is locked out of using the system, you
can break the gate via SQL:

```sql
UPDATE users
   SET totp_secret_enc = NULL,
       totp_enrolled_at = NULL,
       failed_2fa_count = 0
 WHERE username = '<admin-username>';
```

This is a temporary measure — they'll be re-redirected on their next
login. Use it only when an admin is in a hurry; the right fix is to
finish enrollment.

### "Complaint detail page loads but every field is `—`"
The user doesn't have read permission on the per-field permissions
that gate value display. Check
`complaint.field:*:read` and per-field reads on their role(s).

### "Sub-department dropdown doesn't appear on new complaint form"

Two causes:
1. The chosen department has no **active** sub-departments. Go to **Admin → Sub-departments**, pick the department, and confirm at least one row shows `active`.
2. The `allSubcatsQ` fetch failed silently. Open browser DevTools → Network, look for a failed `GET /api/subcategories?active=true`.

### "Origin dropdown is empty on an old complaint"

Complaints created before the Origin feature was deployed have `origin_id = NULL`. The dropdown is intentionally empty — staff must set the origin when they next access the complaint. See "Backfilling old complaints" in the Origins section above.

### "Dashboard Origin cards are missing"

The dashboard endpoint `GET /api/dashboard/by-origin` returns rows only for origins that have ≥ 1 complaint. If no complaints exist yet (or all origins are `(Unknown)`), the Origin section shows no cards — that's correct. After the first complaint is filed with an origin set, the card appears.

### "Filter by sub-department returns no results"

Most likely the complaints in that department were created before sub-departments were configured, so their `subcategory_id` is NULL. Either backfill them (see cookbook section) or accept that the filter only matches complaints where the field was explicitly set.
