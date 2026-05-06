import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Convert a machine value (snake_case enum, dotted action key, etc.) into
 * a sentence-case display label: replaces `_` and `.` with spaces and
 * capitalises only the first letter. e.g.
 *   'open'                  → 'Open'
 *   'in_progress'           → 'In progress'
 *   'attachment.added'      → 'Attachment added'
 *   'role_permissions_changed' → 'Role permissions changed'
 *
 * Display-only — never feed the result back into the API. Use the
 * original machine value as the underlying option key.
 */
export function titleize(s: string | null | undefined): string {
  if (!s) return '';
  const cleaned = s.replace(/[_.]/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
}
