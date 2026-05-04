# 08 — Security review (OWASP Top 10 — 2021 mapping)

This is the operator-facing review of how the codebase addresses each OWASP
top-10 category. It's living documentation; update on every release.

> Status legend:
> ✅ controls in place ·  🟡 partial ·  🟥 gap

## A01 — Broken Access Control ✅

- Every authenticated route is wrapped by `JwtAuthGuard` (registered as
  `APP_GUARD`). `@Public()` is opt-in for `/auth/login`, `/auth/refresh`,
  `/auth/logout`, `/health`.
- `PermissionsGuard` (also `APP_GUARD`) reads `@RequirePermissions` /
  `@RequireAnyPermission` metadata. Wildcards are honoured by the resolver
  (`complaint.field:*:write`).
- **Per-field write checks live in the service**, not the route, so dynamic
  field keys are honoured (admin can add fields without code changes).
- **Locking** prevents non-owners from overwriting designated fields without
  an explicit override permission; overrides emit a distinct
  `lock_override` audit row.
- IDOR mitigation: complaint ids are validated; per-field permission checks
  ensure that even with a known id, an unprivileged user can't modify
  individual fields.
- Test coverage: `local-auth.provider.spec.ts`, `permissions.guard.spec.ts`,
  `locking.service.spec.ts`, plus e2e flow `complaint-flow.e2e-spec.ts`.

