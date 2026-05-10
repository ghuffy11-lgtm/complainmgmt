-- 0027 — Let the auth_audit_log FK cascade run.
--
-- 0022 declared `user_id BIGINT REFERENCES users(id) ON DELETE SET NULL`,
-- on the assumption that audits should outlive their actor: when an
-- admin deletes a user, we want to keep the historical rows but null
-- out the user_id (the row still records `username` as text).
--
-- That FK action triggers an UPDATE on auth_audit_log, which the
-- append-only BEFORE UPDATE trigger from 0022 then unconditionally
-- rejects — so DELETEing a user with any audit history fails. Caught
-- when trying to drop a temp smoke-test account.
--
-- Fix: relax the trigger to allow exactly the FK-cascade case (user_id
-- transitioning from non-null to NULL, with no other column changing).
-- Every other UPDATE shape is still blocked. The DELETE block stays
-- untouched: nothing should ever delete an audit row at the row level.
--
-- Idempotent: CREATE OR REPLACE FUNCTION rewrites the body in place.

INSERT INTO schema_migrations (filename) VALUES ('0027_auth_audit_allow_fk_cascade.sql');

CREATE OR REPLACE FUNCTION block_auth_audit_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
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
    -- Genuine FK cascade from `users.id` deletion. Allow.
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'auth_audit_log is append-only';
END;
$$;
