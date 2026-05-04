#!/usr/bin/env bash
# Production-readiness preflight. Run before promoting a deploy.
#
# Checks:
#   1. .env exists and required values are set + non-default
#   2. JWT_SECRET is sufficiently long
#   3. POSTGRES_PASSWORD isn't the example default
#   4. db service does NOT expose a host port (production posture)
#   5. nginx certs are present and not the dev self-signed cert
#   6. HSTS is enabled in nginx config
#
# Exits 0 on a clean run, non-zero with a summary otherwise.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

FAILS=0
WARNS=0
fail() { echo "✗ $1"; FAILS=$((FAILS + 1)); }
warn() { echo "⚠ $1"; WARNS=$((WARNS + 1)); }
pass() { echo "✓ $1"; }

# 1 — .env present
if [[ ! -f .env ]]; then
  fail ".env missing — copy .env.example and fill it in"
else
  pass ".env present"
  # shellcheck disable=SC1091
  set -a && source .env && set +a

  # 2 — JWT_SECRET length
  if [[ -z "${JWT_SECRET:-}" ]]; then
    fail "JWT_SECRET unset"
  elif [[ "${#JWT_SECRET}" -lt 32 ]]; then
    fail "JWT_SECRET is too short (${#JWT_SECRET} chars; ≥ 32 required)"
  elif [[ "$JWT_SECRET" == "replace_with_long_random_secret" ]]; then
    fail "JWT_SECRET is still the example placeholder"
  else
    pass "JWT_SECRET is set and strong enough (${#JWT_SECRET} chars)"
  fi

  # 3 — POSTGRES_PASSWORD
  if [[ -z "${POSTGRES_PASSWORD:-}" ]]; then
    fail "POSTGRES_PASSWORD unset"
  elif [[ "$POSTGRES_PASSWORD" == "change_me_in_production" ]]; then
    fail "POSTGRES_PASSWORD is the example default"
  elif [[ "${#POSTGRES_PASSWORD}" -lt 16 ]]; then
    warn "POSTGRES_PASSWORD is shorter than 16 chars"
  else
    pass "POSTGRES_PASSWORD looks reasonable"
  fi

  # BCRYPT_ROUNDS
  if [[ "${BCRYPT_ROUNDS:-12}" -lt 12 ]]; then
    warn "BCRYPT_ROUNDS=${BCRYPT_ROUNDS} (recommend ≥ 12)"
  else
    pass "BCRYPT_ROUNDS=${BCRYPT_ROUNDS}"
  fi

  # NODE_ENV
  if [[ "${NODE_ENV:-}" != "production" ]]; then
    warn "NODE_ENV=${NODE_ENV:-unset} (set to 'production' before promoting)"
  else
    pass "NODE_ENV=production"
  fi

  # INITIAL_ADMIN_* should be unset post-bootstrap
  if [[ -n "${INITIAL_ADMIN_PASSWORD:-}" ]]; then
    warn "INITIAL_ADMIN_PASSWORD is still set — unset after first admin login"
  fi
fi

# 4 — db host port exposure
if grep -qE '^\s*-\s*"\$\{POSTGRES_PORT' docker-compose.yml; then
  warn "docker-compose.yml exposes the db port to the host (remove for prod)"
else
  pass "db port is not exposed in docker-compose"
fi

# 5 — nginx certs
if [[ ! -f nginx/certs/fullchain.pem ]] || [[ ! -f nginx/certs/privkey.pem ]]; then
  fail "nginx/certs/{fullchain,privkey}.pem missing"
elif openssl x509 -in nginx/certs/fullchain.pem -noout -subject 2>/dev/null \
     | grep -qE 'CN\s*=\s*localhost'; then
  warn "nginx/certs/fullchain.pem appears to be the dev self-signed cert (CN=localhost)"
else
  pass "nginx certs present (non-self-signed)"
fi

# 6 — HSTS
if grep -q '^\s*add_header Strict-Transport-Security' nginx/conf.d/default.conf; then
  pass "HSTS header enabled in nginx config"
else
  warn "HSTS header is commented out in nginx/conf.d/default.conf"
fi

echo
echo "Summary: $FAILS failure(s), $WARNS warning(s)"
[[ "$FAILS" -eq 0 ]]
