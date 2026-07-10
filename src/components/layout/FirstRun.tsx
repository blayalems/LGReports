import { useTracker } from '../../state/StoreContext';
import { Card } from '../ui/Card';

/**
 * Shown instead of the routed screens until the leader makes an explicit choice.
 * Replaces the old behavior of silently seeding real people's names on first load
 * (a launch blocker) — a brand-new install starts genuinely empty unless you opt in.
 */
export function FirstRun() {
  const { startBlank, startDemo } = useTracker();

  return (
    <section className="view" style={{ padding: 'clamp(16px,3.5vw,36px)', maxWidth: 640, margin: '40px auto' }}>
      <Card>
        <div style={{ fontSize: 12.5, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 600 }}>Welcome</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(24px,4vw,32px)', margin: '4px 0 10px' }}>
          Set up Life Group Tracker
        </h1>
        <p style={{ color: 'var(--text2)', lineHeight: 1.6, marginBottom: 20 }}>
          Your data stays on this device for now — Google Sheets sync for shared, multi-leader access is coming in a follow-up update. You can start from a
          completely blank workspace, or load a small set of fictional sample records to see how everything fits together before entering your real roster.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="pressable"
            onClick={startBlank}
            style={{
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 100,
              padding: '13px 22px',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Start blank
          </button>
          <button
            type="button"
            className="pressable"
            onClick={() => startDemo()}
            style={{
              background: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--stroke2)',
              borderRadius: 100,
              padding: '13px 22px',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Load fictional sample data
          </button>
        </div>
      </Card>
    </section>
  );
}
