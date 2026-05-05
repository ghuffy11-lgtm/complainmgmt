# 04 — Operations Playbook

> **Bringing CTS up for the first time?** See [`docs/10-production-runbook.md`](10-production-runbook.md) — that's the step-by-step bring-up procedure with self-signed TLS for IP-only deploys.
>
> This document covers everything **after** a successful first boot: logs, backups, schema migrations on a running cluster, secret rotation, scaling, and the production audit-table privilege split.

## Prerequisites

A successful initial deploy via the runbook. Inside the repo on your prod host:

```bash
cd /opt/complainmgmt
docker compose ps        # all four services healthy
```

## Logs

```bash
docker compose logs -f --tail=200 backend
docker compose logs -f --tail=200 nginx
docker compose logs -f --tail=200 db
```

Backend logs are JSON (Pino). Pipe through `jq` or `pino-pretty` locally for human-readable output. Every line includes the request-id, also exposed as the `x-request-id` response header — use it to correlate UI errors to backend logs.

## Backup

Daily automated dump (set up as cron in step 8 of the runbook):

```bash
BACKUP_DIR=/var/backups/cts /opt/complainmgmt/scripts/backup.sh
```

Defaults: 14-day retention. Adjust inside `scripts/backup.sh`. **Important**: copy the dumps off the server periodically — a backup on the same disk doesn't survive a disk failure. Common patterns: `rsync` to a NAS, `aws s3 sync`, a scheduled `scp` to a second host.

### Verifying backups

Restore drills should run on a regular cadence. The fastest verify is a dry-run restore into an ephemeral container:

```bash
docker run --rm -v /var/backups/cts:/dump:ro postgres:16-alpine \
  sh -c 'createdb -h <host> -U cts_app verify && \
         gunzip < /dump/<latest>.sql.gz | psql -h <host> -U cts_app -d verify && \
         dropdb -h <host> -U cts_app verify'
```

Or: stand up a separate `docker compose` stack on a non-prod host pointed at a copy of the dump, run the smoke test against it.

## Restore

```bash
gunzip -c /var/backups/cts/cts_backup_YYYYMMDD_HHMMSS.sql.gz \
  | docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB
```

This **overwrites** the current database. Always stop the backend first to avoid mid-restore writes:

```bash
docker compose stop backend
gunzip -c /var/backups/...sql.gz | docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB
docker compose start backend
```

## Schema migrations on a running cluster

Postgres init scripts under `/docker-entrypoint-initdb.d` only run on an **empty** data directory. For changes after go-live:

```bash
docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB \
  < db/migrations/00NN_my_change.sql
```

The backend will pick up entity changes on its next start (`docker compose up -d backend`). Until a dedicated migration runner is added (see roadmap), the operator runs each new file once and records it in `schema_migrations` (table created in `0001`).

A safe pattern when applying a destructive migration:

1. **Take a fresh backup.**
2. Stop backend (`docker compose stop backend`).
3. Apply the migration file via `psql`.
4. Start backend (`docker compose start backend`).
5. Run smoke (`bash scripts/smoke-test.sh`).
6. If anything fails, restore from the backup taken in step 1.

## Updating to a new release

When a new tag lands on the repo:

```bash
cd /opt/complainmgmt
git fetch --tags
git checkout v1.X.Y
docker compose build
docker compose up -d
BASE=https://<your-host> bash scripts/smoke-test.sh
```

Backend image rebuilds run any new TypeORM entity reflection automatically; raw SQL migrations (above) need running explicitly.

## Rolling back

```bash
cd /opt/complainmgmt
git checkout v1.0.0          # or whatever known-good tag
docker compose build
docker compose up -d
```

Note: rolling back the *application* doesn't undo a destructive schema change applied during a forward-deploy. If you need to undo a schema-modifying upgrade, restore from the pre-upgrade backup first.

## Rotating secrets

### JWT secret

