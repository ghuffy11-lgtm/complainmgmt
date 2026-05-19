# Sub-categories & Origin of Complaint — Design Spec

**Status:** Draft — awaiting implementation plan
**Author:** Claude (paired with operator)
**Date:** 2026-05-19
**Scope:** Two new classification axes for complaints — per-department
sub-categories and a flat admin-managed list of complaint origins.

---

## 1. Motivation

Today a complaint is classified by Department + Priority. Operators
want two more axes:

1. **Sub-category** — a per-department refinement (e.g. *IT → Network*,
   *IT → Application*). Selected on the create form so triage knows
   *which* slice of a department's work the complaint belongs to.
2. **Origin of complaint** — the channel the complaint arrived through
   (initial values: *Social media*, *Verbal*, *Suggestion box*).
   Needed for dashboard reporting and trend filtering. Must be
   admin-extendable in the same way Departments already are.

---

## 2. Decisions locked in during brainstorming

| Question                                                | Decision |
|---------------------------------------------------------|----------|
| Sub-category scope                                      | Admin-managed, per-department |
| Sub-category required on form?                          | Required only if the chosen department has ≥1 active sub-category |
| Sub-category surfaces beyond create form                | Complaint detail page (display + edit), Complaints list filter |
| Origin admin model                                      | Flat admin-managed list, seeded with 3 values |
| Origin required on form?                                | Required (every new complaint must have one) |
| Dashboard "Origin" treatment                            | Clickable count cards, one per active origin |
| Permissions for managing both new admin lists           | Reuse `admin.departments:manage` |
| Editing origin / sub-category on existing complaints    | Anyone who can edit the complaint today (reuse `complaint:update`) |
| Deactivation rule                                       | Hide from new complaints; keep showing on existing rows |
| Data-model approach                                     | Two dedicated tables (mirrors `departments` pattern) |

---

## 3. Schema

Two new migrations on top of the current head (`0030`):

### 3.1 `0031_department_subcategories.sql`

```sql
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

### 3.2 `0032_complaint_origins.sql`

```sql
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

### 3.3 Constraint notes

- Both new complaint FKs are **nullable in DB**. Required-ness is
  enforced at the API layer so the migration can apply against existing
  rows without a backfill.
- `ON DELETE CASCADE` on `department_subcategories.department_id`
  matches the natural ownership: deleting a department would wipe its
  sub-category list. In practice the admin UI exposes only
  *deactivate* (no destructive delete), matching how departments are
  managed today — so cascade is a safety net, not a routine path.
- The complaint → sub-category FK and complaint → origin FK both use
  the default `NO ACTION`. Combined with admin-UI-only-deactivate, this
  means in-use rows are preserved indefinitely (consistent with the
  deactivation rule).
- Existing complaints get `origin_id = NULL` and `subcategory_id =
  NULL`. They render as "—" on the detail page and group under
  "Unknown" if filtered. No bulk-edit migration.

---

## 4. Backend

### 4.1 New modules

```
backend/src/modules/
  subcategories/
    entities/subcategory.entity.ts
    subcategories.controller.ts
    subcategories.service.ts
    subcategories.module.ts
  origins/
    entities/origin.entity.ts
    origins.controller.ts
    origins.service.ts
    origins.module.ts
```

Both modules mirror the existing `departments/` module — same Nest
patterns, same DTO shape conventions, same RxJS-free service layer.

### 4.2 Routes

**Sub-categories** — writes guarded by `admin.departments:manage`;
reads available to any authenticated user.

```
GET    /api/departments/:id/subcategories          → list (active + inactive flagged)
POST   /api/departments/:id/subcategories          → { key, name }
PATCH  /api/subcategories/:id                       → { name?, isActive? }
GET    /api/subcategories?departmentId=&active=    → flat list for filter dropdown
```

**Origins** — writes guarded by `admin.departments:manage`; reads
available to any authenticated user.

```
GET    /api/origins                                → list
POST   /api/origins                                → { key, name, sortOrder? }
PATCH  /api/origins/:id                            → { name?, isActive?, sortOrder? }
```

### 4.3 Complaint payload deltas

Both `POST /api/complaints` and `PATCH /api/complaints/:id` accept two
new fields:

- `subcategoryId?: number | null`
- `originId?: number` (required on create only)

Server-side validation (returns `VALIDATION_FAILED` with per-field
errors, matching the existing error contract):

