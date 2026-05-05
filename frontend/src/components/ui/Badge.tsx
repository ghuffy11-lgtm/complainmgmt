import * as React from 'react';
import { cn } from '../../lib/utils';

export type BadgeVariant = 'default' | 'primary' | 'warn' | 'danger' | 'success';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ className, variant = 'default', children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'badge',
        variant === 'primary' && 'badge-primary',
        variant === 'warn' && 'badge-warn',
        variant === 'danger' && 'badge-danger',
        variant === 'success' && 'badge-success',
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
