-- 0012 — Narrow the attachment allow-list to image + PDF only.
--
-- Rationale: complaint attachments are evidence (photos, scanned letters,
-- PDFs of correspondence). Word/Excel/text uploads were a holdover from the
-- generic Phase-1 allow-list. The viewer (Batch D, T-231) only renders
-- images and PDFs inline; restricting the upload allow-list to match keeps
-- the flow consistent and removes the "click → forced download" surprise
-- for content the UI couldn't show.
--
-- Operators can still loosen the policy via Admin → Settings → edit
-- `attachments.allowed_mime_types` if their use case requires it. This
-- migration only changes the default — it isn't a hardcoded ceiling.
--
-- Idempotent: re-running sets the same value.

INSERT INTO schema_migrations (filename) VALUES ('0012_attachments_image_pdf_only.sql');

UPDATE system_settings
   SET value = '["application/pdf","image/png","image/jpeg","image/webp"]'::jsonb,
       updated_at = NOW()
 WHERE key = 'attachments.allowed_mime_types';
