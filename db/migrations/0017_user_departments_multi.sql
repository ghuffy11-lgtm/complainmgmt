-- 0017 — Multi-department user membership.
--
-- Today a user has a single `users.department_id`. That fits "home
-- department" but breaks when a supervisor covers Reception + Nursing or
-- an employee floats between departments.
--
-- This migration introduces a join table (`user_departments`) so a user
-- can belong to N departments. We keep `users.department_id` as a
-- *primary* marker (defaults form pickers, marks "their main department"
-- in the UI) — it's expected to be one of the user's active memberships.
-- A trigger keeps the invariant honest.
--
-- Membership rows carry `is_active` so admins can revoke access without
-- losing the historical record (matches how we deactivate users
-- themselves rather than deleting them).
--
-- Idempotent on rerun.

INSERT INTO schema_migrations (filename) VALUES ('0017_user_departments_multi.sql');

-- ─── 1. join table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_departments (
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_user_departments_user_active
  ON user_departments (user_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_user_departments_dept_active
  ON user_departments (department_id) WHERE is_active = TRUE;

-- ─── 2. backfill from existing users.department_id ─────────────────────
-- One row per (user, primary_dept) for every user that has one. Skipped
-- silently if the row already exists (rerun safety).
INSERT INTO user_departments (user_id, department_id, is_active)
  SELECT id, department_id, TRUE FROM users WHERE department_id IS NOT NULL
ON CONFLICT (user_id, department_id) DO NOTHING;

-- ─── 3. trigger: primary department must be one of the active memberships
--      Skipped when department_id is NULL (legacy admins span depts).
CREATE OR REPLACE FUNCTION users_primary_dept_must_be_member()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.department_id IS NULL THEN RETURN NEW; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM user_departments
     WHERE user_id = NEW.id
       AND department_id = NEW.department_id
       AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'PRIMARY_DEPT_NOT_MEMBER: user % must be an active member of department %',
      NEW.id, NEW.department_id;
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_users_primary_dept_must_be_member ON users;
CREATE TRIGGER trg_users_primary_dept_must_be_member
  BEFORE INSERT OR UPDATE OF department_id ON users
  FOR EACH ROW
  EXECUTE FUNCTION users_primary_dept_must_be_member();
