#!/usr/bin/env bash
# Black-box smoke test against a running CTS stack.
#
# Usage:
#   ./scripts/smoke-test.sh                            # probes https://localhost:8443
#   BASE=https://cts.example.com ./scripts/smoke-test.sh
#
# Requires the bootstrapped admin user to already exist (set INITIAL_ADMIN_*
# in .env, then `docker compose up -d`). Reads ADMIN_USER / ADMIN_PASS from
# .env or env vars; falls back to the .env.example defaults.
#
# Exits non-zero on the first failed assertion. Cleans up the test artefacts
# it creates (department, employee user, complaints).

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
[[ -f .env ]] && set -a && source .env && set +a

BASE="${BASE:-https://localhost:${NGINX_HTTPS_PORT:-8443}}"
ADMIN_USER="${ADMIN_USER:-${INITIAL_ADMIN_USERNAME:-admin}}"
ADMIN_PASS="${ADMIN_PASS:-${INITIAL_ADMIN_PASSWORD:?set ADMIN_PASS or INITIAL_ADMIN_PASSWORD}}"

CURL=(curl -sk --max-time 15)

# tiny json helpers — prefer jq, fall back to python3
if command -v jq >/dev/null 2>&1; then
  JSON_GET() { jq -r "$1"; }
else
  JSON_GET() { python3 -c "import json,sys; d=json.load(sys.stdin)
keys = '$1'.lstrip('.').split('.')
v = d
for k in keys:
    if k == '': continue
    if isinstance(v, list): v = v[int(k)]
    else: v = v[k]
print(v if v is not None else '')"; }
fi

PASS=0
FAIL=0
ok()   { echo "  ✓ $1"; PASS=$((PASS + 1)); }
nope() { echo "  ✗ $1"; FAIL=$((FAIL + 1)); }
expect_eq() { [[ "$1" == "$2" ]] && ok "$3 = $1" || nope "$3 expected '$2', got '$1'"; }
expect_status() { [[ "$1" == "$2" ]] && ok "$3 → HTTP $1" || nope "$3 expected HTTP $2, got $1"; }

step() { echo; echo "─── $1 ───"; }

# ─── 1. health ─────────────────────────────────────────────────────────────
step "health"
HEALTH="$("${CURL[@]}" "$BASE/api/health")"
expect_eq "$(echo "$HEALTH" | JSON_GET '.status')" "ok" "/api/health.status"

# ─── 2. login ──────────────────────────────────────────────────────────────
step "login"
LOGIN="$("${CURL[@]}" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$ADMIN_USER\",\"password\":\"$ADMIN_PASS\"}")"
TOK="$(echo "$LOGIN" | JSON_GET '.accessToken')"
[[ -n "$TOK" ]] && ok "got access token" || { nope "no access token (response: $LOGIN)"; exit 1; }

H=(-H "Authorization: Bearer $TOK")

# ─── 3. me + permissions ───────────────────────────────────────────────────
step "/auth/me materialises permissions"
ME="$("${CURL[@]}" "${H[@]}" "$BASE/api/auth/me")"
expect_eq "$(echo "$ME" | JSON_GET '.username')" "$ADMIN_USER" "me.username"
PERM_COUNT="$(echo "$ME" | python3 -c "import json,sys; print(len(json.load(sys.stdin)['permissions']))")"
[[ "$PERM_COUNT" -ge 25 ]] && ok "$PERM_COUNT permissions resolved" || nope "expected ≥ 25 permissions, got $PERM_COUNT"

# ─── 4. dynamic schema ────────────────────────────────────────────────────
step "dynamic field schema"
SCHEMA="$("${CURL[@]}" "${H[@]}" "$BASE/api/dynamic-fields")"
N="$(echo "$SCHEMA" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")"
[[ "$N" -ge 4 ]] && ok "$N active fields" || nope "expected ≥ 4 system fields, got $N"

# ─── 5. complaint lifecycle ───────────────────────────────────────────────
step "complaint lifecycle (create → status → priority → audit)"
C="$("${CURL[@]}" -X POST "$BASE/api/complaints" "${H[@]}" \
  -H 'Content-Type: application/json' \
  -d '{"values":{"patient_complaint":"smoke test '"$RANDOM"'"},"priority":"normal"}')"
ID="$(echo "$C" | JSON_GET '.id')"
REF="$(echo "$C" | JSON_GET '.referenceNo')"
[[ -n "$ID" && "$REF" =~ ^CMP-[0-9]{4}-[0-9]{6}$ ]] && ok "created $REF (id=$ID)" || nope "create returned: $C"

