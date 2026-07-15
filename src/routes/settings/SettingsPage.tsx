import { useEffect, useState, type ChangeEvent } from 'react';
import { Card } from '../../components/ui/Card';
import { DraftNumberInput } from '../../components/ui/DraftNumberInput';
import { SheetsSyncCard } from './SheetsSyncCard';
import { nowISO, todayISO } from '../../domain/dateUtils';
import { createEmptySnapshot } from '../../domain/demoData';
import { newId } from '../../domain/ids';
import { notDeleted } from '../../domain/selectors';
import { isTrackerSnapshot } from '../../domain/snapshotValidation';
import type { Config } from '../../domain/types';
import { showToast } from '../../hooks/useToast';
import { downloadBlob } from '../../lib/xlsx/writer';
import { useTracker } from '../../state/StoreContext';
import styles from './SettingsPage.module.css';

const ACCENTS: { color: string; name: string }[] = [
  { color: '#0E7C6B', name: 'Evergreen' },
  { color: '#C4763B', name: 'Amber' },
  { color: '#5A6FBE', name: 'Indigo' },
  { color: '#8A5CA0', name: 'Plum' },
  { color: '#B04A6E', name: 'Rose' },
  { color: '#3B8AA8', name: 'Lagoon' },
];

const THEMES: { value: Config['theme']; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Auto' },
];

