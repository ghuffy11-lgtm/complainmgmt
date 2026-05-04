-- 0007 — Seed: roles, permissions, role↔permission grid, system fields.
-- This migration is idempotent on a fresh DB. It does NOT create users
-- (the application bootstraps an initial admin from env on first start).

INSERT INTO schema_migrations (filename) VALUES ('0007_seed.sql');

-- ───────────────────────────────────────────────────────────────────────────
-- Roles
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO roles (key, name, description, is_system) VALUES
  ('admin',      'Admin',      'Full system control',                            TRUE),
  ('manager',    'Manager',    'Read-everywhere monitoring + assignment',        TRUE),
  ('supervisor', 'Supervisor', 'Edit complaints, override locked fields',        TRUE),
  ('employee',   'Employee',   'Create complaints and edit their own entries',   TRUE);

-- ───────────────────────────────────────────────────────────────────────────
-- Permissions catalog (resource:action)
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO permissions (resource, action, description) VALUES
  -- Complaint core
  ('complaint',                  'read',     'Read complaints'),
  ('complaint',                  'create',   'Create complaints'),
  ('complaint',                  'update',   'Update complaint metadata + non-locked fields'),
  ('complaint',                  'delete',   'Delete complaints (rare; use status instead)'),
  ('complaint',                  'assign',   'Assign complaints to dept/user'),

  -- Field-level wildcards
  ('complaint.field:*',          'read',     'Read all complaint fields'),
  ('complaint.field:*',          'write',    'Write all complaint fields'),
  ('complaint.field:*',          'override', 'Override any locked field'),

  -- System-field-specific (auto-provisioned for runtime fields by app)
  ('complaint.field:patient_complaint',         'read',     NULL),
  ('complaint.field:patient_complaint',         'write',    NULL),
  ('complaint.field:patient_complaint',         'override', NULL),
  ('complaint.field:complaint_investigation',   'read',     NULL),
  ('complaint.field:complaint_investigation',   'write',    NULL),
  ('complaint.field:complaint_investigation',   'override', NULL),
  ('complaint.field:action_taken',              'read',     NULL),
  ('complaint.field:action_taken',              'write',    NULL),
  ('complaint.field:action_taken',              'override', NULL),
  ('complaint.field:pro',                       'read',     NULL),
  ('complaint.field:pro',                       'write',    NULL),
  ('complaint.field:pro',                       'override', NULL),

  -- Audit / dashboard
  ('audit',                      'read',     'Read audit log'),
  ('dashboard',                  'read',     'Read dashboard aggregates'),

  -- Admin
  ('admin.users',                'read',     'Read users in admin'),
  ('admin.users',                'manage',   'CRUD users + roles + reset password'),
  ('admin.roles',                'read',     'Read roles + permissions'),
  ('admin.roles',                'manage',   'CRUD roles + edit permission grid'),
  ('admin.fields',               'manage',   'CRUD dynamic fields + options'),
  ('admin.departments',          'manage',   'CRUD departments'),
  ('admin.settings',             'manage',   'Edit system settings');

-- ───────────────────────────────────────────────────────────────────────────
-- Role ↔ permission grid (default; admins can edit later)
-- ───────────────────────────────────────────────────────────────────────────
-- Admin: everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.key = 'admin';

-- Manager: read complaints, assign, audit, dashboard
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.key = 'manager' AND (
     (p.resource = 'complaint'         AND p.action IN ('read','assign'))
  OR (p.resource = 'complaint.field:*' AND p.action = 'read')
  OR (p.resource = 'audit'             AND p.action = 'read')
  OR (p.resource = 'dashboard'         AND p.action = 'read')
);

-- Supervisor: full complaint editing inc. override on all fields, dashboard, audit
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.key = 'supervisor' AND (
     (p.resource = 'complaint'         AND p.action IN ('read','create','update','assign'))
  OR (p.resource = 'complaint.field:*' AND p.action IN ('read','write','override'))
  OR (p.resource = 'audit'             AND p.action = 'read')
  OR (p.resource = 'dashboard'         AND p.action = 'read')
);

-- Employee: read + create + update on own; field read/write but no override
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p
WHERE r.key = 'employee' AND (
     (p.resource = 'complaint'         AND p.action IN ('read','create','update'))
  OR (p.resource = 'complaint.field:*' AND p.action IN ('read','write'))
);

-- ───────────────────────────────────────────────────────────────────────────
-- System dynamic fields
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO dynamic_fields (key, label, type, is_required, sort_order, locking, is_system) VALUES
  ('patient_complaint',       'Patient Complaint',       'text', TRUE,  10, 'first_writer_wins', TRUE),
  ('complaint_investigation', 'Complaint Investigation', 'text', FALSE, 20, 'first_writer_wins', TRUE),
  ('action_taken',            'Action Taken',            'text', FALSE, 30, 'first_writer_wins', TRUE),
  ('pro',                     'PRO',                     'text', FALSE, 40, 'first_writer_wins', TRUE);
