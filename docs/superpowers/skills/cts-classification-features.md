---
name: cts-classification-features
description: How sub-departments and origins work in the CTS codebase — architecture, data flow, and extension patterns. Use when modifying or debugging classification features.
metadata:
  type: reference
---

# CTS Classification Features — Sub-departments & Origins

## What these features do

**Sub-departments** (`department_subcategories` table) are optional per-department refinements. When ≥ 1 active sub-dept exists for a department, the create-complaint form requires a selection; otherwise the field is hidden. Managed via Admin → Sub-departments.

**Origins** (`complaint_origins` table) are the channel a complaint arrived through. Required on every new complaint. Managed via Admin → Origins.

Both values are stored as nullable FK columns on `complaints`:
- `complaints.subcategory_id → department_subcategories.id`
- `complaints.origin_id → complaint_origins.id`

---

## DB schema

```sql
-- migrations 0031 + 0032
CREATE TABLE department_subcategories (
  id            BIGSERIAL PRIMARY KEY,
  department_id BIGINT NOT NULL REFERENCES departments(id),
  key           TEXT NOT NULL,
  name          TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  sort_order    INT NOT NULL DEFAULT 0
);

CREATE TABLE complaint_origins (
  id         BIGSERIAL PRIMARY KEY,
  key        TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0
);
-- Seeded: Social media, Verbal, Suggestion box

ALTER TABLE complaints
  ADD COLUMN subcategory_id BIGINT REFERENCES department_subcategories(id),
  ADD COLUMN origin_id      BIGINT REFERENCES complaint_origins(id);
```

Old complaints (pre-feature) have both columns as NULL.

---

## Backend modules

### Subcategories

```
backend/src/modules/subcategories/
  entities/subcategory.entity.ts     SubcategoryEntity
  subcategories.service.ts           list(), listForDepartment(), hasActive(), create(), update()
  subcategories.controller.ts        GET /api/subcategories, GET /api/departments/:id/subcategories
                                     POST /api/subcategories, PATCH /api/subcategories/:id
  subcategories.module.ts
  subcategories.service.spec.ts
```

`hasActive(deptId)` — used by the complaints service to decide whether sub-dept is required.

### Origins

```
backend/src/modules/origins/
  entities/origin.entity.ts          OriginEntity
  origins.service.ts                 list(), findActive(), create(), update()
  origins.controller.ts              GET /api/origins, POST /api/origins, PATCH /api/origins/:id
  origins.module.ts
  origins.service.spec.ts
```

### Complaints integration

**`validateClassification()`** in `complaints.service.ts` (line ~73):
- Called only on CREATE.
- Requires `originId` (throws `VALIDATION_FAILED / origin: REQUIRED` if missing).
- If the dept has active subcats, requires `subcategoryId` too.
- Returns `{ subcategoryId, originId }` for the create flow.

**`update()` in `complaints.service.ts`** (line ~333):
- `hasOriginPatch` / `hasSubcategoryPatch` detected via `Object.prototype.hasOwnProperty.call(dto, field)`.
- Origin PATCH: rejects `null`, validates active origin, audits as `__origin__`.
- Sub-dept PATCH: rejects if no dept set (`NO_DEPARTMENT`), clears allowed only when dept has no active subcats.
- Date PATCH (`__complaint_date__`): same hasOwnProperty pattern.

**`assignments.service.ts apply()`** — clears `subcategoryId` on cross-dept reassignment:
```typescript
if (oldDept != null && String(oldDept) !== String(newDept ?? '') && complaint.subcategoryId != null) {
  complaint.subcategoryId = null;
}
```
`oldDept != null` guard ensures the clear does NOT fire on initial creation (first assignment from null).

**`toDto()`** returns `subcategoryId: c.subcategoryId ?? null` and `originId: c.originId ?? null`.

### Dashboard

`GET /api/dashboard/by-origin` in `dashboard.controller.ts` — returns `[{ originId, count }]` for all origins (including null as `(Unknown)`).

---

## Frontend

### Services

```
frontend/src/services/subcategories.service.ts
  list({ active?: boolean })          GET /api/subcategories
  listForDepartment(deptId)           GET /api/departments/:id/subcategories
  create(deptId, { key, name })       POST /api/subcategories
  update(id, { name?, isActive? })    PATCH /api/subcategories/:id

frontend/src/services/origins.service.ts
  list()                              GET /api/origins
  create({ key, name, sortOrder })    POST /api/origins
  update(id, { ... })                 PATCH /api/origins/:id
```

