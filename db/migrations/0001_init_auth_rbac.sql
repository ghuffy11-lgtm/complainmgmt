-- 0001 — Extensions, base utilities, auth & RBAC tables.
-- Source of truth for schema. Never edit a shipped migration; add a new one.

CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()

-- ───────────────────────────────────────────────────────────────────────────
-- updated_at trigger helper
-- ───────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- schema_migrations — manual log for ops once init-script flow is replaced
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE schema_migrations (
  filename     TEXT PRIMARY KEY,
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO schema_migrations (filename) VALUES ('0001_init_auth_rbac.sql');

-- ───────────────────────────────────────────────────────────────────────────
-- users
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE users (
  id                  BIGSERIAL PRIMARY KEY,
  username            CITEXT      NOT NULL UNIQUE,
  email               CITEXT      UNIQUE,
  display_name        TEXT        NOT NULL,
  password_hash       TEXT        NOT NULL,
  auth_provider       TEXT        NOT NULL DEFAULT 'local'
                                  CHECK (auth_provider IN ('local','ldap')),
  is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
  last_login_at       TIMESTAMPTZ,
  failed_login_count  INTEGER     NOT NULL DEFAULT 0,
  locked_until        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(password_hash) > 0),
  CHECK (length(display_name) > 0)
);
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- roles, permissions, user_roles, role_permissions
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE roles (
  id          BIGSERIAL PRIMARY KEY,
  key         TEXT        NOT NULL UNIQUE,
  name        TEXT        NOT NULL,
  description TEXT,
  is_system   BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE permissions (
  id          BIGSERIAL PRIMARY KEY,
  resource    TEXT NOT NULL,
  action      TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (resource, action)
);

CREATE TABLE user_roles (
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by BIGINT REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE role_permissions (
  role_id       BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ───────────────────────────────────────────────────────────────────────────
-- auth_refresh_tokens — DB-backed rotating refresh tokens
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE auth_refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT   NOT NULL UNIQUE,
  issued_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  replaced_by UUID REFERENCES auth_refresh_tokens(id),
  user_agent  TEXT,
  ip          INET
);
CREATE INDEX idx_auth_refresh_tokens_user_active
  ON auth_refresh_tokens (user_id) WHERE revoked_at IS NULL;
