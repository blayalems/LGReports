import { useEffect, useState } from 'react';
import { BarChart } from '../../components/charts/BarChart';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { DraftNumberInput } from '../../components/ui/DraftNumberInput';
import { formatDate, toISODate, todayISO } from '../../domain/dateUtils';
import { newId } from '../../domain/ids';
import {
  activeCampaign,
  campaignOverallPct,
  campaignTimePct,
  meetingsForWeek,
  metricsForCampaign,
  notDeleted,
  stageProgress,
  weeksChrono,
} from '../../domain/selectors';
import type { Campaign, TrackerSnapshot } from '../../domain/types';
import { showToast } from '../../hooks/useToast';
import { useTracker } from '../../state/StoreContext';
import styles from './CampaignPage.module.css';

/** Photos from meetings dated inside the campaign window — the cycle's story in pictures. */
function CycleGallery({ snapshot, campaign }: { snapshot: TrackerSnapshot; campaign: Campaign }) {
  const { mediaRepository } = useTracker();
  const [photos, setPhotos] = useState<{ id: string; url: string; date: string }[]>([]);

  const mediaKeys = weeksChrono(snapshot)
    .flatMap((wk) => meetingsForWeek(snapshot, wk.id))
    .filter((m) => m.photoMediaId && m.date && m.date >= campaign.start && m.date <= campaign.end)
    .map((m) => ({ mediaId: m.photoMediaId!, date: m.date }));
  const keySig = mediaKeys.map((k) => k.mediaId).join(',');

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    void Promise.all(
      mediaKeys.map(async (k) => {
        const media = await mediaRepository.read(k.mediaId);
        if (!media) return null;
        const url = URL.createObjectURL(media.blob);
        urls.push(url);
        return { id: k.mediaId, url, date: k.date };
      }),
    ).then((loaded) => {
      if (cancelled) {
        urls.forEach((u) => URL.revokeObjectURL(u));
      } else {
        setPhotos(loaded.filter((p) => p != null));
      }
    });
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySig, mediaRepository]);

  if (photos.length === 0) {
    return <EmptyState icon="📷" title="No photos this cycle yet" hint="Photos attached to weekly reports in this date range show up here." />;
  }
  return (
    <div className={styles.gallery}>
      {photos.map((p) => (
        <img key={p.id} src={p.url} alt={`Meeting on ${formatDate(p.date)}`} className={styles.galleryImg} />
      ))}
    </div>
  );
}

