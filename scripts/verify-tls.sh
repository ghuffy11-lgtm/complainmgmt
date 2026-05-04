#!/usr/bin/env bash
# Probe a CTS deployment over HTTPS and report on the TLS posture.
#
# Usage:
#   ./scripts/verify-tls.sh                    # probes https://localhost
#   ./scripts/verify-tls.sh cts.example.com    # probes a real host
#
# Exits non-zero if /api/health returns anything other than {"status":"ok"}.

set -uo pipefail
HOST="${1:-localhost}"
PORT="${2:-443}"

echo "→ probing https://$HOST:$PORT/api/health"
body="$(curl -sk --max-time 10 "https://$HOST:$PORT/api/health" || true)"
if [[ "$body" != *'"status":"ok"'* ]]; then
  echo "✗ /api/health did not return ok — got: $body"
  exit 1
fi
echo "✓ /api/health = ok"

echo "→ certificate"
echo | openssl s_client -connect "$HOST:$PORT" -servername "$HOST" 2>/dev/null \
  | openssl x509 -noout -subject -issuer -startdate -enddate -fingerprint || {
  echo "✗ could not read certificate"; exit 1;
}

echo "→ headers"
hdrs="$(curl -sIk --max-time 10 "https://$HOST:$PORT/")"
for h in 'X-Frame-Options' 'X-Content-Type-Options' 'Referrer-Policy'; do
  if grep -iq "^$h:" <<<"$hdrs"; then
    echo "✓ $h present"
  else
    echo "⚠ $h missing"
  fi
done
if grep -iq '^Strict-Transport-Security:' <<<"$hdrs"; then
  echo "✓ HSTS present"
else
  echo "⚠ HSTS not set (uncomment in nginx/conf.d/default.conf once cert is real)"
fi

echo "→ TLS protocol versions"
for v in tls1 tls1_1 tls1_2 tls1_3; do
  if echo | openssl s_client -"$v" -connect "$HOST:$PORT" -servername "$HOST" 2>&1 \
     | grep -q 'Cipher is' ; then
    case "$v" in
      tls1|tls1_1) echo "⚠ $v negotiated — this is deprecated; check ssl_protocols" ;;
      *)           echo "✓ $v negotiated" ;;
    esac
  else
    echo "  $v rejected"
  fi
done
