import { DynamicFieldEntity } from './entities/dynamic-field.entity';

/**
 * Validate + coerce a values payload against the live dynamic field schema.
 *
 * Pure function — no DB, no Nest. Both the controller and the (future)
 * frontend mirror are expected to call this.
 *
 * Inputs:
 *   values  — Record<fieldKey, raw> as supplied by the client
 *   schema  — currently-active fields with their options preloaded
 *   opts.allowPartial  — when true, a missing required field is NOT an error
 *                        (used by the update path; create requires the full set).
 *
 * Output: { ok, errors, coerced }. `coerced` only contains entries the caller
 * intends to write — unset/blank values appear as `{ kind: 'unset' }` so callers
 * can clear a previous value.
 */
export type CoercedValue =
  | { kind: 'unset' }
  | { kind: 'text'; value: string }
  | { kind: 'number'; value: number }
  | { kind: 'date'; value: string }   // ISO yyyy-mm-dd
  | { kind: 'dropdown'; optionId: string };

export type ValidationResult = {
  ok: boolean;
  errors: Record<string, string[]>;
  coerced: Record<string, CoercedValue>;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateValues(
  values: Record<string, unknown>,
  schema: DynamicFieldEntity[],
  opts: { allowPartial?: boolean } = {},
): ValidationResult {
  const errors: Record<string, string[]> = {};
  const coerced: Record<string, CoercedValue> = {};

  const activeByKey = new Map<string, DynamicFieldEntity>();
  for (const f of schema) if (f.isActive) activeByKey.set(f.key, f);

  // Reject keys the schema doesn't recognise.
  for (const key of Object.keys(values)) {
    if (!activeByKey.has(key)) (errors[key] ??= []).push('UNKNOWN_FIELD');
  }

  for (const field of activeByKey.values()) {
    if (opts.allowPartial && !(field.key in values)) continue;

    const raw = values[field.key];
    const isBlank =
      raw === undefined ||
      raw === null ||
      (typeof raw === 'string' && raw.trim() === '');

    if (isBlank) {
      if (field.isRequired && !opts.allowPartial) {
        (errors[field.key] ??= []).push('REQUIRED');
      }
      coerced[field.key] = { kind: 'unset' };
      continue;
    }

    switch (field.type) {
      case 'text':
        coerceText(field, raw, errors, coerced);
        break;
      case 'number':
        coerceNumber(field, raw, errors, coerced);
        break;
      case 'date':
        coerceDate(field, raw, errors, coerced);
        break;
      case 'dropdown':
        coerceDropdown(field, raw, errors, coerced);
        break;
      case 'file':
        // Attachments flow through their own endpoint; nothing to coerce here.
        break;
    }
  }

  return { ok: Object.keys(errors).length === 0, errors, coerced };
}

function coerceText(
  field: DynamicFieldEntity,
  raw: unknown,
  errors: Record<string, string[]>,
  coerced: Record<string, CoercedValue>,
) {
  const value = String(raw).trim();
  const v = field.validation as { maxLength?: number; regex?: string };
  if (typeof v.maxLength === 'number' && value.length > v.maxLength) {
    (errors[field.key] ??= []).push('TOO_LONG');
  }
  if (typeof v.regex === 'string' && v.regex.length > 0) {
    let re: RegExp | null = null;
    try { re = new RegExp(v.regex); } catch { re = null; }
    if (re && !re.test(value)) (errors[field.key] ??= []).push('PATTERN_MISMATCH');
  }
  coerced[field.key] = { kind: 'text', value };
}

function coerceNumber(
  field: DynamicFieldEntity,
  raw: unknown,
  errors: Record<string, string[]>,
  coerced: Record<string, CoercedValue>,
) {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) {
    (errors[field.key] ??= []).push('NOT_A_NUMBER');
    return;
  }
  const v = field.validation as { min?: number; max?: number };
  if (typeof v.min === 'number' && n < v.min) (errors[field.key] ??= []).push('TOO_SMALL');
  if (typeof v.max === 'number' && n > v.max) (errors[field.key] ??= []).push('TOO_LARGE');
  coerced[field.key] = { kind: 'number', value: n };
}

function coerceDate(
  field: DynamicFieldEntity,
  raw: unknown,
  errors: Record<string, string[]>,
  coerced: Record<string, CoercedValue>,
) {
  const s = String(raw);
  if (!ISO_DATE.test(s) || Number.isNaN(Date.parse(s))) {
    (errors[field.key] ??= []).push('NOT_A_DATE');
    return;
  }
  const v = field.validation as { min?: string; max?: string };
  if (typeof v.min === 'string' && s < v.min) (errors[field.key] ??= []).push('TOO_EARLY');
  if (typeof v.max === 'string' && s > v.max) (errors[field.key] ??= []).push('TOO_LATE');
  coerced[field.key] = { kind: 'date', value: s };
}

function coerceDropdown(
  field: DynamicFieldEntity,
  raw: unknown,
  errors: Record<string, string[]>,
  coerced: Record<string, CoercedValue>,
) {
  const id = String(raw);
  const opt = (field.options ?? []).find((o) => String(o.id) === id);
  if (!opt) {
    (errors[field.key] ??= []).push('INVALID_OPTION');
    return;
  }
  if (!opt.isActive) {
    (errors[field.key] ??= []).push('INACTIVE_OPTION');
    return;
  }
  coerced[field.key] = { kind: 'dropdown', optionId: id };
}
