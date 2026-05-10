#!/usr/bin/env bash
# Black-box smoke for the TOTP-based 2FA flow (E17 Batch C/D).
#
# Walks the full happy path against a running stack:
#
#   1. log in with username + password           → session
#   2. POST /auth/2fa/setup                      → provisional secret
#   3. compute first TOTP from secret (Python)
#   4. POST /auth/2fa/enable                     → backup codes returned ONCE
#   5. log out
#   6. log in again                              → { twoFactorRequired, challengeToken }
#   7. compute current TOTP
#   8. POST /auth/2fa/verify                     → session
#   9. GET /auth/me                              → twoFactorEnrolled === true
#  10. POST /auth/2fa/disable (currentPassword)  → 204; sessions revoked
#  11. log in once more                          → no challenge (back to plain login)
#
# Idempotency caveat: this test enrolls the account it logs in as and
# then disables. If it crashes between step 4 and step 10, the account
# is left enrolled — recover with `./scripts/unlock-user.sh <user>`
# (clears lockout) plus an admin reset-2FA, OR re-run this script
# (steps 6→11 still apply).
#
# Dependencies: bash, curl, python3 (stdlib only), jq OR python3 for JSON.

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
[[ -f .env ]] && set -a && source .env && set +a

BASE="${BASE:-https://localhost:${NGINX_HTTPS_PORT:-8443}}"
USERNAME="${USERNAME:-${INITIAL_ADMIN_USERNAME:-admin}}"
PASSWORD="${PASSWORD:-${INITIAL_ADMIN_PASSWORD:?set PASSWORD or INITIAL_ADMIN_PASSWORD}}"

CURL=(curl -sk --max-time 15)

# Two helpers we need from a JSON tool:
#   JSON_GET <jq-path>     reads a value from stdin
#   JSON_OBJ <key=val> ...  emits a JSON object with the given pairs
# jq does both; the python fallback covers stacks without jq.
if command -v jq >/dev/null 2>&1; then
  JSON_GET() { jq -r "$1"; }
  JSON_OBJ() {
    local args=()
    for kv in "$@"; do args+=(--arg "${kv%%=*}" "${kv#*=}"); done
    local fields=""
    local sep=""
    for kv in "$@"; do fields+="$sep\"${kv%%=*}\":\$${kv%%=*}"; sep=","; done
    jq -n "${args[@]}" "{$fields}"
  }
else
  JSON_GET() { python3 -c "import json,sys; d=json.load(sys.stdin)
keys = '$1'.lstrip('.').split('.')
v = d
for k in keys:
    if k == '': continue
    if isinstance(v, list): v = v[int(k)]
    else: v = v[k]
print(v if v is not None else '')"; }
  JSON_OBJ() {
    python3 -c "import json,sys
out={}
for kv in sys.argv[1:]:
    k, _, v = kv.partition('=')
    out[k] = v
print(json.dumps(out))" "$@"
  }
fi

# jq -r and Python both render a missing key as 'null' (string) /
# 'None'. Reject both so we don't silently carry 'null' as an auth
# token through the rest of the script.
require_value() {
  local label="$1" value="$2"
  if [[ -z "$value" || "$value" == "null" || "$value" == "None" ]]; then
    fail "${label} missing — response was: ${3:-<empty>}"
  fi
}

# Compute the current 6-digit TOTP for a base32 secret using only the
# Python stdlib. Mirrors otplib's defaults: SHA1, 30s step, 6 digits.
totp_now() {
  local secret="$1"
  python3 - <<PY
import base64, hmac, hashlib, struct, time, sys
secret = "${secret}".replace(" ", "").upper()
# pad to a multiple of 8 chars before base32 decode
pad = (-len(secret)) % 8
key = base64.b32decode(secret + ("=" * pad))
counter = int(time.time()) // 30
mac = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
offset = mac[-1] & 0x0F
code = (struct.unpack(">I", mac[offset:offset+4])[0] & 0x7FFFFFFF) % 1_000_000
print(f"{code:06d}")
PY
}

step() { echo "── $* ──"; }
fail() { echo "✗ $*" >&2; exit 1; }

# ─── 1. password login ────────────────────────────────────────────────────
step "1. password login as $USERNAME"
LOGIN_RESP="$("${CURL[@]}" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(JSON_OBJ username="$USERNAME" password="$PASSWORD")")"
TOKEN="$(printf '%s' "$LOGIN_RESP" | JSON_GET '.accessToken')"
ALREADY_ENROLLED="$(printf '%s' "$LOGIN_RESP" | JSON_GET '.twoFactorRequired' || true)"
if [[ "$ALREADY_ENROLLED" == "true" || "$ALREADY_ENROLLED" == "True" ]]; then
  fail "user is already enrolled; reset 2FA via admin or pick a different test user"
