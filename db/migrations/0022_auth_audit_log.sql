-- 0022 — Append-only audit log for authentication events.
--
-- Today the system has no record of who logged in, when, from which IP, or
-- who failed. The existing `complaint_audit_log` is complaint-scoped only.
-- This migration adds a dedicated table so:
--   * Login noise (success/failed/lockout) doesn't pollute complaint audits.
--   * Retention and access can differ (auth audits typically expire on a
--     365-day default; complaint audits are kept for the life of the row).
--   * IP / User-Agent are first-class columns, not stuffed in a JSON blob.
--
-- The table mirrors the append-only enforcement we apply to
-- complaint_audit_log (see 0005, 0009): BEFORE UPDATE/DELETE triggers at
-- the row level + REVOKE UPDATE/DELETE/TRUNCATE at the privilege level.
--
-- Column notes:
--   * `username`  — always recorded, even when the user does not exist
--                   (login.unknown_user). This is the input from the form.
--   * `user_id`   — resolved user, NULL for unknown_user. For admin-initiated
--                   events (account.unlocked_by_admin, 2fa.reset_by_admin)
--                   this is the *target* user; the acting admin is captured
--                   in detail->>'actor_id'.
--   * `event`     — discriminator. CHECK list catches typos; ALTER the
--                   constraint when adding future events.
--   * `ip`        — `inet` for native IPv4 + IPv6 + range queries.
--   * `detail`    — jsonb for event-specific extras (lockout reason,
--                   actor_id for admin actions, the failed-attempt count, …).

INSERT INTO schema_migrations (filename) VALUES ('0022_auth_audit_log.sql');

CREATE TABLE auth_audit_log (
  id           BIGSERIAL PRIMARY KEY,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  username     TEXT        NOT NULL,
  user_id      BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  event        TEXT        NOT NULL CHECK (event IN (
                 'login.success',
                 'login.password_failed',
                 'login.unknown_user',
                 'login.account_locked',
                 'login.inactive',
                 'login.wrong_provider',
                 'login.2fa_success',
                 'login.2fa_failed',
                 'account.locked',
                 'account.unlocked_by_admin',
                 '2fa.enrolled',
                 '2fa.disabled',
                 '2fa.reset_by_admin',
                 'logout',
                 'password_changed'
               )),
  ip           INET,
  user_agent   TEXT,
  detail       JSONB
);

CREATE INDEX idx_auth_audit_occurred ON auth_audit_log (occurred_at DESC);
CREATE INDEX idx_auth_audit_username ON auth_audit_log (username, occurred_at DESC);
CREATE INDEX idx_auth_audit_user     ON auth_audit_log (user_id, occurred_at DESC) WHERE user_id IS NOT NULL;
CREATE INDEX idx_auth_audit_ip       ON auth_audit_log (ip, occurred_at DESC) WHERE ip IS NOT NULL;
CREATE INDEX idx_auth_audit_event    ON auth_audit_log (event, occurred_at DESC);

-- Append-only enforcement at the row level. Same pattern as
-- complaint_audit_log (see 0005). Reuses the existing trigger function
-- if it has been created earlier; otherwise creates an auth-specific one.
CREATE OR REPLACE FUNCTION block_auth_audit_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'auth_audit_log is append-only';
END;
$$;

CREATE TRIGGER trg_auth_audit_no_update BEFORE UPDATE ON auth_audit_log
  FOR EACH ROW EXECUTE FUNCTION block_auth_audit_modification();
CREATE TRIGGER trg_auth_audit_no_delete BEFORE DELETE ON auth_audit_log
  FOR EACH ROW EXECUTE FUNCTION block_auth_audit_modification();

-- Privilege-level lockdown — same defence-in-depth as 0009 for
-- complaint_audit_log. The application role gets INSERT + SELECT only.
-- Retention cleanup runs as the table owner (a separate, scheduled
-- maintenance role in production) and is allowed to DELETE; in dev where
-- the application role *is* the owner, the REVOKE is harmless because
-- owners retain implicit privileges that can't be revoked.
REVOKE UPDATE, TRUNCATE ON TABLE auth_audit_log FROM PUBLIC;
GRANT  INSERT, SELECT   ON TABLE auth_audit_log TO   PUBLIC;
-- DELETE is intentionally NOT granted to PUBLIC. The retention job runs as
-- the table owner; see docs/04-deployment-guide.md (auth-audit retention).
