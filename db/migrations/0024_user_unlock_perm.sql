-- 0024 — Provision `user:unlock` permission so an admin can clear a
--        user's failed-login counter / locked_until from the UI without
--        running raw SQL.
--
-- Driven by the 2026-05-10 incident where the only admin account was
-- locked out and recovery required `docker compose exec -T db psql ...`.
-- This permission gates the new endpoint POST /admin/users/:id/unlock
-- and the matching "Unlock" button on the Users admin page (T-411,
-- T-412). The break-glass script `scripts/unlock-user.sh` (T-413) is
-- independent — it bypasses the API entirely so a locked-out admin
-- can still recover.
--
-- Idempotent on rerun.

INSERT INTO schema_migrations (filename) VALUES ('0024_user_unlock_perm.sql');

-- ─── 1. provision the permission ───────────────────────────────────────
INSERT INTO permissions (resource, action, description) VALUES
  ('user', 'unlock',
   'Clear a user''s failed-login counter and lock-until timestamp.')
ON CONFLICT (resource, action) DO NOTHING;

-- ─── 2. grant to admin role only ───────────────────────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.key = 'admin'
   AND p.resource = 'user'
   AND p.action = 'unlock'
ON CONFLICT (role_id, permission_id) DO NOTHING;
