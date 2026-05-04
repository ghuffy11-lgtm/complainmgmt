-- 0009 — Defence-in-depth grants on complaint_audit_log.
--
-- The BEFORE UPDATE/DELETE triggers in 0005 already block modification at the
-- row level for ANY connection. This migration adds privilege-level enforcement
-- so a connection that disabled triggers (which itself requires owner rights)
-- still can't delete or modify rows unless it's the table owner.
--
-- Production setup (recommended; see docs/04-deployment-guide.md):
--   * The `complaint_audit_log` table is OWNED by a non-application role
--     (e.g. the postgres superuser).
--   * The application role is granted only INSERT, SELECT on this table.
--   * UPDATE, DELETE, TRUNCATE are never granted.
--
-- This migration sets up that grant pattern. In dev (where the docker init
-- runs as POSTGRES_USER, who also owns the table) the REVOKE is harmless —
-- the owner retains implicit privileges that can't be revoked, but the
-- triggers still block tampering. Treat this as a production-hardening
-- baseline, not a dev-time guarantee.

INSERT INTO schema_migrations (filename) VALUES ('0009_audit_lockdown.sql');

REVOKE UPDATE, DELETE, TRUNCATE ON TABLE complaint_audit_log FROM PUBLIC;
GRANT  INSERT, SELECT                ON TABLE complaint_audit_log TO   PUBLIC;