| Rule | Behavior |
|------|----------|
| `originId` missing on create | Reject — `origin: required` |
| `originId` references inactive origin | Reject — `origin: not_active` |
| Dept has ≥1 active subcategory, `subcategoryId` missing | Reject — `subcategory: required` |
| Dept has 0 active subcategories, `subcategoryId` provided | Reject — `subcategory: not_allowed` |
| `subcategoryId` provided but not under the chosen department | Reject — `subcategory: dept_mismatch` |
| PATCH changes `departmentId`; old subcategory belongs to old dept | Server clears `subcategory_id` and applies the required-if-any rule against the new dept. Caller may include a new `subcategoryId` in the same PATCH to satisfy the rule in one round-trip; otherwise the request is rejected with `subcategory: required` when the new dept has ≥1 active sub-category. |
| PATCH omits `originId` | `origin_id` left unchanged (PATCH is partial). Legacy complaints with `origin_id = NULL` stay null unless explicitly set. |
| PATCH sets `originId = null` explicitly | Rejected — `origin: required`. Origin cannot be cleared once set. |

### 4.4 Audit & dashboard

- Origin and sub-category changes flow through the **existing
  complaint-audit infrastructure** — same diff payload shape as
  priority/department changes. No new audit table.
- Admin CRUD on `complaint_origins` and `department_subcategories` is
  **not audited** in v1 — matches how `departments` is treated today.
- `GET /api/dashboard` response grows an `originBreakdown` array:

  ```ts
  originBreakdown: Array<{
    originId: number | null;   // null = "Unknown" bucket (legacy rows)
    key:      string | null;
    name:     string;          // e.g. "Social media" or "Unknown"
    count:    number;
  }>
  ```

  Scope respects the same filters the rest of the dashboard already
  honors: department filter, time window, manager-vs-user view.

---

## 5. Frontend

### 5.1 Admin UX

**A. Sub-categories** (new route `/admin/subcategories`):

- Top of page: Department picker (`DepartmentsService.list()`,
  default = first active dept).
- Below: table identical to `AdminDepartmentsPage` — columns
  `Key | Name | Active | Edit/Toggle`. "New sub-category" button
  top-right opens a modal with `Key` + `Name` fields. Edit modal
  allows rename + toggle active.
- Switching the department picker swaps the table contents.
  Deactivated rows show with `inactive` badge — same pattern as
  departments today.
- Empty state: *"No sub-categories yet. New complaints for this
  department will skip the sub-category step until you add one."*
- Permission: `admin.departments:manage` (no new perm). Read-only view
  when missing.

**B. Origins** (new route `/admin/origins`):

- Single flat table: `Key | Name | Sort | Active | Edit/Toggle`.
- "New origin" modal: `Key`, `Name`, `Sort order`
  (default = `max(sort_order) + 10`).
- Drag-to-reorder is **out of scope** in v1; admin sets sort
  numerically.
- Seeded rows (`social_media`, `verbal`, `suggestion_box`) appear
  pre-populated.
- Permission: `admin.departments:manage` (no new perm). Read-only view
  when missing.

Both pages register in `AdminShell` sidebar, visible to anyone who can
already see the Departments admin tab.

### 5.2 Create-complaint form (`ComplaintCreatePage.tsx`)

Classification card gains two fields:

```
┌─ Classification ─────────────────────────────────────────┐
│  Priority *               Department *                   │
│  [Normal       ▾]         [Pick a department  ▾]         │
│                                                          │
│  Sub-category *  ← only if dept has ≥1 active subcat     │
│  [Pick a sub-category ▾]                                 │
│                                                          │
│  Origin of complaint *                                   │
│  [Pick an origin ▾]                                      │
│                                                          │
│  Assigned to                                             │
│  [Department queue ▾]                                    │
└──────────────────────────────────────────────────────────┘
```

Behavior:

- Sub-category field renders **only after** Department is picked **and**
  the chosen department has ≥1 active sub-category. Hidden otherwise
  (no empty disabled control).
- Changing Department clears Sub-category (mirrors the existing
  assignee-clear `useEffect`).
- Origin is always visible, always required. Options come from
  `OriginsService.list()` filtered to `isActive`.
- Server validation errors surface via the existing `errors` map.

### 5.3 Complaint detail page (`ComplaintDetailPage.tsx`)

- Add two display rows to the existing Classification panel, between
  Department and Priority: **Sub-category** and **Origin**. Both show
  "—" when null.
- Inline edit reuses the existing edit affordance (whatever gate
  currently controls Priority/Department edits — `complaint:update`).
  Sub-category dropdown narrows to the complaint's department's active
  sub-categories; Origin to active origins.
- **Print** path: include both as plain text rows in the print
  letterhead — reuse the existing `.print-only` pattern, same treatment
  as Priority/Department.

