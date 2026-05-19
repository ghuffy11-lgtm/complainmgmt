# Sub-categories & Origin of Complaint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two classification axes to complaints — per-department
*sub-categories* (admin-managed, cascade off Department) and an
admin-managed *Origin of Complaint* list (seeded with Social media /
Verbal / Suggestion box) — including create-form fields, detail-page
display + edit, list-page filters, a clickable dashboard breakdown,
and admin pages for both new lists.

**Architecture:** Two new dedicated tables (`department_subcategories`,
`complaint_origins`) mirroring the existing `departments` table
pattern. Two nullable FK columns on `complaints` (`subcategory_id`,
`origin_id`); required-ness enforced at the API layer. Two new Nest
modules. Two new React admin pages. Detail page and create form gain
cascading inputs. List page gains two new filters and URL params.
Dashboard gains a `/dashboard/by-origin` endpoint and a clickable
card row.

**Tech Stack:** NestJS + TypeORM + Postgres on the backend;
React + TanStack Query + react-router on the frontend.
class-validator for DTO validation. Vitest/Jest for unit + integration
tests. Playwright for the E2E happy path.

**Spec:** `docs/superpowers/specs/2026-05-19-subcategory-and-origin-design.md`

**Operator constraint:** Dev-only deployment until operator signs off.
**Do not** push to `cts.hadiclinic.com.kw` from any task in this plan.

---

## File Structure

### Created files (backend)

```
db/migrations/0031_department_subcategories.sql
db/migrations/0032_complaint_origins.sql

backend/src/modules/subcategories/
  entities/subcategory.entity.ts
  subcategories.controller.ts
  subcategories.service.ts
  subcategories.service.spec.ts
  subcategories.module.ts

backend/src/modules/origins/
  entities/origin.entity.ts
  origins.controller.ts
  origins.service.ts
  origins.service.spec.ts
  origins.module.ts
```

### Modified files (backend)

```
backend/src/app.module.ts
  → import SubcategoriesModule, OriginsModule
backend/src/modules/complaints/entities/complaint.entity.ts
  → add `subcategoryId`, `originId` columns
backend/src/modules/complaints/dto/complaint.dto.ts
  → add `subcategoryId` (create+update), `originId` (create+update)
backend/src/modules/complaints/complaints.service.ts
  → validate + persist new fields, audit changes
backend/src/modules/complaints/complaints.module.ts
  → register Subcategory + Origin entities for the validation queries
backend/src/modules/assignments/assignments.service.ts
  → clear `subcategory_id` when dept changes and old subcat no longer matches
backend/src/modules/dashboard/dashboard.controller.ts
  → add `GET /dashboard/by-origin`
backend/test/complaint-flow.e2e-spec.ts
  → E2E happy path covering subcat + origin
```

### Created files (frontend)

```
frontend/src/services/subcategories.service.ts
frontend/src/services/origins.service.ts
frontend/src/pages/admin/AdminSubcategoriesPage.tsx
frontend/src/pages/admin/AdminOriginsPage.tsx
```

### Modified files (frontend)

```
frontend/src/types/api.ts
  → add Subcategory, Origin, complaint detail fields
frontend/src/App.tsx
  → register two new admin routes
frontend/src/pages/admin/AdminShell.tsx
  → add nav links for Sub-categories + Origins
frontend/src/services/complaints.service.ts
  → add subcategoryId + originId to create + update payloads, accept on list filter
frontend/src/services/dashboard.service.ts
  → add byOrigin()
frontend/src/pages/ComplaintCreatePage.tsx
  → cascading sub-category + origin fields
frontend/src/pages/ComplaintDetailPage.tsx
  → display + inline edit + print of sub-category and origin
frontend/src/pages/ComplaintsListPage.tsx
  → origin + subcategory filters + URL params
frontend/src/pages/DashboardPage.tsx
  → origin breakdown card row
docs/02-database-schema.md
docs/03-api-design.md
docs/05-admin-user-guide.md
```

---

## Spec deviations (deliberate)

The spec hand-waved the dashboard payload as *"`GET /api/dashboard`
grows an `originBreakdown` array"*. The actual dashboard module uses
**separate `by-*` endpoints** (`/dashboard/by-status`,
`/dashboard/by-priority`, etc.) — there is no consolidated
`/dashboard` endpoint to grow. This plan therefore adds
`GET /api/dashboard/by-origin` and a corresponding
`DashboardService.byOrigin()` on the frontend, matching the existing
pattern. Same payload shape, same scope rules. Update §4.4 of the
spec when convenient.

---

## Sequencing notes

Tasks are ordered so the codebase is **always green** after each
commit:

1. Migrations first (the entity columns in later tasks must back real
   DB columns).
2. New CRUD modules (sub-categories, origins) shipped before the
   complaint changes that depend on them.
3. Complaint DTO + service + assignments wiring.
4. Dashboard endpoint.
5. Frontend types + services.
6. Admin pages (so the operator can seed data while waiting for the
   rest).
7. Create-form changes.
8. Detail-page changes.
9. List-page filters.
10. Dashboard card row.
11. E2E happy path.
12. Docs.

---

### Task 1: Migration 0031 — department_subcategories table + complaints.subcategory_id

**Files:**
- Create: `db/migrations/0031_department_subcategories.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0031 — Per-department sub-categories. Selected on complaint create
-- when the chosen department has ≥1 active sub-category.

INSERT INTO schema_migrations (filename) VALUES ('0031_department_subcategories.sql');

CREATE TABLE department_subcategories (
  id            BIGSERIAL PRIMARY KEY,
  department_id BIGINT      NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  key           TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, key)
);
CREATE INDEX idx_subcat_dept ON department_subcategories(department_id);
CREATE TRIGGER trg_subcat_updated_at
  BEFORE UPDATE ON department_subcategories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE complaints
  ADD COLUMN subcategory_id BIGINT REFERENCES department_subcategories(id);
CREATE INDEX idx_complaints_subcat ON complaints(subcategory_id);
```

- [ ] **Step 2: Run the migration against the dev DB**

Run from repo root:
```bash
docker compose up -d db
docker compose exec -T db psql -U cts -d cts -f /docker-entrypoint-initdb.d/migrations/0031_department_subcategories.sql 2>/dev/null \
  || docker compose run --rm migrate
```

The repo has a `migrate` service in `docker-compose.yml` that applies
every pending file in `db/migrations/`. Use that if the inline psql
form does not work in this environment.

Expected: psql exits 0; `\d complaints` in psql shows the new
`subcategory_id` column; `\d department_subcategories` shows the new
table.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0031_department_subcategories.sql
git commit -m "feat(db): per-department sub-categories table + complaints.subcategory_id"
```

---

### Task 2: Migration 0032 — complaint_origins table + seed + complaints.origin_id

**Files:**
- Create: `db/migrations/0032_complaint_origins.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 0032 — Complaint origins (channel the complaint arrived through).
-- Flat list, admin-managed. Seeded with the three operator-requested
-- starters; admin may add more via the new admin page.

INSERT INTO schema_migrations (filename) VALUES ('0032_complaint_origins.sql');

