-- 0014 — Add `users.department_id` so users can have a "home department".
--
-- Two new things wired off this:
--   1) The user dashboard scopes its data to the actor's department when the
--      caller has only `dashboard.own:read` (employees / non-managers).
--   2) The admin user form gets a department picker.
--
-- Nullable: legacy users + admins typically aren't tied to a department.

INSERT INTO schema_migrations (filename) VALUES ('0014_users_department.sql');

ALTER TABLE users
  ADD COLUMN department_id BIGINT REFERENCES departments(id);

CREATE INDEX idx_users_department
  ON users (department_id)
  WHERE department_id IS NOT NULL;

-- The "scoped" dashboard permission. Granted to everyone *except* admin and
-- manager, who already see the full picture via `dashboard:read`.
INSERT INTO permissions (resource, action, description) VALUES
  ('dashboard.own', 'read', 'View dashboard scoped to your own department.')
ON CONFLICT (resource, action) DO NOTHING;

-- Seed: supervisor + employee get the scoped view by default.
-- (Admin keeps full `dashboard:read` from 0007; manager too.)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.key IN ('supervisor', 'employee')
   AND p.resource = 'dashboard.own'
   AND p.action = 'read'
ON CONFLICT (role_id, permission_id) DO NOTHING;
