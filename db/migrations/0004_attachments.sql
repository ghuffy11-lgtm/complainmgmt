-- 0004 — Attachments stored in the database (BYTEA), with size + count caps.

INSERT INTO schema_migrations (filename) VALUES ('0004_attachments.sql');

CREATE TABLE complaint_attachments (
  id            BIGSERIAL PRIMARY KEY,
  complaint_id  BIGINT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  filename      TEXT   NOT NULL,
  mime_type     TEXT   NOT NULL,
  byte_size     INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 2097152),
  content       BYTEA  NOT NULL,
  sha256        BYTEA  NOT NULL CHECK (octet_length(sha256) = 32),
  uploaded_by   BIGINT NOT NULL REFERENCES users(id),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_attachments_complaint ON complaint_attachments (complaint_id);

-- ≤ 3 attachments per complaint, enforced by trigger.
CREATE OR REPLACE FUNCTION enforce_attachment_count_cap()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM complaint_attachments WHERE complaint_id = NEW.complaint_id;
  IF n >= 3 THEN
    RAISE EXCEPTION 'attachment count cap exceeded for complaint %', NEW.complaint_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_attachment_count_cap
  BEFORE INSERT ON complaint_attachments
  FOR EACH ROW EXECUTE FUNCTION enforce_attachment_count_cap();
