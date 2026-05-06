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
  function DateInput({ className, onClick, onMouseDown, onFocus, ...rest }, ref) {
    // Open the calendar from any user gesture that lands on this field.
    // Doing this from onMouseDown (instead of onClick) catches the case
    // where the click target is the small icon vs. the rest of the input
    // and prevents the default behaviour where Chrome only opens on the
    // icon. We don't make the input readOnly — Chrome refuses to open
    // showPicker() on readOnly inputs in some versions, which is what
    // killed the picker in v1.2.x.
    const triggerPicker = (el: HTMLInputElement | null) => {
      const withPicker = el as (HTMLInputElement & { showPicker?: () => void }) | null;
      try {
        withPicker?.showPicker?.();
      } catch {
        // Some browsers throw when called outside a user gesture; ignore
        // — the native picker behaviour is the fallback.
      }
    };
    return (
      <input
        ref={ref}
        type="date"
        onMouseDown={(e) => {
          // Prevent the focus that would otherwise place a caret in the
          // input; we want the picker, not the caret.
          e.preventDefault();
          triggerPicker(e.currentTarget);
          onMouseDown?.(e);
        }}
        onClick={(e) => {
          triggerPicker(e.currentTarget);
          onClick?.(e);
        }}
        onFocus={(e) => {
          // Keyboard-tab focus: hit Space/Enter on the input opens it,
          // but we also want it to be obvious — leave native handling
          // here. (No picker call on focus to avoid double-open.)
          onFocus?.(e);
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
