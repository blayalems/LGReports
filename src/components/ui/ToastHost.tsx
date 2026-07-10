import { useEffect, useRef, useState } from 'react';
import { subscribeToast, type ToastKind } from '../../hooks/useToast';

const BG: Record<ToastKind, string> = {
  success: 'var(--good)',
  error: 'var(--bad)',
  info: '#28564c',
};

/** Mount exactly once (in AppShell). Purely visual — the accompanying screen-reader announcement fires separately via useToast. */
export function ToastHost() {
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(
    () =>
      subscribeToast((message, kind) => {
        setToast({ message, kind });
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setToast(null), 2600);
      }),
    [],
  );

  if (!toast) return null;

  return (
    <div
      style={{ position: 'fixed', bottom: 88, left: '50%', transform: 'translateX(-50%)', zIndex: 90, animation: 'toastIn .3s cubic-bezier(.2,.8,.2,1)' }}
      aria-hidden="true"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          background: BG[toast.kind],
          color: '#fff',
          padding: '13px 22px',
          borderRadius: 100,
          boxShadow: '0 14px 38px rgba(0,0,0,0.3)',
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        {toast.message}
      </div>
    </div>
  );
}
