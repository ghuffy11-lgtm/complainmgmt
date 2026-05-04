-- 0005 — Append-only audit log + assignment history.

INSERT INTO schema_migrations (filename) VALUES ('0005_audit_assignment_history.sql');

CREATE TABLE complaint_audit_log (
  id            BIGSERIAL PRIMARY KEY,
  complaint_id  BIGINT REFERENCES complaints(id) ON DELETE CASCADE,
  field_key     TEXT,                      -- nullable: settings/role audits use synthetic keys
  action        TEXT NOT NULL CHECK (action IN
                  ('create','update','delete','assign','lock_override',
                   'attachment.added','attachment.removed','password_reset_by_admin',
                   'role_permissions_changed','settings_changed')),
  old_value     JSONB,
  new_value     JSONB,
  actor_id      BIGINT REFERENCES users(id),
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note          TEXT
);
CREATE INDEX idx_audit_complaint   ON complaint_audit_log (complaint_id);
CREATE INDEX idx_audit_actor       ON complaint_audit_log (actor_id);
CREATE INDEX idx_audit_occurred    ON complaint_audit_log (occurred_at DESC);
CREATE INDEX idx_audit_field       ON complaint_audit_log (field_key);
CREATE INDEX idx_audit_action      ON complaint_audit_log (action);

-- Append-only enforcement: block UPDATE and DELETE at the table level.
-- (This protects against application bugs; bypassing it requires a superuser
--  privilege that the application role does not have.)
CREATE OR REPLACE FUNCTION block_audit_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'complaint_audit_log is append-only';
END;
$$;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE ON complaint_audit_log
  FOR EACH ROW EXECUTE FUNCTION block_audit_modification();
CREATE TRIGGER trg_audit_no_delete BEFORE DELETE ON complaint_audit_log
  FOR EACH ROW EXECUTE FUNCTION block_audit_modification();

-- ───────────────────────────────────────────────────────────────────────────
-- Assignment history
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE complaint_assignment_history (
  id                BIGSERIAL PRIMARY KEY,
  complaint_id      BIGINT NOT NULL REFERENCES complaints(id) ON DELETE CASCADE,
  old_assigned_to   BIGINT REFERENCES users(id),
  new_assigned_to   BIGINT REFERENCES users(id),
  old_department_id BIGINT REFERENCES departments(id),
  new_department_id BIGINT REFERENCES departments(id),
  changed_by        BIGINT NOT NULL REFERENCES users(id),
  changed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note              TEXT
);
CREATE INDEX idx_assignment_history_complaint ON complaint_assignment_history (complaint_id);
CREATE INDEX idx_assignment_history_changed_at ON complaint_assignment_history (changed_at DESC);
