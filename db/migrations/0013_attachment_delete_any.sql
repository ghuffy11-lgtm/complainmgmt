-- 0013 — `complaint.attachment:delete_any`: who may delete *other people's*
-- attachments.
--
-- Bug fix: prior to this migration the rule was "owner OR `complaint:update`",
-- which let any employee delete another employee's attachments because
-- `complaint:update` is in the seeded employee role. The new permission is
-- the explicit gate; the service still allows owners to delete their own.
--
-- Idempotent on rerun.

INSERT INTO schema_migrations (filename) VALUES ('0013_attachment_delete_any.sql');

INSERT INTO permissions (resource, action, description) VALUES
  ('complaint.attachment', 'delete_any',
   'Delete attachments uploaded by any user (owners can always delete their own).')
ON CONFLICT (resource, action) DO NOTHING;

-- Seed for admin and supervisor. Operators can extend to other roles via the
-- role-grid editor.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.key IN ('admin', 'supervisor')
   AND p.resource = 'complaint.attachment'
   AND p.action = 'delete_any'
ON CONFLICT (role_id, permission_id) DO NOTHING;
