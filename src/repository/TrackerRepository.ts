import type { DomainCommand, SyncState, TrackerSnapshot } from '../domain/types';

export interface ConnectResult {
  ok: boolean;
  reason?: 'no-workbook-selected' | 'wrong-schema' | 'access-denied' | 'network' | 'unknown';
  message?: string;
}

/**
 * Public interface every backend (local/IndexedDB in phase 1, Google Sheets in phase 2)
 * must implement. Screens and state management depend only on this — never on a concrete
 * backend — so swapping the backend in phase 2 touches no UI code.
 */
export interface TrackerRepository {
  /** Current sync state, observable so the UI can render Disconnected/Loading/Saving/etc. */
  getSyncState(): SyncState;
  onSyncStateChange(listener: (state: SyncState) => void): () => void;

  /** Establish a connection (sign-in + workbook selection for the Sheets backend). */
  connect(): Promise<ConnectResult>;
  disconnect(): Promise<void>;

  /** Load the full current snapshot. */
  loadSnapshot(): Promise<TrackerSnapshot>;

  /** Re-fetch from the source of truth (sign-in, focus, manual refresh, 60s poll). */
  refresh(): Promise<TrackerSnapshot>;

  /**
   * Apply a single domain command. Implementations must:
   *  - dedupe by commandId for retried appends,
   *  - compare baseRevision for mutable rows and throw ConflictError on mismatch,
   *  - never execute payload text as a formula.
   * Returns the updated snapshot slice is not required — callers re-derive from the
   * next loadSnapshot/refresh or an optimistic local merge.
   */
  saveCommand(command: DomainCommand): Promise<void>;

  /**
   * Optional convenience for a first-run "load fictional sample data" choice.
   * Only ever writes clearly-fictional rows (see domain/demoData.ts) and must
   * never be invoked implicitly — the UI calls this only on explicit opt-in.
   */
  seedDemoData?(): Promise<void>;

  /**
   * Optional bulk load for Settings' "Restore backup" (JSON) and phase 3's migration
   * wizard. Replaces the entire local snapshot in one shot — callers are responsible
   * for validating/previewing before calling this, it does no merging of its own.
   */
  restoreSnapshot?(snapshot: TrackerSnapshot): Promise<void>;
}
