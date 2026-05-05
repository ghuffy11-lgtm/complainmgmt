-- 0021 — Raise the per-complaint attachment cap from 3 to 5.
--
-- The cap is enforced in three places (DB trigger, backend service via
-- env, frontend policy constant). This migration handles the DB layer;
-- the env default + frontend constant land in the same release.
--
-- Existing complaints with 3 attachments are unaffected; the trigger
-- only fires on INSERT.
--
-- Idempotent on rerun — `CREATE OR REPLACE FUNCTION` swaps the body.

INSERT INTO schema_migrations (filename) VALUES ('0021_attachment_cap_5.sql');

CREATE OR REPLACE FUNCTION enforce_attachment_count_cap()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM complaint_attachments WHERE complaint_id = NEW.complaint_id;
  IF n >= 5 THEN
    RAISE EXCEPTION 'attachment count cap exceeded for complaint %', NEW.complaint_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
