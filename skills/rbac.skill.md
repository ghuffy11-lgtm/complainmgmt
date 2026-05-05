# Skill — RBAC

## Purpose

Decide *can this user do this thing?* using configuration, never code. Roles and permissions are runtime data; engineering does not redeploy to grant or revoke access.

## Model

- **Permission** = `(resource, action)`. `resource` is a dotted string and may be wild-cardable (e.g. `complaint.field:*`). `action` is a verb (`read`, `create`, `update`, `delete`, `assign`, `override`, `manage`).
- **Role** = bag of permissions. Roles have a stable `key` and a human `name`.
- **User** has 0..N roles. **Effective permissions** = union of all roles' permissions.

## Inputs / outputs

```
buildAuthUser(userId)         → AuthUser (with permissions: Set<string>)
hasPermission(user, "complaint:update")           → boolean
assertPermission(user, "complaint:update")        → throws ForbiddenException
hasFieldPermission(user, fieldKey, "write")       → boolean
```

The `permissions` set in `AuthUser` is materialized at login (and re-materialized on refresh) so per-request authorization is an O(1) hash lookup.

## Logic

### Materializing permissions

```sql
SELECT DISTINCT p.resource, p.action
FROM   user_roles ur
JOIN   role_permissions rp ON rp.role_id = ur.role_id
JOIN   permissions p       ON p.id       = rp.permission_id
WHERE  ur.user_id = $1;
```

The result is encoded as `"resource:action"` strings into the `Set`.

### Wildcard resolution

`hasPermission(user, "complaint.field:investigation:write")` returns true if **any** of the following are present:

- `complaint.field:investigation:write`
- `complaint.field:*:write`
- `*:write` *(reserved for `admin` role only, not seeded by default)*

Wildcards never elevate `action` — `complaint:*` is **not** supported (we want explicit verbs).

### Guards

- `JwtAuthGuard` validates the access token, populates `req.user` with `AuthUser`.
- `PermissionsGuard` reads `@RequirePermissions(...)` metadata, calls `hasPermission` for each, ANDs them. Use multiple decorators or a helper for OR.

### Decorators

```ts
@RequirePermissions('complaint:read')
@RequirePermissions('complaint:read', 'complaint:update')   // both
```

For OR semantics use `@RequireAnyPermission('a', 'b')` (less common; default to AND).

### Field-level permissions

Per-field permissions follow the dynamic field schema. When a field is created with key `pro`, three permissions are auto-provisioned:

- `complaint.field:pro:read`
- `complaint.field:pro:write`
- `complaint.field:pro:override`

When a field is deleted (only allowed for non-system fields), those permissions are deleted too. Roles that referenced them lose the entries automatically (FK cascade).

### Create-time routing exception

`complaint:assign` gates **re**assignment of an existing complaint. The
*first-time* routing on create is open to any user with `complaint:create` —
they can pick a department and (if they can list users) an assignee on the
new-complaint form. Rationale: an employee filing a complaint should be able
to direct it to the right department without an admin in the loop;
re-routing later is the privileged action.

The audit row + `complaint_assignment_history` entry are written under the
creator's id either way, so attribution is preserved.

### Frozen-state permission (`complaint:reopen`)

When a complaint's status is `closed` or `resolved`, every mutation path
refuses with `409 COMPLAINT_FROZEN` — including direct field edits,
priority/department/assignment changes, and attachment uploads/deletes.

`complaint:reopen` permits transitioning the status *out* of a frozen
state. It is **not** a free pass: holders must reopen first, then edit,
then re-close. Each step lands a distinct audit row (the reopen as
`action='reopen'`, subsequent edits as `'update'`).

The permission is seeded only on the `admin` role; admins can extend it to
supervisor (or any custom role) via the permission grid.

### Visibility scope (department-aware reads)

Two read tiers exist for complaints and dashboard:

| Permission | Effect |
|---|---|
| `complaint:read` / `dashboard:read` | Full visibility. Default for `admin` + `manager`. |
| `complaint.own:read` / `dashboard.own:read` | Narrowed to `assigned_department_id IN (caller.departmentIds)` **OR** `created_by = caller.id` (creator-always-sees). Default for `supervisor` + `employee`. |

The broader `:read` always wins — granting an admin `:own:read` is harmless. The list path applies the scope as a single SQL clause:

```ts
private applyVisibilityScope(qb, actor) {
  if (actor.permissions.has('complaint:read')) return;
  const depts = actor.departmentIds ?? [];
  if (depts.length > 0) {
    qb.andWhere(
      '(c.assigned_department_id IN (:...scopeDepts) OR c.created_by = :scopeMe)',
      { scopeDepts: depts, scopeMe: String(actor.id) },
    );
  } else {
    qb.andWhere('c.created_by = :scopeMe', { scopeMe: String(actor.id) });
  }
}
```

The detail endpoint guards the same way but throws **`NotFoundException`** rather than `ForbiddenException` — leaking "this id exists in another department" is itself an information leak. The mutate endpoints (`update`, `setStatus`, `setPriority`, `assign`) acquire the row lock first, then call the same `assertVisible(complaint, actor)` check inside the transaction.

### Assignment requires department membership

`AssignmentsService.apply()` rejects an assignee who isn't an active member of the target department (`USER_NOT_IN_DEPARTMENT`). Without this check, an admin could assign a user to a department they can't see — the assignee would lose visibility immediately. The frontend cascade picker (department → assignee) loads only `?departmentId=…&isActive=true` so invalid options never appear in the dropdown.

### Other owner-scoped permissions

Beyond the visibility-scope pattern above, other ownership constraints live in the service after the permission check:

```ts
this.rbac.assertPermission(actor, 'complaint:update');
if (!actor.permissions.has('complaint:update:any') && complaint.created_by !== actor.id) {
  throw new ForbiddenException('NOT_OWNER');
}
```

This pattern is the only place ownership leaks into authorization, and it lives **in the service**, never in a guard.

## Edge cases

- **A user has no roles** → permissions set is empty. No special-case; `hasPermission` returns false for everything.
- **A role has no permissions** → equivalent to absence. Useful for "named placeholder" roles before grants are decided.
- **System role** (`is_system = true`) → cannot be deleted; permissions are still editable. The seeded `admin` role has every permission by default but is **not** unkillable in code — admin power flows from permissions, not from the key `'admin'`. Removing all permissions from it is configuration, not a bug.
- **Concurrent permission edit** → effective permissions are recomputed on the next access-token refresh. To force-apply now, revoke the user's refresh tokens (admin "force re-login").
- **Permission inflation in the catalog** → permissions for deleted dynamic fields are GC'd by FK cascade. No manual cleanup.

## Reusability notes

- The `PermissionsService` is the only place that reads `user_roles` / `role_permissions`. Everywhere else just consumes `AuthUser.permissions`.
- `hasPermission` is wildcard-aware so callers don't reimplement the matching rules.
- Tests assert the full seeded permission grid via a snapshot — adding a permission requires updating the snapshot, which forces reviewer attention.
