-- 0002 — Departments + complaints core table.

INSERT INTO schema_migrations (filename) VALUES ('0002_departments_complaints.sql');

CREATE TABLE departments (
  id          BIGSERIAL PRIMARY KEY,
  key         TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_departments_updated_at
  BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE complaints (
  id                       BIGSERIAL PRIMARY KEY,
  reference_no             TEXT NOT NULL UNIQUE,
  status                   TEXT NOT NULL DEFAULT 'open'
                                CHECK (status IN ('open','in_progress','resolved','closed','rejected')),
  priority                 TEXT NOT NULL DEFAULT 'normal'
                                CHECK (priority IN ('low','normal','high','critical')),
  created_by               BIGINT REFERENCES users(id),
  assigned_department_id   BIGINT REFERENCES departments(id),
  assigned_to              BIGINT REFERENCES users(id),
  assigned_by              BIGINT REFERENCES users(id),
  assigned_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_complaints_updated_at
  BEFORE UPDATE ON complaints
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_complaints_status         ON complaints (status);
CREATE INDEX idx_complaints_priority       ON complaints (priority);
CREATE INDEX idx_complaints_dept           ON complaints (assigned_department_id);
CREATE INDEX idx_complaints_assigned_to    ON complaints (assigned_to);
CREATE INDEX idx_complaints_created_at     ON complaints (created_at DESC);
