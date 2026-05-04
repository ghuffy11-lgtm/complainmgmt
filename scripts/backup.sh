#!/usr/bin/env bash
# Take a gzipped pg_dump of the running CTS database via docker compose.
#
# Usage:
#   ./scripts/backup.sh                       # writes ./backups/cts-YYYY-MM-DD.sql.gz
#   BACKUP_DIR=/mnt/backups ./scripts/backup.sh
#   RETAIN_DAYS=14 ./scripts/backup.sh        # delete dumps older than N days
#
# Schedule via cron / systemd timer for daily runs. Verify recoverability
# periodically with restore.sh against a scratch DB.

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
