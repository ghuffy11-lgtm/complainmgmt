#!/usr/bin/env bash
# Take a gzipped pg_dump of the running CTS database via docker compose,
# plus a config tarball containing .env + nginx/certs/.
#
# Two output files per run, same timestamp:
#   cts-<TS>.sql.gz         — DB dump (complaint data, users, attachments,
#                              logo — everything in postgres)
#   cts-config-<TS>.tar.gz  — .env (DB password, JWT_SECRET,
#                              TOTP_ENCRYPTION_KEY) + nginx/certs/.
#                              Mode 600 because .env has plaintext secrets.
#
# Frontend + backend code is NOT backed up — both are stateless, built
# from git into Docker images on deploy. To restore, you need: this
# repo at the matching commit + the DB dump + the config tarball.
#
# Usage:
#   ./scripts/backup.sh                       # writes both to ./backups/
#   BACKUP_DIR=/mnt/backups ./scripts/backup.sh
#   RETAIN_DAYS=14 ./scripts/backup.sh        # delete dumps older than N days
#   SKIP_CONFIG=1 ./scripts/backup.sh         # DB-only (legacy behaviour)
#   MIRROR_DIR=/mnt/lxbackup/cts ./scripts/backup.sh
#                                             # also copy BOTH files to a second
#                                             # location (e.g. an NFS / SMB share)
#                                             # so the backup survives loss of
#                                             # this host
#   MIRROR_RETAIN_DAYS=90 ./scripts/backup.sh # retention applied to MIRROR_DIR
#                                             # too; defaults to RETAIN_DAYS
#
# Schedule via cron / systemd timer for daily runs. Verify recoverability
# periodically with restore.sh against a scratch DB.
#
# Mirror is best-effort: if the destination is unreachable, the local
# backup still succeeds and the cron log captures the mirror failure.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
[[ -f .env ]] && set -a && source .env && set +a

BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
RETAIN_DAYS="${RETAIN_DAYS:-30}"
TS="$(date +%Y-%m-%d_%H%M%S)"
OUT="$BACKUP_DIR/cts-$TS.sql.gz"
CONFIG_OUT="$BACKUP_DIR/cts-config-$TS.tar.gz"

mkdir -p "$BACKUP_DIR"

echo "→ pg_dump from docker compose service 'db' to $OUT"
docker compose exec -T db \
  pg_dump -U "${POSTGRES_USER:?POSTGRES_USER missing}" \
          -d "${POSTGRES_DB:?POSTGRES_DB missing}" \
          --no-owner --clean --if-exists \
  | gzip -9 > "$OUT"

bytes="$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")"
echo "✓ wrote $OUT ($((bytes / 1024)) KB)"

# ─── config tarball: .env + nginx/certs ────────────────────────────────
# Both live outside Docker images and outside git. Losing .env makes
# every encrypted 2FA secret in the DB undecryptable (TOTP_ENCRYPTION_KEY
# is rotated, not derived), so this is load-bearing.
if [[ "${SKIP_CONFIG:-0}" != "1" ]]; then
  CONFIG_ITEMS=()
  [[ -f .env ]] && CONFIG_ITEMS+=(.env)
  [[ -d nginx/certs ]] && CONFIG_ITEMS+=(nginx/certs)
  if [[ ${#CONFIG_ITEMS[@]} -gt 0 ]]; then
    echo "→ config tar to $CONFIG_OUT (${CONFIG_ITEMS[*]})"
    tar -czf "$CONFIG_OUT" "${CONFIG_ITEMS[@]}"
    chmod 600 "$CONFIG_OUT"   # .env has plaintext secrets
    cbytes="$(stat -c%s "$CONFIG_OUT" 2>/dev/null || stat -f%z "$CONFIG_OUT")"
    echo "✓ wrote $CONFIG_OUT ($((cbytes / 1024)) KB, mode 600)"
  else
    echo "→ config tar: no .env or nginx/certs/ present, skipping"
  fi
fi

if [[ "${RETAIN_DAYS}" -gt 0 ]]; then
  echo "→ retention: deleting backups older than $RETAIN_DAYS days"
  find "$BACKUP_DIR" -maxdepth 1 -type f \
       \( -name 'cts-*.sql.gz' -o -name 'cts-config-*.tar.gz' \) \
       -mtime +"${RETAIN_DAYS}" -print -delete || true
fi

# ─── optional mirror to a second location ──────────────────────────────
# Best-effort: if the mirror dir is unreachable (e.g. NFS share down), the
# local backup is still authoritative. The cron log captures the failure
# message for whoever monitors it.
if [[ -n "${MIRROR_DIR:-}" ]]; then
  MIRROR_RETAIN_DAYS="${MIRROR_RETAIN_DAYS:-$RETAIN_DAYS}"
  echo "→ mirror: copying $OUT to $MIRROR_DIR/"
  mirror_ok=0
  if mkdir -p "$MIRROR_DIR" 2>/dev/null && cp -p "$OUT" "$MIRROR_DIR/" 2>/dev/null; then
    echo "✓ mirrored to $MIRROR_DIR/$(basename "$OUT")"
    mirror_ok=1
  else
    echo "✗ mirror failed (dest unreachable / not writable). Local backup is fine; investigate."
  fi
  if [[ -f "$CONFIG_OUT" && "$mirror_ok" -eq 1 ]]; then
    if cp -p "$CONFIG_OUT" "$MIRROR_DIR/" 2>/dev/null; then
      echo "✓ mirrored to $MIRROR_DIR/$(basename "$CONFIG_OUT")"
    else
      echo "✗ config mirror failed."
    fi
  fi
  if [[ "$mirror_ok" -eq 1 && "${MIRROR_RETAIN_DAYS}" -gt 0 ]]; then
    find "$MIRROR_DIR" -maxdepth 1 -type f \
         \( -name 'cts-*.sql.gz' -o -name 'cts-config-*.tar.gz' \) \
         -mtime +"${MIRROR_RETAIN_DAYS}" -print -delete 2>/dev/null || true
  fi
fi
