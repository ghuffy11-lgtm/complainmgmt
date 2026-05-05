-- 0020 — Themeable primary color via system_settings.
--
-- Adds branding.primary_color, defaulted to the current editorial blue so
-- existing deployments look identical until an admin picks a different
-- theme. Hover / active / bg / border variants are derived in-app via HSL
-- math, so only one color is stored.
--
-- Idempotent on rerun.

INSERT INTO schema_migrations (filename) VALUES ('0020_branding_theme.sql');

INSERT INTO system_settings (key, value) VALUES
  ('branding.primary_color', '"#2563eb"')
ON CONFLICT (key) DO NOTHING;