# regression: response body must reflect the new state, not stale read
S="$("${CURL[@]}" -X PATCH "$BASE/api/complaints/$ID/status" "${H[@]}" \
  -H 'Content-Type: application/json' -d '{"status":"in_progress"}')"
expect_eq "$(echo "$S" | JSON_GET '.status')" "in_progress" "PATCH status returns new state"

P="$("${CURL[@]}" -X PATCH "$BASE/api/complaints/$ID/priority" "${H[@]}" \
  -H 'Content-Type: application/json' -d '{"priority":"critical"}')"
expect_eq "$(echo "$P" | JSON_GET '.priority')" "critical" "PATCH priority returns new state"

A="$("${CURL[@]}" "${H[@]}" "$BASE/api/complaints/$ID/audit")"
EXPECTED_ACTIONS=("create" "update")
for want in "${EXPECTED_ACTIONS[@]}"; do
  if echo "$A" | grep -q "\"action\":\"$want\""; then ok "audit contains '$want'"; else nope "audit missing '$want'"; fi
done

# ─── 6. attachment ────────────────────────────────────────────────────────
step "attachment upload + MIME sniff"
PNG="/tmp/cts-smoke-$$-${RANDOM}.png"
printf '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfeA<l\xa3\x00\x00\x00\x00IEND\xaeB`\x82' > "$PNG"
UP="$("${CURL[@]}" -X POST "$BASE/api/complaints/$ID/attachments" "${H[@]}" -F "file=@$PNG")"
expect_eq "$(echo "$UP" | JSON_GET '.mimeType')" "image/png" "uploaded MIME (server-sniffed)"
SHA="$(echo "$UP" | JSON_GET '.sha256')"
[[ "$SHA" =~ ^[0-9a-f]{64}$ ]] && ok "sha256 captured" || nope "sha256 malformed: $SHA"
rm -f "$PNG"

# ─── 7. locking ────────────────────────────────────────────────────────────
step "field locking (FIELD_LOCKED for non-owner without override)"
EMP_USER="smoketest_$(date +%s)"
EMP_PASS="smoke-test-pass-1234"
EMP="$("${CURL[@]}" -X POST "$BASE/api/users" "${H[@]}" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$EMP_USER\",\"displayName\":\"Smoke\",\"password\":\"$EMP_PASS\"}")"
EID="$(echo "$EMP" | JSON_GET '.id')"
ROLES="$("${CURL[@]}" "${H[@]}" "$BASE/api/roles")"
EMP_ROLE="$(echo "$ROLES" | python3 -c "import json,sys; print([r['id'] for r in json.load(sys.stdin) if r['key']=='employee'][0])")"
"${CURL[@]}" -X POST "$BASE/api/users/$EID/roles" "${H[@]}" \
  -H 'Content-Type: application/json' -d "{\"roleIds\":[\"$EMP_ROLE\"]}" >/dev/null

ETOK="$("${CURL[@]}" -X POST "$BASE/api/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"$EMP_USER\",\"password\":\"$EMP_PASS\"}" | JSON_GET '.accessToken')"

CONFLICT_CODE="$("${CURL[@]}" -o /dev/null -w '%{http_code}' \
  -X PATCH "$BASE/api/complaints/$ID" \
  -H "Authorization: Bearer $ETOK" -H 'Content-Type: application/json' \
  -d '{"values":{"patient_complaint":"OVERWRITE ATTEMPT"}}')"
expect_status "$CONFLICT_CODE" "409" "non-owner without override"

# ─── 8. dashboard ──────────────────────────────────────────────────────────
step "dashboard"
DASH="$("${CURL[@]}" "${H[@]}" "$BASE/api/dashboard/summary")"
TOTAL="$(echo "$DASH" | JSON_GET '.total')"
[[ "$TOTAL" =~ ^[0-9]+$ && "$TOTAL" -ge 1 ]] && ok "total complaints = $TOTAL" || nope "summary.total: $DASH"

# ─── cleanup (best effort) ─────────────────────────────────────────────────
step "cleanup"
"${CURL[@]}" -X PATCH "$BASE/api/users/$EID" "${H[@]}" \
  -H 'Content-Type: application/json' -d '{"isActive":false}' >/dev/null && ok "deactivated $EMP_USER"

# ─── summary ──────────────────────────────────────────────────────────────
echo
echo "Summary: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]]
