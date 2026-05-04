# 06 — Developer Onboarding

## Prereqs

- Node.js 20 LTS (use `nvm use`).
- Docker 24+ with Compose v2.
- A psql client (optional; for poking at the DB).

## Local setup

```bash
git clone <repo> && cd complainmgmt
cp .env.example .env
./nginx/certs/generate-dev-certs.sh
docker compose up --build
```

Frontend hot-reload and backend hot-reload are configured via the dev compose override (run `docker compose -f docker-compose.yml -f docker-compose.dev.yml up`).

## Repository layout

| Path | What lives here |
|---|---|
| `backend/src/main.ts` | Nest bootstrap |
| `backend/src/app.module.ts` | Root module — registers feature modules |
| `backend/src/config/` | Env-loading + Joi schema |
| `backend/src/common/` | Cross-cutting (filters, guards, decorators, interceptors) |
| `backend/src/database/` | TypeORM datasource, transaction helpers |
| `backend/src/modules/<feature>/` | One folder per feature module: controller, service, dto, entity |
| `frontend/src/pages/` | Top-level routes |
| `frontend/src/components/` | Reusable UI |
| `frontend/src/services/` | API clients (one file per backend module) |
| `frontend/src/hooks/` | Reusable hooks (auth, permissions, fetch wrappers) |
| `db/migrations/` | Numbered SQL files — **the** source of truth for schema |
| `skills/` | Reusable design patterns referenced from code |

## Conventions

- **TypeScript strict** is on; no `any` without an inline justification.
- **Linting:** ESLint + Prettier; CI fails on diffs (`pnpm lint`).
- **Commits:** Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`).
- **Branches:** `feat/<short>`, `fix/<short>`, `chore/<short>`.
- **PRs:** small, single-purpose; checklist asks for migration impact, audit impact, RBAC impact.
- **Tests:** Jest in backend (`*.spec.ts`), Vitest in frontend.

## Adding a backend module

1. `backend/src/modules/<name>/` with at minimum:
   - `<name>.module.ts`
   - `<name>.controller.ts` (if HTTP-facing)
   - `<name>.service.ts`
   - `dto/` for request/response shapes
   - `entities/` for TypeORM entities
2. Register in `app.module.ts`.
3. Add migration under `db/migrations/` if schema changes.
4. Mirror the API surface in `frontend/src/services/<name>.ts`.
5. Update `docs/03-api-design.md`.

## Adding a database column

1. Write a new numbered migration `db/migrations/00NN_<describe>.sql`. **Never** edit a previously-shipped migration.
2. Update the TypeORM entity to match.
3. Update `docs/02-database-schema.md`.
4. If the column is user-data, decide: does it need an audit trail? Does it need a permission?

## How to write a controller (template)

```ts
@Controller('complaints')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  @RequirePermissions('complaint:read')
  list(@Query() q: ListComplaintsDto, @CurrentUser() user: AuthUser) {
    return this.complaints.list(q, user);
  }

  @Patch(':id')
  @RequirePermissions('complaint:update')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateComplaintDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.complaints.update(id, body, user);
  }
}
```

Per-field write checks happen **inside** the service after consulting the dynamic field schema, not at the route level.

## How to write a service that mutates

```ts
async update(id: number, body: UpdateComplaintDto, actor: AuthUser) {
  return this.tx.run(async (em) => {
    const complaint = await em.getRepository(Complaint).findOneOrFail({ where: { id } });
    const fields    = await this.dynamicFields.activeMap(em);
    const before    = await em.getRepository(ComplaintFieldValue).findBy({ complaintId: id });

    const changes = this.diff(before, body, fields, actor);
    this.locking.assertWritable(changes, before, actor);
    await em.getRepository(ComplaintFieldValue).save(changes.toUpsert);
    await this.audit.recordChanges(em, complaint, changes, actor);
    return this.toDto(complaint, fields, em);
  });
}
```

Three rules every mutating service follows:

1. **Single transaction** spanning all related writes.
2. **Audit before commit** (inside the same transaction).
3. **Permission resolution** sits in dedicated services, never inline `if (user.role === 'admin')` checks.

## Useful npm scripts

```bash
# from backend/
pnpm dev          # nest start --watch
pnpm test         # unit tests
pnpm test:e2e     # spins a test DB, runs migrations, hits HTTP
pnpm lint
pnpm typecheck

# from frontend/
pnpm dev
pnpm test
pnpm build
```

## Debugging tips

- Backend logs are JSON; pipe through `| pino-pretty` locally.
- The request id is in every log line and in the `x-request-id` response header — use it to correlate UI errors to backend logs.
- `psql $DATABASE_URL` from inside the `db` container: `docker compose exec db psql -U $POSTGRES_USER -d $POSTGRES_DB`.

## Where to look first

| Question | Look at |
|---|---|
| "How does login work?" | `skills/authentication.skill.md`, `modules/auth/` |
| "How do permissions resolve?" | `skills/rbac.skill.md`, `common/guards/permissions.guard.ts` |
| "Why is this field locked?" | `skills/field-locking.skill.md`, `modules/complaints/locking.service.ts` |
| "How is audit captured?" | `skills/audit.skill.md`, `modules/audit/` |
| "How do attachments work?" | `skills/file-upload.skill.md`, `modules/attachments/` |
