-- 0026 — Provision `user:reset_2fa` permission so an admin can clear
--        another user's 2FA secret + backup codes when both their
--        authenticator and recovery codes are gone.
--
-- Driven by the recovery story for Batch C: backup codes are hashed,
-- so even an admin can't read them — the only escape hatch from a
-- "lost both factors" situation is to reset 2FA entirely and have
-- the user re-enroll with a fresh secret.
--
-- Granted to admin only. The endpoint POST /users/:id/reset-2fa
-- (T-441) is the audited path; emits `2fa.reset_by_admin`.
--
-- Idempotent on rerun.

INSERT INTO schema_migrations (filename) VALUES ('0026_user_reset_2fa_perm.sql');

INSERT INTO permissions (resource, action, description) VALUES
  ('user', 'reset_2fa',
   'Clear a user''s 2FA secret + backup codes; force re-enrollment.')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.key = 'admin'
   AND p.resource = 'user'
   AND p.action = 'reset_2fa'
ON CONFLICT (role_id, permission_id) DO NOTHING;
