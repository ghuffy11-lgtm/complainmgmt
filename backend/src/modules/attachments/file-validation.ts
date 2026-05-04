import { fromBuffer as sniffFromBuffer } from 'file-type';

/**
 * Strip path components, control characters, and excessive length from a
 * client-supplied filename. NFC-normalised so equivalent unicode collapses
 * to the same bytes.
 *
 * Pure function. Always returns a non-empty string ("file" if everything
 * was stripped) so the DB NOT NULL is never violated.
 */
export function sanitizeFilename(input: string): string {
  // Drop any path component the client may have sent.
  const lastSlash = Math.max(input.lastIndexOf('/'), input.lastIndexOf('\\'));
  let base = lastSlash >= 0 ? input.slice(lastSlash + 1) : input;

  // Strip control characters (incl. NUL, DEL).
  // eslint-disable-next-line no-control-regex
  base = base.replace(/[\x00-\x1f\x7f]/g, '');

  // Normalise and trim.
  base = base.normalize('NFC').trim();

  // Cap length.
  if (base.length > 200) base = base.slice(0, 200);

  // A wholly stripped name → use a stable placeholder.
  return base.length > 0 ? base : 'file';
}

/**
 * Detect MIME from the bytes (server-trusted), not from the client header.
 *
 * Strategy:
 *   1. Try magic-byte sniffing via `file-type`.
 *   2. If that fails (no signature — common for plain text), fall back to a
 *      cheap UTF-8 heuristic.
 *   3. Otherwise return null and let the caller reject.
 */
export async function sniffMime(bytes: Buffer): Promise<string | null> {
  if (bytes.length === 0) return null;
  const sniffed = await sniffFromBuffer(bytes);
  if (sniffed?.mime) return sniffed.mime;
  return looksLikeUtf8Text(bytes) ? 'text/plain' : null;
}

/**
 * Cheap heuristic: no NULs, no control bytes outside whitespace, decodes as
 * strict UTF-8. Good enough to identify plain-text uploads that file-type
 * can't sniff (it has no magic bytes to match).
 */
export function looksLikeUtf8Text(bytes: Buffer): boolean {
  // Empty or contains a NUL → not text.
  if (bytes.length === 0) return false;
  for (const b of bytes) {
    if (b === 0) return false;
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) return false;
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check `mime` against an allow-list. Caller pulls the list from
 * system_settings.attachments.allowed_mime_types.
 */
export function isMimeAllowed(mime: string, allowList: readonly string[]): boolean {
  return allowList.includes(mime);
}