**Residual risks:** ownership-scoped permissions (e.g. "employee can update
their *own* complaints only") are enforced in the service via explicit
`if (created_by !== actor.id)` checks. Adding a new such constraint requires
discipline; document each in the relevant skill file.

## A02 — Cryptographic Failures ✅

- Passwords: `bcrypt` with configurable rounds (default 12). Never logged,
  never returned over the API.
- Refresh tokens: 384-bit (`crypto.randomBytes(48).base64url`); only the
  SHA-256 hash is persisted (`auth_refresh_tokens.token_hash`).
- JWT secret loaded from env, validated to be ≥32 chars by Joi schema.
- TLS terminated at NGINX with TLS 1.2/1.3 only; the dev cert is self-signed
  (clearly flagged), production guidance points to certbot.
- Attachment SHA-256 stored alongside bytes for integrity (`bytea` column,
  32-byte CHECK).

**Residual risks:** the JWT secret rotates per redeploy and isn't escrowed.
Plan: move to a managed secrets store (Vault / AWS SM) post-1.0.

## A03 — Injection ✅

- All DB access goes through TypeORM with parameterised queries; raw SQL is
  used only in two places (`PermissionsService.materialize`,
  `ReferenceNumberService.next`) and both bind via `$1`/`$2` placeholders.
- Inputs validated by `class-validator` DTOs at the controller boundary;
  unknown keys are rejected (`forbidNonWhitelisted: true`).
- Dynamic field values go through `validateValues()` which coerces by type
  before persistence (text/number/date/dropdown); whitelisted-key check
  prevents schema-skew injection.
- Filename sanitization strips path components and control chars; MIME is
  sniffed server-side (client `Content-Type` is ignored).
- No template engines; no shell-outs from request handlers; no `eval`.

## A04 — Insecure Design 🟡

- Threat model is documented through skill files (`field-locking`,
  `audit`, `rbac`, `file-upload`).
- Audit log is **append-only** at two layers: triggers (`0005`) raise on
  UPDATE/DELETE, and migration `0009` revokes those privileges from PUBLIC.
- Account lockout after N failed logins (configurable; default 5/15 min).
- Constant-time path on the username-not-found branch defeats trivial
  enumeration.
- **Known design gap:** logging is structured (`pino`) but not centralized
  yet (e.g. Loki / OpenSearch). Operators must ship logs themselves.

## A05 — Security Misconfiguration 🟡

- `helmet` enabled globally on the backend.
- NGINX sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
  Permissions-Policy. **HSTS commented out** until a real cert is in place
  — uncomment after the first successful certbot deploy (preflight script
  warns when this is still off).
- `scripts/preflight.sh` checks: env present, JWT_SECRET strength,
  POSTGRES_PASSWORD non-default, db port not exposed, certs not self-signed,
  HSTS enabled.
- `synchronize: false` on TypeORM — schema is owned by SQL migrations.
- Stack traces and detailed error fields are stripped from non-development
  responses by `HttpExceptionFilter`.

**Residual:** Container images aren't pinned to digests (only tags). A
build pipeline that emits a digest manifest is the next hardening step.

## A06 — Vulnerable and Outdated Components 🟡

- Dependencies are pinned to caret ranges in `package.json`. CI is the
  enforcement point — see `.github/workflows/ci.yml`.
- `npm audit` should run pre-merge; gating to be added once the project
  has a real lockfile (the scaffold doesn't commit one yet — add
  `package-lock.json` as part of first real install).
- Postgres image pinned to `postgres:16-alpine`; consider digest pinning
  in production.

## A07 — Identification and Authentication Failures ✅

- Refresh token rotation with replay detection (re-using a rotated token
  fails with `INVALID_REFRESH_TOKEN`).
- Force-logout on:
  - admin password reset (`UsersService.resetPassword`),
  - user-initiated change-password (`AuthService.changePassword`),
  - role change (`UsersService.setRoles`),
  - account deactivation.
- Per-IP rate limit (Nest throttler 5/min/IP on login + NGINX limit zone).
- Per-user lockout after configurable failed attempts.
- JWT TTL short (default 15 min); refresh TTL long but revocable.

**Residual:** no MFA. If required, the `IAuthProvider` abstraction makes it
the natural addition — a wrapping provider could enforce TOTP after
`LocalAuthProvider` succeeds.

## A08 — Software and Data Integrity Failures ✅

- Attachments: SHA-256 captured at upload, returned as ETag on download.
- Audit log is append-only (triggers + privileges).
- All complaint mutations are atomic transactions including the audit row;
  no path produces a state change without a corresponding audit entry.
- DB schema is the source of truth (numbered migrations); no autosync.

## A09 — Security Logging and Monitoring Failures 🟡

- Pino structured logs include the request-id (`x-request-id` header).
- Audit log captures every mutation with old/new value + actor.
- Healthcheck endpoint at `/api/health`; docker-compose healthchecks wired
  for `db`, `backend`, and `nginx`.

**Residual:** no log shipping by default; no metrics endpoint
(`/metrics`). For 1.0+: emit Prometheus metrics from Nest + an OTel
exporter.

## A10 — Server-Side Request Forgery ✅

- The application performs no outbound HTTP requests today (no webhook
  delivery, no URL fetches from user data). When `INotificationTransport`
  gains an HTTP variant, route it through an allow-listed sender service.

---

## Test coverage anchoring this review

| Area | Tests |
|---|---|
| RBAC resolution + guards | `permission-resolver.spec.ts`, `permissions.guard.spec.ts`, `permissions.service.spec.ts` |
| Auth (provider, lockout, rotation, change-pw) | `local-auth.provider.spec.ts`, `auth-provider.registry.spec.ts`, `refresh-token.service.spec.ts`, `auth.service.spec.ts`, `auth.e2e-spec.ts` |
| Locking + override | `locking.service.spec.ts`, `complaint-flow.e2e-spec.ts` |
| Field validation | `validate-values.spec.ts` |
| File upload | `file-validation.spec.ts` |
| Frontend permission mirror | `permissions.test.ts` |
| Reference number generator | `format-reference.spec.ts` |

## Pre-deploy checklist

- [ ] `./scripts/preflight.sh` exits 0
- [ ] `./scripts/verify-tls.sh <host>` passes
- [ ] All unit + e2e tests green in CI
- [ ] Latest k6 load run within thresholds
- [ ] Backup verified by restore drill within last 30 days
- [ ] HSTS header active in `nginx/conf.d/default.conf`
