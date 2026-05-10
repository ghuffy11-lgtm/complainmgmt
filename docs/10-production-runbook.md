# Production deploy runbook

A step-by-step procedure for bringing up CTS on a Linux server reachable by IP only, with self-signed TLS. This is the runbook you execute on the production server itself.

> Replace every `<PROD_IP>` below with your server's actual IP — for example `10.1.13.50`.

## 0. Prerequisites

A Linux server (Ubuntu 22.04 / 24.04 / Debian 12 / similar) with:
- Root or sudo access
- Outbound internet for `git clone` + `docker pull`
- TCP port **443** open from where users will connect (configure your firewall / `ufw allow 443/tcp` if applicable). If port 443 is already in use by another service on this host, see "Coexistence with another web stack" below.
- At least 2 CPU cores, 4 GB RAM, 20 GB disk free

### Coexistence with another web stack on the same host (optional)

If the host already runs Apache / nginx / IIS / Laravel / etc. on ports 80 and 443, CTS can run alongside without touching that stack. Pick non-conflicting host ports for CTS — `8080` and `8443` are the conventional choices. The values are set in `.env`:

```
NGINX_HTTP_PORT=8080
NGINX_HTTPS_PORT=8443
CORS_ORIGINS=https://<your-cts-hostname>:8443
```

Users then access CTS at `https://<your-cts-hostname>:8443/`. To get the port out of the URL later, add a reverse-proxy block to the host's existing web server pointing the CTS hostname at `127.0.0.1:8443`.

### Dedicated disk for Docker storage (recommended)

Mounting `/var/lib/docker` on its own disk before installing Docker isolates Docker's growing data (images, container layers, named volumes, build cache) from the OS root volume. A runaway image build then can't fill `/` and crash the OS or other services on the host. Do this **before** installing Docker so Docker uses the disk from the start; otherwise you'll have to stop Docker, move `/var/lib/docker` contents over, and remount.

```bash
# Identify the new device (here /dev/sdb)
lsblk -o NAME,SIZE,FSTYPE,TYPE,MOUNTPOINT
sudo mkfs.ext4 -L docker /dev/sdb
sudo mkdir -p /var/lib/docker
UUID=$(sudo blkid -s UUID -o value /dev/sdb)
echo "UUID=$UUID  /var/lib/docker  ext4  defaults,nofail  0  2" | sudo tee -a /etc/fstab
sudo mount -a
```

Use `nofail` so a missing disk after a reboot doesn't block boot — Docker fails to start instead of the whole server hanging.

If the host is a virtual machine and you've hot-attached the disk but `lsblk` doesn't show it, trigger a SCSI rescan: `for h in /sys/class/scsi_host/host*; do echo "- - -" | sudo tee "$h/scan" >/dev/null; done`.

### Install Docker

Install Docker (skip if already installed):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
sudo usermod -aG docker $USER     # then log out + back in so the group takes effect
docker compose version            # confirms the compose plugin is installed
```

**Storage driver gotcha (Docker 29.x):** the install on Ubuntu 22.04 sometimes defaults to the `overlayfs` (containerd image-store) driver. That driver has known race conditions when building multiple images in parallel that lock content blobs and fail with `mount callback failed … device or resource busy` errors during `docker compose build`. Switch to the classic, stable `overlay2` driver before any build:

```bash
sudo tee /etc/docker/daemon.json >/dev/null <<'EOF'
{"features":{"containerd-snapshotter":false},"storage-driver":"overlay2"}
EOF
sudo systemctl restart docker
docker info | grep "Storage Driver"   # should print: overlay2
```

### Install git

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

If the repo is **private**, the HTTPS clone above will prompt for credentials and fail under automation. Two options:

- **Deploy key (recommended for read-only deploys).** On the prod server, generate a dedicated keypair (`ssh-keygen -t ed25519 -f ~/.ssh/github-deploy -N ''`), add a `Host github.com` block to `~/.ssh/config` pointing at that key with `IdentitiesOnly yes`, then paste the public key into the repo's **Deploy keys** page on GitHub (`https://github.com/<owner>/<repo>/settings/keys` — *not* the account-wide `github.com/settings/keys` page). Leave "Allow write access" unchecked. Switch the clone URL to SSH: `git clone git@github.com:<owner>/<repo>.git`.
- **Personal access token.** Create a fine-grained PAT scoped to this repo with read-only "Contents" permission, configure git on prod to use HTTPS with that token. Slightly less restrictive than a deploy key.

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

Wire the existing backup script to cron so you have nightly Postgres dumps. If you set up a dedicated docker disk in section 0, put the backups on that disk too — the OS volume stays untouched as Docker data and backups grow together. The example below assumes that layout; adjust `BACKUP_DIR` if you didn't.

```bash
sudo install -d -o $USER -g $USER -m 700 /var/lib/docker/cts-backups
# /var/lib/docker is mode 710 by default — let your user traverse into its own subdir
sudo chmod 711 /var/lib/docker
crontab -e
```

Add this line under your own user's crontab (not root's — running as the deploy user keeps the backup process unprivileged):

```
0 2 * * * cd /opt/complainmgmt && BACKUP_DIR=/var/lib/docker/cts-backups /opt/complainmgmt/scripts/backup.sh >> /var/log/cts-backup.log 2>&1
```

```bash
sudo touch /var/log/cts-backup.log
sudo chown $USER:$USER /var/log/cts-backup.log
```

Test it now:

```bash
BACKUP_DIR=/var/lib/docker/cts-backups ./scripts/backup.sh
ls -lah /var/lib/docker/cts-backups/
```

You should see a fresh `.sql.gz` dump. The script handles its own retention. Copy these off the server to a separate location (S3, NAS, second VM) periodically — backups on the same physical machine don't survive a disk or host failure.

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

## Break-glass: unlocking a user when no admin can log in

Lockout is a security feature: 5 wrong passwords in a short window → 15-minute lock. The everyday recovery path is **Admin → Users → "Unlock"** in the app. That writes an audited `account.unlocked_by_admin` row to `auth_audit_log`.

If the locked-out user is the only admin (or the in-app path is otherwise unreachable), use the break-glass script. It runs against the DB directly so no admin login is required:

```bash
cd /opt/complainmgmt
./scripts/unlock-user.sh <username>
```

The script:
- prints the row state before and after the change;
- only touches `failed_login_count` and `locked_until` — never the password or any other field;
- exits non-zero with a clear message if the username doesn't exist.

Limitation: because it bypasses the API, the action is **not** captured in `auth_audit_log`. That's the cost of working when the API is unreachable. Prefer the in-app button when both options are available.