### 5.4 Complaints list (`ComplaintsListPage.tsx`)

- New filter chip "Origin" beside the existing Department filter.
  Cardinality matches whatever the existing Department filter does
  today — if Department is single-value, Origin is single-value;
  if multi-select, Origin is multi-select. Implementation verifies
  the existing behavior and mirrors it. Clearable either way.
- Sub-category filter added but cascading: enabled only once a
  Department is selected (same UX as the create-form assignee
  cascade).
- **No new table columns** in v1.
- URL query params: `?originId=...&subcategoryId=...&departmentId=...`
  so the dashboard cards can deep-link.

### 5.5 Dashboard (`DashboardPage.tsx`)

New section below the existing status/priority breakdowns:

```
┌─ Origin of complaint ─────────────────────────────────────┐
│                                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ Social media │  │ Verbal       │  │ Suggestion   │    │
│  │              │  │              │  │ box          │    │
│  │      12      │  │      7       │  │      3       │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

- One card per **active** origin. Inactive origins hidden even if
  existing complaints reference them.
- Card count reflects the dashboard's current scope: dept filter, time
  window, manager-vs-user view.
- Card is a `<Link to="/complaints?originId={id}&...">` that carries
  the dashboard's active filters into the URL (date range, dept if
  set). Click lands on the list page pre-filtered.
- **Unknown bucket**: rendered only if `count > 0` for null-origin
  legacy rows. Label "Unknown", clickable → `?originId=none`. Backend
  filter accepts `originId=none` and translates to
  `WHERE origin_id IS NULL`.
- Layout: CSS grid — 3 cards/row desktop, 2 tablet, 1 mobile. Reuses
  the existing breakdown-card component style (`var(--surface)` bg,
  hover lift).
- `@media print` hides this section (matches dashboard print rules for
  the other breakdown tiles).
- **No sub-category dashboard section** in v1 (deferred per
  brainstorming).

---

## 6. Testing & rollout

### 6.1 Testing — dev-only until sign-off

**The operator has explicitly required dev-only deployment until full
testing passes — no prod push without sign-off.**

- **Backend unit tests** for new services: CRUD happy path,
  key-uniqueness, cascade behavior, deactivate-while-in-use leaves
  complaints intact.
- **Backend integration tests** on `POST /complaints` and
  `PATCH /complaints/:id` covering the four validation cases listed in
  §4.3.
- **Frontend tests** alongside existing pages: sub-category shows/hides
  on department change; origin dashboard card link carries filters.
- **E2E happy path** under `e2e/`: admin seeds an IT/Network
  sub-category → user files complaint with origin=Verbal → dashboard
  card increments → click filters list to that one complaint.
- **Manual smoke**: dev rebuild via
  `docker compose up -d --build`. Walk through the full flow in a
  browser. Verify print still works.
- **Regression**: run the pre-existing test suite. The 4 known
  `DynamicFieldRenderer.test.tsx` failures are tolerated; no *new*
  failures introduced.

### 6.2 Rollout

1. Land migrations + backend + frontend on a feature branch.
2. Dev verify (browser + automated tests).
3. Operator sign-off (screenshots + walkthrough).
4. **Only after sign-off**: ship to `cts.hadiclinic.com.kw` via the
   standard `git pull` + `docker compose up -d --build` flow described
   in `docs/10-production-runbook.md`. Take the pre-deploy DB backup
   per the runbook.
5. Existing complaints render with origin "—" and no sub-category.
   Operators may backfill via the detail-page edit if they choose.

### 6.3 Docs

Updates to ship alongside the code:

- `docs/02-database-schema.md` — two new tables, two new complaint
  columns.
- `docs/03-api-design.md` — new endpoints, complaint payload deltas.
- `docs/05-admin-user-guide.md` — new "Sub-categories" and "Origins"
  admin sections.

---

## 7. Explicit scope-outs (YAGNI)

- No drag-to-reorder for origins (numeric `sort_order` only).
- No multi-select on filter chips.
- No sub-category-level dashboard breakdown (operator defaulted out
  during brainstorming).
- No bulk backfill of legacy `origin_id` / `subcategory_id` — manual
  edits only.
- No per-department origin restriction.
- No new RBAC permissions — reuse `admin.departments:manage` and
  `complaint:update`.
- No "Add Print button to list page" or fixing the 4 pre-existing
  `DynamicFieldRenderer.test.tsx` failures — separate backlog items.

---

## 8. Open follow-ups (out of scope for this spec)

- Sub-category-level dashboard breakdown (if requested later).
- Per-origin SLA or routing rules.
- Origin-level reporting export.
