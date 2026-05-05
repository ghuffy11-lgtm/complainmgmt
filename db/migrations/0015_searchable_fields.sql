-- 0015 — `dynamic_fields.is_searchable` + seed `mobile_number` / `file_id`.
--
-- Searchable fields appear as filter inputs in the complaints list toolbar
-- (one per field, type-appropriate input). The list endpoint accepts
-- `?fv[<key>]=<value>` and refuses any key that isn't an active searchable
-- field — so a forgotten flag can't accidentally expose hidden data.
--
-- The two fields seeded here are user-requested:
--   * `mobile_number` — exactly 8 digits (number, validated by min/max)
--   * `file_id`       — exactly 10 digits (number, validated by min/max)
--
-- Both are number-typed; the searchable filter casts value_number::text and
-- does substring ILIKE so partial matches work ("555" finds "555-1234"-ish
-- patterns even though the column is numeric).
--
-- Idempotent on rerun.

INSERT INTO schema_migrations (filename) VALUES ('0015_searchable_fields.sql');

-- ─── 1. is_searchable column ──────────────────────────────────────────────
ALTER TABLE dynamic_fields
  ADD COLUMN IF NOT EXISTS is_searchable BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── 2. seed the two new fields ───────────────────────────────────────────
INSERT INTO dynamic_fields
  (key, label, type, is_required, sort_order, validation, locking, is_system, is_searchable)
VALUES
  -- mobile_number: numeric value with exactly 8 digits
  ('mobile_number', 'Mobile number', 'number',
   FALSE, 50,
   '{"min": 10000000, "max": 99999999}'::jsonb,
   'none', FALSE, TRUE),

  -- file_id: numeric value with exactly 10 digits
  ('file_id', 'File ID', 'number',
   FALSE, 60,
   '{"min": 1000000000, "max": 9999999999}'::jsonb,
   'none', FALSE, TRUE)
ON CONFLICT (key) DO NOTHING;

-- ─── 3. auto-provision per-field permissions for the new keys ────────────
-- (Same pattern DynamicFieldsService.create uses for runtime-created fields.)
INSERT INTO permissions (resource, action, description) VALUES
  ('complaint.field:mobile_number', 'read',     NULL),
  ('complaint.field:mobile_number', 'write',    NULL),
  ('complaint.field:mobile_number', 'override', NULL),
  ('complaint.field:file_id',       'read',     NULL),
  ('complaint.field:file_id',       'write',    NULL),
  ('complaint.field:file_id',       'override', NULL)
ON CONFLICT (resource, action) DO NOTHING;

-- Grant the read/write permissions to the same roles that already hold the
-- `complaint.field:*` wildcards, so the new fields are usable immediately
-- without admins editing the role grid. (Override stays admin-only.)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE p.resource IN ('complaint.field:mobile_number', 'complaint.field:file_id')
   AND (
     -- Admin gets everything (already true via the original CROSS JOIN seed,
     -- but this catches admin-derived custom roles too).
     (r.key = 'admin')
     -- Supervisor: read + write (override already held via wildcard)
  OR (r.key = 'supervisor' AND p.action IN ('read', 'write'))
     -- Employee: read + write
  OR (r.key = 'employee'   AND p.action IN ('read', 'write'))
     -- Manager: read only
  OR (r.key = 'manager'    AND p.action = 'read')
   )
ON CONFLICT (role_id, permission_id) DO NOTHING;