function LogoPreview({ logoMediaId }: { logoMediaId: string }) {
  const { mediaRepository } = useTracker();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void mediaRepository.read(logoMediaId).then((media) => {
      if (media && !cancelled) {
        objectUrl = URL.createObjectURL(media.blob);
        setUrl(objectUrl);
      }
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [logoMediaId, mediaRepository]);
  return url ? <img src={url} alt="Church logo" className={styles.logoImg} /> : null;
}

export default function SettingsPage() {
  const { snapshot, dispatch, mediaRepository, repository, refresh, actorId } = useTracker();
  if (!snapshot) return null;

  const config = snapshot.config;
  const stages = notDeleted(snapshot.stages).sort((a, b) => a.order - b.order);
  const groups = notDeleted(snapshot.groups);

  const updateConfig = (payload: Partial<Config>) => {
    void dispatch({ entity: { type: 'config', id: 'config' }, op: 'update', payload, baseRevision: config.revision });
  };

  const onLogoPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const mediaId = newId();
    await mediaRepository.upload(mediaId, file);
    await dispatch({
      entity: { type: 'media', id: mediaId },
      op: 'create',
      payload: { kind: 'logo', ownerType: 'config', ownerId: 'config', driveFileId: null, localBlobKey: mediaId, createdAt: nowISO(), createdBy: actorId },
    });
    await dispatch({ entity: { type: 'config', id: 'config' }, op: 'update', payload: { logoMediaId: mediaId }, baseRevision: config.revision });
    showToast('Logo updated', 'success');
  };

  const downloadBackup = () => {
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    downloadBlob(`life-group-tracker-backup-${todayISO()}.json`, blob);
    showToast('Backup downloaded', 'success');
  };

  const restoreBackup = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !repository.restoreSnapshot) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isTrackerSnapshot(parsed)) {
        showToast("That file doesn't look like a tracker backup", 'error');
        return;
      }
      const summary = `${parsed.members.length} members, ${parsed.groups.length} groups, ${parsed.weeks.length} weeks`;
      if (!window.confirm(`Replace everything on this device with the backup (${summary})? This can't be undone.`)) return;
      await repository.restoreSnapshot(parsed);
      await refresh();
      showToast('Backup restored', 'success');
    } catch {
      showToast("Couldn't read that backup file", 'error');
    }
  };

  const resetAll = async () => {
    if (!repository.restoreSnapshot) return;
    if (!window.confirm('Reset everything? All members, weeks, and campaigns on this device will be erased.')) return;
    if (!window.confirm('Last check — download a backup first if you might need this data. Really erase it all?')) return;
    await repository.restoreSnapshot(createEmptySnapshot(actorId));
    await refresh();
    showToast('Everything was reset', 'info');
  };

  return (
    <section className={`view ${styles.page}`}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.kicker}>Personalization</div>
          <h1 className={styles.h1}>Settings</h1>
        </div>

        <div className={styles.stack}>
          <Card>
            <h2 className={styles.cardTitle}>Branding</h2>
            <p className={styles.cardHint}>Shown on the sidebar, reports, and exports.</p>
            <div className={styles.fieldGrid}>
              <label className={styles.fieldLabel}>
                Church
                <input
                  className={styles.fieldInput}
                  defaultValue={config.church}
                  onBlur={(e) => {
                    if (e.target.value !== config.church) updateConfig({ church: e.target.value });
                  }}
                />
              </label>
              <label className={styles.fieldLabel}>
                Network
                <input
                  className={styles.fieldInput}
                  defaultValue={config.network}
                  onBlur={(e) => {
                    if (e.target.value !== config.network) updateConfig({ network: e.target.value });
                  }}
                />
              </label>
              <label className={styles.fieldLabel}>
                Overseer
                <input
                  className={styles.fieldInput}
                  defaultValue={config.overseer}
                  onBlur={(e) => {
                    if (e.target.value !== config.overseer) updateConfig({ overseer: e.target.value });
                  }}
                />
              </label>
              <div>
                <span className={styles.fieldLabel}>Logo</span>
                <div className={styles.logoRow}>
                  {config.logoMediaId && <LogoPreview logoMediaId={config.logoMediaId} />}
                  <label className={`pressable ${styles.uploadBtn}`}>
                    <input type="file" accept="image/*" onChange={(e) => void onLogoPick(e)} style={{ display: 'none' }} />
                    Upload
                  </label>
                  {config.logoMediaId && (
                    <button type="button" className={`tap-target-inline ${styles.linkBtn}`} onClick={() => updateConfig({ logoMediaId: null })}>
                      remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className={styles.cardTitle}>Appearance</h2>
            <div className={styles.appearanceRow}>
              <div>
                <span className={styles.fieldLabel} id="theme-label" style={{ marginBottom: 8, display: 'block' }}>
                  Theme
                </span>
                <div className={styles.segment} role="group" aria-labelledby="theme-label">
                  {THEMES.map((t) => (
                    <button key={t.value} type="button" className={styles.segmentBtn} aria-pressed={config.theme === t.value} onClick={() => updateConfig({ theme: t.value })}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className={styles.fieldLabel} id="accent-label" style={{ marginBottom: 8, display: 'block' }}>
                  Accent color
                </span>
                <div className={styles.swatches} role="group" aria-labelledby="accent-label">
                  {ACCENTS.map((a) => (
                    <button
                      key={a.color}
                      type="button"
                      className={styles.swatch}
                      style={{ background: a.color }}
                      aria-pressed={config.accent.toLowerCase() === a.color.toLowerCase()}
                      aria-label={`${a.name} accent`}
                      title={a.name}
                      onClick={() => updateConfig({ accent: a.color })}
                    />
                  ))}
                </div>
              </div>
              <label htmlFor="settings-at-risk-weeks">
                <span className={styles.fieldLabel} style={{ marginBottom: 8, display: 'block' }}>
                  At-risk after missed weeks
                </span>
                <DraftNumberInput
                  id="settings-at-risk-weeks"
                  min={1}
                  max={12}
                  className={styles.numInput}
                  value={config.atRiskWeeks}
                  onCommit={(value) => updateConfig({ atRiskWeeks: value ?? 1 })}
                />
              </label>
            </div>
          </Card>

          <Card>
            <h2 className={styles.cardTitle}>Campaign milestones</h2>
            <p className={styles.cardHint}>Rename stages for future cycles — goals, funnel and member journeys follow these names everywhere.</p>
            {stages.map((stage, i) => (
              <div key={stage.id} className={styles.stageRow}>
                <span className={styles.stageNum} aria-hidden="true">
                  {i + 1}
                </span>
                <label style={{ flex: 1 }}>
                  <span className="visually-hidden">Milestone {i + 1} name</span>
                  <input
                    className={styles.stageInput}
                    style={{ width: '100%' }}
                    defaultValue={stage.label}
                    onBlur={(e) => {
                      if (e.target.value !== stage.label) {
                        void dispatch({ entity: { type: 'stage', id: stage.id }, op: 'update', payload: { label: e.target.value }, baseRevision: stage.revision });
                      }
                    }}
                  />
                </label>
              </div>
            ))}
          </Card>

          <Card>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Life group roster</h2>
              <button
                type="button"
                className={`pressable ${styles.pillBtn}`}
                onClick={() =>
                  void dispatch({
                    entity: { type: 'group', id: newId() },
                    op: 'create',
                    payload: { name: '', category: 'open', location: '', weeklyTarget: null },
                  })
                }
              >
                + Group
              </button>
            </div>
            <p className={styles.cardHint}>New weeks pre-fill from this roster; members link to these groups.</p>
            {groups.length === 0 && <p className={styles.cardHint}>No groups yet — add your first leader.</p>}
            {groups.map((g) => (
              <div key={g.id} className={styles.rosterRow}>
                <label>
                  <span className="visually-hidden">Leader name</span>
                  <input
                    className={styles.fieldInput}
                    style={{ marginTop: 0, fontWeight: 600 }}
                    defaultValue={g.name}
                    placeholder="Leader name"
                    onBlur={(e) => {
                      if (e.target.value !== g.name) {
                        void dispatch({ entity: { type: 'group', id: g.id }, op: 'update', payload: { name: e.target.value }, baseRevision: g.revision });
                      }
                    }}
                  />
                </label>
                <label>
                  <span className="visually-hidden">Group type</span>
                  <select
                    className={styles.fieldInput}
                    style={{ marginTop: 0 }}
                    value={g.category}
                    onChange={(e) =>
                      void dispatch({ entity: { type: 'group', id: g.id }, op: 'update', payload: { category: e.target.value }, baseRevision: g.revision })
                    }
                  >
                    <option value="leader">Leader's LG</option>
                    <option value="open">Open LG</option>
                  </select>
                </label>
                <label>
                  <span className="visually-hidden">Location</span>
                  <input
                    className={styles.fieldInput}
                    style={{ marginTop: 0 }}
                    defaultValue={g.location}
                    placeholder="Location"
                    onBlur={(e) => {
                      if (e.target.value !== g.location) {
                        void dispatch({ entity: { type: 'group', id: g.id }, op: 'update', payload: { location: e.target.value }, baseRevision: g.revision });
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={styles.rosterDelete}
                  aria-label={`Remove ${g.name || 'group'} from roster`}
                  onClick={() => {
                    if (!window.confirm(`Remove ${g.name || 'this group'} from the roster? Past weeks keep their records.`)) return;
                    void dispatch({ entity: { type: 'group', id: g.id }, op: 'delete', payload: {}, baseRevision: g.revision });
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </Card>

          <Card>
            <h2 className={styles.cardTitle}>Report statuses</h2>
            <p className={styles.cardHint}>Options in the weekly report's status dropdown. One per line.</p>
            <label>
              <span className="visually-hidden">Report status options, one per line</span>
              <textarea
                className={styles.statusesArea}
                rows={3}
                defaultValue={config.statusOptions.join('\n')}
                onBlur={(e) => {
                  const options = e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  if (options.join('\n') !== config.statusOptions.join('\n')) updateConfig({ statusOptions: options });
                }}
              />
            </label>
          </Card>

          <SheetsSyncCard />

          <Card>
            <h2 className={styles.cardTitle}>Backup &amp; data</h2>
            <p className={styles.cardHint}>
              {repository.restoreSnapshot
                ? 'Download a backup regularly — restore it on any device.'
                : 'Download a backup any time. Restore and reset are managed from the shared workbook itself (ask the overseer) rather than per device.'}
            </p>
            <div className={styles.dangerRow}>
              <button type="button" className={`pressable ${styles.primaryBtn}`} onClick={downloadBackup}>
                Download backup
              </button>
              {repository.restoreSnapshot && (
                <>
                  <label className={`pressable ${styles.ghostBtn}`}>
                    <input type="file" accept=".json,application/json" onChange={(e) => void restoreBackup(e)} style={{ display: 'none' }} />
                    Restore backup
                  </label>
                  <button type="button" className={styles.dangerBtn} onClick={() => void resetAll()}>
                    Reset everything
                  </button>
                </>
              )}
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
