import { DynamicFieldEntity } from './entities/dynamic-field.entity';
import { validateValues } from './validate-values';

function field(over: Partial<DynamicFieldEntity>): DynamicFieldEntity {
  return {
    id: '1',
    key: 'k',
    label: 'L',
    type: 'text',
    isRequired: false,
    isActive: true,
    sortOrder: 0,
    validation: {},
    visibility: { roles: '*' },
    locking: 'none',
    isSystem: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    options: [],
    ...over,
  } as DynamicFieldEntity;
}

describe('validateValues', () => {
  it('accepts a complete valid payload', () => {
    const schema = [
      field({ key: 'note', type: 'text', isRequired: true }),
      field({ id: '2', key: 'cost', type: 'number', validation: { min: 0, max: 1_000 } }),
    ];
    const r = validateValues({ note: ' hello ', cost: '500' }, schema);
    expect(r.ok).toBe(true);
    expect(r.coerced.note).toEqual({ kind: 'text', value: 'hello' });
    expect(r.coerced.cost).toEqual({ kind: 'number', value: 500 });
  });

  it('flags missing required fields on create, allows them on partial update', () => {
    const schema = [field({ key: 'note', type: 'text', isRequired: true })];
    expect(validateValues({}, schema).errors.note).toEqual(['REQUIRED']);
    expect(validateValues({}, schema, { allowPartial: true }).ok).toBe(true);
  });

  it('treats whitespace-only text as blank', () => {
    const schema = [field({ key: 'note', type: 'text', isRequired: true })];
    expect(validateValues({ note: '   ' }, schema).errors.note).toEqual(['REQUIRED']);
  });

  it('rejects unknown keys (preventing schema-skew silent writes)', () => {
    const schema = [field({ key: 'note' })];
    const r = validateValues({ note: 'ok', stowaway: 'x' }, schema);
    expect(r.ok).toBe(false);
    expect(r.errors.stowaway).toEqual(['UNKNOWN_FIELD']);
  });

  it('skips inactive fields entirely', () => {
    const schema = [field({ key: 'note', isActive: false, isRequired: true })];
    const r = validateValues({}, schema);
    expect(r.ok).toBe(true);
  });

  it('text: enforces maxLength and regex', () => {
    const schema = [
      field({ key: 't', type: 'text', validation: { maxLength: 3, regex: '^[a-z]+$' } }),
    ];
    const r = validateValues({ t: 'ABCD' }, schema);
    expect(r.errors.t).toEqual(expect.arrayContaining(['TOO_LONG', 'PATTERN_MISMATCH']));
  });

  it('number: rejects non-numeric, enforces min/max', () => {
    const schema = [field({ key: 'n', type: 'number', validation: { min: 10, max: 20 } })];
    expect(validateValues({ n: 'abc' }, schema).errors.n).toEqual(['NOT_A_NUMBER']);
    expect(validateValues({ n: 5 }, schema).errors.n).toEqual(['TOO_SMALL']);
    expect(validateValues({ n: 25 }, schema).errors.n).toEqual(['TOO_LARGE']);
    expect(validateValues({ n: 15 }, schema).ok).toBe(true);
  });

  it('number: digits validator enforces exact digit count', () => {
    const schema = [field({ key: 'mob', type: 'number', validation: { digits: 8 } })];
    expect(validateValues({ mob: 1234567 }, schema).errors.mob).toEqual(['WRONG_DIGIT_COUNT']);
    expect(validateValues({ mob: 123456789 }, schema).errors.mob).toEqual(['WRONG_DIGIT_COUNT']);
    expect(validateValues({ mob: 55512345 }, schema).ok).toBe(true);
  });

  it('number: minDigits / maxDigits enforce a range', () => {
    const schema = [field({ key: 'n', type: 'number', validation: { minDigits: 7, maxDigits: 10 } })];
    expect(validateValues({ n: 123456 }, schema).errors.n).toEqual(['TOO_FEW_DIGITS']);
    expect(validateValues({ n: 12345678901 }, schema).errors.n).toEqual(['TOO_MANY_DIGITS']);
    expect(validateValues({ n: 1234567 }, schema).ok).toBe(true);
    expect(validateValues({ n: 1234567890 }, schema).ok).toBe(true);
  });

  it('number: digit-count counts magnitude (sign and decimals stripped)', () => {
    const schema = [field({ key: 'n', type: 'number', validation: { digits: 3 } })];
    expect(validateValues({ n: -123 }, schema).ok).toBe(true);
    expect(validateValues({ n: 123.45 }, schema).ok).toBe(true);
  });

  it('date: requires ISO yyyy-mm-dd, enforces min/max', () => {
    const schema = [field({ key: 'd', type: 'date', validation: { min: '2026-01-01', max: '2026-12-31' } })];
    expect(validateValues({ d: '15-04-2026' }, schema).errors.d).toEqual(['NOT_A_DATE']);
    expect(validateValues({ d: '2025-12-31' }, schema).errors.d).toEqual(['TOO_EARLY']);
    expect(validateValues({ d: '2027-01-01' }, schema).errors.d).toEqual(['TOO_LATE']);
    expect(validateValues({ d: '2026-04-15' }, schema).ok).toBe(true);
  });

  it('dropdown: rejects unknown ids and inactive options', () => {
    const schema = [
      field({
        key: 'pri',
        type: 'dropdown',
        options: [
          { id: '1', value: 'low', label: 'Low', isActive: true } as never,
          { id: '2', value: 'archived', label: 'Archived', isActive: false } as never,
        ],
      }),
    ];
    expect(validateValues({ pri: '999' }, schema).errors.pri).toEqual(['INVALID_OPTION']);
    expect(validateValues({ pri: '2' }, schema).errors.pri).toEqual(['INACTIVE_OPTION']);
    expect(validateValues({ pri: '1' }, schema).ok).toBe(true);
  });

  it('emits {kind:"unset"} for blank values so callers can clear them', () => {
    const schema = [field({ key: 'note', type: 'text' })];
    const r = validateValues({ note: '' }, schema, { allowPartial: true });
    expect(r.ok).toBe(true);
    expect(r.coerced.note).toEqual({ kind: 'unset' });
  });
});
