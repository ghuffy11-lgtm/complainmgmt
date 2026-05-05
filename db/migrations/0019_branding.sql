-- 0019 — Branding: customisable copy + admin-uploaded logo.
--
-- Branding strings live in `system_settings` so the existing admin
-- settings editor can manage them; the logo bytes live in their own
-- single-row table because base64-stuffing a binary into jsonb is a
-- footgun. The frontend reads everything in one shot via a public
-- `/api/branding` endpoint (no auth — the login page needs it).
--
-- Idempotent on rerun.

INSERT INTO schema_migrations (filename) VALUES ('0019_branding.sql');

-- ─── 1. branding_assets — single-row store for the logo bytes ──────────
-- Keyed by `kind` so future asset slots (favicon, marketing banner, etc.)
-- can land here without a new table.
CREATE TABLE IF NOT EXISTS branding_assets (
  kind        TEXT PRIMARY KEY,
  mime        TEXT NOT NULL,
  bytes       BYTEA NOT NULL,
  size_bytes  INT  NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by  BIGINT REFERENCES users(id)
);

-- ─── 2. seed branding settings rows with current copy ──────────────────
-- These match what's currently hardcoded in the frontend so swapping the
-- source for the settings doesn't change the visible result on day 0.
INSERT INTO system_settings (key, value) VALUES
  ('branding.organization_name', '"Hadi Clinic"'),
  ('branding.system_name',       '"Complaint Tracking System"'),
  ('branding.system_short_name', '"CTS"'),
  ('branding.login_subtitle',    '"Quality & Patient Safety"'),
  ('branding.login_tagline',     '"Sign in to continue to the portal"'),
  ('branding.footer_text',       '"Internal use only · Access logged"')
ON CONFLICT (key) DO NOTHING;
