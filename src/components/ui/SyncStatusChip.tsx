import type { SyncState } from '../../domain/types';

const META: Record<SyncState, { label: string; color: string; pulse?: boolean }> = {
  disconnected: { label: 'Not connected', color: 'var(--text3)' },
  connecting: { label: 'Connecting…', color: 'var(--warn)', pulse: true },
  loading: { label: 'Loading…', color: 'var(--warn)', pulse: true },
  saving: { label: 'Saving…', color: 'var(--warn)', pulse: true },
  saved: { label: 'Saved', color: 'var(--good)' },
  stale: { label: 'Stale — refresh to see the latest', color: 'var(--warn)' },
  error: { label: "Couldn't save — check your connection", color: 'var(--bad)' },
};

/**
 * Replaces the old "Current week — auto-synced" label (a launch blocker: it claimed
 * sync had happened when it hadn't). Only ever shows a state the repository actually
 * reported — "Saved" appears only after the backend confirms the write.
 */
export function SyncStatusChip({ state }: { state: SyncState }) {
  const meta = META[state];
  return (
    <span
      role="status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: 'var(--accent-soft)',
        color: 'var(--text2)',
        fontSize: 12,
        fontWeight: 700,
        borderRadius: 100,
        padding: '5px 12px',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: meta.color,
          animation: meta.pulse ? 'floaty 1.1s ease-in-out infinite' : undefined,
        }}
      />
      {meta.label}
    </span>
  );
}
