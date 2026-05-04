# Complaint Tracking System (CTS)

Enterprise complaint management platform replacing an Excel-based workflow.

- **Frontend:** React 18 + Vite + TypeScript
- **Backend:** NestJS 10 + TypeORM + PostgreSQL
- **Infra:** Docker Compose, NGINX (TLS termination)
- **Auth:** Local (bcrypt) — designed for LDAP/AD swap-in
- **Authorization:** Fully dynamic RBAC, no hardcoded roles or permissions
- **Forms:** Admin-defined complaint fields, no schema redeploys

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

- Frontend: https://localhost
- API:      https://localhost/api
- Postgres: localhost:5432 (from host, dev only)

## Documentation

| File | Purpose |
| --- | --- |
| [docs/01-architecture.md](docs/01-architecture.md) | System architecture & module map |
| [docs/02-database-schema.md](docs/02-database-schema.md) | Full ER model & table definitions |
| [docs/03-api-design.md](docs/03-api-design.md) | REST endpoints & contracts |
| [docs/04-deployment-guide.md](docs/04-deployment-guide.md) | Production deploy + TLS |
| [docs/05-admin-user-guide.md](docs/05-admin-user-guide.md) | Operating the admin panel |
| [docs/06-developer-onboarding.md](docs/06-developer-onboarding.md) | Local setup, conventions |
| [docs/07-roadmap.md](docs/07-roadmap.md) | Phased delivery plan |

## Skill files

Reusable design patterns referenced by modules — see [skills/](skills/).

## Project tracking

See [tracking/](tracking/) for epics, task breakdown, and board state.
