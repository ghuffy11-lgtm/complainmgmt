# Production deploy runbook

A step-by-step procedure for bringing up CTS on a Linux server reachable by IP only, with self-signed TLS. This is the runbook you execute on the production server itself.

> Replace every `<PROD_IP>` below with your server's actual IP — for example `10.1.13.50`.

## 0. Prerequisites

A Linux server (Ubuntu 22.04 / 24.04 / Debian 12 / similar) with:
- Root or sudo access
- Outbound internet for `git clone` + `docker pull`
- TCP port **443** open from where users will connect (configure your firewall / `ufw allow 443/tcp` if applicable)
- At least 2 CPU cores, 4 GB RAM, 20 GB disk free

Install Docker (skip if already installed):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
sudo usermod -aG docker $USER     # then log out + back in so the group takes effect
docker compose version            # confirms the compose plugin is installed
```

Install git if not already:

```bash
sudo apt update && sudo apt install -y git openssl
```

## 1. Clone the repo

```bash
sudo mkdir -p /opt && sudo chown $USER:$USER /opt
cd /opt
git clone https://github.com/ghuffy11-lgtm/complainmgmt.git
cd complainmgmt
git checkout v1.0.0
```

(Anchoring to the tag means future `git pull` commands won't surprise you with mid-development code.)

## 2. Generate strong secrets

Generate two secrets you'll paste into `.env` in the next step:

```bash
echo "JWT_SECRET=$(openssl rand -base64 64 | tr -d '\n')"
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -d '/=+\n' | head -c 32)"
echo "INITIAL_ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '/=+\n' | head -c 24)"
```

Copy the three lines somewhere safe (password manager). You'll need the admin password for the very first login.

## 3. Configure `.env`

```bash
cp .env.example .env
nano .env
```

Edit these keys (everything else can stay default):

```
POSTGRES_PASSWORD=<paste from step 2>
JWT_SECRET=<paste from step 2>
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=<paste from step 2>
DATABASE_URL=postgres://cts_app:<the same POSTGRES_PASSWORD>@db:5432/complainmgmt
NGINX_HTTPS_PORT=443
NGINX_HTTP_PORT=80
CORS_ORIGINS=https://<PROD_IP>
```

> The `DATABASE_URL` password must match `POSTGRES_PASSWORD` exactly — they're not auto-linked.

Save and close.

## 4. Generate self-signed TLS certs (with IP in the SAN)

This is what makes the cert valid for `https://<PROD_IP>` instead of just `https://localhost`:

```bash
EXTRA_SANS="<PROD_IP>" CN="<PROD_IP>" ./nginx/certs/generate-dev-certs.sh
```

