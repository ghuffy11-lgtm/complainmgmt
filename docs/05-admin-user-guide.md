# 05 — Admin User Guide

Audience: deployment administrators using the **Admin** panel.

## Logging in

Visit your CTS URL, sign in with the credentials set during deployment. After first login, change your password (top-right → Change password).

## Admin panel layout

The admin panel is the **Admin** entry in the left navigation, visible only to users with admin permissions. It has six sub-pages:

1. Users
2. Roles & Permissions
3. Departments
4. Complaint Fields
5. System Settings *(includes Branding)*
6. Audit Search

## 1. Managing users

**Users → New user**

| Field | Notes |
|---|---|
| Username | Case-insensitive, must be unique. |
| Display name | Shown throughout the UI. |
| Email | Optional today, used for future notifications. |
| Initial password | The user is required to change it on first login. |
| Roles | Pick one or more. |
| **Departments** | The user can belong to multiple — tick every department they're a member of. Click ☆/★ next to a row to mark the **primary** department. Primary defaults form pickers + the dashboard scope label. |

A user must belong to at least one active department before they can be assigned to complaints. Admins and managers (who have full read across everything) can have zero memberships and still see every complaint via `complaint:read`.

**Deactivating a user** (toggle "Active" off) keeps their history but blocks login. Don't delete — deletion would orphan audit records.

**Resetting a password** writes a new bcrypt hash and revokes all of the user's refresh tokens, forcing logout everywhere.

**Removing a department membership** uses the soft-delete `is_active=false` semantics — historical assignment-history rows referencing that membership stay intact.

## 2. Roles & permissions

A **role** is a named bundle of permissions. The four seeded roles (`admin`, `manager`, `supervisor`, `employee`) cannot be deleted, but their permission sets are fully editable.

To create a new role (e.g. *"Pharmacy Lead"*):

1. **Roles → New role** → key `pharmacy_lead`, name `Pharmacy Lead`.
2. On the role's detail page, check the permissions to grant. Permissions are grouped by resource:
   - `complaint:read` (full) vs `complaint.own:read` (own departments + own creations) — see "Visibility scoping" below.
   - `complaint:create / update / assign / reopen` — write actions.
   - `complaint.field:<field_key>:read|write|override` — per-field controls.
   - `admin.*` — admin-panel access.
   - `audit:*`, `dashboard:*` — read-only access to the analytics areas.
3. Save.

Per-field permissions follow the live dynamic field schema — when you add a new field in *Complaint Fields*, new `complaint.field:<key>:read|write|override` permissions appear automatically.

### Visibility scoping (department-aware reads)

There are **two read tiers** for complaints:

| Permission | Effect |
|---|---|
| `complaint:read` | See every complaint, every department. Default for `admin` and `manager`. |
| `complaint.own:read` | See only complaints whose `assigned_department_id` is in the caller's active membership set, OR complaints they personally created. Default for `supervisor` and `employee`. |

Same split exists for the dashboard: `dashboard:read` sees the whole picture; `dashboard.own:read` aggregates only across the caller's department memberships.

A user can hold both — the broader `:read` always wins, no scoping is applied. So granting an admin `complaint.own:read` is harmless.

### Override

`complaint.field:<key>:override` lets a user write a value even when the field is **locked** by another user. Use sparingly; every override is recorded as a `lock_override` entry in the audit log.

## 3. Departments

Departments are the assignment targets for complaints. Add the org units used at your facility (e.g. *Pharmacy, Lab, Reception, Nursing*). Departments can be marked inactive — preserves history but excludes them from new assignment dropdowns.

A complaint is **assigned to one department at a time**. Reassignment is recorded in the assignment history. The complaint's department drives:

- Who can see it (via `complaint.own:read`).
- Who can be assigned to it (the cascade picker on New Complaint and the Assignment dialog only shows active members of the chosen department; backend rejects mismatches with `USER_NOT_IN_DEPARTMENT`).

## 4. Complaint fields (dynamic form)

This is where the form shown to staff is defined.

**Add field** form:

| Field | Notes |
|---|---|
| Key | Stable machine name (`patient_complaint`). Lowercase, snake_case. **Cannot be changed** after creation. |
| Label | Display label. |
| Type | `text` / `number` / `date` / `dropdown` / `file`. |
| Required | If on, complaints can't be saved without this field. |
| **Searchable in complaints list** | Only available for `text` / `number` / `dropdown`. When ticked, the complaints list grows a per-field filter input — partial substring match for text/number, exact pick for dropdown. |
| Validation | Per-type — see Validation block below. |
| Visibility | Either *all roles* or a chosen subset. |
| Locking | `none` or `first_writer_wins`. |

