#!/usr/bin/env bash
# Take a gzipped pg_dump of the running CTS database via docker compose.
#
# Usage:
#   ./scripts/backup.sh                       # writes ./backups/cts-YYYY-MM-DD.sql.gz
#   BACKUP_DIR=/mnt/backups ./scripts/backup.sh
#   RETAIN_DAYS=14 ./scripts/backup.sh        # delete dumps older than N days
#   MIRROR_DIR=/mnt/lxbackup/cts ./scripts/backup.sh
#                                             # also copy to a second location
#                                             # (e.g. an NFS / SMB share) so the
#                                             # backup survives loss of this host
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

mkdir -p "$BACKUP_DIR"

echo "→ pg_dump from docker compose service 'db' to $OUT"
docker compose exec -T db \
  pg_dump -U "${POSTGRES_USER:?POSTGRES_USER missing}" \
          -d "${POSTGRES_DB:?POSTGRES_DB missing}" \
          --no-owner --clean --if-exists \
  | gzip -9 > "$OUT"

bytes="$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")"
echo "✓ wrote $OUT ($((bytes / 1024)) KB)"

if [[ "${RETAIN_DAYS}" -gt 0 ]]; then
  echo "→ retention: deleting backups older than $RETAIN_DAYS days"
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'cts-*.sql.gz' -mtime +"${RETAIN_DAYS}" -print -delete || true
fi

# ─── optional mirror to a second location ──────────────────────────────
# Best-effort: if the mirror dir is unreachable (e.g. NFS share down), the
# local backup is still authoritative. The cron log captures the failure
# message for whoever monitors it.
if [[ -n "${MIRROR_DIR:-}" ]]; then
  MIRROR_RETAIN_DAYS="${MIRROR_RETAIN_DAYS:-$RETAIN_DAYS}"
  echo "→ mirror: copying $OUT to $MIRROR_DIR/"
  if mkdir -p "$MIRROR_DIR" 2>/dev/null && cp -p "$OUT" "$MIRROR_DIR/" 2>/dev/null; then
    echo "✓ mirrored to $MIRROR_DIR/$(basename "$OUT")"
    if [[ "${MIRROR_RETAIN_DAYS}" -gt 0 ]]; then
      find "$MIRROR_DIR" -maxdepth 1 -type f -name 'cts-*.sql.gz' \
        -mtime +"${MIRROR_RETAIN_DAYS}" -print -delete 2>/dev/null || true
    fi
  else
    echo "✗ mirror failed (dest unreachable / not writable). Local backup is fine; investigate."
  fi
fi
