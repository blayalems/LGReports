import { useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import styles from './Dialog.module.css';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  variant?: 'center' | 'sheet';
  children: ReactNode;
  footer?: ReactNode;
  /** Extra content announced with the title, e.g. a running total chip. */
  headerExtra?: ReactNode;
}

/**
 * Accessible dialog primitive every modal in the app is built from: role="dialog",
 * aria-modal, labelled by its own title, focus moves in on open and traps Tab/Shift+Tab,
 * Escape closes, focus returns to the trigger on close, and it renders in a portal so
 * an ancestor's overflow/stacking context can't clip it (the "inaccessible dialogs" blocker).
 */
export function Dialog({ open, onClose, title, variant = 'center', children, footer, headerExtra }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useFocusTrap(panelRef, open, onClose);

  if (!open) return null;

  return createPortal(
    <div
      className={`${styles.backdrop} ${styles[variant]}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`${styles.panel} ${styles[variant]}`} role="dialog" aria-modal="true" aria-labelledby={titleId} ref={panelRef} tabIndex={-1}>
        <div className={styles.header} style={variant === 'sheet' ? { flexDirection: 'column', alignItems: 'stretch' } : undefined}>
          {variant === 'sheet' && <div className={styles.grabber} />}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div className={styles.title} id={titleId}>
              {title}
            </div>
            {headerExtra}
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close dialog">
              ✕
            </button>
          </div>
        </div>
        <div style={{ padding: '18px 24px' }}>{children}</div>
        {footer && <div style={{ padding: '15px 24px 20px', borderTop: '1px solid var(--stroke2)' }}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
