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

### Owner-scoped permissions

Some permissions are conditional on ownership (e.g. an employee can update their *own* complaints but not others). RBAC does not model ownership directly; the service layer enforces it after the permission check:

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
