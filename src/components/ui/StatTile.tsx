import type { ReactNode } from 'react';
import { Card } from './Card';

export interface StatTileProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  delta?: { text: string; color: string };
}

export function StatTile({ label, value, sub, delta }: StatTileProps) {
  return (
    <Card>
      <div style={{ fontSize: 12, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, marginTop: 9 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 38, color: 'var(--text)', lineHeight: 1 }}>{value}</span>
        {delta && <span style={{ fontSize: 12.5, fontWeight: 700, color: delta.color }}>{delta.text}</span>}
      </div>
      {sub && <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 7 }}>{sub}</div>}
    </Card>
  );
}
