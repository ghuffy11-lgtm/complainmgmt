/**
 * Single source of truth for client-side attachment policy. The server is
 * still authoritative (see `attachments.service.ts` + `system_settings`),
 * but doing the obvious checks before we ship bytes saves a round trip and
 * gives the user a precise message instead of a generic upload failure.
 */
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_FILES = 3;

export const ALLOWED_MIME = new Set<string>([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

/**
 * `accept` attribute for `<input type=file>`. Browsers use it as a *hint*
 * for the picker (greys out other types), not enforcement — the server
 * still has to do the heavy lifting via magic-byte sniffing.
 */
export const ACCEPT_ATTR = 'image/png,image/jpeg,image/webp,application/pdf';

export const ALLOWED_MIME_LABEL = 'images (PNG / JPEG / WEBP) and PDF';

/**
 * Pre-flight client-side validation. Returns null on success or a human
 * message on failure. The caller is responsible for deciding whether the
 * count cap is hit (existing-attachment count varies by context: detail
 * page vs. create-form queue).
 */
export function validateAttachmentFile(file: File, currentCount: number): string | null {
  if (currentCount >= MAX_FILES) {
    return `Maximum ${MAX_FILES} attachments per complaint.`;
  }
  if (file.size > MAX_BYTES) {
    return `"${file.name}" is too large (max 2 MB).`;
  }
  if (file.size === 0) {
    return `"${file.name}" is empty.`;
  }
  // Browsers can omit `type` for some sources (drag-drop from quirky apps);
  // when it's set, enforce it. When it isn't, we let the server have the
  // final say via magic-byte sniffing.
  if (file.type && !ALLOWED_MIME.has(file.type)) {
    return `"${file.name}" type ${file.type} is not allowed. Use ${ALLOWED_MIME_LABEL}.`;
  }
  return null;
}
