import * as React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type, label, error, hint, id, ...rest },
  ref,
) {
  const fallbackId = React.useId();
  const inputId = id ?? fallbackId;
  return (
    <div className="field">
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-medium text-text-main">
          {label}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        type={type}
        className={cn(
          'flex h-10 w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm',
          'placeholder:text-text-subtle disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-surface-2',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          error && 'border-danger focus-visible:ring-danger',
          className,
        )}
        {...rest}
      />
      {hint && !error && <p className="hint">{hint}</p>}
      {error && <p className="err">{error}</p>}
    </div>
  );
});
