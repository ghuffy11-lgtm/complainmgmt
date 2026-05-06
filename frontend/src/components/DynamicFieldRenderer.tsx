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
  error,
}: Props) {
  return (
    <div className="field">
      <label>
        {field.label}
        {field.isRequired && <span style={{ color: 'var(--danger)' }}> *</span>}
        {locked && (
          <span title={lockOwner ? `Locked — owner #${lockOwner}` : 'Locked'} style={{ marginLeft: 6 }}>
            🔒
          </span>
        )}
      </label>
      {renderInput(field, value, onChange, !!disabled || !!locked)}
      {error && <div className="err">{error}</div>}
    </div>
  );
}

function renderInput(field: DynamicField, value: unknown, onChange: (v: unknown) => void, disabled: boolean) {
  switch (field.type) {
    case 'text':
      return (
        <textarea
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={3}
        />
      );
    case 'number':
      return (
        <input
          type="number"
          value={value == null || value === '' ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          disabled={disabled}
        />
      );
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
