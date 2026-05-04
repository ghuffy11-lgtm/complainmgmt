# Skill — Field Locking

## Purpose

Prevent later editors from overwriting fields where the **first** non-empty value matters (Patient Complaint, Investigation, Action Taken, PRO — and any other field admins flag with `locking='first_writer_wins'`). A user with explicit override permission can still change the value; the override is audited.

## Inputs / outputs

```
assertWritable(em, complaint, fieldKey, incomingValue, actor): void
                       // throws FIELD_LOCKED if violated and no override
applyOwnership(em, complaint, fieldKey, actor): void
                       // marks the actor as owner if field had no owner before
```

## Logic

### State machine per field

```
unset ──── first non-empty write ───▶ locked (owner = first writer)
locked ── owner writes again ──────▶ locked (no owner change, audit row)
locked ── non-owner writes ────────▶ rejected: 409 FIELD_LOCKED
locked ── non-owner with override ─▶ locked (owner UNCHANGED; audit action='lock_override')
locked ── owner clears value ──────▶ unset (owner cleared, audit row)
```

Two important rules:

1. **An override does not transfer ownership.** The original first-writer remains the owner. This preserves the historical truth ("the supervisor overrode Alice's value", not "Bob is now the author").
2. **Clearing a field unlocks it.** If the owner sets the field back to null, the next non-empty write starts the cycle over with a new owner. Non-owner clears require override permission.

### Where the check lives

`ComplaintsService.update` runs the diff, then for each changed field calls `LockingService.assertWritable`. The locking service:

```ts
const fv = await em.getRepository(ComplaintFieldValue)
  .findOne({ where: { complaintId, fieldId } });

const isLocked = field.locking === 'first_writer_wins'
  && fv?.owner_user_id != null
  && fv.owner_user_id !== actor.id;

if (isLocked) {
  const canOverride = actor.permissions.has(`complaint.field:${field.key}:override`)
    || actor.permissions.has('complaint.field:*:override');
  if (!canOverride) throw new ConflictException({ code: 'FIELD_LOCKED', fieldKey: field.key });
  this.audit.recordChange({
    em, complaintId, fieldKey: field.key, action: 'lock_override',
    oldValue: serialize(fv), newValue: serialize(incoming), actorId: actor.id,
  });
}
```

### Concurrency

The update path runs inside a transaction with `SELECT … FOR UPDATE` on the parent complaint row. Two concurrent edits serialize on that row, so the lock check sees the previous edit's effect, not stale data.

### System-seeded fields

The four legacy fields ship with `locking='first_writer_wins'`, `is_system=true`. Admins can flip locking off, but cannot delete the field. Per-deployment, admins can also enable locking on additional fields (e.g. a `root_cause` text field).

## Edge cases

- **Whitespace** — values are trimmed before comparison; `'   '` counts as empty and does **not** establish ownership.
- **Owner is deactivated** — the lock still holds. The supervisor must override; the override is audited and visible.
- **Lock toggled off after a value exists** — `owner_user_id` and `locked_at` are kept (they remain a historical fact). New edits behave as `none`. Toggling back on does not re-establish a lock automatically.
- **Type change of a locked field** — forbidden (see `dynamic-form.skill.md`); admin must deactivate and create a new field.
- **Migration / bulk import sets the value** — the import sets `owner_user_id = <import_user>` and `locked_at = NOW()`. Audit reflects the import.

## Reusability notes

- All locking logic is in `LockingService`. Other modules (assignment, attachments) do not call it — they have their own rules.
- The override path emits a distinct audit `action` so the audit timeline can render an explicit "overridden by …" badge in the UI.
- The same service is reusable for any field whose `locking` flag is set, today and in the future. There is no code path that special-cases the four legacy fields by key.
