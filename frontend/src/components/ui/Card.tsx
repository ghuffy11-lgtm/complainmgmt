import * as React from 'react';
import { cn } from '../../lib/utils';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  subtitle?: string;
  headerAction?: React.ReactNode;
}

/**
 * Surface container with consistent border + shadow + padding. The
 * `title` / `subtitle` / `headerAction` triplet renders a header strip
 * above `children` with the standard typography. Override `className` to
 * swap padding (e.g. `p-0` for tables-in-cards).
 */
export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { className, title, subtitle, headerAction, children, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={cn('card', className)} {...rest}>
      {(title || subtitle || headerAction) && (
        <div className="flex items-center justify-between mb-4">
          <div>
            {title && <h3 className="font-semibold text-text-main tracking-tight m-0">{title}</h3>}
            {subtitle && <p className="text-xs text-text-muted mt-0.5">{subtitle}</p>}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      {children}
    </div>
  );
});
