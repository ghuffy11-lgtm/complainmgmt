import { ButtonHTMLAttributes, forwardRef, useState } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  /** Optional leading icon (typically from `./Icons`). */
  icon?: React.ReactNode;
};

/**
 * Single button primitive. Variants share the size grid; hover / active /
 * focus / disabled states are handled here so call-sites don't drift on
 * look-and-feel.
 */
export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', style, disabled, icon, children, ...rest },
  ref,
) {
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);

  const merged: React.CSSProperties = {
    ...sizeStyle(size),
    ...variantStyle(variant, hovered, active),
    ...(disabled ? { opacity: 0.5, pointerEvents: 'none' } : {}),
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    fontWeight: 500,
    fontSize: size === 'sm' ? 13 : 14,
    lineHeight: 1,
    border: '1px solid transparent',
    borderRadius: 'var(--radius)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    transition:
      'background-color 120ms ease, border-color 120ms ease, color 120ms ease, ' +
      'transform 80ms ease, box-shadow 120ms ease',
    transform: active && !disabled ? 'translateY(1px)' : 'none',
    userSelect: 'none',
    ...style,
  };

  return (
    <button
      ref={ref}
      {...rest}
      disabled={disabled}
      style={merged}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
    >
      {icon && <span style={{ display: 'inline-flex' }}>{icon}</span>}
      {children}
    </button>
  );
});

function sizeStyle(size: Size): React.CSSProperties {
  return size === 'sm'
    ? { padding: '5px 10px' }
    : { padding: '8px 14px' };
}

function variantStyle(v: Variant, hovered: boolean, active: boolean): React.CSSProperties {
  switch (v) {
    case 'primary':
      return {
        background:
          active  ? 'var(--primary-active)' :
          hovered ? 'var(--primary-hover)'  :
                    'var(--primary)',
        color: 'var(--text-on-primary)',
        borderColor: 'var(--primary)',
        boxShadow: hovered && !active ? '0 1px 2px rgba(15,23,42,0.15)' : 'none',
      };
    case 'danger':
      return {
        background: hovered ? 'var(--danger-hover)' : 'var(--danger)',
        color: 'var(--text-on-primary)',
        borderColor: 'var(--danger)',
      };
    case 'secondary':
      return {
        background: hovered ? 'var(--surface-hover)' : 'var(--surface)',
        color: 'var(--text)',
        borderColor: 'var(--border-strong)',
      };
    case 'ghost':
      return {
        background: hovered ? 'var(--surface-hover)' : 'transparent',
        color: 'var(--text)',
        borderColor: 'transparent',
      };
  }
}
