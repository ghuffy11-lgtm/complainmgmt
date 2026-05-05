-- 0018 — Provision `complaint.own:read` and reshape role grants.
--
-- Until now, anyone with `complaint:read` saw every complaint. With
-- multi-department user memberships we want supervisors and employees
-- scoped to their own departments (with creators always seeing their
-- own filings).
--
-- Permission split:
--   * `complaint:read`     — full picture; admin + manager keep this.
--   * `complaint.own:read` — narrowed to the caller's active department
--                            memberships, plus complaints they created.
--                            Granted to supervisor + employee.
--
-- Service code reads the broader `complaint:read` first; if the caller
-- has it, no scoping. Otherwise it falls back to the `.own` rule. So
-- having both is safe; admins can be granted `.own` without breaking
-- anything.
--
-- Idempotent on rerun.

INSERT INTO schema_migrations (filename) VALUES ('0018_complaint_own_read.sql');

-- ─── 1. provision the new permission ───────────────────────────────────
INSERT INTO permissions (resource, action, description) VALUES
  ('complaint.own', 'read',
   'Read complaints assigned to the caller''s departments, plus those they created.')
ON CONFLICT (resource, action) DO NOTHING;

-- ─── 2. swap role grants ───────────────────────────────────────────────
-- Supervisor + employee lose the broad `complaint:read` and pick up the
-- scoped `complaint.own:read`. Admin + manager are unaffected.
DELETE FROM role_permissions rp
 USING roles r, permissions p
 WHERE rp.role_id = r.id
   AND rp.permission_id = p.id
   AND r.key IN ('supervisor', 'employee')
   AND p.resource = 'complaint'
   AND p.action = 'read';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.key IN ('supervisor', 'employee')
   AND p.resource = 'complaint.own'
   AND p.action = 'read'
ON CONFLICT (role_id, permission_id) DO NOTHING;
