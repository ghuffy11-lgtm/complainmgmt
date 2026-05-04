# 04 — Deployment Guide

Targets a single Linux host running Docker Engine 24+ and Docker Compose v2.

## Prerequisites

- Docker Engine ≥ 24, Compose plugin v2
- 2 vCPU / 4 GB RAM minimum
- Open ports: 80 (redirect), 443 (HTTPS)
- DNS A record pointing to the host (for real TLS)
- Backup destination for Postgres dumps

## 1. Clone & configure

```bash
git clone <repo> /opt/cts && cd /opt/cts
cp .env.example .env
# edit .env — set strong POSTGRES_PASSWORD, JWT_SECRET, INITIAL_ADMIN_*
$EDITOR .env
```

Generate a strong JWT secret:

```bash
openssl rand -base64 64 | tr -d '\n'
```

## 2. TLS certificates

### Production (Let's Encrypt via certbot, host-mounted)

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d cts.example.com
sudo cp /etc/letsencrypt/live/cts.example.com/fullchain.pem nginx/certs/fullchain.pem
sudo cp /etc/letsencrypt/live/cts.example.com/privkey.pem  nginx/certs/privkey.pem
sudo chown $USER:$USER nginx/certs/*.pem
```

Set a renewal cron — `certbot renew --post-hook "docker compose exec nginx nginx -s reload"`.

### Development (self-signed)

```bash
./nginx/certs/generate-dev-certs.sh
```

This emits `nginx/certs/fullchain.pem` and `nginx/certs/privkey.pem` for `localhost`.

## 3. Initial bring-up

```bash
docker compose up -d --build
docker compose logs -f backend
```

The Postgres container runs `db/migrations/*.sql` in lexical order on first start (`/docker-entrypoint-initdb.d`). On subsequent starts the data volume is preserved and migrations are **not** re-applied; for schema changes during operation, see the migration runbook below.

Verify:

```bash
curl -k https://localhost/api/health
# {"status":"ok","ts":"..."}
```

## 4. First admin login

If `.env` set `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD`, the seed migration created that user. Log in, change the password immediately, then **unset those env vars** and `docker compose up -d` again.

## 5. Operations

### Logs

```bash
docker compose logs -f --tail=200 backend
docker compose logs -f --tail=200 nginx
```

### Backup

```bash
docker compose exec -T db pg_dump -U $POSTGRES_USER $POSTGRES_DB \
  | gzip > backups/cts-$(date +%F).sql.gz
```

Schedule daily via cron / systemd timer; keep 30 days off-host.

### Restore

```bash
gunzip -c backups/cts-2026-04-01.sql.gz \
  | docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB
```

### Schema migrations on a running cluster

Postgres init scripts only run on an empty data dir. For changes after go-live:

```bash
docker compose exec -T db psql -U $POSTGRES_USER -d $POSTGRES_DB \
  < db/migrations/0008_my_change.sql
```

Until a dedicated migration runner is added (see roadmap), the operator runs each new file once and records it in `schema_migrations` (table created in `0001`).

### Rotating JWT secret

1. Update `JWT_SECRET` in `.env`.
2. `docker compose up -d backend` — all in-flight access tokens become invalid; refresh tokens survive (they're DB-backed).

### Stopping / removing

```bash
docker compose down            # stop containers, keep data
docker compose down -v         # ⚠ destroys the database volume
```

## 6. Hardening checklist

- [ ] `POSTGRES_PASSWORD` is a 20+ char random string.
- [ ] `JWT_SECRET` is from `openssl rand -base64 64`.
- [ ] `BCRYPT_ROUNDS` ≥ 12.
- [ ] `db` service has no host port (remove the `ports:` mapping in production).
- [ ] HSTS enabled in `nginx.conf` (uncomment after first successful real-cert deploy).
- [ ] Daily DB backups verified by a periodic restore drill.
- [ ] OS firewall blocks everything except 22, 80, 443.
- [ ] Container images pinned to digests in production.
- [ ] Log shipping configured (journald → syslog/Loki).
- [ ] Audit table is owned by a non-application role; the application role has only `INSERT, SELECT` (see "Audit table privileges" below).

### Audit table privileges (production)

The `complaint_audit_log` table is the tamper-evidence record. Two layers
defend it:

1. **BEFORE UPDATE/DELETE triggers** (migration `0005`) raise an exception on
   any modification attempt — irrespective of which role is connected.
2. **Privilege-level revocation** (migration `0009`) revokes UPDATE/DELETE
   from PUBLIC.

The dev `docker-compose` stack runs Postgres init scripts as `POSTGRES_USER`,
who becomes the *owner* of the table. Owners hold implicit privileges that
cannot be revoked, so in dev the trigger is the load-bearing defence.

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

Point the backend's `DATABASE_URL` at `cts_app`. Run migrations with
`cts_owner`. With this split, even an application-level bug (or compromise)
cannot tamper with audit history — privilege check rejects it before the
trigger sees it.

## 7. Scaling

Backend is stateless. To run two replicas:

```yaml
backend:
  deploy:
    replicas: 2
```

NGINX upstream round-robins. Refresh tokens in DB ensure rotation works across replicas.

For Postgres, move to a managed service or set up streaming replication; the application tolerates read replicas only after the read/write split work in the roadmap.
