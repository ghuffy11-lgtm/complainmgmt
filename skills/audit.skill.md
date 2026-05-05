# Skill — Audit

## Purpose

Capture every meaningful state change as an append-only record so the system can answer *who did what, when, and what was it before*.

## Inputs / outputs

```
recordChange({
  em,                  // active TypeORM EntityManager (so it joins the caller's transaction)
  complaintId,
  fieldKey,            // or special: __status__, __assignment__, __priority__, __settings__
  action,              // create | update | delete | assign | lock_override
  oldValue,            // any JSON-serializable value or null
  newValue,            // ditto
  actorId,
  note?,
})  → void

query({ complaintId?, actorId?, from?, to?, fieldKey?, action?, page, pageSize })
  → { data: AuditEntry[], meta }
```

## Logic

### Writing

- Audit rows are written **inside the same transaction** as the underlying change. If the change rolls back, so does the audit row — there can never be an orphan audit, and there can never be a successful change without one.
- The service is the **only** writer of `complaint_audit_log`. Repository writes from elsewhere are forbidden by code review.
- Operationally, the application uses a Postgres role with `INSERT` only on this table. `UPDATE`/`DELETE` are revoked. Migrations apply with the owner role.

### Value serialization

- Both `old_value` and `new_value` are `JSONB` so any field type fits.
- For `dropdown` fields, both the option `id` and `label` are stored — option labels can change later, but the audit row still tells the truth about what was selected.
- For attachments: actions `attachment.added` / `attachment.removed` log `{ filename, byteSize, sha256 }` — never the bytes.

### Diffing

The complaint update path computes a diff before writing:

```ts
const diff = computeDiff(oldValues, incoming, fieldSchema);
// diff: Array<{ fieldKey, oldValue, newValue, action }>
```

Unchanged fields produce no audit row. A field that goes from value to null logs `action='update'` with `newValue=null`, not a synthetic delete.

### Querying

- Filter by complaint, actor, field, action, date range.
- Paged; default sort `occurred_at DESC, id DESC`.
- Indexed columns: `complaint_id`, `actor_id`, `occurred_at`, `field_key`, `action`.
- Read access requires `audit:read` permission.

## Edge cases

- **Bulk imports** (future) → still produce one audit row per (record, field). The `note` field carries `import_batch=<uuid>` so admins can filter.
- **Pre-existing data without audit** → not applicable in greenfield deploy. If we ever bulk-import legacy Excel rows, they get a single synthetic `action='create'` audit row per complaint with `note='legacy_import'`.
- **Clock change** → `occurred_at` uses `NOW()` at insertion. NTP is the operator's problem; we don't try to be cleverer.
- **PII in audit** → audit rows can contain old/new values that include PII. Retention and access controls must treat the audit table at the same sensitivity as the source data.
- **Storage growth** → 1 row per field change; for ~1 M complaints with avg 8 changes each = 8 M rows, comfortably handled by a single Postgres instance with the documented indexes. Partitioning by month is the roadmap path if growth exceeds projections.

## Read-path enrichment

Audit rows reference users and departments by id. The read endpoints
(`/audit`, `/complaints/:id/audit`, `/complaints/:id/assignments`) enrich
each row with display names via `DisplayNamesService` so the UI can render
without N+1 follow-up queries. The enriched fields are:

- `actorName` — `"Display Name (username)"`, or null if the actor is unknown
  (system events or deleted users — the latter shouldn't happen because we
  RESTRICT on user delete, but the resolver is null-safe).
- For assignment history: `oldAssignedToName`, `newAssignedToName`,
  `oldDepartmentName`, `newDepartmentName`, `changedByName`.

The raw ids are still returned so downstream filters (e.g. "show me
everything actor X did") keep working.

## Reusability notes

- Every mutating service (complaints, assignments, settings) calls `AuditService.recordChange` exactly once per change. Adding a new mutating endpoint without an audit call should fail review.
- The service supports **bulk** changes via `recordChanges(em, list)` — a single transactional `INSERT … VALUES (…),(…),(…)`.
- The same service is reused for non-complaint mutations (`__settings__`, `__role_permissions__`) — `complaint_id` is nullable for those rows.
