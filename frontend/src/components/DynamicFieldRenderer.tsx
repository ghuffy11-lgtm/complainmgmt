import type { DynamicField } from '../types/api';

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
        <input
          type="date"
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
        />
      );
    case 'dropdown':
      return (
        <select
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
        >
          <option value="">— select —</option>
          {(field.options ?? [])
            .filter((o) => o.isActive)
            .map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
        </select>
      );
    case 'file':
      return <span className="muted">(uploads via the Attachments section)</span>;
    default:
      return null;
  }
}
