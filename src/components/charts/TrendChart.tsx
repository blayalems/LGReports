import styles from './TrendChart.module.css';

export interface TrendDatum {
  label: string;
  value: number;
  average: number | null;
}

export interface TrendChartProps {
  title: string;
  data: TrendDatum[];
  height?: number;
}

/**
 * Weekly totals as bars (accent, magnitude) with a rolling average overlaid as a
 * neutral dashed line — deliberately *not* a second brand hue, so it reads as
 * "signal vs. reference" rather than two competing categories and needs no CVD check.
 * Single shared y-axis for both series (never dual-axis).
 */
export function TrendChart({ title, data, height = 180 }: TrendChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value), ...data.map((d) => d.average ?? 0));
  const n = data.length || 1;
  const points = data
    .map((d, i) => {
      if (d.average == null) return null;
      const x = ((i + 0.5) / n) * 100;
      const y = 100 - (d.average / max) * 100;
      return `${x},${y}`;
    })
    .filter(Boolean)
    .join(' ');

  const summary = data.length
    ? `${title}: ${data.map((d) => `${d.label} total ${d.value}${d.average != null ? `, 4-week average ${Math.round(d.average)}` : ''}`).join('; ')}`
    : `${title}: no data yet`;

  return (
    <figure style={{ margin: 0 }}>
      <div className={styles.wrap} style={{ ['--chart-h' as string]: `${height}px` }} role="img" aria-label={summary}>
        <div className={styles.bars} aria-hidden="true">
          {data.map((d, i) => (
            <div className={styles.col} key={i}>
              <div className={styles.value}>{d.value}</div>
              <div className={styles.bar} style={{ height: `${Math.max(4, (d.value / max) * (height - 34))}px`, background: 'var(--accent)' }} />
              <div className={styles.label}>{d.label}</div>
            </div>
          ))}
        </div>
        {points && (
          <svg
            aria-hidden="true"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <polyline
              points={points}
              fill="none"
              stroke="var(--text2)"
              strokeWidth={1.5}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
              opacity={0.75}
            />
          </svg>
        )}
      </div>
      <div className={styles.legend} aria-hidden="true">
        <span className={styles.legendItem}>
          <span className={styles.swatchBar} /> Total
        </span>
        <span className={styles.legendItem}>
          <span className={styles.swatchLine} /> 4-week average
        </span>
      </div>
      <details>
        <summary>View as table</summary>
        <table>
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col">Total</th>
              <th scope="col">4-week average</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i}>
                <td>{d.label}</td>
                <td>{d.value}</td>
                <td>{d.average != null ? Math.round(d.average) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
