import styles from './BarChart.module.css';

export interface BarDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  title: string;
  data: BarDatum[];
  color?: string;
  height?: number;
  valueFormatter?: (n: number) => string;
}

/** Single-series magnitude bars. One hue (accent by default) — see dataviz skill: no legend needed for one series. */
export function BarChart({ title, data, color = 'var(--accent)', height = 168, valueFormatter = (n) => String(n) }: BarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const summary = data.length ? `${title}: ${data.map((d) => `${d.label} ${valueFormatter(d.value)}`).join(', ')}` : `${title}: no data yet`;

  return (
    <figure style={{ margin: 0 }}>
      <div className={styles.wrap} style={{ ['--chart-h' as string]: `${height}px` }} role="img" aria-label={summary}>
        {data.map((d, i) => (
          <div className={styles.col} key={i} aria-hidden="true">
            <div className={styles.value}>{valueFormatter(d.value)}</div>
            <div className={styles.bar} style={{ height: `${Math.max(4, (d.value / max) * (height - 40))}px`, background: color }} />
            <div className={styles.label}>{d.label}</div>
          </div>
        ))}
      </div>
      <details className={styles.tableToggle}>
        <summary>View as table</summary>
        <table>
          <caption className="visually-hidden">{title}</caption>
          <thead>
            <tr>
              <th scope="col">Week</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d, i) => (
              <tr key={i}>
                <td>{d.label}</td>
                <td>{valueFormatter(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
