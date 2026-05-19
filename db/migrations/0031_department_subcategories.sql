-- 0031 — Per-department sub-categories. Selected on complaint create
-- when the chosen department has ≥1 active sub-category.

INSERT INTO schema_migrations (filename) VALUES ('0031_department_subcategories.sql');

CREATE TABLE department_subcategories (
  id            BIGSERIAL PRIMARY KEY,
  department_id BIGINT      NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  key           TEXT        NOT NULL,
  name          TEXT        NOT NULL,
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (department_id, key)
);
CREATE INDEX idx_subcat_dept ON department_subcategories(department_id);
CREATE TRIGGER trg_subcat_updated_at
  BEFORE UPDATE ON department_subcategories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE complaints
  ADD COLUMN subcategory_id BIGINT REFERENCES department_subcategories(id);
CREATE INDEX idx_complaints_subcat ON complaints(subcategory_id);
