-- 0030 — Let `complaint_audit_log` accept the FK cascade DELETE.
--
-- 0005 declared `complaint_id BIGINT REFERENCES complaints(id) ON DELETE
-- CASCADE`, on the assumption that audit rows for a deleted complaint
-- should disappear with it. The companion BEFORE DELETE trigger
-- (`block_audit_modification`) was unconditional, so the cascade UPDATEs
-- the trigger emits get rejected — making it impossible to delete any
-- complaint that has audit history (i.e. all of them, since audit fires
-- at create).
--
-- Caught when an operator tried to clean up test complaints they had
-- created on prod to validate a workflow.
--
-- Fix mirrors what 0029 did for `auth_audit_log`: keep the trigger but
-- allow DELETE when the caller has set a session-local flag,
-- `app.allow_audit_delete = 'true'`. SET LOCAL is transaction-scoped
-- so the flag never leaks across connections or to subsequent
-- transactions on the same connection. Arbitrary UPDATE remains
-- blocked unconditionally.
--
-- Also loosen UPDATE to allow exactly one shape — the FK cascade case
-- where some other table's ON DELETE SET NULL clears `actor_id`. Today
-- no such FK action exists on `complaint_audit_log`, but it costs
-- nothing to anticipate the same fix-up we already applied to the
-- auth-audit trigger and keeps the two functions structurally aligned.
--
-- Idempotent: CREATE OR REPLACE rewrites the body in place.

INSERT INTO schema_migrations (filename) VALUES ('0030_complaint_audit_allow_cascade_delete.sql');

CREATE OR REPLACE FUNCTION block_audit_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Allow a future FK ON DELETE SET NULL on actor_id (mirrors the
  -- pattern from migration 0027 for auth_audit_log).
  IF TG_OP = 'UPDATE'
     AND NEW.actor_id IS NULL
     AND OLD.actor_id IS NOT NULL
     AND NEW.id = OLD.id
     AND NEW.occurred_at = OLD.occurred_at
     AND NEW.complaint_id IS NOT DISTINCT FROM OLD.complaint_id
     AND NEW.field_key IS NOT DISTINCT FROM OLD.field_key
     AND NEW.action = OLD.action
     AND NEW.old_value IS NOT DISTINCT FROM OLD.old_value
     AND NEW.new_value IS NOT DISTINCT FROM OLD.new_value
     AND NEW.note IS NOT DISTINCT FROM OLD.note
  THEN
    RETURN NEW;
  END IF;

  -- Allow DELETE when the caller has explicitly opted in via
  -- SET LOCAL app.allow_audit_delete = 'true'. Used both for FK
  -- cascade from `complaints` (the application sets the flag inside
  -- its transaction before issuing the DELETE) and for any future
  -- retention cleanup.
  IF TG_OP = 'DELETE'
     AND current_setting('app.allow_audit_delete', TRUE) = 'true'
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'complaint_audit_log is append-only';
END;
$$;