CREATE TABLE complaint_origins (
  id          BIGSERIAL PRIMARY KEY,
  key         TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_origins_updated_at
  BEFORE UPDATE ON complaint_origins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO complaint_origins (key, name, sort_order) VALUES
  ('social_media',   'Social media',   10),
  ('verbal',         'Verbal',         20),
  ('suggestion_box', 'Suggestion box', 30);

ALTER TABLE complaints
  ADD COLUMN origin_id BIGINT REFERENCES complaint_origins(id);
CREATE INDEX idx_complaints_origin ON complaints(origin_id);
```

- [ ] **Step 2: Apply against dev DB**

Same command as Task 1 step 2.

Expected: psql exits 0; `SELECT key, name, sort_order FROM complaint_origins ORDER BY sort_order` returns 3 rows; `\d complaints` shows the new `origin_id` column.

- [ ] **Step 3: Commit**

```bash
git add db/migrations/0032_complaint_origins.sql
git commit -m "feat(db): complaint origins table seeded with the 3 standard channels + complaints.origin_id"
```

---

### Task 3: Subcategory TypeORM entity

**Files:**
- Create: `backend/src/modules/subcategories/entities/subcategory.entity.ts`

- [ ] **Step 1: Write the entity**

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'department_subcategories' })
export class SubcategoryEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ name: 'department_id', type: 'bigint' })
  departmentId!: string;

  @Column({ type: 'text' })
  key!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/subcategories/entities/subcategory.entity.ts
git commit -m "feat(api): subcategory entity"
```

---

### Task 4: Subcategory service (failing tests first)

**Files:**
- Create: `backend/src/modules/subcategories/subcategories.service.spec.ts`
- Create: `backend/src/modules/subcategories/subcategories.service.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// subcategories.service.spec.ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SubcategoriesService } from './subcategories.service';
import { SubcategoryEntity } from './entities/subcategory.entity';

function repoMock(): jest.Mocked<Repository<SubcategoryEntity>> {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
    create: jest.fn((x: unknown) => x),
  } as unknown as jest.Mocked<Repository<SubcategoryEntity>>;
}

describe('SubcategoriesService', () => {
  test('list returns rows ordered by name for the given department', async () => {
    const repo = repoMock();
    repo.find.mockResolvedValue([]);
    const svc = new SubcategoriesService(repo);
    await svc.listForDepartment('7');
    expect(repo.find).toHaveBeenCalledWith({
      where: { departmentId: '7' },
      order: { name: 'ASC' },
    });
  });

  test('create rejects duplicate (departmentId, key)', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue({ id: '99' } as SubcategoryEntity);
    const svc = new SubcategoriesService(repo);
    await expect(
      svc.create('7', { key: 'network', name: 'Network' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  test('create saves with departmentId attached', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue(null);
    const svc = new SubcategoriesService(repo);
    await svc.create('7', { key: 'network', name: 'Network' });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ departmentId: '7', key: 'network', name: 'Network' }),
    );
  });

  test('update throws SUBCATEGORY_NOT_FOUND for unknown id', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue(null);
    const svc = new SubcategoriesService(repo);
    await expect(svc.update('123', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  test('listAll filters by active flag when requested', async () => {
    const repo = repoMock();
    repo.find.mockResolvedValue([]);
    const svc = new SubcategoriesService(repo);
    await svc.listAll({ active: true });
    expect(repo.find).toHaveBeenCalledWith({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && npx jest subcategories.service.spec
```

Expected: FAIL — `Cannot find module './subcategories.service'`.

- [ ] **Step 3: Write the implementation**

```ts
// subcategories.service.ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubcategoryEntity } from './entities/subcategory.entity';

@Injectable()
export class SubcategoriesService {
  constructor(
    @InjectRepository(SubcategoryEntity)
    private readonly repo: Repository<SubcategoryEntity>,
  ) {}

  listForDepartment(departmentId: string) {
    return this.repo.find({
      where: { departmentId },
      order: { name: 'ASC' },
    });
  }

  listAll(opts: { active?: boolean } = {}) {
    const where = opts.active === undefined ? {} : { isActive: opts.active };
    return this.repo.find({ where, order: { name: 'ASC' } });
  }

  async create(
    departmentId: string,
    input: { key: string; name: string },
  ): Promise<SubcategoryEntity> {
    const existing = await this.repo.findOne({
      where: { departmentId, key: input.key },
    });
    if (existing) {
      throw new ConflictException({ code: 'SUBCATEGORY_KEY_TAKEN' });
    }
    return this.repo.save(this.repo.create({ departmentId, ...input }));
  }

  async update(
    id: string,
    patch: Partial<Pick<SubcategoryEntity, 'name' | 'isActive'>>,
  ): Promise<SubcategoryEntity> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'SUBCATEGORY_NOT_FOUND' });
    Object.assign(row, patch);
    return this.repo.save(row);
  }

  /** Used by the complaint validation path to confirm a chosen subcat
   *  exists, belongs to the requested department, and is active. */
  async findActiveForDepartment(
    id: string,
    departmentId: string,
  ): Promise<SubcategoryEntity | null> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row || !row.isActive || row.departmentId !== departmentId) return null;
    return row;
  }

  /** Used by validation to decide if subcat is required for a dept. */
  async hasActive(departmentId: string): Promise<boolean> {
    const n = await this.repo.count({
      where: { departmentId, isActive: true },
    });
    return n > 0;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd backend && npx jest subcategories.service.spec
```

Expected: PASS, 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/subcategories/subcategories.service.ts \
        backend/src/modules/subcategories/subcategories.service.spec.ts
git commit -m "feat(api): subcategories service with key-uniqueness + active lookup"
```

---

### Task 5: Subcategory controller

**Files:**
- Create: `backend/src/modules/subcategories/subcategories.controller.ts`

- [ ] **Step 1: Write the controller**

```ts
import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { SubcategoriesService } from './subcategories.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

class CreateSubcategoryDto {
  @IsString() @MinLength(2) @MaxLength(60) @Matches(/^[a-z][a-z0-9_]*$/) key!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
}

class UpdateSubcategoryDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

@Controller()
export class SubcategoriesController {
  constructor(private readonly svc: SubcategoriesService) {}

  // Nested under departments for list/create — clear parent-child URL shape.
  @Get('departments/:id/subcategories')
  list(@Param('id') id: string) {
    return this.svc.listForDepartment(id);
  }

  @Post('departments/:id/subcategories')
  @RequirePermissions('admin.departments:manage')
  create(@Param('id') id: string, @Body() dto: CreateSubcategoryDto) {
    return this.svc.create(id, dto);
  }

  // Flat list endpoint for the filter dropdown.
  @Get('subcategories')
  flat(@Query('departmentId') departmentId?: string, @Query('active') active?: string) {
    if (departmentId) return this.svc.listForDepartment(departmentId);
    return this.svc.listAll({
      active: active === 'true' ? true : active === 'false' ? false : undefined,
    });
  }

  @Patch('subcategories/:id')
  @RequirePermissions('admin.departments:manage')
  update(@Param('id') id: string, @Body() dto: UpdateSubcategoryDto) {
    return this.svc.update(id, dto);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/subcategories/subcategories.controller.ts
git commit -m "feat(api): subcategories controller (nested + flat routes)"
```

---

### Task 6: Subcategory module wiring

**Files:**
- Create: `backend/src/modules/subcategories/subcategories.module.ts`

- [ ] **Step 1: Write the module**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubcategoryEntity } from './entities/subcategory.entity';
import { SubcategoriesService } from './subcategories.service';
import { SubcategoriesController } from './subcategories.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SubcategoryEntity])],
  providers: [SubcategoriesService],
  controllers: [SubcategoriesController],
  exports: [SubcategoriesService, TypeOrmModule],
})
export class SubcategoriesModule {}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/subcategories/subcategories.module.ts
git commit -m "feat(api): subcategories module"
```

---

### Task 7: Origin TypeORM entity

**Files:**
- Create: `backend/src/modules/origins/entities/origin.entity.ts`

- [ ] **Step 1: Write the entity**

```ts
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'complaint_origins' })
export class OriginEntity {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id!: string;

  @Column({ type: 'text', unique: true })
  key!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/modules/origins/entities/origin.entity.ts
git commit -m "feat(api): origin entity"
```

---

### Task 8: Origin service (failing tests first)

**Files:**
- Create: `backend/src/modules/origins/origins.service.spec.ts`
- Create: `backend/src/modules/origins/origins.service.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// origins.service.spec.ts
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { OriginsService } from './origins.service';
import { OriginEntity } from './entities/origin.entity';

function repoMock(): jest.Mocked<Repository<OriginEntity>> {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn((x: unknown) => Promise.resolve(x)),
    create: jest.fn((x: unknown) => x),
    createQueryBuilder: jest.fn(),
  } as unknown as jest.Mocked<Repository<OriginEntity>>;
}

describe('OriginsService', () => {
  test('list orders by sort_order then name', async () => {
    const repo = repoMock();
    repo.find.mockResolvedValue([]);
    const svc = new OriginsService(repo);
    await svc.list();
    expect(repo.find).toHaveBeenCalledWith({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  });

  test('create rejects duplicate key', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue({ id: '1' } as OriginEntity);
    const svc = new OriginsService(repo);
    await expect(
      svc.create({ key: 'verbal', name: 'Verbal' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  test('create defaults sortOrder to max+10 when not provided', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue(null);
    // emulate getRawOne returning a max
    repo.createQueryBuilder = jest.fn().mockReturnValue({
      select: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ max: '30' }),
    }) as unknown as Repository<OriginEntity>['createQueryBuilder'];
    const svc = new OriginsService(repo);
    await svc.create({ key: 'email', name: 'Email' });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'email', name: 'Email', sortOrder: 40 }),
    );
  });

  test('update throws ORIGIN_NOT_FOUND for unknown id', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue(null);
    const svc = new OriginsService(repo);
    await expect(svc.update('77', { name: 'X' })).rejects.toBeInstanceOf(NotFoundException);
  });

  test('findActive returns row only when isActive=true', async () => {
    const repo = repoMock();
    repo.findOne.mockResolvedValue({ id: '1', isActive: false } as OriginEntity);
    const svc = new OriginsService(repo);
    const r = await svc.findActive('1');
    expect(r).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && npx jest origins.service.spec
```

Expected: FAIL — `Cannot find module './origins.service'`.

- [ ] **Step 3: Write the implementation**

```ts
// origins.service.ts
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OriginEntity } from './entities/origin.entity';

@Injectable()
export class OriginsService {
  constructor(
    @InjectRepository(OriginEntity)
    private readonly repo: Repository<OriginEntity>,
  ) {}

  list() {
    return this.repo.find({ order: { sortOrder: 'ASC', name: 'ASC' } });
  }

  async create(input: { key: string; name: string; sortOrder?: number }): Promise<OriginEntity> {
    const dup = await this.repo.findOne({ where: { key: input.key } });
    if (dup) throw new ConflictException({ code: 'ORIGIN_KEY_TAKEN' });
    const sortOrder = input.sortOrder ?? (await this.nextSortOrder());
    return this.repo.save(this.repo.create({ ...input, sortOrder }));
  }

  async update(
    id: string,
    patch: Partial<Pick<OriginEntity, 'name' | 'isActive' | 'sortOrder'>>,
  ): Promise<OriginEntity> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException({ code: 'ORIGIN_NOT_FOUND' });
    Object.assign(row, patch);
    return this.repo.save(row);
  }

  async findActive(id: string): Promise<OriginEntity | null> {
    const row = await this.repo.findOne({ where: { id } });
    if (!row || !row.isActive) return null;
    return row;
  }

  private async nextSortOrder(): Promise<number> {
    const r = await this.repo
      .createQueryBuilder('o')
      .select('MAX(o.sort_order)', 'max')
      .getRawOne<{ max: string | null }>();
    const cur = r?.max == null ? 0 : Number(r.max);
    return cur + 10;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd backend && npx jest origins.service.spec
```

Expected: PASS, 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/origins/origins.service.ts \
        backend/src/modules/origins/origins.service.spec.ts
git commit -m "feat(api): origins service with key-uniqueness + auto sort order"
```

---

### Task 9: Origin controller + module

**Files:**
- Create: `backend/src/modules/origins/origins.controller.ts`
- Create: `backend/src/modules/origins/origins.module.ts`

- [ ] **Step 1: Write the controller**

```ts
// origins.controller.ts
import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, MaxLength, Min, MinLength } from 'class-validator';
import { OriginsService } from './origins.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

class CreateOriginDto {
  @IsString() @MinLength(2) @MaxLength(60) @Matches(/^[a-z][a-z0-9_]*$/) key!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

class UpdateOriginDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

@Controller('origins')
export class OriginsController {
  constructor(private readonly svc: OriginsService) {}

  @Get()
  list() {
    return this.svc.list();
  }

  @Post()
  @RequirePermissions('admin.departments:manage')
  create(@Body() dto: CreateOriginDto) {
    return this.svc.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('admin.departments:manage')
  update(@Param('id') id: string, @Body() dto: UpdateOriginDto) {
    return this.svc.update(id, dto);
  }
}
```

- [ ] **Step 2: Write the module**

```ts
// origins.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OriginEntity } from './entities/origin.entity';
import { OriginsService } from './origins.service';
import { OriginsController } from './origins.controller';

@Module({
  imports: [TypeOrmModule.forFeature([OriginEntity])],
  providers: [OriginsService],
  controllers: [OriginsController],
  exports: [OriginsService, TypeOrmModule],
})
export class OriginsModule {}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/origins/origins.controller.ts \
        backend/src/modules/origins/origins.module.ts
git commit -m "feat(api): origins controller + module"
```

---

### Task 10: Register modules in AppModule

**Files:**
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Add the imports and module list entries**

Edit `backend/src/app.module.ts`. Add the two import lines beside the
other module imports near `DepartmentsModule`:

```ts
import { SubcategoriesModule } from './modules/subcategories/subcategories.module';
import { OriginsModule } from './modules/origins/origins.module';
```

In the `imports: [...]` array, add the two new modules immediately
after `DepartmentsModule`:

```ts
    DepartmentsModule,
    SubcategoriesModule,
    OriginsModule,
    DynamicFieldsModule,
```

- [ ] **Step 2: Boot the API and verify routes register**

```bash
cd backend && npm run start:dev &
sleep 5
curl -s http://localhost:3000/api/origins | head -c 200
kill %1 || true
```

Expected: response is the seeded list as JSON (3 entries), or `401`
if auth is required — either is fine, both confirm the route is
mounted. A 404 means the module isn't wired.

- [ ] **Step 3: Commit**

```bash
git add backend/src/app.module.ts
git commit -m "feat(api): register SubcategoriesModule + OriginsModule"
```

---

### Task 11: Extend ComplaintEntity with the two new columns

**Files:**
- Modify: `backend/src/modules/complaints/entities/complaint.entity.ts`

- [ ] **Step 1: Add the two columns to the entity**

Edit `backend/src/modules/complaints/entities/complaint.entity.ts`.
Add the two columns after the existing `complaintDate` column and
before `createdAt`:

```ts
  @Column({ name: 'subcategory_id', type: 'bigint', nullable: true })
  subcategoryId!: string | null;

  @Column({ name: 'origin_id', type: 'bigint', nullable: true })
  originId!: string | null;
```

- [ ] **Step 2: Build to verify the entity compiles**

```bash
cd backend && npx tsc --noEmit
```

Expected: PASS, no TS errors. (The columns map to the nullable DB
columns added in Tasks 1 and 2.)

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/complaints/entities/complaint.entity.ts
git commit -m "feat(api): extend complaint entity with subcategoryId + originId"
```

---

### Task 12: Extend complaint DTO with sub-category + origin fields

**Files:**
- Modify: `backend/src/modules/complaints/dto/complaint.dto.ts`

- [ ] **Step 1: Add the new DTO fields**

Edit `CreateComplaintDto`. Add two fields after `complaintDate`:

```ts
  /** Per-department refinement. Required when the chosen department
   *  has ≥1 active sub-category; rejected otherwise. */
  @IsOptional() @IsString() subcategoryId?: string;

  /** Channel the complaint arrived through. Required on create. */
  @IsString() originId!: string;
```

Edit `UpdateComplaintDto`. Add two fields after `complaintDate`:

```ts
  /** Pass `null` to clear, omit to leave unchanged, pass a string to
   *  set. Server validates the (new dept, sub-category) pairing. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  subcategoryId?: string | null;

  /** Set to a new origin. `null` is rejected (origin cannot be
   *  cleared once set — see spec §4.3). */
  @IsOptional() @IsString() originId?: string;
```

- [ ] **Step 2: Build to verify compile**

```bash
cd backend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/complaints/dto/complaint.dto.ts
git commit -m "feat(api): accept subcategoryId + originId on complaint create + update DTOs"
```

---

### Task 13: Wire Subcategory + Origin entities into ComplaintsModule

**Files:**
- Modify: `backend/src/modules/complaints/complaints.module.ts`

- [ ] **Step 1: Read the current module**

```bash
cat backend/src/modules/complaints/complaints.module.ts
```

You'll see a list of `TypeOrmModule.forFeature([...])` entities and a
list of imported modules. The complaints service needs to inject
`SubcategoriesService` and `OriginsService`, so import both modules.

- [ ] **Step 2: Add imports**

At the top of the file, add:

```ts
import { SubcategoriesModule } from '../subcategories/subcategories.module';
import { OriginsModule } from '../origins/origins.module';
```

In the `imports: [...]` array of the `@Module({...})` decorator, add
`SubcategoriesModule` and `OriginsModule` to the list (alongside any
existing module imports).

- [ ] **Step 3: Build**

```bash
cd backend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/complaints/complaints.module.ts
git commit -m "feat(api): wire subcategories + origins modules into complaints module"
```

---

### Task 14: Validate + persist sub-category + origin on complaint create

**Files:**
- Modify: `backend/src/modules/complaints/complaints.service.ts`

- [ ] **Step 1: Add the service-level dependencies**

Edit the constructor of `ComplaintsService`. Add two new parameters:

```ts
    private readonly subcategories: SubcategoriesService,
    private readonly origins: OriginsService,
```

Add the imports at the top:

```ts
import { SubcategoriesService } from '../subcategories/subcategories.service';
import { OriginsService } from '../origins/origins.service';
```

- [ ] **Step 2: Add the validation helper near the top of the class**

```ts
  private async validateClassification(input: {
    departmentId: string;
    subcategoryId?: string | null;
    originId?: string;
  }): Promise<{ subcategoryId: string | null; originId: string }> {
    if (!input.originId) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        errors: { origin: ['REQUIRED'] },
      });
    }
    const origin = await this.origins.findActive(input.originId);
    if (!origin) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        errors: { origin: ['NOT_ACTIVE'] },
      });
    }

    const deptHasSubcats = await this.subcategories.hasActive(input.departmentId);
    if (deptHasSubcats) {
      if (!input.subcategoryId) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          errors: { subcategory: ['REQUIRED'] },
        });
      }
      const sub = await this.subcategories.findActiveForDepartment(
        input.subcategoryId,
        input.departmentId,
      );
      if (!sub) {
        throw new BadRequestException({
          code: 'VALIDATION_FAILED',
          errors: { subcategory: ['DEPT_MISMATCH_OR_INACTIVE'] },
        });
      }
      return { subcategoryId: sub.id, originId: origin.id };
    }

    // Dept has zero active sub-cats — must not be supplied.
    if (input.subcategoryId) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        errors: { subcategory: ['NOT_ALLOWED'] },
      });
    }
    return { subcategoryId: null, originId: origin.id };
  }
```

- [ ] **Step 3: Call it from create()**

Inside `ComplaintsService.create(...)`, immediately after the
`validateValues` check and before the transaction call, add:

```ts
    const classification = await this.validateClassification({
      departmentId: dto.departmentId,
      subcategoryId: dto.subcategoryId,
      originId: dto.originId,
    });
```

Then in the `em.getRepository(ComplaintEntity).create({...})` call
inside the transaction, add two properties:

```ts
        em.getRepository(ComplaintEntity).create({
          referenceNo,
          status: 'open',
          priority: dto.priority ?? 'normal',
          createdBy: String(actor.id),
          complaintDate: dto.complaintDate ?? null,
          subcategoryId: classification.subcategoryId,
          originId: classification.originId,
        }),
```

- [ ] **Step 4: Build**

```bash
cd backend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Smoke-test create through curl**

Start the dev API:

```bash
cd backend && npm run start:dev &
sleep 5
```

Replace `$TOKEN` with a valid JWT from a logged-in dev user (use the
existing dev seed or log in via `POST /api/auth/login`).

```bash
# Get an origin id
ORIGIN_ID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/origins | jq -r '.[0].id')

# Missing origin: should 400
curl -s -X POST http://localhost:3000/api/complaints \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"values":{},"departmentId":"1"}' | jq .

# Happy path with origin
curl -s -X POST http://localhost:3000/api/complaints \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"values\":{},\"departmentId\":\"1\",\"originId\":\"$ORIGIN_ID\"}" | jq .
```

Expected: first call returns `{code: "VALIDATION_FAILED",
errors: {origin: ["REQUIRED"]}}` with HTTP 400; second call returns
`200` with the new complaint payload containing `originId` and
`subcategoryId: null`.

```bash
kill %1 || true
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/complaints/complaints.service.ts
git commit -m "feat(api): validate + persist origin + subcategory on complaint create"
```

---

### Task 15: Persist sub-category + origin changes on complaint update

**Files:**
- Modify: `backend/src/modules/complaints/complaints.service.ts`

- [ ] **Step 1: Extend the update() method**

The current `update()` early-returns when there is no `values` patch
and no `complaintDate` patch. Extend the gate to cover the new
fields. Replace the early-return block at the top of `update()`:

```ts
    const hasValuesPatch = !!dto.values && Object.keys(dto.values).length > 0;
    const hasDatePatch = Object.prototype.hasOwnProperty.call(dto, 'complaintDate');
    const hasSubcategoryPatch = Object.prototype.hasOwnProperty.call(dto, 'subcategoryId');
    const hasOriginPatch = Object.prototype.hasOwnProperty.call(dto, 'originId');
    if (!hasValuesPatch && !hasDatePatch && !hasSubcategoryPatch && !hasOriginPatch) {
      return this.detail(id, actor);
    }
```

Then, inside the `dataSource.transaction(...)` callback, after the
`complaint_date` branch and before the existing values loop, add:

```ts
      // ─── origin branch ────────────────────────────────────────────────
      if (hasOriginPatch) {
        if (dto.originId == null) {
          // Spec §4.3 — explicit null is rejected.
          throw new BadRequestException({
            code: 'VALIDATION_FAILED',
            errors: { origin: ['REQUIRED'] },
          });
        }
        const newOrigin = await this.origins.findActive(dto.originId);
        if (!newOrigin) {
          throw new BadRequestException({
            code: 'VALIDATION_FAILED',
            errors: { origin: ['NOT_ACTIVE'] },
          });
        }
        const oldId = complaint.originId;
        if (oldId !== newOrigin.id) {
          complaint.originId = newOrigin.id;
          await em.getRepository(ComplaintEntity).save(complaint);
          await this.audit.recordChange({
            em,
            complaintId: id,
            fieldKey: '__origin__',
            action: 'update',
            oldValue: oldId,
            newValue: newOrigin.id,
            actorId: String(actor.id),
          });
        }
      }

      // ─── sub-category branch ──────────────────────────────────────────
      if (hasSubcategoryPatch) {
        const deptId = complaint.assignedDepartmentId;
        if (!deptId) {
          throw new BadRequestException({
            code: 'VALIDATION_FAILED',
            errors: { subcategory: ['NO_DEPARTMENT'] },
          });
        }
        const next = dto.subcategoryId;
        if (next == null) {
          // Clearing — only valid if the dept has no active subcats.
          const deptHasSubcats = await this.subcategories.hasActive(deptId);
          if (deptHasSubcats) {
            throw new BadRequestException({
              code: 'VALIDATION_FAILED',
              errors: { subcategory: ['REQUIRED'] },
            });
          }
          if (complaint.subcategoryId != null) {
            const old = complaint.subcategoryId;
            complaint.subcategoryId = null;
            await em.getRepository(ComplaintEntity).save(complaint);
            await this.audit.recordChange({
              em,
              complaintId: id,
              fieldKey: '__subcategory__',
              action: 'update',
              oldValue: old,
              newValue: null,
              actorId: String(actor.id),
            });
          }
        } else {
          const sub = await this.subcategories.findActiveForDepartment(next, deptId);
          if (!sub) {
            throw new BadRequestException({
              code: 'VALIDATION_FAILED',
              errors: { subcategory: ['DEPT_MISMATCH_OR_INACTIVE'] },
            });
          }
          if (complaint.subcategoryId !== sub.id) {
            const old = complaint.subcategoryId;
            complaint.subcategoryId = sub.id;
            await em.getRepository(ComplaintEntity).save(complaint);
            await this.audit.recordChange({
              em,
              complaintId: id,
              fieldKey: '__subcategory__',
              action: 'update',
              oldValue: old,
              newValue: sub.id,
              actorId: String(actor.id),
            });
          }
        }
      }
```

- [ ] **Step 2: Build**

```bash
cd backend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Smoke-test update through curl**

(Using the complaint created in Task 14 step 5; call its id `$CID`.)

```bash
# Try to clear the origin → 400
curl -s -X PATCH http://localhost:3000/api/complaints/$CID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"originId": null}' | jq .

# Switch origin → 200
ORIGIN2=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/origins | jq -r '.[1].id')
curl -s -X PATCH http://localhost:3000/api/complaints/$CID \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"originId\": \"$ORIGIN2\"}" | jq .
```

Expected: first call returns `VALIDATION_FAILED origin: ["REQUIRED"]`;
second call returns the updated complaint with the new origin.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/complaints/complaints.service.ts
git commit -m "feat(api): allow editing subcategoryId + originId on complaint update"
```

---

### Task 16: Clear orphaned sub-category on cross-dept reassignment

**Files:**
- Modify: `backend/src/modules/assignments/assignments.service.ts`

- [ ] **Step 1: Detect the dept change and clear subcat when needed**

Edit `AssignmentsService.apply()`. After the assignment fields are
mutated (right before
`await em.getRepository(ComplaintEntity).save(complaint);`), add:

```ts
    // If the department is changing, the existing sub-category may no
    // longer belong to the new dept. Clear it pre-emptively so the DB
    // doesn't keep a dangling orphan; if the new dept needs a subcat,
    // the operator will set it in a follow-up PATCH /complaints/:id.
    if (oldDept !== newDept && complaint.subcategoryId != null) {
      complaint.subcategoryId = null;
    }
```

(The `subcategoryId` audit hop is not duplicated here — the
`__assignment__` audit row already records the dept change; the
subcat clearing is a derived consequence of that change.)

- [ ] **Step 2: Build**

```bash
cd backend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/assignments/assignments.service.ts
git commit -m "fix(api): clear orphaned subcategory on cross-dept reassignment"
```

---

### Task 17: Dashboard /by-origin endpoint

**Files:**
- Modify: `backend/src/modules/dashboard/dashboard.controller.ts`

- [ ] **Step 1: Add the endpoint**

Add a method to `DashboardController` next to `byDepartment`:

```ts
  @Get('by-origin')
  @RequireAnyPermission('dashboard:read', 'dashboard.own:read')
  byOrigin(@CurrentUser() actor: AuthUser, @Query('departmentId') departmentId?: string) {
    const dept = this.resolveScope(actor, departmentId);
    return this.scoped(
      this.complaints.createQueryBuilder('c')
        .select('c.origin_id', 'originId').addSelect('COUNT(*)::int', 'count')
        .groupBy('c.origin_id'),
      dept,
    ).getRawMany<{ originId: string | null; count: number }>();
  }
```

- [ ] **Step 2: Smoke-test via curl**

```bash
cd backend && npm run start:dev &
sleep 5
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/dashboard/by-origin | jq .
kill %1 || true
```

Expected: an array of `{originId, count}` rows. `originId: null` is a
valid bucket (legacy rows).

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/dashboard/dashboard.controller.ts
git commit -m "feat(api): dashboard /by-origin breakdown endpoint"
```

---

### Task 18: Frontend types

**Files:**
- Modify: `frontend/src/types/api.ts`

- [ ] **Step 1: Add the two new types and extend Complaint**

Insert after the existing `Department` type:

```ts
export type Subcategory = {
  id: string;
  departmentId: string;
  key: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Origin = {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};
```

Update the existing `Complaint` type. Add the two fields immediately
after `assignedAt`:

```ts
  subcategoryId: string | null;
  originId: string | null;
```

- [ ] **Step 2: Type-check the frontend**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS — even though many call sites now mention complaints,
the new fields are optional in the type intersection only when
constructing one (none of the existing code constructs `Complaint`).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/api.ts
git commit -m "feat(ui): add Subcategory + Origin types, extend Complaint"
```

---

### Task 19: Frontend services for subcategories + origins + extended complaint payload + dashboard

**Files:**
- Create: `frontend/src/services/subcategories.service.ts`
- Create: `frontend/src/services/origins.service.ts`
- Modify: `frontend/src/services/complaints.service.ts`
- Modify: `frontend/src/services/dashboard.service.ts`

- [ ] **Step 1: Subcategories service**

```ts
// frontend/src/services/subcategories.service.ts
import { api } from './api-client';
import type { Subcategory } from '../types/api';

export const SubcategoriesService = {
  listForDepartment(departmentId: string) {
    return api
      .get<Subcategory[]>(`/departments/${departmentId}/subcategories`)
      .then((r) => r.data);
  },
  list(opts: { departmentId?: string; active?: boolean } = {}) {
    return api
      .get<Subcategory[]>('/subcategories', {
        params: {
          departmentId: opts.departmentId,
          active: opts.active === undefined ? undefined : String(opts.active),
        },
      })
      .then((r) => r.data);
  },
  create(departmentId: string, body: { key: string; name: string }) {
    return api
      .post<Subcategory>(`/departments/${departmentId}/subcategories`, body)
      .then((r) => r.data);
  },
  update(id: string, body: { name?: string; isActive?: boolean }) {
    return api.patch<Subcategory>(`/subcategories/${id}`, body).then((r) => r.data);
  },
};
```

- [ ] **Step 2: Origins service**

```ts
// frontend/src/services/origins.service.ts
import { api } from './api-client';
import type { Origin } from '../types/api';

export const OriginsService = {
  list() {
    return api.get<Origin[]>('/origins').then((r) => r.data);
  },
  create(body: { key: string; name: string; sortOrder?: number }) {
    return api.post<Origin>('/origins', body).then((r) => r.data);
  },
  update(id: string, body: { name?: string; isActive?: boolean; sortOrder?: number }) {
    return api.patch<Origin>(`/origins/${id}`, body).then((r) => r.data);
  },
};
```

- [ ] **Step 3: Extend ComplaintsService.create + update + ListParams**

In `frontend/src/services/complaints.service.ts`:

Add `originId` and `subcategoryId` to `ListParams`:

```ts
export type ListParams = {
  page?: number;
  pageSize?: number;
  status?: ComplaintStatus;
  priority?: ComplaintPriority;
  assignedTo?: string;
  departmentId?: string;
  /** Origin filter. `'none'` = legacy rows with NULL origin_id. */
  originId?: string;
  subcategoryId?: string;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  fv?: Record<string, string>;
};
```

Update the `create()` body type:

```ts
  create(body: {
    values: Record<string, unknown>;
    priority?: ComplaintPriority;
    departmentId?: string;
    assignedTo?: string;
    assignmentNote?: string;
    complaintDate?: string;
    originId: string;
    subcategoryId?: string;
  }) {
    return api.post<ComplaintDetail>('/complaints', body).then((r) => r.data);
  },
```

Update the `update()` body type:

```ts
  update(
    id: string,
    body: {
      values?: Record<string, unknown>;
      complaintDate?: string | null;
      subcategoryId?: string | null;
      originId?: string;
    },
  ) {
    return api.patch<ComplaintDetail>(`/complaints/${id}`, body).then((r) => r.data);
  },
```

- [ ] **Step 4: DashboardService.byOrigin**

In `frontend/src/services/dashboard.service.ts`, add inside the
exported object after `byDepartment`:

```ts
  byOrigin(opts: ScopeOpts = {}) {
    return api
      .get<{ originId: string | null; count: number }[]>('/dashboard/by-origin', { params: opts })
      .then((r) => r.data);
  },
```

- [ ] **Step 5: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/services/subcategories.service.ts \
        frontend/src/services/origins.service.ts \
        frontend/src/services/complaints.service.ts \
        frontend/src/services/dashboard.service.ts
git commit -m "feat(ui): services for subcategories, origins, complaint payload + dashboard"
```

---

### Task 20: AdminSubcategoriesPage

**Files:**
- Create: `frontend/src/pages/admin/AdminSubcategoriesPage.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { errorMessage, useToast } from '../../components/ui/Toast';
import { usePermissions } from '../../hooks/usePermissions';
import { DepartmentsService } from '../../services/departments.service';
import { SubcategoriesService } from '../../services/subcategories.service';
import type { Subcategory } from '../../types/api';

export function AdminSubcategoriesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { has } = usePermissions();
  const canManage = has('admin.departments:manage');

  const deptsQ = useQuery({ queryKey: ['departments'], queryFn: () => DepartmentsService.list() });
  const [deptId, setDeptId] = useState<string>('');
  // Default to the first active department once departments load.
  if (!deptId && deptsQ.data && deptsQ.data.length > 0) {
    const first = deptsQ.data.find((d) => d.isActive) ?? deptsQ.data[0];
    setDeptId(first.id);
  }

  const subsQ = useQuery({
    queryKey: ['subcategories', deptId],
    queryFn: () => SubcategoriesService.listForDepartment(deptId),
    enabled: !!deptId,
  });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Subcategory | null>(null);

  const toggleM = useMutation({
    mutationFn: (s: Subcategory) => SubcategoriesService.update(s.id, { isActive: !s.isActive }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subcategories', deptId] });
      toast.success('Updated');
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold text-text-main m-0">Sub-categories</h3>
          <Select
            size="sm"
            className="w-[220px]"
            value={deptId}
            onChange={setDeptId}
            options={(deptsQ.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
          />
        </div>
        {canManage && deptId && (
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
            New sub-category
          </Button>
        )}
      </div>

      {subsQ.isLoading && <p className="muted p-4">Loading…</p>}
      {subsQ.data && subsQ.data.length === 0 && (
        <p className="muted p-4">
          No sub-categories yet. New complaints for this department will skip the sub-category step
          until you add one.
        </p>
      )}
      {subsQ.data && subsQ.data.length > 0 && (
        <table>
          <thead>
            <tr><th>Key</th><th>Name</th><th>Active</th><th></th></tr>
          </thead>
          <tbody>
            {subsQ.data.map((s) => (
              <tr key={s.id}>
                <td className="mono">{s.key}</td>
                <td>{s.name}</td>
                <td>
                  {s.isActive
                    ? <span className="badge badge-success">active</span>
                    : <span className="badge">inactive</span>}
                </td>
                <td className="right">
                  {canManage && (
                    <>
                      <Button variant="ghost" onClick={() => setEditing(s)}>Edit</Button>
                      <Button variant="ghost" onClick={() => toggleM.mutate(s)}>
                        {s.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && deptId && (
        <CreateModal
          departmentId={deptId}
          onClose={() => setCreating(false)}
          onCreated={() => {
            qc.invalidateQueries({ queryKey: ['subcategories', deptId] });
            setCreating(false);
          }}
        />
      )}
      {editing && (
        <EditModal
          sub={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['subcategories', deptId] });
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function CreateModal({
  departmentId, onClose, onCreated,
}: { departmentId: string; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const m = useMutation({
    mutationFn: () => SubcategoriesService.create(departmentId, { key, name }),
    onSuccess: () => { toast.success('Created'); onCreated(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Modal open onClose={onClose} title="New sub-category" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending ? 'Creating…' : 'Create'}
        </Button>
      </>
    }>
      <div className="field">
        <label>Key</label>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="network" />
        <span className="hint">Lower-snake-case. Used internally.</span>
      </div>
      <div className="field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Network" />
      </div>
    </Modal>
  );
}

function EditModal({
  sub, onClose, onSaved,
}: { sub: Subcategory; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(sub.name);
  const m = useMutation({
    mutationFn: () => SubcategoriesService.update(sub.id, { name }),
    onSuccess: () => { toast.success('Saved'); onSaved(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Modal open onClose={onClose} title={`Edit — ${sub.key}`} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending ? 'Saving…' : 'Save'}
        </Button>
      </>
    }>
      <div className="field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/admin/AdminSubcategoriesPage.tsx
git commit -m "feat(ui): admin sub-categories page (per-department CRUD)"
```

---

### Task 21: AdminOriginsPage

**Files:**
- Create: `frontend/src/pages/admin/AdminOriginsPage.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { errorMessage, useToast } from '../../components/ui/Toast';
import { usePermissions } from '../../hooks/usePermissions';
import { OriginsService } from '../../services/origins.service';
import type { Origin } from '../../types/api';

export function AdminOriginsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const { has } = usePermissions();
  const canManage = has('admin.departments:manage');

  const q = useQuery({ queryKey: ['origins'], queryFn: () => OriginsService.list() });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Origin | null>(null);

  const toggleM = useMutation({
    mutationFn: (o: Origin) => OriginsService.update(o.id, { isActive: !o.isActive }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['origins'] }); toast.success('Updated'); },
    onError: (err) => toast.error(errorMessage(err)),
  });

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h3 className="font-semibold text-text-main m-0">Origins of complaint</h3>
        {canManage && (
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
            New origin
          </Button>
        )}
      </div>

      {q.isLoading && <p className="muted p-4">Loading…</p>}
      {q.data && (
        <table>
          <thead>
            <tr><th>Key</th><th>Name</th><th>Sort</th><th>Active</th><th></th></tr>
          </thead>
          <tbody>
            {q.data.map((o) => (
              <tr key={o.id}>
                <td className="mono">{o.key}</td>
                <td>{o.name}</td>
                <td className="mono">{o.sortOrder}</td>
                <td>
                  {o.isActive
                    ? <span className="badge badge-success">active</span>
                    : <span className="badge">inactive</span>}
                </td>
                <td className="right">
                  {canManage && (
                    <>
                      <Button variant="ghost" onClick={() => setEditing(o)}>Edit</Button>
                      <Button variant="ghost" onClick={() => toggleM.mutate(o)}>
                        {o.isActive ? 'Deactivate' : 'Activate'}
                      </Button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {creating && (
        <CreateModal
          onClose={() => setCreating(false)}
          onCreated={() => { qc.invalidateQueries({ queryKey: ['origins'] }); setCreating(false); }}
        />
      )}
      {editing && (
        <EditModal
          origin={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ['origins'] }); setEditing(null); }}
        />
      )}
    </Card>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const m = useMutation({
    mutationFn: () => OriginsService.create({
      key,
      name,
      sortOrder: sortOrder ? Number(sortOrder) : undefined,
    }),
    onSuccess: () => { toast.success('Created'); onCreated(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Modal open onClose={onClose} title="New origin" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending ? 'Creating…' : 'Create'}
        </Button>
      </>
    }>
      <div className="field">
        <label>Key</label>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="email" />
        <span className="hint">Lower-snake-case. Used internally.</span>
      </div>
      <div className="field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Email" />
      </div>
      <div className="field">
        <label>Sort order</label>
        <input
          type="number"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          placeholder="(auto)"
        />
        <span className="hint">Leave blank to append. Lower sorts first.</span>
      </div>
    </Modal>
  );
}

function EditModal({
  origin, onClose, onSaved,
}: { origin: Origin; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(origin.name);
  const [sortOrder, setSortOrder] = useState(String(origin.sortOrder));
  const m = useMutation({
    mutationFn: () => OriginsService.update(origin.id, {
      name,
      sortOrder: Number(sortOrder),
    }),
    onSuccess: () => { toast.success('Saved'); onSaved(); },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Modal open onClose={onClose} title={`Edit — ${origin.key}`} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={() => m.mutate()} disabled={m.isPending}>
          {m.isPending ? 'Saving…' : 'Save'}
        </Button>
      </>
    }>
      <div className="field">
        <label>Name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Sort order</label>
        <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/admin/AdminOriginsPage.tsx
git commit -m "feat(ui): admin origins page"
```

---

### Task 22: Register admin routes + nav

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/pages/admin/AdminShell.tsx`

- [ ] **Step 1: Add routes to App.tsx**

In `frontend/src/App.tsx`, add the imports near the existing
admin-page imports:

```ts
import { AdminSubcategoriesPage } from './pages/admin/AdminSubcategoriesPage';
import { AdminOriginsPage } from './pages/admin/AdminOriginsPage';
```

In the admin `<Route ...>` children block, add the two new routes
alongside the existing ones, right after the `departments` route:

```tsx
          <Route path="departments" element={<AdminDepartmentsPage />} />
          <Route path="subcategories" element={<AdminSubcategoriesPage />} />
          <Route path="origins" element={<AdminOriginsPage />} />
          <Route path="fields" element={<AdminFieldsPage />} />
```

- [ ] **Step 2: Add nav links to AdminShell.tsx**

In `frontend/src/pages/admin/AdminShell.tsx`, add two NavLink entries
right after the existing Departments one:

```tsx
        {has('admin.departments:manage') && <NavLink to="departments" className={tabClass}>Departments</NavLink>}
        {has('admin.departments:manage') && <NavLink to="subcategories" className={tabClass}>Sub-categories</NavLink>}
        {has('admin.departments:manage') && <NavLink to="origins" className={tabClass}>Origins</NavLink>}
        {has('admin.fields:manage') && <NavLink to="fields" className={tabClass}>Fields</NavLink>}
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Smoke-test in browser**

```bash
docker compose up -d --build frontend backend
```

Open `http://localhost:8080` (or whatever the dev URL is), log in as
admin, click Admin → Sub-categories → confirm the page loads, the
department picker works, and "New sub-category" opens a modal.
Repeat for Origins.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/pages/admin/AdminShell.tsx
git commit -m "feat(ui): register sub-categories + origins admin routes and nav"
```

---

### Task 23: ComplaintCreatePage — cascading sub-category + required origin

**Files:**
- Modify: `frontend/src/pages/ComplaintCreatePage.tsx`

- [ ] **Step 1: Add imports + queries + state**

At the top of `ComplaintCreatePage.tsx`, alongside the existing
service imports, add:

```ts
import { OriginsService } from '../services/origins.service';
import { SubcategoriesService } from '../services/subcategories.service';
```

Inside the component, near the other `useQuery` calls:

```ts
  const originsQ = useQuery({ queryKey: ['origins'], queryFn: () => OriginsService.list() });
  const subcatsQ = useQuery({
    queryKey: ['subcategories', departmentId],
    queryFn: () => SubcategoriesService.listForDepartment(departmentId),
    enabled: !!departmentId,
  });
```

Add two state variables next to the existing `[priority, ...]` /
`[departmentId, ...]` / `[assignedTo, ...]` declarations:

```ts
  const [originId, setOriginId] = React.useState('');
  const [subcategoryId, setSubcategoryId] = React.useState('');
```

Clear sub-category whenever department changes — extend the existing
clear-assignee effect, or add a sibling:

```ts
  React.useEffect(() => {
    setSubcategoryId('');
  }, [departmentId]);
```

- [ ] **Step 2: Update submit() to include the new fields**

Replace the existing `ComplaintsService.create({...})` call in
`submit()`:

```ts
      const c = await ComplaintsService.create({
        values,
        priority,
        departmentId: departmentId || undefined,
        assignedTo: assignedTo || undefined,
        complaintDate: complaintDate || undefined,
        originId,
        subcategoryId: subcategoryId || undefined,
      });
```

- [ ] **Step 3: Render the two new fields**

Inside the Classification `<Card>`, after the existing
`Priority + Department` grid and before the `Assigned to` block,
insert:

```tsx
          {departmentId && (subcatsQ.data ?? []).filter((s) => s.isActive).length > 0 && (
            <div className="field">
              <label className="text-[13px] font-medium text-text-main">
                Sub-category <span className="text-danger">*</span>
              </label>
              <Select
                placeholder="Pick a sub-category"
                value={subcategoryId}
                onChange={setSubcategoryId}
                options={(subcatsQ.data ?? [])
                  .filter((s) => s.isActive)
                  .map((s) => ({ value: s.id, label: s.name }))}
              />
              {errors.subcategory && (
                <span className="text-danger text-xs">{errors.subcategory.join(', ')}</span>
              )}
            </div>
          )}

          <div className="field">
            <label className="text-[13px] font-medium text-text-main">
              Origin of complaint <span className="text-danger">*</span>
            </label>
            <Select
              placeholder="Pick an origin"
              value={originId}
              onChange={setOriginId}
              options={(originsQ.data ?? [])
                .filter((o) => o.isActive)
                .map((o) => ({ value: o.id, label: o.name }))}
            />
            {errors.origin && (
              <span className="text-danger text-xs">{errors.origin.join(', ')}</span>
            )}
          </div>
```

- [ ] **Step 4: Type-check + smoke-test**

```bash
cd frontend && npx tsc --noEmit
```

Then rebuild + visit `/complaints/new` in the browser. Confirm:
- Origin shows the seeded list and is required.
- Sub-category appears only after a department with active subcats is
  picked. Switching department clears the selection.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ComplaintCreatePage.tsx
git commit -m "feat(ui): cascading sub-category + required origin on create form"
```

---

### Task 24: ComplaintDetailPage — display, inline edit, print

**Files:**
- Modify: `frontend/src/pages/ComplaintDetailPage.tsx`

- [ ] **Step 1: Add imports + queries**

```ts
import { OriginsService } from '../services/origins.service';
import { SubcategoriesService } from '../services/subcategories.service';
```

In the component:

```ts
  const originsQ = useQuery({ queryKey: ['origins'], queryFn: () => OriginsService.list() });
  const subcatsQ = useQuery({
    queryKey: ['subcategories', c?.assignedDepartmentId],
    queryFn: () => SubcategoriesService.listForDepartment(c!.assignedDepartmentId!),
    enabled: !!c?.assignedDepartmentId,
  });
```

(Place these after `departmentsQ`. `c` here is `complaintQ.data` —
move the queries below the existing data destructuring or use
`complaintQ.data?.assignedDepartmentId` directly.)

- [ ] **Step 2: Add mutations for origin + subcategory**

Alongside `priorityM` / `complaintDateM`:

```ts
  const originM = useMutation({
    mutationFn: (next: string) => ComplaintsService.update(id, { originId: next }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaint', id] });
      qc.invalidateQueries({ queryKey: ['complaint', id, 'audit'] });
      qc.invalidateQueries({ queryKey: ['complaints'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not change origin')),
  });
  const subcatM = useMutation({
    mutationFn: (next: string | null) => ComplaintsService.update(id, { subcategoryId: next }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['complaint', id] });
      qc.invalidateQueries({ queryKey: ['complaint', id, 'audit'] });
      qc.invalidateQueries({ queryKey: ['complaints'] });
    },
    onError: (err) => toast.error(errorMessage(err, 'Could not change sub-category')),
  });
```

- [ ] **Step 3: Render the two new rows in the State card**

In the existing `<Card title="State">` block, immediately after the
existing `<div className="field">` for Priority, insert:

```tsx
              <div className="field">
                <label className="text-[13px] font-medium text-text-main">
                  Origin of complaint
                </label>
                <Select
                  value={c.originId ?? ''}
                  disabled={!canEdit}
                  onChange={(v) => v && originM.mutate(v)}
                  options={(originsQ.data ?? [])
                    .filter((o) => o.isActive || o.id === c.originId)
                    .map((o) => ({
                      value: o.id,
                      label: o.isActive ? o.name : `${o.name} (inactive)`,
                    }))}
                />
              </div>
              {(subcatsQ.data ?? []).filter((s) => s.isActive).length > 0 && (
                <div className="field">
                  <label className="text-[13px] font-medium text-text-main">
                    Sub-category
                  </label>
                  <Select
                    value={c.subcategoryId ?? ''}
                    disabled={!canEdit}
                    onChange={(v) => subcatM.mutate(v || null)}
                    allowClear={!subcatsQ.data?.some((s) => s.isActive)}
                    options={(subcatsQ.data ?? [])
                      .filter((s) => s.isActive || s.id === c.subcategoryId)
                      .map((s) => ({
                        value: s.id,
                        label: s.isActive ? s.name : `${s.name} (inactive)`,
                      }))}
                  />
                </div>
              )}
```

- [ ] **Step 4: Add print rows**

Inside the existing `print-letterhead` block, after the
`Status: ... · Priority: ...` line, extend with:

```tsx
          <div className="text-[11px] text-[#555]">
            Origin: {originsQ.data?.find((o) => o.id === c.originId)?.name ?? '—'}
            {c.subcategoryId && (
              <> · Sub-category: {subcatsQ.data?.find((s) => s.id === c.subcategoryId)?.name ?? '—'}</>
            )}
          </div>
```

- [ ] **Step 5: Type-check + smoke-test**

```bash
cd frontend && npx tsc --noEmit
```

In the browser, open an existing complaint detail page, change the
origin via the dropdown, verify the audit timeline shows a new entry,
verify Ctrl+P preview includes the origin row.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ComplaintDetailPage.tsx
git commit -m "feat(ui): show + edit + print origin and sub-category on complaint detail"
```

---

### Task 25: ComplaintsListPage — origin + sub-category filters + URL params

**Files:**
- Modify: `frontend/src/pages/ComplaintsListPage.tsx`

- [ ] **Step 1: Imports + queries**

Add at the top:

```ts
import { OriginsService } from '../services/origins.service';
import { SubcategoriesService } from '../services/subcategories.service';
```

In the component:

```ts
  const originsQ = useQuery({ queryKey: ['origins'], queryFn: () => OriginsService.list() });
  const subcatsQ = useQuery({
    queryKey: ['subcategories', filters.departmentId],
    queryFn: () => SubcategoriesService.listForDepartment(filters.departmentId!),
    enabled: !!filters.departmentId,
  });
```

- [ ] **Step 2: Add two filter dropdowns in the toolbar**

Inside the toolbar `<form>`, after the existing Department `<Select>`,
add:

```tsx
          <Select
            size="sm"
            className="w-[170px]"
            placeholder="Any origin"
            value={filters.originId ?? ''}
            onChange={(v) => apply({ originId: v || undefined })}
            allowClear
            clearLabel="Any origin"
            options={[
              ...((originsQ.data ?? []).filter((o) => o.isActive)
                .map((o) => ({ value: o.id, label: o.name }))),
              { value: 'none', label: '(Unknown)' },
            ]}
          />

          {filters.departmentId && (subcatsQ.data ?? []).filter((s) => s.isActive).length > 0 && (
            <Select
              size="sm"
              className="w-[170px]"
              placeholder="Any sub-category"
              value={filters.subcategoryId ?? ''}
              onChange={(v) => apply({ subcategoryId: v || undefined })}
              allowClear
              clearLabel="Any sub-category"
              options={(subcatsQ.data ?? []).filter((s) => s.isActive)
                .map((s) => ({ value: s.id, label: s.name }))}
            />
          )}
```

- [ ] **Step 3: URL serde — read & write the new params**

Update `filtersFromQuery`:

```ts
function filtersFromQuery(sp: URLSearchParams): ListParams {
  // ... existing body ...
  return {
    page: Number(sp.get('page')) || 1,
    pageSize: Number(sp.get('pageSize')) || 25,
    status: STATUSES.includes(status as ComplaintStatus) ? status : undefined,
    priority: PRIORITIES.includes(priority as ComplaintPriority) ? priority : undefined,
    departmentId: get('departmentId'),
    assignedTo: get('assignedTo'),
    originId: get('originId'),
    subcategoryId: get('subcategoryId'),
    q: get('q'),
    dateFrom: get('dateFrom'),
    dateTo: get('dateTo'),
    fv: Object.keys(fv).length > 0 ? fv : undefined,
  };
}
```

Update `queryFromFilters`:

```ts
function queryFromFilters(f: ListParams): Record<string, string> {
  const out: Record<string, string> = {};
  if (f.status) out.status = f.status;
  if (f.priority) out.priority = f.priority;
  if (f.departmentId) out.departmentId = f.departmentId;
  if (f.assignedTo) out.assignedTo = f.assignedTo;
  if (f.originId) out.originId = f.originId;
  if (f.subcategoryId) out.subcategoryId = f.subcategoryId;
  if (f.q) out.q = f.q;
  // ... rest unchanged ...
  if (f.page && f.page > 1) out.page = String(f.page);
  if (f.fv) {
    for (const [k, v] of Object.entries(f.fv)) {
      if (v && v.trim() !== '') out[`fv[${k}]`] = v;
    }
  }
  return out;
}
```

Extend the `hasAnyFilter` predicate so the Clear button activates
when only the new filters are set:

```ts
  const hasAnyFilter =
    !!(filters.q || filters.status || filters.priority || filters.departmentId
       || filters.originId || filters.subcategoryId
       || filters.dateFrom || filters.dateTo || hasFvFilter);
```

- [ ] **Step 4: Backend — accept the two new query params**

Edit `backend/src/modules/complaints/complaints.controller.ts`. In
the `list(...)` method add:

```ts
    @Query('originId') originId?: string,
    @Query('subcategoryId') subcategoryId?: string,
```

Pass them into the service call:

```ts
    const r = await this.complaints.list(
      {
        page: p, pageSize: ps,
        status, priority, assignedTo, departmentId, q,
        dateFrom, dateTo,
        originId, subcategoryId,
        fv,
      },
      actor,
    );
```

Edit `complaints.service.ts`. Extend `ListFilters`:

```ts
type ListFilters = {
  page: number;
  pageSize: number;
  status?: ComplaintStatus;
  priority?: ComplaintPriority;
  assignedTo?: string;
  departmentId?: string;
  originId?: string;
  subcategoryId?: string;
  // ...
};
```

In `list(...)`, after the `departmentId` filter clause, add:

```ts
    if (filters.originId === 'none') {
      qb.andWhere('c.origin_id IS NULL');
    } else if (filters.originId) {
      qb.andWhere('c.origin_id = :originId', { originId: filters.originId });
    }
    if (filters.subcategoryId) {
      qb.andWhere('c.subcategory_id = :subcategoryId', { subcategoryId: filters.subcategoryId });
    }
```

- [ ] **Step 5: Type-check both sides**

```bash
cd frontend && npx tsc --noEmit && cd ../backend && npx tsc --noEmit
```

Expected: PASS, PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/ComplaintsListPage.tsx \
        backend/src/modules/complaints/complaints.controller.ts \
        backend/src/modules/complaints/complaints.service.ts
git commit -m "feat: origin + sub-category filters on complaints list"
```

---

### Task 26: DashboardPage — clickable Origin breakdown cards

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Add the data hook**

In each dashboard variant (`ManagerDashboard`, `UserDashboard` — the
file has both), add a `useQuery` for the by-origin endpoint:

```ts
  const byOriginQ = useQuery({
    queryKey: ['dashboard', 'by-origin', scopeOpts],
    queryFn: () => DashboardService.byOrigin(scopeOpts),
  });
  const originsQ = useQuery({ queryKey: ['origins'], queryFn: () => OriginsService.list() });
```

`scopeOpts` already exists in the dashboard variant; if it's named
differently (e.g. `scope`), reuse that name. Add the import next to
the other dashboard imports:

```ts
import { OriginsService } from '../services/origins.service';
```

- [ ] **Step 2: Render the cards**

After the existing status/priority breakdown sections, before the
trend chart, insert a new `<Card title="Origin of complaint">`:

```tsx
        <Card title="Origin of complaint" subtitle="Channel the complaint arrived through">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {(byOriginQ.data ?? []).map((row) => {
              const origin = originsQ.data?.find((o) => o.id === row.originId);
              // Skip rows for deactivated origins unless they have a count;
              // skip null bucket if zero.
              if (!origin && row.originId !== null) return null;
              if (!origin && row.count === 0) return null;
              const name = origin ? origin.name : 'Unknown';
              const isInactive = origin && !origin.isActive;
              if (isInactive && row.count === 0) return null;
              const query = new URLSearchParams();
              query.set('originId', origin ? origin.id : 'none');
              if (filters.departmentId) query.set('departmentId', filters.departmentId);
              return (
                <Link
                  key={row.originId ?? 'none'}
                  to={`/complaints?${query.toString()}`}
                  className="block p-4 rounded-md border border-border bg-surface hover:shadow-md transition-shadow no-print"
                >
                  <div className="text-xs text-text-muted">{name}</div>
                  <div className="text-2xl font-bold text-text-main mt-1">{row.count}</div>
                </Link>
              );
            })}
          </div>
        </Card>
```

`filters` here is the dashboard's existing filters object. If the
local dashboard variant uses a different name (e.g. `state`), adapt
the property names accordingly.

- [ ] **Step 3: Type-check + smoke-test**

```bash
cd frontend && npx tsc --noEmit
```

Then rebuild via `docker compose up -d --build frontend`. Open the
dashboard, confirm three cards render (the seeded origins), each
shows a count, clicking one navigates to
`/complaints?originId=<id>...` with the list pre-filtered.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat(ui): clickable Origin of complaint breakdown on dashboard"
```

---

### Task 27: E2E happy path — admin seeds → user files → dashboard counts → click filters list

**Files:**
- Modify: `e2e/tests/` (add a new spec file; existing pattern is
  `e2e/tests/<feature>.spec.ts`)
- Create: `e2e/tests/origin-and-subcategory.spec.ts`

- [ ] **Step 1: Confirm the e2e test directory layout**

```bash
ls e2e/tests
```

Expected: at least one existing `.spec.ts` you can mirror for setup,
fixtures, and auth helpers. Read the closest existing spec
end-to-end before writing the new one.

- [ ] **Step 2: Write the happy-path spec**

```ts
// e2e/tests/origin-and-subcategory.spec.ts
import { expect, test } from '@playwright/test';

test('admin seeds, user files, dashboard counts, click filters list', async ({ page }) => {
  // 1. Log in as admin (use whatever helper the existing tests use).
  await page.goto('/login');
  await page.getByLabel('Username').fill('admin');
  await page.getByLabel('Password').fill('admin');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page).toHaveURL(/dashboard/);

  // 2. Seed a sub-category for the IT department.
  await page.goto('/admin/subcategories');
  // Pick IT in the department picker (adapt to whatever the seed dept is).
  await page.getByRole('combobox').first().click();
  await page.getByRole('option', { name: /it/i }).click();
  await page.getByRole('button', { name: /new sub-category/i }).click();
  await page.getByLabel('Key').fill('network');
  await page.getByLabel('Name').fill('Network');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Network')).toBeVisible();

  // 3. File a complaint with origin=Verbal and subcategory=Network.
  await page.goto('/complaints/new');
  // (Fill any required dynamic fields the dev seed marks required.)
  // Department: IT
  // Sub-category: Network
  // Origin: Verbal
  await page.getByRole('combobox', { name: /department/i }).click();
  await page.getByRole('option', { name: /it/i }).click();
  await page.getByRole('combobox', { name: /sub-category/i }).click();
  await page.getByRole('option', { name: 'Network' }).click();
  await page.getByRole('combobox', { name: /origin/i }).click();
  await page.getByRole('option', { name: 'Verbal' }).click();
  await page.getByRole('button', { name: /create complaint/i }).click();
  await expect(page).toHaveURL(/\/complaints\/\d+/);

  // 4. Dashboard shows a Verbal card with count ≥ 1.
  await page.goto('/dashboard');
  const verbalCard = page.getByRole('link', { name: /verbal/i }).first();
  await expect(verbalCard).toBeVisible();

  // 5. Click the Verbal card — list page narrows to Verbal complaints.
  await verbalCard.click();
  await expect(page).toHaveURL(/originId=/);
  await expect(page.locator('table tbody tr')).toHaveCountGreaterThanOrEqual(1);
});
```

(Adapt selectors / role queries to match the existing dev seed and
the actual `Select` component's accessibility — the existing specs
will show the conventions.)

- [ ] **Step 3: Run the spec**

```bash
cd e2e && npx playwright test origin-and-subcategory
```

Expected: PASS. If it fails on selectors, adjust to match the
component-library's accessible names; do not change the assertions
about counts / URLs.

- [ ] **Step 4: Commit**

```bash
git add e2e/tests/origin-and-subcategory.spec.ts
git commit -m "test(e2e): happy path for sub-category + origin"
```

---

### Task 28: Documentation updates

**Files:**
- Modify: `docs/02-database-schema.md`
- Modify: `docs/03-api-design.md`
- Modify: `docs/05-admin-user-guide.md`

- [ ] **Step 1: Schema doc**

In `docs/02-database-schema.md`, add a section after the existing
`departments` section:

```markdown
### department_subcategories

Per-department refinement of complaint classification. Cascades off
`departments` (deleting a department wipes its subcat list). Selected
on complaint create when the chosen department has ≥1 active subcat.

| Column         | Type        | Notes                                 |
|----------------|-------------|---------------------------------------|
| id             | BIGSERIAL   | PK                                    |
| department_id  | BIGINT      | FK → departments(id) ON DELETE CASCADE |
| key            | TEXT        | UNIQUE within department              |
| name           | TEXT        |                                        |
| is_active      | BOOLEAN     | Inactive rows hidden from create form |

### complaint_origins

Channel the complaint arrived through. Flat list; admin-managed via
Admin → Origins. Seeded with `social_media`, `verbal`,
`suggestion_box`.

| Column      | Type      | Notes                            |
|-------------|-----------|----------------------------------|
| id          | BIGSERIAL | PK                               |
| key         | TEXT      | UNIQUE                            |
| name        | TEXT      |                                   |
| is_active   | BOOLEAN   | Inactive rows hidden from picker |
| sort_order  | INT       | Lower sorts first; auto-defaults |

### complaints (new columns)

| Column         | Type   | Notes                                   |
|----------------|--------|-----------------------------------------|
| subcategory_id | BIGINT | nullable; FK → department_subcategories |
| origin_id      | BIGINT | nullable; required on create per API    |
```

- [ ] **Step 2: API doc**

In `docs/03-api-design.md`, add sections for the new endpoints and
the complaint-payload deltas. Mirror the format used by existing
sections (each route gets one row: method + path + permission +
short description).

Key entries:
- `GET /departments/:id/subcategories`
- `POST /departments/:id/subcategories` — `admin.departments:manage`
- `PATCH /subcategories/:id` — `admin.departments:manage`
- `GET /subcategories?departmentId=&active=`
- `GET /origins`
- `POST /origins` — `admin.departments:manage`
- `PATCH /origins/:id` — `admin.departments:manage`
- `GET /dashboard/by-origin`
- `POST /complaints` / `PATCH /complaints/:id` accept `originId`,
  `subcategoryId`; validation cases listed in the spec §4.3.

- [ ] **Step 3: Admin guide**

In `docs/05-admin-user-guide.md`, add two short sections:

```markdown
## Sub-categories

Refinements of a department (e.g. *IT → Network, Application*). Admin
→ Sub-categories. Pick a department, then add entries with a
lower-snake-case key and a display name. Once at least one active
sub-category exists for a department, the create-complaint form will
require operators to pick one when filing against that department.

Deactivating a sub-category hides it from the create form but keeps
showing it on existing complaints that already reference it.

## Origins of complaint

The channel a complaint arrived through. Admin → Origins. The system
seeds three (Social media, Verbal, Suggestion box); you may add more.
Every new complaint must pick an origin.

Inactive origins still display on existing complaints but won't be
offered on new ones; the dashboard "Origin of complaint" card hides
zero-count inactive entries.
```

- [ ] **Step 4: Commit**

```bash
git add docs/02-database-schema.md docs/03-api-design.md docs/05-admin-user-guide.md
git commit -m "docs: schema + API + admin guide for sub-categories and origins"
```

---

### Task 29: Final regression smoke + sign-off prep

**Files:** none — verification + reporting only.

- [ ] **Step 1: Run the full backend test suite**

```bash
cd backend && npm test
```

Expected: all existing tests pass; the new
`subcategories.service.spec.ts` and `origins.service.spec.ts`
report green; no new failures introduced elsewhere.

- [ ] **Step 2: Run the full frontend test suite**

```bash
cd frontend && npm test
```

Expected: same as before. The 4 known
`DynamicFieldRenderer.test.tsx` failures (documented in handoff.md)
are tolerated — no new failures.

- [ ] **Step 3: Run the e2e suite**

```bash
cd e2e && npx playwright test
```

Expected: green, including the new `origin-and-subcategory` spec.

- [ ] **Step 4: Manual UI walkthrough**

In a browser (dev URL):

1. Log in as admin.
2. Admin → Sub-categories — pick a department, add one, deactivate
   it, reactivate. Confirm toasts + table updates.
3. Admin → Origins — add a fourth origin, deactivate it, edit its
   sort order. Confirm seeded three still show.
4. New complaint — confirm origin is required and submission is
   blocked when blank. Confirm sub-category appears only after
   picking a department that has any.
5. Detail page — change the origin; confirm the dropdown updates,
   timeline shows an entry, dashboard counts shift.
6. List page — filter by origin, by sub-category (after picking a
   dept); confirm URL params reflect the filter and refreshing the
   page restores it.
7. Dashboard — confirm Origin breakdown row; click a card; confirm
   it navigates to a pre-filtered list.
8. Print preview a detail page — confirm origin / sub-category rows
   appear on the letterhead and the Activity / Attachments / Origin
   section markers behave as before.

- [ ] **Step 5: Report status to the operator**

Summarise (in chat / handoff.md, not a new doc):

- All commits landed on the feature branch.
- Tests + lint pass.
- Print + existing flows unchanged.
- Awaiting operator sign-off before deploying to
  `cts.hadiclinic.com.kw`.

Do **not** run the production deploy commands from this task. The
operator triggers that step manually after sign-off.

---

## Self-Review Checklist (run after writing the plan)

- [x] **Spec coverage:**
  - §3 Schema → Tasks 1, 2, 11
  - §4.1 New modules → Tasks 3–10
  - §4.2 Routes → Tasks 5, 9, 13
  - §4.3 Payload validation → Tasks 14, 15
  - §4.4 Audit + dashboard payload → Tasks 14, 15, 17 (spec deviation
    documented above)
  - §5.1 Admin UX → Tasks 20, 21, 22
  - §5.2 Create form → Task 23
  - §5.3 Detail page → Task 24
  - §5.4 List filter → Task 25
  - §5.5 Dashboard cards → Task 26
  - §6.1 Testing → Tasks 4, 8, 27, 29
  - §6.3 Docs → Task 28
  - §7 YAGNI scope-outs → not implemented (correct)
- [x] **Placeholder scan:** none — every step has a concrete code
      block or shell command.
- [x] **Type consistency:** method names match across tasks
      (`SubcategoriesService.listForDepartment`, `findActiveForDepartment`,
      `hasActive`; `OriginsService.findActive`,
      `DashboardService.byOrigin`).

---

## Open follow-ups (out of scope, tracked for later)

- Sub-category-level dashboard card row (spec §7 scope-out).
- Per-origin SLA / routing rules.
- Drag-to-reorder origins.
- Bulk backfill of legacy `origin_id` for existing complaints.
- Fix the 4 pre-existing `DynamicFieldRenderer.test.tsx` failures.
- Decide whether to commit `handoff.md` or `.gitignore` it.
