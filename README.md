# Complaint Tracking System (CTS)

Enterprise complaint management platform replacing an Excel-based workflow.

- **Frontend:** React 18 + Vite + Tailwind v4 + TypeScript
- **Backend:** NestJS 10 + TypeORM + PostgreSQL
- **Infra:** Docker Compose, NGINX (TLS termination)
- **Auth:** Local (bcrypt) — designed for LDAP/AD swap-in
- **Authorization:** Fully dynamic RBAC, no hardcoded roles or permissions
- **Forms:** Admin-defined complaint fields, no schema redeploys
- **Multi-department:** Users can belong to N departments; supervisors / employees see only their depts (creators always see their filings); managers see everything
- **Branding:** Logo + system name + footer text editable from Admin → Settings, no redeploy

## Repository layout

```
complainmgmt/
├── backend/              NestJS API
├── frontend/             React SPA
├── db/migrations/        Raw SQL migrations (source of truth for schema)
├── nginx/                Reverse proxy + TLS
├── docs/                 Architecture, schema, API, deployment, onboarding
├── skills/               Reusable design patterns ("skill files")
├── tracking/             Epics, tasks, board
└── docker-compose.yml    Full stack
```

## Quick start (development)

```bash
cp .env.example .env
# generate self-signed certs for local HTTPS
./nginx/certs/generate-dev-certs.sh
docker compose up --build
```

- Frontend: `https://localhost:${NGINX_HTTPS_PORT}` (default 443; common dev override 8443)
- API:      `https://localhost:${NGINX_HTTPS_PORT}/api`
- Postgres: `localhost:${POSTGRES_PORT}` (from host, dev only)

Default admin user is created from `INITIAL_ADMIN_USERNAME` / `INITIAL_ADMIN_PASSWORD` in `.env` on first boot. Change the password right after.

### Smoke test

```bash
bash scripts/smoke-test.sh         # exits non-zero if anything is broken
```

Covers: health, login, permission materialisation, dynamic field schema, complaint create/update/audit, attachment upload + MIME sniffing, field locking, dashboard. The script is also a useful reference for the API contracts.

## Recent additions (2026)

The current `main` includes work from the post-handover phase:

- **Editorial visual theme** — Tailwind v4, semantic CSS-variable palette (royal blue primary + slate sidebar), lucide-react icons throughout. To re-skin, edit the `:root` block in `frontend/src/styles.css`.
- **Searchable dynamic fields** — admin can flag any text/number/dropdown field as searchable; the complaints list auto-renders a per-field filter input with URL-roundtripped state.
- **Digit-count validators** — number-typed fields support `{"digits": N}` / `{"minDigits": M, "maxDigits": N}` in their validation block, the natural way to express "exactly 8 digits" without computing numeric bounds.
- **Department-scoped visibility** — `complaint.own:read` restricts list / detail / update to complaints in the caller's active departments OR complaints they created.
- **Multi-department membership** — `user_departments(user_id, department_id, is_active)` join table; users can belong to N depts. Assignment dialog cascades department → assignee (member-only).
- **Admin-managed branding** — single-row `branding_assets` table for the logo, plus `branding.*` keys in `system_settings`. A public `/api/branding` endpoint serves both, used by the login page and app shell.

## Documentation

| File | Purpose |
| --- | --- |
| [docs/01-architecture.md](docs/01-architecture.md) | System architecture & module map |
| [docs/02-database-schema.md](docs/02-database-schema.md) | Full ER model & table definitions (current) |
| [docs/03-api-design.md](docs/03-api-design.md) | REST endpoints & contracts (current) |
| [docs/04-deployment-guide.md](docs/04-deployment-guide.md) | Production deploy + TLS (older — see runbook below for the IP-only path) |
| [docs/05-admin-user-guide.md](docs/05-admin-user-guide.md) | Operating the admin panel (current) |
| [docs/06-developer-onboarding.md](docs/06-developer-onboarding.md) | Local setup, conventions |
| [docs/07-roadmap.md](docs/07-roadmap.md) | Phased delivery plan |
| [docs/08-security-review.md](docs/08-security-review.md) | Security model |
| [docs/10-production-runbook.md](docs/10-production-runbook.md) | Step-by-step IP-only production deploy with self-signed TLS |
| [docs/99-archive-theme-spec-for-lovable.md](docs/99-archive-theme-spec-for-lovable.md) | Archived — pre-port theme handover, kept for history |

## Skill files

Reusable design patterns referenced by modules — see [skills/](skills/).

## Project tracking

See [tracking/](tracking/) for epics, task breakdown, and board state.
