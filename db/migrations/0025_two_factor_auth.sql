-- 0025 — TOTP-based two-factor authentication.
--
-- Adds the persistent state needed for RFC-6238 TOTP plus single-use
-- recovery codes. Code-side wiring lands in T-421..T-428.
--
-- Design notes:
--   * `totp_secret_enc` stores the base32 secret encrypted at rest with
--     AES-256-GCM (T-421). The encryption key lives in
--     TOTP_ENCRYPTION_KEY (env), not the DB — so a DB dump alone does
--     not give an attacker a working second factor.
--   * `totp_enrolled_at` doubles as the "is enrolled?" boolean. NULL =
--     not enrolled; non-NULL = enrolled, must present TOTP at login.
--   * `failed_2fa_count` mirrors `failed_login_count` so brute-forcing
--     the 6-digit code is rate-limited the same way passwords are. Both
--     counters share `locked_until` (set in T-444).
--   * `user_backup_codes` holds *hashed* recovery codes — never the
--     plaintext. Codes are shown once at enrollment (T-424) and that's
--     the user's only chance to save them. Each row tracks `used_at` so
--     a code is single-use; the `created_at` timestamp lets an admin
--     see when the current set was issued.
--
-- All additions are nullable / default-zero so the migration is safe
-- to apply to a populated table; existing users transparently remain
-- "not enrolled" until they opt in.
--
-- Idempotent on rerun: every column / table create is guarded.

INSERT INTO schema_migrations (filename) VALUES ('0025_two_factor_auth.sql');

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS totp_secret_enc    BYTEA,
  ADD COLUMN IF NOT EXISTS totp_enrolled_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_2fa_count   INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS user_backup_codes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT        NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_backup_codes_user
  ON user_backup_codes (user_id);

-- A user has at most one active backup-code set at any time. We don't
-- enforce that with a unique constraint (we'd need to factor in used_at)
-- but the service layer will treat "regenerate codes" as
-- DELETE + INSERT 10 within a transaction.
