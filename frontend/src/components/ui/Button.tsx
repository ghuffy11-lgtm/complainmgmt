import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'sm' | 'md';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Render as the immediate child element (e.g. <a>) instead of <button>. */
  asChild?: boolean;
  /** Optional leading icon. Kept for backward compat with pre-port call-sites. */
  icon?: React.ReactNode;
  /** Render a spinner + disable the button while a network call is in flight. */
  isLoading?: boolean;
}

/**
 * Single button primitive. Variants share size + state grid so call-sites
 * stay consistent. Use `asChild` to project styles onto a non-button element
 * (e.g. router Link) without losing hover/focus.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', asChild = false, icon, isLoading, disabled, children, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp
      ref={ref}
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:pointer-events-none active:translate-y-[1px]',
        {
          'bg-primary text-white hover:bg-primary-hover shadow-sm': variant === 'primary',
          'bg-surface text-text-main border border-border-strong hover:bg-surface-hover shadow-sm': variant === 'secondary',
          'bg-danger text-white hover:bg-danger-hover shadow-sm': variant === 'danger',
          'bg-transparent text-text-main hover:bg-surface-hover': variant === 'ghost',
        },
        {
          'px-3 py-1.5 text-[13px]': size === 'sm',
          'px-4 py-2 text-[14px]': size === 'md',
        },
        className,
      )}
      {...rest}
    >
      {isLoading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden />
      ) : icon ? (
        <span className="inline-flex">{icon}</span>
      ) : null}
      {children}
    </Comp>
  );
});
