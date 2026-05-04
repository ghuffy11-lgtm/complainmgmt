import { useEffect, useState } from 'react';
import { create } from 'zustand';

type ToastKind = 'info' | 'success' | 'error';
type Toast = { id: number; kind: ToastKind; message: string };

type ToastStore = {
  toasts: Toast[];
  push: (kind: ToastKind, message: string) => void;
  dismiss: (id: number) => void;
};

let nextId = 1;
const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (kind, message) => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, kind, message }] });
    setTimeout(() => get().dismiss(id), 4000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

/**
 * Convenience hook callers use to push toasts.
 *   const toast = useToast();
 *   toast.success('Saved'); toast.error('Failed'); toast.info('…');
 */
export function useToast() {
  const push = useToastStore((s) => s.push);
  return {
    info:    (m: string) => push('info', m),
    success: (m: string) => push('success', m),
    error:   (m: string) => push('error', m),
  };
}

/** Mounted once near the app root; renders the queue. */
export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} onClick={() => dismiss(t.id)}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

/** Best-effort error → message mapper for axios errors. */
export function errorMessage(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as { response?: { data?: { error?: string; code?: string; details?: unknown } } };
  const data = e?.response?.data;
  if (!data) return fallback;
  if (data.code) return `${data.error ?? 'Error'} (${data.code})`;
  if (data.error) return data.error;
  return fallback;
}
