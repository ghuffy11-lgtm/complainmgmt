# 05 — Admin User Guide

Audience: deployment administrators using the **Admin** panel.

## Logging in

Visit your CTS URL, sign in with the credentials set during deployment. After first login, change your password (top-right menu → Change password).

## Admin panel layout

The admin panel is the **Admin** section in the left navigation, visible only to users with admin permissions. It has six sub-pages:

1. Users
2. Roles & Permissions
3. Departments
4. Complaint Fields
5. System Settings
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

**Deactivating a user** (toggle "Active" off) keeps their history but blocks login. Don't delete — deletion would orphan audit records.

**Resetting a password** writes a new bcrypt hash and revokes all of the user's refresh tokens, forcing logout everywhere.

## 2. Roles & permissions

A **role** is a named bundle of permissions. The four seeded roles (`admin`, `manager`, `supervisor`, `employee`) cannot be deleted, but their permission sets are fully editable.

To create a new role (e.g. *"Pharmacy Lead"*):

1. **Roles → New role** → key `pharmacy_lead`, name `Pharmacy Lead`.
2. On the role's detail page, check the permissions to grant. Permissions are grouped by resource:
   - `complaint:*` — basic complaint actions (create, read, update, assign).
   - `complaint.field:<field_key>:*` — per-field read/write/override.
   - `admin.*` — admin-panel access.
   - `audit:*`, `dashboard:*` — read-only access to the analytics areas.
3. Save.

Per-field permissions follow the live dynamic field schema — when you add a new field in *Complaint Fields*, new `complaint.field:<key>:read|write|override` permissions appear automatically.

### Override

`complaint.field:<key>:override` lets a user write a value even when the field is **locked** by another user. Use sparingly; every override is recorded as a `lock_override` entry in the audit log.

## 3. Departments

Departments are the assignment targets for complaints. Add the org units used at your facility (e.g. *Pharmacy, Lab, Reception, Nursing*). A complaint belongs to exactly one department at a time; reassignment is recorded in assignment history.

Deactivating a department prevents new assignments to it but does not break historical references.

## 4. Complaint fields (dynamic form)

This is where the form shown to staff is defined.

**Add field** form:

| Field | Notes |
|---|---|
| Key | Stable machine name (`patient_complaint`). Lowercase, snake_case. **Cannot be changed** after creation. |
| Label | Display label. |
| Type | `text` / `number` / `date` / `dropdown` / `file`. |
| Required | If on, complaints can't be saved without this field. |
| Validation | Per-type: `min/max`, `maxLength`, `regex`. Stored as JSON. |
| Visibility | Either *all roles* or a chosen subset. |
| Locking | `none` or `first_writer_wins`. |

**For dropdowns:** add the allowed options on the field's detail page. Marking an option inactive hides it from new entries but preserves its label on existing complaints.

**Locking:** when set to `first_writer_wins`, the first user who writes a non-empty value becomes the field owner. Others can read but not modify; only users with the `:override` permission can change it (and that change is audited).

The four legacy fields (Patient Complaint, Complaint Investigation, Action Taken, PRO) ship as **system fields** with locking enabled. You can deactivate them but not delete them.

## 5. System settings

Tunables that can change without a redeploy:

| Key | Purpose | Default |
|---|---|---|
| `complaint.reference_format` | Format for new complaint refs. Tokens: `{YYYY}`, `{MM}`, `{seq}`. | `CMP-{YYYY}-{seq:6}` |
| `lockout.max_failed_logins` | Login attempts before lockout. | `5` |
| `lockout.duration_minutes` | Lockout duration. | `15` |
| `password.min_length` | Minimum password length. | `10` |

Edits are recorded in the audit log under `__settings__`.

## 6. Audit search

Audit searches every recorded change across the system. Filters: complaint, actor, field, action, date range. Results show old → new value, actor, and timestamp. Audit rows are append-only — they cannot be edited or deleted from the UI or via the API.

## Recommended onboarding order for a new deployment

1. Log in as the seeded admin.
2. Create your real admin user; assign the `admin` role; log out and back in as the real admin; deactivate (don't delete) the seeded admin.
3. Create departments.
4. Review/adjust the four seeded dynamic fields. Add facility-specific fields if needed.
5. Review/adjust role permission grids.
6. Create users for staff and assign roles.
7. Walk one supervisor through creating a test complaint end-to-end.
