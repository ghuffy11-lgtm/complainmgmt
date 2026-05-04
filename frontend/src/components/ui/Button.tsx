import { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const styles: Record<Variant, React.CSSProperties> = {
  primary:   { background: 'var(--primary)', color: 'white', border: '1px solid var(--primary)' },
  secondary: { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border-strong)' },
  danger:    { background: 'var(--danger)', color: 'white', border: '1px solid var(--danger)' },
  ghost:     { background: 'transparent', color: 'var(--text)', border: '1px solid transparent' },
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant };

export function Button({ variant = 'primary', style, disabled, ...rest }: Props) {
  return (
    <button
      {...rest}
      disabled={disabled}
      style={{
        padding: '7px 14px',
        borderRadius: 'var(--radius)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        fontWeight: 500,
        ...styles[variant],
        ...style,
      }}
    />
  );
}
