/**
 * Render a complaint reference number from a template.
 *
 * Tokens:
 *   {YYYY}    — 4-digit year
 *   {MM}      — 2-digit month
 *   {seq}     — sequence with no padding
 *   {seq:N}   — sequence padded with leading zeros to width N
 *
 * Pure function. No I/O.
 */
export function formatReference(template: string, year: number, month: number, seq: number): string {
  return template
    .replace('{YYYY}', String(year))
    .replace('{MM}', String(month).padStart(2, '0'))
    .replace(/\{seq:(\d+)\}/g, (_m, n: string) => String(seq).padStart(parseInt(n, 10), '0'))
    .replace('{seq}', String(seq));
}
