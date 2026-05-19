# Session handoff

> Maintained by Claude. Update before any `/clear`, `/compact`, or
> session wrap-up so the next iteration can resume without re-deriving
> context. Overwrite rather than append — this is *current* state, not
> a journal.

**Last updated:** 2026-05-20 (sub-dept + origin feature live on prod;
backup script now also archives config; test complaint #27 deleted).

## 1. Where we are

- Feature **sub-departments + origin of complaint** is live on prod.
  Operator walkthrough passed, end-to-end exercised
  (created dept, 3 sub-depts, new origin, complaint with both,
  filtered by both, dashboard cards). 122 non-health requests in
  6 h, zero errors.
- Branch `feat/subcat-and-origin` merged to `main` and **deleted**
  conceptually (still exists on origin until pruned — fine).
- Prod HEAD: `86e4bf3`. Local `main` matches.

## 2. Current state of the code

- Working tree clean except two untracked: `handoff.md` (this file)
  and `frontend/tsconfig.tsbuildinfo` (build artefact).
- Recent commits on `main` (latest first):
  - `86e4bf3` — docs: note config tarball in backup runbook + restore
  - `80f7e4b` — backup: also archive `.env` + `nginx/certs/`
  - `775705d` — docs: cookbook entries + skill for sub-depts/origins
  - `6323dec` — fix: subcat preserved on create, date not cleared on
    origin change, Sub-Department rename
  - `d256bba` — fix: single hierarchical dept+subcat dropdown,
    multi-color origin cards
  - `b56b122` — fix: origin/subcat on detail + dashboard KPI cards
  - `f6ed117` — e2e + docs

## 3. Prod deploy log (2026-05-19 → 2026-05-20)

- Backups taken: `cts-2026-05-19_232959.sql.gz` (pre-deploy),
  `cts-2026-05-19_234708.sql.gz` (pre-delete of #27),
  `cts-2026-05-20_001750.sql.gz` (post-backup-extension manual test,
  written under `/opt/complainmgmt/backups/`),
  `cts-2026-05-20_002008.sql.gz` + `cts-config-2026-05-20_002008.tar.gz`
  (cron-style manual run, written under `/var/lib/docker/cts-backups/`
  and mirrored to NFS `/mnt/lxbackup/cts/`).
- Code shipped via **git bundle offline path** (prod's outbound
  internet to github.com:22 and :443 is blocked again as of today;
  runbook §3 documents the bundle workflow).
- Migrations 0031 + 0032 applied; 3 origins seeded.
- Test complaint **CMP-2026-000027 deleted** per cookbook
  (flagged DELETE transaction; cascade removed audit/assignment/
  attachment rows).

## 4. Backup coverage (after this session)

`./scripts/backup.sh` now writes **two** files per run:

| File | Mode | Contents |
|---|---|---|
| `cts-<TS>.sql.gz` | 644 | pg_dump: complaints, users, attachments (`bytea`), logo (`bytea`), settings, audit |
| `cts-config-<TS>.tar.gz` | 600 | `.env` + `nginx/certs/` |

Cron (root, 02:00) picks both up automatically — no schedule change.
Mirror to NFS works for both. Retention deletes both by pattern.

`SKIP_CONFIG=1 ./scripts/backup.sh` preserves the legacy DB-only
behaviour for anyone scripting around the old output shape.

Frontend/backend code is NOT in any backup — they're stateless Docker
images rebuilt from git on deploy. Restore needs: this repo at the
matching commit + DB dump + config tarball (see cookbook
§ "Restoring the config tarball" for the 2FA-key-rotation gotcha).

## 5. Pre-existing issues (not introduced this session)

- Outbound from `cts-prod` to github.com is blocked. Use git-bundle
  offline path per runbook §3 until network team unblocks it.
- Host-env bcrypt libc mismatch — backend unit tests fail on host,
  pass inside the alpine container. Pre-existing.
- 3 TS errors in `*.guard.spec.ts` / `locking.service.spec.ts` from
  `auth-user.type` drift. Pre-existing.
- 4 `DynamicFieldRenderer.test.tsx` failures. Pre-existing.

## 6. Open items

- Operator may want a one-time SQL backfill of `origin_id` on the
  pre-feature complaints (60ish rows have `origin_id IS NULL`).
  Cookbook § "Backfilling old complaints" has the SQL. No deadline.
- Off-host backup retention: NFS share at 10.1.27.220 keeps 90 days.
  If we ever want S3 / cloud, that's a separate task.

## 7. Other context worth knowing

- **Prod**: `cts.hadiclinic.com.kw` (10.1.27.99) · SSH alias
  `cts-prod` · repo `/opt/complainmgmt` · NGINX :8443.
- **Cron** (root): `0 2 * * * cd /opt/complainmgmt && BACKUP_DIR=/var/lib/docker/cts-backups MIRROR_DIR=/mnt/lxbackup/cts RETAIN_DAYS=14 MIRROR_RETAIN_DAYS=90 /opt/complainmgmt/scripts/backup.sh >> /var/log/cts-backup.log 2>&1`
- **Operational docs to read first** in any new session:
  - `docs/10-production-runbook.md` § Updating to a new release + § 8 Backups
  - `docs/11-operations-cookbook.md` (full — auth, audit, backup,
    sub-dept/origin sections, troubleshooting)
  - `docs/superpowers/skills/cts-classification-features.md` —
    architecture reference for sub-dept + origin code paths
