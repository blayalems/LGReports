import styles from './FunnelChart.module.css';

export interface FunnelStage {
  label: string;
  count: number;
  dropLabel?: string;
}

export interface FunnelChartProps {
  title: string;
  stages: FunnelStage[];
}

/** Ordinal stages (order carries meaning) — one hue, monotone intensity, never a rainbow. */
export function FunnelChart({ title, stages }: FunnelChartProps) {
  const max = Math.max(1, ...stages.map((s) => s.count));
  const n = Math.max(1, stages.length - 1);
  const summary = `${title}: ${stages.map((s) => `${s.label} ${s.count}`).join(', then ')}`;

  return (
    <div role="img" aria-label={summary} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {stages.map((s, i) => {
        const pct = s.count / max;
        const intensity = 42 + (i / n) * 58; // ordinal ramp: earliest stage lightest, later stages fuller accent
        return (
          <div className={styles.row} key={i} aria-hidden="true">
            <div className={styles.top}>
              <span className={styles.name}>{s.label}</span>
              <span className={styles.count}>
                <strong>{s.count}</strong> {s.dropLabel ?? ''}
              </span>
            </div>
            <div className={styles.track}>
              <div
                className={styles.fill}
                style={{ width: `${Math.max(4, pct * 100)}%`, background: `color-mix(in oklab, var(--accent) ${intensity}%, var(--stroke2))` }}
              >
                <span className={styles.pctLabel}>{Math.round(pct * 100)}%</span>
              </div>
            </div>
          </div>
        );
      })}
      <details>
        <summary>View as table</summary>
        <table>
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Stage</th>
              <th scope="col">Count</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((s, i) => (
              <tr key={i}>
                <td>{s.label}</td>
                <td>{s.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
