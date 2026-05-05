-- 0016 — retire legacy `mobile` / `fileid` fields in favour of
--        `mobile_number` / `file_id` seeded in migration 0015.
--
-- Context: an admin had created `mobile` (required, 8-digit) and `fileid`
-- (required) via the admin UI before migration 0015 introduced the canonical
-- searchable equivalents. With both pairs active the create-complaint flow
-- was rejecting submissions for missing legacy required fields.
--
-- Both legacy fields had zero captured values at retirement time, so we
-- deactivate (not delete) — keeps the rows around in case an admin wants to
-- inspect or revive them, but hides them from the schema endpoint and skips
-- them in validation.
--
-- Idempotent: WHERE clause matches the legacy keys; rerunning is a no-op.

INSERT INTO schema_migrations (filename) VALUES ('0016_retire_legacy_mobile_fileid.sql');

UPDATE dynamic_fields
   SET is_active   = FALSE,
       is_required = FALSE,
       updated_at  = now()
 WHERE key IN ('mobile', 'fileid');