### Create form — hierarchical dropdown

`ComplaintCreatePage.tsx` combines dept + sub-dept into a single `Select` using Radix grouped options.

Encoding: `d_${deptId}` for a dept with no active subcats; `s_${subId}` for a sub-dept (group label = dept name).

```typescript
const allSubcatsQ = useQuery({
  queryKey: ['subcategories', 'all-active'],
  queryFn: () => SubcategoriesService.list({ active: true }),
});
// deptSubcatOptions built in useMemo; value encoded as d_/s_ prefix
// handleDeptSubcatChange decodes and sets departmentId + subcategoryId
```

### Detail page

`ComplaintDetailPage.tsx`:
- `subcatsQ`: per-dept query, enabled only when `!!complaint.assignedDepartmentId`.
- Sub-dept Select shown only when `subcatsQ.data` has ≥1 active subcat.
- `onChange={(v) => v && subcatM.mutate(v)}` — empty string guard prevents clearing.
- Origin Select same guard: `onChange={(v) => v && originM.mutate(v)}`.
- Date guard (round 3 fix): `onChange={(e) => { if (e.target.value) complaintDateM.mutate(e.target.value); }}` — prevents Chrome `showPicker()` dismiss from sending null.

### List filter

`ComplaintsListPage.tsx`:
- `allSubcatsQ` (same `['subcategories','all-active']` query).
- Combined dept+subcat Select: depts WITH subcats get an "All" option first, then each subcat under a group header.
- `apply({ departmentId, subcategoryId })` atomically updates both filter fields + URL params.
- `queryFromFilters()` includes `subcategoryId` and `originId` if set; `originId='none'` maps to `IS NULL` on the backend.

### Admin pages

```
frontend/src/pages/admin/AdminSubcategoriesPage.tsx
  — dept picker → list + create/edit/toggle sub-depts

frontend/src/pages/admin/AdminOriginsPage.tsx
  — list + create/edit/reorder/toggle origins
```

Both gated by `admin.departments:manage` permission.

### Dashboard

`DashboardPage.tsx` — `byOriginQ` fetches `/api/dashboard/by-origin`. Each origin gets a colored card (cycling `ORIGIN_COLORS` palette) with a left border. Clicking navigates to `/complaints?originId=<id>`.

---

## Types

`frontend/src/types/api.ts`:
```typescript
export interface Subcategory {
  id: string;
  departmentId: string;
  key: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface Origin {
  id: string;
  key: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}
```

`ComplaintDto` grows `subcategoryId: string | null` and `originId: string | null`.

---

## Adding a new classification dimension (pattern)

Follow this checklist if you need to add a third classifier (e.g. "Complaint category"):

1. **DB migration**: new table + nullable FK column on `complaints`.
2. **Entity + service + controller + module** — mirror `origins/` module.
3. **Register module** in `app.module.ts`.
4. **Extend entity**: add column to `ComplaintEntity`.
5. **Extend DTOs**: add optional field to `CreateComplaintDto` + `UpdateComplaintDto`.
6. **`validateClassification()`**: add required-check if the field is always required.
7. **`update()` branch**: add `hasXxxPatch` + save + audit.
8. **`toDto()`**: add `xxxId: c.xxxId ?? null`.
9. **Frontend types**: add to `ComplaintDto` and create service file.
10. **Create form**: add Select (or fold into hierarchical dropdown if dept-scoped).
11. **Detail page**: add mutation + Select with `v && xxxM.mutate(v)` guard.
12. **List filter**: add `apply({..., xxxId})` + URL param.
13. **Admin page**: new `AdminXxxPage.tsx`, add route in `App.tsx`, tab in `AdminShell.tsx`.
14. **Patch e2e golden-path tests** if the field becomes required at create.

---

## Known edge cases

- **Old complaints**: `origin_id` and `subcategory_id` are NULL for all complaints created before these features were deployed. The UI handles this gracefully (empty dropdowns, no forced re-save). Backfilling via SQL is optional — see cookbook.
- **Cross-dept reassignment**: `subcategoryId` is automatically cleared when a complaint moves to a different department (only during reassignment, not initial create — guarded by `oldDept != null`).
- **Inactive sub-dept on existing complaint**: `subcatsQ` filter includes `s.isActive || s.id === c.subcategoryId` so the inactive label still shows for historical data.
- **Origin can't be cleared**: once set, origin is required. The Select has no `allowClear`. Backend rejects `dto.originId == null` with `origin: REQUIRED`.
