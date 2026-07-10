import styles from './CycleCompareChart.module.css';

export interface CycleSeries {
  cycleName: string;
  values: number[];
}

export interface CycleCompareChartProps {
  title: string;
  stageLabels: string[];
  /** Oldest first, most recent last — order is chronological (ordinal), not arbitrary. */
  series: CycleSeries[];
}

function intensityFor(index: number, total: number): string {
  const pct = total <= 1 ? 100 : 42 + (index / (total - 1)) * 58;
  return `color-mix(in oklab, var(--accent) ${pct}%, var(--stroke2))`;
}

/** Cycle-over-cycle: chronological order carries meaning, so this is an ordinal ramp (one hue), not nominal categorical. */
export function CycleCompareChart({ title, stageLabels, series }: CycleCompareChartProps) {
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const summary = `${title}: ${stageLabels.map((label, si) => `${label} — ${series.map((s) => `${s.cycleName} ${s.values[si] ?? 0}`).join(', ')}`).join('; ')}`;

  return (
    <div>
      <div className={styles.scroll}>
        <div className={styles.wrap} role="img" aria-label={summary}>
          {stageLabels.map((label, si) => (
            <div className={styles.group} key={si} aria-hidden="true">
              <div className={styles.bars}>
                {series.map((s, ci) => (
                  <div className={styles.barCol} key={ci} title={`${s.cycleName}: ${s.values[si] ?? 0}`}>
                    <span className={styles.val}>{s.values[si] ?? 0}</span>
                    <div
                      className={styles.bar}
                      style={{ height: `${Math.max(4, ((s.values[si] ?? 0) / max) * 120)}px`, background: intensityFor(ci, series.length) }}
                    />
                  </div>
                ))}
              </div>
              <div className={styles.groupLabel}>{label}</div>
            </div>
          ))}
        </div>
      </div>
      <div className={styles.legend} aria-hidden="true">
        {series.map((s, i) => (
          <span className={styles.legendItem} key={i}>
            <span className={styles.swatch} style={{ background: intensityFor(i, series.length) }} />
            {s.cycleName}
          </span>
        ))}
      </div>
      <details>
        <summary>View as table</summary>
        <table>
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Stage</th>
              {series.map((s, i) => (
                <th scope="col" key={i}>
                  {s.cycleName}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {stageLabels.map((label, si) => (
              <tr key={si}>
                <td>{label}</td>
                {series.map((s, ci) => (
                  <td key={ci}>{s.values[si] ?? 0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
