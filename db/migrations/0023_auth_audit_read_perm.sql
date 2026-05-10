-- 0023 — Provision `auth_audit:read` permission for the Login Activity admin page.
--
-- The auth audit log (created in 0022) is append-only by design and visible
-- only to operators who already manage the user/role grid. Granting the
-- read permission to admin only matches the principle: a manager who can
-- see every complaint should not automatically be able to enumerate IPs
-- and timestamps of failed logins for every account.
--
-- Idempotent on rerun.

INSERT INTO schema_migrations (filename) VALUES ('0023_auth_audit_read_perm.sql');

-- ─── 1. provision the permission ───────────────────────────────────────
INSERT INTO permissions (resource, action, description) VALUES
  ('auth_audit', 'read',
   'Read the authentication audit log (login attempts, lockouts, 2FA events).')
ON CONFLICT (resource, action) DO NOTHING;

-- ─── 2. grant to admin role only ───────────────────────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.key = 'admin'
   AND p.resource = 'auth_audit'
   AND p.action = 'read'
ON CONFLICT (role_id, permission_id) DO NOTHING;
