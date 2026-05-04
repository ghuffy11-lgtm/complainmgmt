#!/usr/bin/env bash
# Generate a self-signed certificate for local HTTPS development.
# DO NOT use the output for production — see docs/04-deployment-guide.md.

set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CN="${CN:-localhost}"

if [[ -f "$DIR/fullchain.pem" && -f "$DIR/privkey.pem" ]]; then
  echo "Certs already exist in $DIR — delete them first if you want to regenerate." >&2
  exit 0
fi

openssl req -x509 -nodes -newkey rsa:2048 \
  -keyout "$DIR/privkey.pem" \
  -out    "$DIR/fullchain.pem" \
  -days 365 \
  -subj "/CN=$CN" \
  -addext "subjectAltName=DNS:$CN,DNS:localhost,IP:127.0.0.1"

chmod 600 "$DIR/privkey.pem"
echo "Generated $DIR/fullchain.pem and $DIR/privkey.pem (CN=$CN, 365 days)"
echo "Browsers will warn about the self-signed cert. That's expected for local dev."
