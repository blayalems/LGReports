import type { ReactNode } from 'react';

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text3)' }}>
      {icon && <div style={{ fontSize: 36, marginBottom: 10 }}>{icon}</div>}
      <div style={{ fontWeight: 600, color: 'var(--text2)' }}>{title}</div>
      {hint && <div style={{ fontSize: 13.5, marginTop: 4 }}>{hint}</div>}
    </div>
  );
}
