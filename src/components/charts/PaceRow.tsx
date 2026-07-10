import styles from './PaceRow.module.css';

export type PaceState = 'ahead' | 'on-track' | 'behind';

export interface PaceRowProps {
  label: string;
  actualPct: number; // 0..1
  expectedPct: number; // 0..1, "where you should be by today"
  state: PaceState;
}

const STATE_META: Record<PaceState, { text: string; color: string; icon: string }> = {
  ahead: { text: 'Ahead of pace', color: 'var(--good)', icon: '▲' },
  'on-track': { text: 'On track', color: 'var(--text2)', icon: '●' },
  behind: { text: 'Behind pace', color: 'var(--bad)', icon: '▼' },
};

/** Status color used only for the ahead/on-track/behind state — never as series identity — always icon + label. */
export function PaceRow({ label, actualPct, expectedPct, state }: PaceRowProps) {
  const meta = STATE_META[state];
  return (
    <div className={styles.row}>
      <div className={styles.top}>
        <span className={styles.name}>{label}</span>
        <span className={styles.state} style={{ color: meta.color }}>
          <span aria-hidden="true">{meta.icon}</span> {meta.text}
        </span>
      </div>
      <div
        className={styles.track}
        role="img"
        aria-label={`${label}: ${Math.round(actualPct * 100)}% actual against ${Math.round(expectedPct * 100)}% expected by today — ${meta.text}`}
      >
        <div className={styles.fill} style={{ width: `${actualPct * 100}%`, background: 'var(--accent)' }} aria-hidden="true" />
        <div className={styles.marker} style={{ left: `${expectedPct * 100}%` }} title="Where you should be by today" aria-hidden="true" />
      </div>
    </div>
  );
}
