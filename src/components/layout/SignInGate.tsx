import { useState } from 'react';
import { clearConnection } from '../../repository/connection';
import { useTracker } from '../../state/StoreContext';
import { Card } from '../ui/Card';

/**
 * Shown when the configured backend is a shared Google Sheets workbook but this
 * browser has no live Google session. Nothing renders behind it — we never show
 * an empty tracker that could be mistaken for "all our data is gone".
 */
export function SignInGate() {
  const { repository, refresh } = useTracker();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setError(null);
    const result = await repository.connect();
    if (result.ok) {
      await refresh().catch(() => undefined);
    } else {
      setError(result.message ?? 'Sign-in failed. Check that this Google account can edit the workbook.');
    }
    setBusy(false);
  };

  const useLocal = () => {
    if (!window.confirm('Switch this browser back to device-only mode? The shared workbook is untouched; you can reconnect any time from Settings.')) return;
    clearConnection();
    window.location.reload();
  };

  return (
    <section className="view" style={{ padding: 'clamp(16px,3.5vw,36px)', maxWidth: 560, margin: '60px auto' }}>
      <Card>
        <div style={{ fontSize: 12.5, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--text3)', fontWeight: 600 }}>Shared workbook</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 'clamp(24px,4vw,30px)', margin: '4px 0 10px' }}>Sign in to continue</h1>
        <p style={{ color: 'var(--text2)', lineHeight: 1.6, marginBottom: 8 }}>
          This tracker lives in a shared Google Sheets workbook. Sign in with the Google account it was shared with to load your network's data.
        </p>
        <p style={{ color: 'var(--text3)', fontSize: 13, lineHeight: 1.5, marginBottom: 18 }}>
          Your sign-in stays in this browser tab — no passwords or tokens are ever stored by this app.
        </p>
        {error && (
          <p role="alert" style={{ color: 'var(--bad)', fontSize: 13.5, fontWeight: 600, marginBottom: 14 }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="pressable"
            onClick={() => void signIn()}
            disabled={busy}
            style={{
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 100,
              padding: '13px 22px',
              fontWeight: 700,
              fontSize: 14,
              cursor: 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Signing in…' : 'Sign in with Google'}
          </button>
          <button
            type="button"
            className="pressable"
            onClick={useLocal}
            style={{
              background: 'var(--surface2)',
              color: 'var(--text)',
              border: '1px solid var(--stroke2)',
              borderRadius: 100,
              padding: '13px 22px',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            Use this device only
          </button>
        </div>
      </Card>
    </section>
  );
}
