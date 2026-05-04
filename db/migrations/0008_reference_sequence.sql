-- 0008 — Year-scoped sequence for complaint reference numbers.
-- One row per year. Atomic increment via INSERT ... ON CONFLICT DO UPDATE.
-- Living inside the same transaction as the complaint INSERT means a rolled-back
-- creation also rolls back the sequence, so we don't waste numbers.

INSERT INTO schema_migrations (filename) VALUES ('0008_reference_sequence.sql');

CREATE TABLE complaint_reference_sequence (
  year     INTEGER PRIMARY KEY,
  next_seq INTEGER NOT NULL DEFAULT 1
);
