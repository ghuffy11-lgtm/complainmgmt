-- 0011 — `complaint:reopen` permission + audit `reopen` action.
--
-- Closed or resolved complaints are read-only by default. Holders of the
-- new `complaint:reopen` permission can transition the status out of either
-- frozen state; the resulting audit row uses a distinct action so the
-- timeline calls reopens out clearly (vs. ordinary status updates).
--
-- Idempotent on rerun (ON CONFLICT DO NOTHING) so this migration is safe to
-- re-apply.

INSERT INTO schema_migrations (filename) VALUES ('0011_complaint_reopen.sql');

-- ─── 1. permission catalog entry ──────────────────────────────────────────
INSERT INTO permissions (resource, action, description) VALUES
  ('complaint', 'reopen', 'Reopen a closed or resolved complaint')
ON CONFLICT (resource, action) DO NOTHING;

-- Grant to admin role only at seed time. Operators can extend to supervisor
-- (or any other role) via the role-grid editor.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM roles r, permissions p
 WHERE r.key = 'admin'
   AND p.resource = 'complaint'
   AND p.action = 'reopen'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ─── 2. extend the audit_log action CHECK to include 'reopen' ─────────────
-- Drop the unnamed CHECK constraint installed by 0005, then recreate with the
-- expanded enum. The DO block locates the existing constraint by inspecting
-- the rendered definition so we don't depend on Postgres's auto-name.
DO $$
DECLARE
  cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'complaint_audit_log'::regclass
     AND contype = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%action%IN%';
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE complaint_audit_log DROP CONSTRAINT %I', cname);
  END IF;
END
$$;

ALTER TABLE complaint_audit_log
  ADD CONSTRAINT complaint_audit_log_action_check
  CHECK (action IN (
    'create','update','delete','assign','lock_override',
    'attachment.added','attachment.removed',
    'password_reset_by_admin','role_permissions_changed','settings_changed',
    'reopen'
  ));