Browsers will still show a security warning the first time (because the cert isn't from a trusted CA) — users click through. Plan to swap for a real cert from your CA or Let's Encrypt later; the cert files just need to be replaced in `nginx/certs/` (no rebuild needed, just `docker compose restart nginx`).

## 5. Build and start the stack

```bash
docker compose up -d --build
```

This pulls Postgres, builds the backend + frontend images, and brings everything up in detached mode. First build takes ~3–5 minutes.

Wait for everything to report healthy:

```bash
docker compose ps
```

All four services (`db`, `backend`, `frontend`, `nginx`) should show **healthy** or **running**. The `backend` health check waits for migrations + bootstrap to finish, so the whole stack is ready when it goes healthy (~30 seconds after `up`).

## 6. Smoke test

```bash
BASE=https://<PROD_IP> bash scripts/smoke-test.sh
```

Expected: `Summary: 15 passed, 0 failed`. If anything fails, see Troubleshooting below before opening the system to users.

## 7. First login + initial setup

Open `https://<PROD_IP>` in a browser. Click through the cert warning the first time.

1. Sign in with `admin` and the `INITIAL_ADMIN_PASSWORD` from step 2.
2. **Change the admin password immediately** (top-right → Change password).
3. **Admin → Settings → Branding** — set the real organisation name, system name, login subtitle, footer text. Upload your logo (PNG / JPEG / WebP / SVG, max 1 MB).
4. **Admin → Departments** — create the departments you actually have (Reception, Pharmacy, Nursing, …). The defaults from the seed are placeholders.
5. **Admin → Users** — create real user accounts with the appropriate role + department memberships. Mark `admin` inactive (or delete) once you have at least one human admin who isn't the bootstrap account.
6. **Admin → Fields** — review the dynamic fields shipped by default (`mobile_number`, `file_id`, etc.); add or rename any clinic-specific fields.
7. **Admin → Roles** — verify the role permission grid matches your governance.

## 8. Set up backups

Wire the existing backup script to cron so you have nightly Postgres dumps:

```bash
mkdir -p /var/backups/cts
sudo crontab -e
```

Add:

```
0 2 * * * cd /opt/complainmgmt && BACKUP_DIR=/var/backups/cts /opt/complainmgmt/scripts/backup.sh >> /var/log/cts-backup.log 2>&1
```

The script keeps the last 14 days by default (look inside `scripts/backup.sh` to adjust). Test it now:

```bash
BACKUP_DIR=/var/backups/cts ./scripts/backup.sh
ls -lah /var/backups/cts/
```

You should see a fresh `.sql.gz` dump. Copy these off the server to a separate location (S3, NAS, second VM) periodically — a backup on the same disk doesn't survive a disk failure.

## 9. Open it to users

Once the smoke is green and you've completed the first-login setup, send the URL `https://<PROD_IP>` and credentials to your users. Tell them to expect the cert warning on first visit (or mark the cert trusted on managed devices via your MDM / domain policy).

---

## Updating to a new release

When a new tagged version lands on the repo:

```bash
cd /opt/complainmgmt
git fetch --tags
git checkout v1.X.Y           # whatever the new tag is
docker compose build
docker compose up -d
BASE=https://<PROD_IP> bash scripts/smoke-test.sh    # confirm 15/15 before walking away
```

Migrations apply automatically on backend startup. If anything breaks, see Rollback.

## Rollback

```bash
cd /opt/complainmgmt
git checkout v1.0.0           # or whatever known-good tag you were on
docker compose build
docker compose up -d
```

Note: rolling back the *application* doesn't roll back database migrations. If a new release applied a destructive schema change you can't tolerate, you'd need to restore from the most recent backup before retrying:

```bash
gunzip < /var/backups/cts/cts_backup_YYYYMMDD_HHMMSS.sql.gz | docker compose exec -T db psql -U cts_app -d complainmgmt
```

This is why nightly backups + a good rollback tag are non-negotiable before bringing the system up to users.

## Troubleshooting

### Smoke fails on `/api/health`

Check backend logs:
```bash
docker compose logs backend --tail=100
```
Common causes: bad `DATABASE_URL` (mismatched password), `JWT_SECRET` empty, port 443 already in use by another process.

### Smoke fails on login

Verify `INITIAL_ADMIN_PASSWORD` was actually applied — the bootstrap only runs against an empty DB. If you set it after the first `up`, the existing `admin` user already has whatever password that bootstrap minted. Either reset via the DB:
```bash
docker compose exec db psql -U cts_app -d complainmgmt -c "DELETE FROM users WHERE username = 'admin';"
docker compose restart backend     # bootstrap re-creates admin from .env
```

Or use Admin → Users on a different admin account to reset it.

### Browser shows "Connection refused" on https://&lt;PROD_IP&gt;

Firewall — confirm port 443 is open inbound on the server (`sudo ufw status`, or your cloud provider's security group).

### Cert warning persists on managed devices

Self-signed certs are flagged by every browser. Options:
- **MDM-push the cert** to managed devices (Group Policy, Jamf, Intune…) so it shows as trusted. Cert files are in `/opt/complainmgmt/nginx/certs/fullchain.pem`.
- **Switch to Let's Encrypt** when the server has a real DNS name (free certs, auto-renew with `certbot`).
