#!/usr/bin/env bash
# Restore a CTS backup (.sql.gz from backup.sh) into the running database.
#
# Usage:
#   ./scripts/restore.sh ./backups/cts-2026-05-04_010000.sql.gz
#
# WARNING: this DROPs+RECREATEs application objects (the dump uses
# --clean --if-exists). It's destructive on the target database. Confirm
# with the env var I_KNOW_THIS_DESTROYS_DATA=1 to actually run.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
[[ -f .env ]] && set -a && source .env && set +a

FILE="${1:-}"
if [[ -z "$FILE" ]]; then
  echo "usage: $0 <path/to/backup.sql.gz>" >&2
  exit 2
fi
if [[ ! -f "$FILE" ]]; then
  echo "file not found: $FILE" >&2
  exit 2
fi
if [[ "${I_KNOW_THIS_DESTROYS_DATA:-0}" != "1" ]]; then
  echo "Refusing to run without I_KNOW_THIS_DESTROYS_DATA=1 — this drops existing tables." >&2
  exit 3
fi

echo "→ restoring $FILE into ${POSTGRES_DB:?POSTGRES_DB missing}"
gunzip -c "$FILE" | docker compose exec -T db \
  psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:?}" -d "${POSTGRES_DB:?}"

echo "✓ restore complete"
