-- 0006 — System-wide tunable settings.

INSERT INTO schema_migrations (filename) VALUES ('0006_system_settings.sql');

CREATE TABLE system_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  BIGINT REFERENCES users(id)
);

INSERT INTO system_settings (key, value) VALUES
  ('complaint.reference_format',     '"CMP-{YYYY}-{seq:6}"'::jsonb),
  ('lockout.max_failed_logins',      '5'::jsonb),
  ('lockout.duration_minutes',       '15'::jsonb),
  ('password.min_length',            '10'::jsonb),
  ('attachments.allowed_mime_types', '["application/pdf","image/png","image/jpeg","image/webp","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","text/plain"]'::jsonb);
