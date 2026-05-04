-- 0003 — Dynamic form: field definitions, options, per-complaint values.

INSERT INTO schema_migrations (filename) VALUES ('0003_dynamic_form.sql');

CREATE TABLE dynamic_fields (
  id          BIGSERIAL PRIMARY KEY,
  key         TEXT        NOT NULL UNIQUE,
  label       TEXT        NOT NULL,
  type        TEXT        NOT NULL CHECK (type IN ('text','number','date','dropdown','file')),
  is_required BOOLEAN     NOT NULL DEFAULT FALSE,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  validation  JSONB       NOT NULL DEFAULT '{}'::jsonb,
  visibility  JSONB       NOT NULL DEFAULT '{"roles":"*"}'::jsonb,
  locking     TEXT        NOT NULL DEFAULT 'none'
                          CHECK (locking IN ('none','first_writer_wins')),
  is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_dynamic_fields_updated_at
  BEFORE UPDATE ON dynamic_fields
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE dynamic_field_options (
  id          BIGSERIAL PRIMARY KEY,
  field_id    BIGINT NOT NULL REFERENCES dynamic_fields(id) ON DELETE CASCADE,
  value       TEXT   NOT NULL,
  label       TEXT   NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (field_id, value)
);

CREATE TABLE complaint_field_values (
  id              BIGSERIAL PRIMARY KEY,
  complaint_id    BIGINT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  field_id        BIGINT NOT NULL REFERENCES dynamic_fields(id),
  value_text      TEXT,
  value_number    NUMERIC,
  value_date      DATE,
  value_option_id BIGINT REFERENCES dynamic_field_options(id),
  owner_user_id   BIGINT REFERENCES users(id),
  locked_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (complaint_id, field_id),
  -- Exactly one value column populated (or all null = "unset"):
  CHECK (
    (CASE WHEN value_text      IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN value_number    IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN value_date      IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN value_option_id IS NOT NULL THEN 1 ELSE 0 END) <= 1
  )
);
CREATE TRIGGER trg_complaint_field_values_updated_at
  BEFORE UPDATE ON complaint_field_values
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_cfv_complaint     ON complaint_field_values (complaint_id);
CREATE INDEX idx_cfv_field         ON complaint_field_values (field_id);
CREATE INDEX idx_cfv_owner         ON complaint_field_values (owner_user_id) WHERE owner_user_id IS NOT NULL;

-- Enforce that the populated value column matches the field's declared type.
CREATE OR REPLACE FUNCTION enforce_cfv_type_match()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  ftype TEXT;
BEGIN
  SELECT type INTO ftype FROM dynamic_fields WHERE id = NEW.field_id;
  IF ftype IS NULL THEN
    RAISE EXCEPTION 'unknown field_id %', NEW.field_id;
  END IF;
  IF ftype = 'text'     AND (NEW.value_number IS NOT NULL OR NEW.value_date IS NOT NULL OR NEW.value_option_id IS NOT NULL) THEN
    RAISE EXCEPTION 'text field expects value_text only';
  ELSIF ftype = 'number' AND (NEW.value_text IS NOT NULL OR NEW.value_date IS NOT NULL OR NEW.value_option_id IS NOT NULL) THEN
    RAISE EXCEPTION 'number field expects value_number only';
  ELSIF ftype = 'date'   AND (NEW.value_text IS NOT NULL OR NEW.value_number IS NOT NULL OR NEW.value_option_id IS NOT NULL) THEN
    RAISE EXCEPTION 'date field expects value_date only';
  ELSIF ftype = 'dropdown' AND (NEW.value_text IS NOT NULL OR NEW.value_number IS NOT NULL OR NEW.value_date IS NOT NULL) THEN
    RAISE EXCEPTION 'dropdown field expects value_option_id only';
  ELSIF ftype = 'file' THEN
    -- file fields hold no scalar value; the attachment is the data
    IF NEW.value_text IS NOT NULL OR NEW.value_number IS NOT NULL OR NEW.value_date IS NOT NULL OR NEW.value_option_id IS NOT NULL THEN
      RAISE EXCEPTION 'file field expects no scalar value';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_cfv_type_match
  BEFORE INSERT OR UPDATE ON complaint_field_values
  FOR EACH ROW EXECUTE FUNCTION enforce_cfv_type_match();
