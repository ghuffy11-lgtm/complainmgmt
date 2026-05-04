import { ReactNode, useEffect } from 'react';
import { Button } from './Button';

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

export function Modal({ open, title, onClose, children, footer, wide }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'modal modal-wide' : 'modal'} role="dialog" aria-modal="true">
        <div className="modal-header">
          <h2>{title}</h2>
          <Button variant="ghost" onClick={onClose} aria-label="Close">✕</Button>
        </div>
        <div>{children}</div>
        {footer && <div className="row-end" style={{ marginTop: 16 }}>{footer}</div>}
      </div>
    </div>
  );
}
