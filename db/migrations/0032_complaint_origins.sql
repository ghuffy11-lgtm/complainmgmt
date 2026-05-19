-- 0032 — Complaint origins (channel the complaint arrived through).
-- Flat list, admin-managed. Seeded with the three operator-requested
-- starters; admin may add more via the new admin page.

INSERT INTO schema_migrations (filename) VALUES ('0032_complaint_origins.sql');

CREATE TABLE complaint_origins (
  id          BIGSERIAL PRIMARY KEY,
  key         TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_origins_updated_at
  BEFORE UPDATE ON complaint_origins
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO complaint_origins (key, name, sort_order) VALUES
  ('social_media',   'Social media',   10),
  ('verbal',         'Verbal',         20),
  ('suggestion_box', 'Suggestion box', 30);

ALTER TABLE complaints
  ADD COLUMN origin_id BIGINT REFERENCES complaint_origins(id);
CREATE INDEX idx_complaints_origin ON complaints(origin_id);
