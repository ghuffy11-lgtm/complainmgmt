#!/usr/bin/env bash
# Break-glass: clear a user's failed-login counter and lock-until timestamp.
#
# Use this when an admin can't log in to use the in-app "Unlock" button —
# typically because the only locked-out user IS the only admin.
#
# Usage:
#   ./scripts/unlock-user.sh <username>
#
# What it does (and only this):
#   * Sets `failed_login_count = 0` and `locked_until = NULL` on the row
#     where `username = <arg>`.
#   * Prints the row state before and after, so you can see what changed.
#
# What it does NOT do:
#   * Reset the password.
#   * Bypass 2FA (once Batch C lands, see scripts/reset-2fa.sh).
#   * Touch any other field on the user row.
#
# Audit trail: this script bypasses the API, so the in-app
# `auth_audit_log` does NOT get an `account.unlocked_by_admin` row.
# This is the cost of break-glass — it works when the API is unreachable
# or no admin can authenticate. Use the in-app button (admin → Users →
# "Unlock") for the audited path; reach for this script only when the
# in-app path is blocked.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <username>" >&2
  exit 64
fi
USERNAME="$1"

if [[ ! -f .env ]]; then
  echo "✗ .env not found at $ROOT/.env" >&2
  exit 1
fi

# Read DB credentials. Strict: require both to be set so we don't run
# against a default-named DB by accident.
PG_USER="$(grep -E '^POSTGRES_USER=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
PG_DB="$(grep -E '^POSTGRES_DB=' .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
if [[ -z "${PG_USER:-}" || -z "${PG_DB:-}" ]]; then
  echo "✗ POSTGRES_USER and POSTGRES_DB must both be set in .env" >&2
  exit 1
fi

if ! docker compose ps --services --filter "status=running" 2>/dev/null | grep -qx db; then
  echo "✗ db service is not running. Start the stack with: docker compose up -d db" >&2
  exit 1
fi

# `psql -v` variable substitution does NOT expand inside `-c` strings —
# only in commands read from stdin / -f / interactive. We pipe the SQL in
# via stdin so :'u' interpolates safely (psql quotes it correctly,
# defeating injection attempts via crafted usernames).
psql_pipe() {
  docker compose exec -T db psql -U "$PG_USER" -d "$PG_DB" "$@" -v "u=$USERNAME"
}

# Check the row exists.
EXISTS="$(echo "SELECT EXISTS (SELECT 1 FROM users WHERE username = :'u');" \
  | psql_pipe -At)"
if [[ "$EXISTS" != "t" ]]; then
  echo "✗ no user with username '$USERNAME' found." >&2
  exit 2
fi

echo "── before ──"
echo "SELECT id, username, is_active, failed_login_count, locked_until FROM users WHERE username = :'u';" \
  | psql_pipe

echo "UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE username = :'u';" \
  | psql_pipe --single-transaction --set ON_ERROR_STOP=1 >/dev/null

echo "── after ──"
echo "SELECT id, username, is_active, failed_login_count, locked_until FROM users WHERE username = :'u';" \
  | psql_pipe

echo "✓ '$USERNAME' unlocked. They can attempt to log in immediately."