fi
require_value accessToken "$TOKEN" "$LOGIN_RESP"
echo "  ✓ session minted"

REFRESH="$(printf '%s' "$LOGIN_RESP" | JSON_GET '.refreshToken')"

# ─── 2. setup ─────────────────────────────────────────────────────────────
step "2. /auth/2fa/setup"
SETUP="$("${CURL[@]}" -X POST "$BASE/api/auth/2fa/setup" \
  -H "Authorization: Bearer $TOKEN")"
SECRET="$(printf '%s' "$SETUP" | JSON_GET '.provisionalSecret')"
require_value provisionalSecret "$SECRET" "$SETUP"
echo "  ✓ provisional secret received"

# ─── 3+4. compute code, enable ────────────────────────────────────────────
step "3-4. compute TOTP + /auth/2fa/enable"
CODE="$(totp_now "$SECRET")"
ENABLE="$("${CURL[@]}" -X POST "$BASE/api/auth/2fa/enable" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"provisionalSecret\":\"$SECRET\",\"code\":\"$CODE\"}")"
ENROLLED="$(printf '%s' "$ENABLE" | JSON_GET '.enrolled')"
[[ "$ENROLLED" == "true" || "$ENROLLED" == "True" ]] || fail "enable did not return enrolled:true: $ENABLE"
echo "  ✓ enrolled"

# ─── 5. logout ────────────────────────────────────────────────────────────
step "5. logout"
"${CURL[@]}" -X POST "$BASE/api/auth/logout" \
  -H 'Content-Type: application/json' \
  -d "$(JSON_OBJ refreshToken="$REFRESH")" >/dev/null
echo "  ✓ logged out"

# ─── 6. login again, expect challenge ─────────────────────────────────────
step "6. password login again (expect 2FA challenge)"
LOGIN2="$("${CURL[@]}" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(JSON_OBJ username="$USERNAME" password="$PASSWORD")")"
CHALLENGE="$(printf '%s' "$LOGIN2" | JSON_GET '.challengeToken' || true)"
require_value challengeToken "$CHALLENGE" "$LOGIN2"
echo "  ✓ challenge token issued"

# ─── 7+8. verify with fresh TOTP ──────────────────────────────────────────
step "7-8. compute fresh TOTP + /auth/2fa/verify"
CODE2="$(totp_now "$SECRET")"
VERIFY="$("${CURL[@]}" -X POST "$BASE/api/auth/2fa/verify" \
  -H 'Content-Type: application/json' \
  -d "$(JSON_OBJ challengeToken="$CHALLENGE" code="$CODE2")")"
TOKEN2="$(printf '%s' "$VERIFY" | JSON_GET '.accessToken')"
require_value accessToken "$TOKEN2" "$VERIFY"
echo "  ✓ session minted via 2FA"

# ─── 9. /auth/me confirms enrollment ──────────────────────────────────────
step "9. /auth/me reports twoFactorEnrolled=true"
ME="$("${CURL[@]}" "$BASE/api/auth/me" -H "Authorization: Bearer $TOKEN2")"
ENR="$(printf '%s' "$ME" | JSON_GET '.twoFactorEnrolled')"
[[ "$ENR" == "true" || "$ENR" == "True" ]] || fail "twoFactorEnrolled not true on /me: $ME"
echo "  ✓ /me reports twoFactorEnrolled=true"

# ─── 10. self-disable (cleanup) ───────────────────────────────────────────
step "10. /auth/2fa/disable (self) for cleanup"
"${CURL[@]}" -o /dev/null -w "%{http_code}\n" \
  -X POST "$BASE/api/auth/2fa/disable" \
  -H "Authorization: Bearer $TOKEN2" \
  -H 'Content-Type: application/json' \
  -d "$(JSON_OBJ currentPassword="$PASSWORD")" \
  | grep -qx "204" || fail "disable did not return 204"
echo "  ✓ disabled (refresh tokens revoked)"

# ─── 11. confirm plain login is back ──────────────────────────────────────
step "11. plain login again — no challenge"
LOGIN3="$("${CURL[@]}" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "$(JSON_OBJ username="$USERNAME" password="$PASSWORD")")"
TOKEN3="$(printf '%s' "$LOGIN3" | JSON_GET '.accessToken')"
require_value accessToken "$TOKEN3" "$LOGIN3"
echo "  ✓ session minted directly (no 2FA prompt)"

echo
echo "✓ 2FA happy path passed end-to-end."