export default function CampaignPage() {
  const { snapshot, dispatch } = useTracker();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!snapshot) return null;

  const campaigns = notDeleted(snapshot.campaigns).sort((a, b) => (a.start < b.start ? -1 : 1));
  const campaign = (selectedId && campaigns.find((c) => c.id === selectedId)) || activeCampaign(snapshot);

  const addCampaign = async () => {
    const id = newId();
    const start = todayISO();
    const end = new Date();
    end.setDate(end.getDate() + 90);
    await dispatch({
      entity: { type: 'campaign', id },
      op: 'create',
      payload: { name: 'New Cycle', start, end: toISODate(end) },
    });
    setSelectedId(id);
    showToast('New cycle created — set its name and dates', 'success');
  };

  if (!campaign) {
    return (
      <section className={`view ${styles.page}`}>
        <div className={styles.inner}>
          <div className={styles.header}>
            <div>
              <div className={styles.kicker}>One More for Jesus</div>
              <h1 className={styles.h1}>Campaign</h1>
            </div>
          </div>
          <Card>
            <EmptyState icon="🎯" title="No campaign cycles yet" hint="Create your first cycle to set milestone goals and track progress." />
            <div style={{ textAlign: 'center', paddingBottom: 20 }}>
              <button type="button" className={`pressable ${styles.pillBtn}`} onClick={() => void addCampaign()}>
                + Start a cycle
              </button>
            </div>
          </Card>
        </div>
      </section>
    );
  }

  const metrics = metricsForCampaign(snapshot, campaign.id);
  const progress = stageProgress(snapshot, campaign.id);
  const overall = campaignOverallPct(progress);
  const elapsed = campaignTimePct(campaign);
  const pace: 'ahead' | 'on-track' | 'behind' = overall >= elapsed + 0.05 ? 'ahead' : overall <= elapsed - 0.05 ? 'behind' : 'on-track';
  const paceMeta = {
    ahead: { text: 'Ahead', color: 'var(--good)', icon: '▲' },
    'on-track': { text: 'On track', color: 'var(--text2)', icon: '●' },
    behind: { text: 'Behind', color: 'var(--bad)', icon: '▼' },
  }[pace];

  const updateCampaign = (payload: Partial<Campaign>) => {
    void dispatch({ entity: { type: 'campaign', id: campaign.id }, op: 'update', payload, baseRevision: campaign.revision });
  };

  const metricFor = (key: string, weekIndex: number | null = null) =>
    metrics.find((m) => m.metricKey === key && (weekIndex == null ? m.weekIndex == null : m.weekIndex === weekIndex));

  const setMetric = (key: string, patch: { goal?: number | null; actual?: number | null }, weekIndex: number | null = null) => {
    const existing = metricFor(key, weekIndex);
    if (existing) {
      void dispatch({ entity: { type: 'campaignMetric', id: existing.id }, op: 'update', payload: patch, baseRevision: existing.revision });
    } else {
      void dispatch({
        entity: { type: 'campaignMetric', id: newId() },
        op: 'create',
        payload: { campaignId: campaign.id, metricKey: key, goal: patch.goal ?? null, actual: patch.actual ?? null, weekIndex },
      });
    }
  };

  const vipMetrics = metrics.filter((m) => m.metricKey === 'weeklyVip').sort((a, b) => (a.weekIndex ?? 0) - (b.weekIndex ?? 0));
  const rivals = notDeleted(snapshot.rivals)
    .filter((r) => r.campaignId === campaign.id)
    .sort((a, b) => b.total - a.total);
  const ownTotal = progress.reduce((s, p) => s + p.actual, 0);

  const growthTiles = [
    { label: 'Life groups opened', goalKey: 'growth.groupsGoal', actualKey: 'growth.groupsActual' },
    { label: 'New leaders raised', goalKey: 'growth.leadersGoal', actualKey: 'growth.leadersActual' },
  ];

  return (
    <section className={`view ${styles.page}`}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div>
            <div className={styles.kicker}>One More for Jesus</div>
            <h1 className={styles.h1}>Campaign</h1>
          </div>
          <div className={styles.tabs} role="tablist" aria-label="Campaign cycles">
            {campaigns.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={c.id === campaign.id}
                className={styles.tab}
                onClick={() => setSelectedId(c.id)}
              >
                {c.name || 'Untitled cycle'}
              </button>
            ))}
            <button type="button" className={`pressable ${styles.addTab}`} onClick={() => void addCampaign()} aria-label="Start a new cycle">
              +
            </button>
          </div>
        </div>

        <div className={styles.hero}>
          <div className={styles.heroFields}>
            <label>
              <span className="visually-hidden">Cycle name</span>
              <input
                key={campaign.id}
                className={styles.heroNameInput}
                defaultValue={campaign.name}
                placeholder="Cycle name"
                onBlur={(e) => {
                  if (e.target.value !== campaign.name) updateCampaign({ name: e.target.value });
                }}
              />
            </label>
            <div className={styles.heroDates}>
              <label>
                <span className={styles.heroDateLabel}>Starts</span>
                <input type="date" className={styles.heroDateInput} value={campaign.start} onChange={(e) => updateCampaign({ start: e.target.value })} />
              </label>
              <label>
                <span className={styles.heroDateLabel}>Ends</span>
                <input type="date" className={styles.heroDateInput} value={campaign.end} onChange={(e) => updateCampaign({ end: e.target.value })} />
              </label>
            </div>
          </div>
          <div className={styles.heroStats}>
            <div className={styles.heroStat}>
              <div className={styles.heroStatNum}>{Math.round(overall * 100)}%</div>
              <div className={styles.heroStatLabel}>Overall</div>
            </div>
            <div className={styles.heroStat}>
              <div className={styles.heroStatNum}>{Math.round(elapsed * 100)}%</div>
              <div className={styles.heroStatLabel}>Time elapsed</div>
            </div>
            <div className={styles.paceBadge} style={{ color: paceMeta.color }}>
              <span aria-hidden="true">{paceMeta.icon}</span> {paceMeta.text}
            </div>
          </div>
        </div>

        <div className={styles.grid}>
          <Card>
            <h2 className={styles.cardTitle}>Milestone goals</h2>
            <p className={styles.cardHint}>Actual vs goal for each stage of the journey.</p>
            {progress.map((sp) => (
              <div key={sp.stage.id} className={styles.stageRow}>
                <div className={styles.stageTop}>
                  <span className={styles.stageName}>{sp.stage.label}</span>
                  <div className={styles.numPair}>
                    <label htmlFor={`campaign-${campaign.id}-${sp.stage.key}-actual`}>
                      <span className={styles.numLabel}>Actual</span>
                      <DraftNumberInput
                        id={`campaign-${campaign.id}-${sp.stage.key}-actual`}
                        min={0}
                        className={styles.numInput}
                        value={metricFor(sp.stage.key)?.actual}
                        onCommit={(value) => setMetric(sp.stage.key, { actual: value })}
                      />
                    </label>
                    <span className={styles.numSep} aria-hidden="true">
                      /
                    </span>
                    <label htmlFor={`campaign-${campaign.id}-${sp.stage.key}-goal`}>
                      <span className={styles.numLabel}>Goal</span>
                      <DraftNumberInput
                        id={`campaign-${campaign.id}-${sp.stage.key}-goal`}
                        min={0}
                        className={styles.numInput}
                        value={metricFor(sp.stage.key)?.goal}
                        onCommit={(value) => setMetric(sp.stage.key, { goal: value })}
                      />
                    </label>
                  </div>
                </div>
                <ProgressBar actual={sp.actual} goal={sp.goal} label={`${sp.stage.label}: ${sp.actual} of ${sp.goal}`} />
              </div>
            ))}
          </Card>

          <Card>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Weekly VIP monitoring</h2>
              <button type="button" className={`pressable ${styles.pillBtn}`} onClick={() => setMetric('weeklyVip', { actual: 0 }, vipMetrics.length)}>
                + Week
              </button>
            </div>
            <p className={styles.cardHint}>New VIPs reached each week of the cycle.</p>
            {vipMetrics.length === 0 ? (
              <p className={styles.cardHint}>No weeks tracked yet — add the first week.</p>
            ) : (
              <>
                {vipMetrics.map((m) => (
                  <div key={m.id} className={styles.vipRow}>
                    <span className={styles.vipWeek}>Wk {(m.weekIndex ?? 0) + 1}</span>
                    <label htmlFor={`campaign-week-${m.id}-vips`}>
                      <span className="visually-hidden">VIPs in week {(m.weekIndex ?? 0) + 1}</span>
                      <DraftNumberInput
                        id={`campaign-week-${m.id}-vips`}
                        min={0}
                        className={styles.numInput}
                        value={m.actual}
                        onCommit={(value) =>
                          void dispatch({
                            entity: { type: 'campaignMetric', id: m.id },
                            op: 'update',
                            payload: { actual: value },
                            baseRevision: m.revision,
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
                <BarChart title="Weekly VIPs" data={vipMetrics.map((m) => ({ label: `Wk ${(m.weekIndex ?? 0) + 1}`, value: m.actual ?? 0 }))} height={130} />
              </>
            )}
          </Card>

          <Card>
            <h2 className={styles.cardTitle}>Network growth this cycle</h2>
            <p className={styles.cardHint}>Groups and leaders added during the campaign.</p>
            <div className={styles.growthGrid}>
              {growthTiles.map((tile) => {
                const actual = metricFor(tile.actualKey)?.actual ?? 0;
                const goal = metricFor(tile.goalKey)?.goal ?? 0;
                return (
                  <div key={tile.label} className={styles.growthTile}>
                    <div className={styles.growthLabel}>{tile.label}</div>
                    <div className={styles.numPair} style={{ marginBottom: 9 }}>
                      <label htmlFor={`campaign-${campaign.id}-${tile.actualKey}-actual`}>
                        <span className={styles.numLabel}>Actual</span>
                        <DraftNumberInput
                          id={`campaign-${campaign.id}-${tile.actualKey}-actual`}
                          min={0}
                          className={styles.numInput}
                          value={metricFor(tile.actualKey)?.actual}
                          onCommit={(value) => setMetric(tile.actualKey, { actual: value })}
                        />
                      </label>
                      <span className={styles.numSep} aria-hidden="true">
                        /
                      </span>
                      <label htmlFor={`campaign-${campaign.id}-${tile.goalKey}-goal`}>
                        <span className={styles.numLabel}>Goal</span>
                        <DraftNumberInput
                          id={`campaign-${campaign.id}-${tile.goalKey}-goal`}
                          min={0}
                          className={styles.numInput}
                          value={metricFor(tile.goalKey)?.goal}
                          onCommit={(value) => setMetric(tile.goalKey, { goal: value })}
                        />
                      </label>
                    </div>
                    <ProgressBar actual={actual} goal={goal} label={`${tile.label}: ${actual} of ${goal}`} />
                  </div>
                );
              })}
            </div>
          </Card>

          <Card>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Friendly leaderboard</h2>
              <button
                type="button"
                className={`pressable ${styles.pillBtn}`}
                onClick={() =>
                  void dispatch({
                    entity: { type: 'rival', id: newId() },
                    op: 'create',
                    payload: { campaignId: campaign.id, name: '', total: 0 },
                  })
                }
              >
                + Network
              </button>
            </div>
            <p className={styles.cardHint}>Your total is the sum of milestone actuals; other networks are entered by hand.</p>
            {[{ self: true as const, name: `${snapshot.config.network || 'Your network'} (you)`, total: ownTotal }, ...rivals]
              .sort((a, b) => b.total - a.total)
              .map((row, i) => (
                <div key={'self' in row && row.self ? 'self' : (row as { id: string }).id} className={styles.boardRow}>
                  <span className={styles.boardRank} aria-hidden="true">
                    {i + 1}
                  </span>
                  {'self' in row && row.self ? (
                    <span className={styles.boardSelf}>{row.name}</span>
                  ) : (
                    <>
                      <label style={{ flex: 1, minWidth: 0 }}>
                        <span className="visually-hidden">Network name</span>
                        <input
                          className={styles.boardName}
                          style={{ width: '100%' }}
                          defaultValue={(row as { name: string }).name}
                          placeholder="Network name"
                          onBlur={(e) => {
                            const rival = row as (typeof rivals)[number];
                            if (e.target.value !== rival.name) {
                              void dispatch({ entity: { type: 'rival', id: rival.id }, op: 'update', payload: { name: e.target.value }, baseRevision: rival.revision });
                            }
                          }}
                        />
                      </label>
                      <label htmlFor={`campaign-rival-${(row as (typeof rivals)[number]).id}-total`}>
                        <span className="visually-hidden">Network total</span>
                        <DraftNumberInput
                          id={`campaign-rival-${(row as (typeof rivals)[number]).id}-total`}
                          min={0}
                          className={styles.numInput}
                          value={(row as { total: number }).total}
                          onCommit={(value) => {
                            const rival = row as (typeof rivals)[number];
                            void dispatch({
                              entity: { type: 'rival', id: rival.id },
                              op: 'update',
                              payload: { total: value ?? 0 },
                              baseRevision: rival.revision,
                            });
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className={styles.boardDelete}
                        aria-label={`Delete ${(row as { name: string }).name || 'network'} from leaderboard`}
                        onClick={() => {
                          const rival = row as (typeof rivals)[number];
                          void dispatch({ entity: { type: 'rival', id: rival.id }, op: 'delete', payload: {}, baseRevision: rival.revision });
                        }}
                      >
                        ✕
                      </button>
                    </>
                  )}
                  {'self' in row && row.self && <span className={styles.boardTotal}>{row.total}</span>}
                </div>
              ))}
          </Card>

          <Card className={styles.fullWidth}>
            <h2 className={styles.cardTitle}>Cycle gallery</h2>
            <p className={styles.cardHint}>
              Photos from meetings between {formatDate(campaign.start)} and {formatDate(campaign.end)}.
            </p>
            <CycleGallery snapshot={snapshot} campaign={campaign} />
          </Card>
        </div>
      </div>
    </section>
  );
}