```bash
$EDITOR .env                 # update JWT_SECRET (openssl rand -base64 64 | tr -d '\n')
docker compose up -d backend
```

All in-flight access tokens become invalid (users will get a 401 and re-issue from refresh). Refresh tokens survive — they're DB-backed, not signed by the JWT secret.

### Postgres password

```bash
docker compose exec db psql -U $POSTGRES_USER -d postgres \
  -c "ALTER ROLE $POSTGRES_USER WITH PASSWORD '<new>';"
$EDITOR .env                 # update POSTGRES_PASSWORD and DATABASE_URL (must match)
docker compose up -d backend
```

### Admin password reset (forgot all admin passwords)

If every admin lost their credentials, you can recreate the bootstrap admin from `.env`:

```bash
docker compose exec db psql -U cts_app -d complainmgmt -c \
  "DELETE FROM users WHERE username = '$INITIAL_ADMIN_USERNAME';"
docker compose restart backend       # bootstrap re-runs against the now-empty admin row
```

Then immediately log in and change the password.

## Stopping / removing

```bash
docker compose down            # stop containers, keep data volume
docker compose down -v         # ⚠ destroys the database volume
```

The `down -v` form is irrecoverable without a recent backup. Use it only when wiping a test env.

## Scaling

Backend is stateless. To run two replicas:

```yaml
backend:
  deploy:
    replicas: 2
```

NGINX upstream round-robins. Refresh tokens in DB ensure rotation works across replicas.

For Postgres, move to a managed service or set up streaming replication; the application tolerates read replicas only after the read/write split work in the roadmap.

## Audit-table privilege split (production hardening)

The `complaint_audit_log` table is the tamper-evidence record. Two layers defend it in dev:

1. **BEFORE UPDATE/DELETE triggers** (migration `0005`) raise an exception on any modification attempt — irrespective of which role is connected.
2. **Privilege-level revocation** (migration `0009`) revokes UPDATE/DELETE from PUBLIC.

The dev `docker-compose` stack runs Postgres init scripts as `POSTGRES_USER`, who becomes the *owner* of the table. Owners hold implicit privileges that cannot be revoked, so in dev the trigger is the load-bearing defence.

For a production deployment, split roles:

```sql
-- Once, as a superuser:
CREATE ROLE cts_owner LOGIN PASSWORD '...';   -- runs migrations, owns tables
CREATE ROLE cts_app   LOGIN PASSWORD '...';   -- the running backend

-- Re-own the audit table.
ALTER TABLE complaint_audit_log OWNER TO cts_owner;

-- Application gets only what it needs.
GRANT INSERT, SELECT ON complaint_audit_log TO cts_app;
-- (UPDATE, DELETE intentionally NOT granted.)
```

Point the backend's `DATABASE_URL` at `cts_app`. Run migrations with `cts_owner`. With this split, even an application-level bug (or compromise) cannot tamper with audit history — privilege check rejects it before the trigger sees it.

## Hardening checklist (post-bring-up)

- [ ] `POSTGRES_PASSWORD` is a 20+ char random string (verify in `.env`).
- [ ] `JWT_SECRET` is from `openssl rand -base64 64`.
- [ ] `BCRYPT_ROUNDS` ≥ 12.
- [ ] `db` service has no host port (remove the `ports:` mapping in production `docker-compose.yml` if present).
- [ ] HSTS enabled in `nginx.conf` (uncomment after the first successful real-cert deploy — self-signed makes HSTS hostile).
- [ ] Daily DB backups verified by a periodic restore drill (calendar reminder: every 30 days).
- [ ] OS firewall blocks everything except 22, 80, 443.
- [ ] Container images pinned to digests, not floating tags, in the production compose file.
- [ ] Audit-table privilege split applied (see above).
- [ ] Log shipping configured (journald → syslog/Loki/whatever you have).
- [ ] Initial bootstrap admin deactivated; real human admin accounts in use.
