import * as React from 'react';
import { cn } from '../../lib/utils';

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, label, error, hint, options, id, ...rest },
  ref,
) {
  const fallbackId = React.useId();
  const selectId = id ?? fallbackId;
  return (
    <div className="field">
      {label && (
        <label htmlFor={selectId} className="text-[13px] font-medium text-text-main">
          {label}
        </label>
      )}
      <select
        id={selectId}
        ref={ref}
        className={cn(
          'flex h-10 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm appearance-none',
          'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-2',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          error && 'border-danger focus-visible:ring-danger',
          className,
        )}
        {...rest}
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {hint && !error && <p className="hint">{hint}</p>}
      {error && <p className="err">{error}</p>}
    </div>
  );
});
