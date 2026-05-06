import { Unlock } from 'lucide-react';
import type { DynamicField } from '../types/api';
import { DateInput } from './ui/DateInput';
import { Select } from './ui/Select';

type Props = {
  field: DynamicField;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  locked?: boolean;
  lockOwner?: string | null;
  /** When true and `locked`, render an "Unlock" button next to the lock icon. */
  canUnlock?: boolean;
  onUnlock?: () => void;
  error?: string | null;
};

/**
 * Single renderer for the dynamic schema. Form pages do NOT branch on field
 * `key` — only on `type`. New fields added in admin show up here automatically.
 */
export function DynamicFieldRenderer({
  field,
  value,
  onChange,
  disabled,
  locked,
  lockOwner,
  canUnlock,
  onUnlock,
  error,
}: Props) {
  const inputDisabled = !!disabled || !!locked;
  const showUnlock = !!locked && !!canUnlock && !disabled;
  return (
    <div className="field">
      <label className="flex items-center gap-1.5">
        <span>{field.label}</span>
        {field.isRequired && <span style={{ color: 'var(--danger)' }}>*</span>}
        {locked && (
          <span title={lockOwner ? `Locked — owner #${lockOwner}` : 'Locked'}>🔒</span>
        )}
        {showUnlock && (
          <button
            type="button"
            onClick={onUnlock}
            title="Override the lock — recorded in audit."
            className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary-hover ml-1 px-1.5 py-0.5 rounded border border-border-strong bg-surface hover:bg-surface-hover"
          >
            <Unlock size={11} />
            Unlock
          </button>
        )}
      </label>
      {renderInput(field, value, onChange, inputDisabled, !!disabled)}
      {error && <div className="err">{error}</div>}
    </div>
  );
}

function renderInput(
  field: DynamicField,
  value: unknown,
  onChange: (v: unknown) => void,
  disabled: boolean,
  readOnly: boolean,
) {
  const validation = (field.validation ?? {}) as {
    maxLength?: number;
    digits?: number;
    maxDigits?: number;
    minDigits?: number;
    min?: number;
    max?: number;
  };
  switch (field.type) {
    case 'text': {
      // Read view: render as a paragraph block so long narratives display in
      // full, with line breaks preserved. Keeps the editable case in a
      // textarea (with admin-set maxLength when present).
      if (readOnly) {
        const v = (value as string) ?? '';
        return v ? (
          <div className="whitespace-pre-wrap break-words text-[14px] leading-6 text-text-main">{v}</div>
        ) : (
          <div className="text-[14px] text-text-muted">—</div>
        );
      }
      return (
        <textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={3}
          maxLength={typeof validation.maxLength === 'number' ? validation.maxLength : undefined}
        />
      );
    }
    case 'number': {
      // Live-enforce digit caps. A text input with inputMode=numeric supports
      // maxLength natively (type=number ignores it). Non-digits are stripped
      // on every change so paste also obeys the cap.
      const maxDigits = digitCap(validation);
      const display = value == null || value === '' ? '' : String(value);
      return (
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={display}
          maxLength={maxDigits}
          onChange={(e) => {
            const cleaned = e.target.value.replace(/\D+/g, '');
            const capped = maxDigits ? cleaned.slice(0, maxDigits) : cleaned;
            onChange(capped === '' ? null : Number(capped));
          }}
          disabled={disabled}
        />
      );
    }
    case 'date':
      return (
        <DateInput
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
        />
      );
    case 'dropdown':
      return (
        <Select
          placeholder="Select…"
          value={(value as string) ?? ''}
          onChange={(v) => onChange(v || null)}
          disabled={disabled}
          options={(field.options ?? [])
            .filter((o) => o.isActive)
            .map((o) => ({ value: o.id, label: o.label }))}
        />
      );
    case 'file':
      return <span className="muted">(uploads via the Attachments section)</span>;
    default:
      return null;
  }
}

/** Resolve the typing cap for a number field, falling back through the
 *  validation block options the admin guide documents. */
function digitCap(v: {
  digits?: number;
  maxDigits?: number;
  max?: number;
}): number | undefined {
  if (typeof v.digits === 'number' && v.digits > 0) return v.digits;
  if (typeof v.maxDigits === 'number' && v.maxDigits > 0) return v.maxDigits;
  if (typeof v.max === 'number' && v.max > 0) return String(Math.floor(v.max)).length;
  return undefined;
}
