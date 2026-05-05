# Skill — Dynamic Form

## Purpose

Define complaint fields as data, not code. Adding a field is an admin task, not a release.

## Inputs / outputs

```
listActiveSchema(forUser: AuthUser): FieldDef[]    // filtered by visibility
fullSchema(): FieldDef[]                           // admin-only, all fields
upsertField(input: FieldInput, actor): FieldDef
deleteField(id, actor): void                       // refuses if is_system
replaceOptions(fieldId, options[]): void

validateValues(values: Record<string,any>, schema: FieldDef[]): ValidationResult
```

`FieldDef`:

```ts
type FieldDef = {
  id: number;
  key: string;            // immutable after create
  label: string;
  type: 'text' | 'number' | 'date' | 'dropdown' | 'file';
  isRequired: boolean;
  /** When true, the complaints list grows a per-field filter input
   *  (?fv[<key>]=…) — only meaningful for text / number / dropdown. */
  isSearchable: boolean;
  validation: {
    // text
    maxLength?: number;
    regex?: string;
    // number — value bounds
    min?: number;
    max?: number;
    // number — digit-count validators (operator-friendly recipes)
    digits?: number;       // exactly N digits
    minDigits?: number;
    maxDigits?: number;
    // date — ISO bounds
    // (re-uses min / max as YYYY-MM-DD strings)
  };
  visibility: { roles: '*' | string[] };
  locking: 'none' | 'first_writer_wins';
  isActive: boolean;
  isSystem: boolean;
  options?: { id: number; value: string; label: string; isActive: boolean }[]; // dropdown only
};
```

## Logic

### Storage strategy

We store one row per `(complaint, field)` in `complaint_field_values`, with one of `value_text / value_number / value_date / value_option_id` populated. **Why this rather than a JSONB column?**

- Per-field FK to `dynamic_field_options` for dropdown integrity.
- Per-field constraint that the column matches the field type (DB-enforced).
- Per-field locking metadata (`owner_user_id`, `locked_at`) is on the value row, not on a side table.
- Indexable filters by field value (e.g. "show me all complaints where `priority_dropdown` = `urgent`").

The trade-off is more rows; that's acceptable for the expected volume.

### Field types

| Type | DB column used | Notes |
|---|---|---|
| `text` | `value_text` | trimmed; respects `maxLength`/`regex` |
| `number` | `value_number` | numeric; respects `min`/`max` |
| `date` | `value_date` | ISO yyyy-mm-dd; respects `min`/`max` |
| `dropdown` | `value_option_id` | FK; option must be `is_active = true` at write time |
| `file` | — | attachments are a separate concern (see `file-upload.skill.md`); a `file` field type is just a marker that an attachment slot exists for this purpose |

### Visibility

`visibility.roles` is either `'*'` (everyone) or an explicit list of role keys. Filtering happens server-side: the client can't see field defs it isn't allowed to see, which avoids leaking labels/keys through the schema endpoint.

### Validation

`validateValues` runs in two passes:

1. **Type coerce** — strings to numbers/dates as needed; reject if coercion fails.
2. **Per-field rules** — required, min/max, maxLength, regex. Dropdown values are checked against `dynamic_field_options`.

For `type='number'` the validator additionally honours digit-count rules:

| Validator | Effect | Error code |
|---|---|---|
| `digits: N` | exact digit count of `Math.trunc(Math.abs(value))` | `WRONG_DIGIT_COUNT` |
| `minDigits` / `maxDigits` | digit-count range | `TOO_FEW_DIGITS` / `TOO_MANY_DIGITS` |

The digit count is computed against the magnitude — sign and decimal part are stripped. So `{"digits": 3}` accepts `-123`, `123`, and `123.45`.

These exist because operators consistently mis-write `{"min":8, "max":8}` thinking it means "8 digits"; that JSON actually means "value must equal 8". The dedicated `digits` validator reads naturally and computes the equivalent value bounds internally.

The result shape is `{ ok: boolean, errors: { [fieldKey]: string[] } }`. The controller turns errors into a `400 VALIDATION_FAILED` payload.

### Searchable filter

When a field has `is_searchable = true` (text / number / dropdown only), the complaints list endpoint accepts `?fv[<key>]=<value>` and applies it via an `EXISTS` subquery against `complaint_field_values`:

- `text` → `value_text ILIKE '%<value>%'`
- `number` → `value_number::text ILIKE '%<value>%'` (so partial digit matches work)
- `dropdown` → exact match on `value_option_id`

Multiple `fv[…]` filters combine with AND. The endpoint refuses any key that isn't `is_active = true AND is_searchable = true` with `400 BAD_FIELD_FILTER` — protects against an admin accidentally exposing hidden data by forgetting to flip the flag.

The implementation uses `EXISTS` rather than `INNER JOIN` because TypeORM's `getManyAndCount` runs a separate count query whose code path can't walk alias metadata for a raw-table join — it surfaces as `Cannot read properties of undefined (reading 'databaseName')`. `EXISTS` keeps the row set 1-row-per-complaint and works through both the data and count paths.

### Field deletion

- `is_system = true` → never delete; deactivate via `is_active = false`. The value rows on existing complaints stay untouched and continue to render in the audit history.
- `is_system = false` → delete cascades to:
  - `dynamic_field_options` (FK cascade)
  - `complaint_field_values` (`ON DELETE RESTRICT`!) — fail if any complaint has a value for this field. Admin must first deactivate; deletion is for never-used fields.
  - `permissions` rows for `complaint.field:<key>:*` (FK cascade through `role_permissions`).

### Adding a field auto-provisions permissions

On `upsertField` insertion, the service inserts:

- `permissions(resource='complaint.field:<key>', action='read')`
- `permissions(resource='complaint.field:<key>', action='write')`
- `permissions(resource='complaint.field:<key>', action='override')`

so admins can immediately grant them in the role permission grid. On deletion, FK cascade removes them.

## Edge cases

- **Renaming the `key`** is forbidden. The `label` can change; the `key` is immutable so audit history and permission keys remain stable.
- **Changing `type`** is forbidden after creation. Type changes would invalidate every existing value. Workaround: deactivate the old field, create a new one.
- **Deactivating a required field** → existing complaints are unaffected; new complaints don't see it, so it isn't required. No retroactive validation.
- **Dropdown option deactivated** → existing values still resolve to the option (the FK is by id, not value); new entries can't pick it.
- **Schema race** — admin edits the schema while an employee is mid-save. The save validates against the current schema at write time; if a field they used was just deactivated, the save fails with `400 SCHEMA_CHANGED`.

## Reusability notes

- The frontend renders the form by mapping `FieldDef[]` to React inputs — there's one renderer, not one component per field.
- The `validateValues` function is shared between server and client (export from a `shared/` lightweight package later; for phase 1 the server is authoritative and the client mirrors with a thin TS implementation).
- Importing schema into another deployment is just `dynamic_fields` + `dynamic_field_options` rows — no code.
