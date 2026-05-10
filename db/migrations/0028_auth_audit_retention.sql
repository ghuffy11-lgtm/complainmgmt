-- 0028 — Seed `auth_audit.retention_days` so it appears in the admin
--        Settings page and so the nightly retention job (T-406) has a
--        configured value rather than only an in-code default.
--
-- Default 365: a year of login history covers most audit needs without
-- letting `auth_audit_log` grow unbounded. Set to 0 to retain forever
-- (the cron skips deletion in that case).
--
-- The cleanup runs nightly at 03:00 UTC and DELETEs rows older than
-- the configured window. DELETE on `auth_audit_log` requires the table
-- owner role — the application role only has INSERT/SELECT (see 0022).
-- Operators running with the prod-style privilege split must either
-- (a) grant DELETE on this table to the app role, or (b) run the
-- cleanup as a separate maintenance job. See docs/04-deployment-guide.
--
-- Idempotent on rerun.

INSERT INTO schema_migrations (filename) VALUES ('0028_auth_audit_retention.sql');

INSERT INTO system_settings (key, value)
VALUES ('auth_audit.retention_days', '365'::jsonb)
ON CONFLICT (key) DO NOTHING;
