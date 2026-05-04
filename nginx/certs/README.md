# TLS certificates

NGINX expects two files in this directory at runtime:

- `fullchain.pem` — server cert + intermediate chain
- `privkey.pem`   — private key

## Development

```bash
./generate-dev-certs.sh
```

Self-signed cert for `localhost`. Browsers will warn — that's expected.

## Production

Use Let's Encrypt (certbot) or your CA of choice and place the resulting files
here with mode `0600` for the key. See `docs/04-deployment-guide.md` for the
certbot flow and the renewal hook.

The contents of this directory (other than `generate-dev-certs.sh` and this
README) are git-ignored.
