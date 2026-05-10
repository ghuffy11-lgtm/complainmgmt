-- 0029 — Allow the auth-audit retention cron to actually prune.
--
-- 0022 installed a BEFORE DELETE trigger that unconditionally raised
-- 'auth_audit_log is append-only'. Together with 0027 (which already
-- loosened BEFORE UPDATE to allow the FK SET-NULL cascade), this leaves
-- the retention job in T-406 unable to do its job: any actual DELETE
-- against the table errors before the row is removed.
--
-- Caught after seeding 12 tripwire-verification rows that I now want
-- to delete — the trigger blocks it; the same wall the retention cron
-- would hit on its first non-empty run.
--
-- Fix: keep the trigger but allow DELETE when the caller has set a
-- session-local flag, `app.allow_audit_delete = 'true'`. The retention
-- service issues `SET LOCAL app.allow_audit_delete = 'true'` inside
-- its DELETE transaction; nobody else sets it, so an accidental
-- repo.delete() in unrelated code still raises. SET LOCAL is
-- transaction-scoped, so the flag never leaks across connections or
-- between transactions on the same connection.
--
-- Defence still has two layers:
--   1. Privilege-level: app role only has INSERT/SELECT in the
--      production split (see docs/04-deployment-guide.md). The
--      retention job either receives DELETE explicitly or runs as
--      cts_owner.
--   2. The trigger remains a tripwire against application-level bugs
--      that try to delete audit rows without the explicit flag.
--
-- Idempotent: CREATE OR REPLACE rewrites in place.

INSERT INTO schema_migrations (filename) VALUES ('0029_auth_audit_allow_retention_delete.sql');

CREATE OR REPLACE FUNCTION block_auth_audit_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- Allow the FK ON DELETE SET NULL cascade (introduced in 0027).
  IF TG_OP = 'UPDATE'
     AND NEW.user_id IS NULL
     AND OLD.user_id IS NOT NULL
     AND NEW.id = OLD.id
     AND NEW.occurred_at = OLD.occurred_at
     AND NEW.username = OLD.username
     AND NEW.event = OLD.event
     AND NEW.ip IS NOT DISTINCT FROM OLD.ip
     AND NEW.user_agent IS NOT DISTINCT FROM OLD.user_agent
     AND NEW.detail IS NOT DISTINCT FROM OLD.detail
  THEN
    RETURN NEW;
  END IF;

  -- Allow DELETE when the caller has explicitly opted in via
  -- SET LOCAL app.allow_audit_delete = 'true'. Used by the
  -- AuthAuditRetentionService nightly prune.
  IF TG_OP = 'DELETE'
     AND current_setting('app.allow_audit_delete', TRUE) = 'true'
  THEN
    RETURN OLD;
  END IF;

  RAISE EXCEPTION 'auth_audit_log is append-only';
END;
$$;
