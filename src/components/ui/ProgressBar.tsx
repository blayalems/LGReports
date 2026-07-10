import styles from './ProgressBar.module.css';

export interface ProgressBarProps {
  actual: number;
  goal: number;
  color?: string;
  height?: number;
  label?: string;
}

/** Goal/actual linear indicator — single hue (accent by default), always paired with visible actual/goal numbers by the caller. */
export function ProgressBar({ actual, goal, color = 'var(--accent)', height = 9, label }: ProgressBarProps) {
  const pct = goal > 0 ? Math.min(1, actual / goal) : 0;
  return (
    <div
      className={styles.track}
      style={{ ['--bar-h' as string]: `${height}px` }}
      role="img"
      aria-label={label ?? `${actual} of ${goal}, ${Math.round(pct * 100)}%`}
    >
      <div className={styles.fill} style={{ width: `${pct * 100}%`, background: color }} />
    </div>
  );
}
