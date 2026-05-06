import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Native `<input type="date">` with the picker triggered by clicking
 * anywhere on the field — not just the small calendar icon. The native
 * behaviour is browser-dependent and frustrating; `showPicker()` (Chrome
 * 99+, Firefox 101+, Safari 16+) lets us force it programmatically.
 *
 * Falls back gracefully on older browsers — the click does nothing
 * special and users get the original behaviour.
 */
export type DateInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type'
>;

export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  function DateInput({ className, onClick, readOnly, ...rest }, ref) {
    return (
      <input
        ref={ref}
        type="date"
        // `readOnly` keeps the keyboard from popping up + prevents the
        // partial-edit case where the user types "20" and walks away.
        // showPicker() is the only way to set the value.
        readOnly={readOnly ?? true}
        onClick={(e) => {
          // Open the native calendar overlay on any click in the field.
          // Older browsers without showPicker() get the default behaviour.
          (e.currentTarget as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
          onClick?.(e);
        }}
        className={cn(
          'h-10 w-full bg-surface border border-border-strong rounded-md px-3 text-sm cursor-pointer',
          'focus:outline-none focus:ring-2 focus:ring-primary',
          'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-50',
          className,
        )}
        {...rest}
      />
    );
  },
);
