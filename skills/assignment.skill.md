# Skill — Assignment

## Purpose

A complaint belongs to exactly one department at a time, and may be assigned to one specific user within that department. Every change is recorded.

## Inputs / outputs

```
assign(complaintId, { departmentId, userId?, note? }, actor): ComplaintDto
history(complaintId, actor): AssignmentHistoryEntry[]
```

## Logic

### Single assignment, single department

`complaints.assigned_department_id` and `complaints.assigned_to` are the current state. There is no parallel-assignment concept — re-assigning replaces the previous values.

### Permission

Caller needs `complaint:assign`. The seeded `manager` and `supervisor` roles have it; `employee` does not. `manager` cannot edit complaint content but **can** assign — this is enforced by granting `complaint:assign` without `complaint:update` to the manager role at seed time.

### Assignment history

On every change the service appends to `complaint_assignment_history`:

| Column | Captured |
|---|---|
| `old_assigned_to` / `new_assigned_to` | Previous and new user (nullable). |
| `old_department_id` / `new_department_id` | Previous and new department (nullable). |
| `changed_by` | The actor making the change. |
| `changed_at` | `NOW()`. |
| `note` | Optional reason supplied by the actor. |

The history row is written in the same transaction as the `complaints` update. If either fails, both roll back.

### What constitutes a change?

- Department change → row.
- User-within-department change → row.
- "No-op" (same dept, same user) → no row, returns 200 with the unchanged record.

### Validation

- Department must exist and be `is_active = true`.
- User (when supplied) must exist, be `is_active = true`. We do **not** require the user to belong to a specific department (departments are assignment targets, not user attributes in this schema). If you want department membership enforced, that's a future scope decision and lives in `users.department_id`.
- `userId` may be `null` to assign to a department without a specific owner — useful for queues.

### Initial assignment on create

When a complaint is created with `departmentId` in the request body, `ComplaintsService.create` calls `AssignmentService.assignInitial` *before commit*, producing a single audit row + a single assignment-history row.

### Audit interaction

Every assignment also emits an audit row with `field_key = '__assignment__'`, `action = 'assign'`, and a structured diff in `old_value` / `new_value` so the audit timeline shows assignment events alongside field edits.

## Edge cases

- **Reassigning a closed complaint** — allowed by default, recorded in history. If product wants to forbid this later, add the rule to the service.
- **Assigning to a deactivated user** — rejected (`400 INVALID_USER`).
- **Concurrent reassignment** — last writer wins; both rows appear in history with their respective actors and timestamps.
- **Department rename** — doesn't break history (we store `department_id`, names live in `departments`).
- **Self-assignment** — allowed.

## Reusability notes

- The history table is the source of truth for "who has owned this complaint over time" — the dashboard's "average time to first response" metric reads from it.
- `assignInitial` and `assign` share the diff/insert path so the create-time and update-time audit shapes match.
