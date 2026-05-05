import * as React from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button } from './Button';
import { cn } from '../../lib/utils';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}

export function Modal({ open, title, onClose, children, footer, wide }: ModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="backdrop"
            onMouseDown={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: '-46%', x: '-50%' }}
            animate={{ opacity: 1, scale: 1, y: '-50%', x: '-50%' }}
            exit={{ opacity: 0, scale: 0.96, y: '-46%', x: '-50%' }}
            transition={{ duration: 0.18 }}
            role="dialog"
            aria-modal="true"
            className={cn('modal', wide && 'modal-wide')}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h2 className="text-lg font-semibold text-text-main">{title}</h2>
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close" className="p-1">
                <X size={18} />
              </Button>
            </div>
            <div className="py-2">{children}</div>
            {footer && (
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
                {footer}
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