**Validation block** (JSON):

| Type | Keys | Recipe |
|---|---|---|
| `text` | `maxLength`, `regex` | `{"maxLength": 500}` for free-text limits |
| `number` | `min`, `max` | numeric value bounds — `{"min": 0, "max": 100}` |
| `number` | `digits` | exact digit count — `{"digits": 8}` for an 8-digit phone |
| `number` | `minDigits`, `maxDigits` | digit-count range — `{"minDigits": 9, "maxDigits": 10}` |
| `date` | `min`, `max` | ISO date bounds — `{"min": "2026-01-01"}` |

Common gotcha: `{"min":8, "max":8}` on a number field means "value must equal 8", not "8 digits". Use `{"digits": 8}` for that.

**For dropdowns:** add the allowed options on the field's detail page. Marking an option inactive hides it from new entries but preserves its label on existing complaints.

**Locking:** when set to `first_writer_wins`, the first user who writes a non-empty value becomes the field owner. Others can read but not modify; only users with the `:override` permission can change it (and that change is audited).

System fields (Patient Complaint, Complaint Investigation, Action Taken, PRO, plus seeded number fields like Mobile Number and File ID) ship pre-configured. You can deactivate them but not delete them.

## 5. System settings

The System Settings page has two cards:

### Branding (top card)

The user-friendly editor for the strings shown on the login page, sidebar, header, and footer:

| Field | Where it appears |
|---|---|
| Organisation name | Login subtitle, header label, footer left side |
| System name | Browser tab, sidebar subtitle, login heading |
| System short name | Sidebar brand mark + footer right side |
| Login subtitle | Below the login heading |
| Login tagline | Above the login form ("Sign in to continue…") |
| Footer text | Right of org name in the footer ("Internal use only…") |

**Logo** — click "Upload logo" to replace the default shield icon. Accepts PNG, JPEG, WebP, SVG up to 1 MB. Server sniffs the bytes (declared MIME type is ignored except for SVG, which can't be sniffed). Use "Remove" to clear back to the icon.

Changes go live for everyone on next refetch (max 5-min cache; sign-out/in or hard refresh forces immediately).

### Raw settings (bottom card)

Low-level JSON editor for tunables. Strings need quotes (`"value"`); numbers and arrays don't.

| Key | Purpose | Default |
|---|---|---|
| `complaint.reference_format` | Format for new complaint refs. Tokens: `{YYYY}`, `{MM}`, `{seq}`. | `CMP-{YYYY}-{seq:6}` |
| `lockout.max_failed_logins` | Login attempts before lockout. | `5` |
| `lockout.duration_minutes` | Lockout duration. | `15` |
| `password.min_length` | Minimum password length. | `10` |
| `branding.*` | Same as the Branding card; the card is the easier place to edit these. | — |

Edits are recorded in the audit log under `__settings__`.

## 6. Audit search

Audit searches every recorded change across the system. Filters: complaint, actor, field, action, date range. Results show old → new value, actor, and timestamp. Audit rows are append-only — they cannot be edited or deleted from the UI or via the API.

Notable actions you'll see in the timeline:

| Action | Meaning |
|---|---|
| `create` | Complaint created |
| `update` | Field or scalar (status/priority/date) changed |
| `assign` | Department or assignee changed |
| `reopen` | Complaint moved out of `closed`/`resolved` |
| `lock_override` | Locked field overwritten by override permission |
| `attachment.added` / `attachment.removed` | File attached/removed |
| `password_reset_by_admin` | Admin reset a user's password |
| `role_permissions_changed` | A role's permission grid was modified |
| `settings_changed` | A `system_settings` key was updated |

## Recommended onboarding order for a new deployment

1. Log in as the seeded admin (`INITIAL_ADMIN_USERNAME` from `.env`).
2. **Settings → Branding** — upload your logo, set the organisation name and system name. This makes the rest of the setup feel like *your* system.
3. **Departments** — create the org units you actually have.
4. **Complaint Fields** — review the system fields and the seeded `mobile_number` / `file_id`; add facility-specific fields. Tick "Searchable in complaints list" on anything operators will filter by.
5. **Roles** — review the permission grid. The defaults are sensible; tweak for your governance.
6. **Users** — create accounts for staff. For each, pick the right role(s) and tick the department(s) they belong to. Star their primary department.
7. Create your real human admin account, log in as them, and **deactivate the seeded admin** (don't delete — deletion orphans audit history).
8. Walk one supervisor through creating a test complaint end-to-end so you've seen the full flow before users do.
