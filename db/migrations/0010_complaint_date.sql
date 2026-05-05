-- 0010 — `complaint_date`: when the complaint actually happened.
--
-- This is the user-supplied event date, distinct from `complaints.created_at`
-- (which is when the row was inserted into CTS). Both are useful: created_at
-- is the audit/internal timestamp, complaint_date is the operational one.
--
-- Nullable because:
--   1) every row inserted before this migration must remain valid,
--   2) callers that don't know the date yet can leave it blank and fill in
--      later (the audit log captures the change).

INSERT INTO schema_migrations (filename) VALUES ('0010_complaint_date.sql');

ALTER TABLE complaints
  ADD COLUMN complaint_date DATE;

-- Partial index — callers filter by a date range when present; rows with NULL
-- never match the range so they don't need to be in the index.
CREATE INDEX idx_complaints_complaint_date
  ON complaints (complaint_date)
  WHERE complaint_date IS NOT NULL;
