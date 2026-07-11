import { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { SyncStatusChip } from '../../components/ui/SyncStatusChip';
import { showToast } from '../../hooks/useToast';
import { clearConnection, defaultClientId } from '../../repository/connection';
import { createSharedWorkbook, linkExistingWorkbook } from '../../repository/sheets/connectFlows';
import { SheetsTrackerRepository } from '../../repository/sheets/SheetsTrackerRepository';
import { useTracker } from '../../state/StoreContext';
import styles from './SettingsPage.module.css';

/**
 * The "Data & sync" card. Local mode offers the two adoption flows (create a new
 * shared workbook from this device's data, or link one the overseer shared);
 * Sheets mode shows the live connection and a way back to device-only.
 */
export function SheetsSyncCard() {
  const { repository, snapshot, syncState } = useTracker();
  const [clientId, setClientId] = useState(defaultClientId());
  const [workbookRef, setWorkbookRef] = useState('');
  const [busy, setBusy] = useState<'create' | 'link' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sheetsRepo = repository instanceof SheetsTrackerRepository ? repository : null;

  if (sheetsRepo) {
    const url = `https://docs.google.com/spreadsheets/d/${sheetsRepo.getSpreadsheetId()}`;
    const email = sheetsRepo.getAccountEmail();
    return (
      <Card>
        <h2 className={styles.cardTitle}>Data &amp; sync</h2>
        <div className={styles.syncRow} style={{ marginBottom: 10 }}>
          <SyncStatusChip state={syncState} />
          {email && <span className={styles.cardHint} style={{ margin: 0 }}>Signed in as {email}</span>}
        </div>
        <p className={styles.cardHint}>
          This tracker reads and writes a shared Google Sheets workbook — every leader it's shared with (as Editor) sees the same data.{' '}
          <a href={url} target="_blank" rel="noreferrer">
            Open the workbook in Google Sheets
          </a>
          . To add a leader: share the workbook with their Google account in Drive, then have them link it here on their device.
        </p>
        <div className={styles.dangerRow}>
          <button
            type="button"
            className={styles.dangerBtn}
            onClick={() => {
              if (!window.confirm('Switch this browser to device-only mode? The shared workbook keeps all its data; you can reconnect any time.')) return;
              clearConnection();
              void repository.disconnect().finally(() => window.location.reload());
            }}
          >
            Disconnect this device
          </button>
        </div>
      </Card>
    );
  }

  const run = async (kind: 'create' | 'link') => {
    if (!snapshot) return;
    setBusy(kind);
    setError(null);
    const result =
      kind === 'create'
        ? await createSharedWorkbook(clientId, `Life Group Tracker — ${snapshot.config.network || 'My Network'}`, snapshot)
        : await linkExistingWorkbook(clientId, workbookRef);
    if (result.ok) {
      showToast(kind === 'create' ? 'Shared workbook created — reloading' : 'Workbook linked — reloading', 'success');
      window.location.reload();
    } else {
      setError(result.message ?? 'Something went wrong.');
      setBusy(null);
    }
  };

  return (
    <Card>
      <h2 className={styles.cardTitle}>Data &amp; sync</h2>
      <div className={styles.syncRow} style={{ marginBottom: 10 }}>
        <SyncStatusChip state={syncState} />
        <p className={styles.cardHint} style={{ margin: 0, flex: 1, minWidth: 220 }}>
          Right now your data is saved on this device only. Connect a shared Google Sheets workbook so the whole leadership team works from one source of
          truth — see <code>docs/google-sheets-setup.md</code> in the repository for the one-time Google Cloud setup.
        </p>
      </div>
      <div className={styles.fieldGrid} style={{ marginBottom: 12 }}>
        <label className={styles.fieldLabel}>
          Google OAuth Client ID
          <input
            className={styles.fieldInput}
            value={clientId}
            placeholder="1234567890-abc.apps.googleusercontent.com"
            onChange={(e) => setClientId(e.target.value)}
          />
        </label>
        <label className={styles.fieldLabel}>
          Existing workbook link (to join your team)
          <input
            className={styles.fieldInput}
            value={workbookRef}
            placeholder="https://docs.google.com/spreadsheets/d/…"
            onChange={(e) => setWorkbookRef(e.target.value)}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className={styles.cardHint} style={{ color: 'var(--bad)', fontWeight: 600 }}>
          {error}
        </p>
      )}
      <div className={styles.dangerRow}>
        <button type="button" className={`pressable ${styles.primaryBtn}`} disabled={busy != null} onClick={() => void run('create')}>
          {busy === 'create' ? 'Creating…' : "Create new shared workbook (copies this device's data)"}
        </button>
        <button type="button" className={`pressable ${styles.ghostBtn}`} disabled={busy != null} onClick={() => void run('link')}>
          {busy === 'link' ? 'Linking…' : 'Link existing workbook'}
        </button>
      </div>
    </Card>
  );
}
