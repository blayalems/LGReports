import { CycleCompareChart } from '../../components/charts/CycleCompareChart';
import { FunnelChart } from '../../components/charts/FunnelChart';
import { TrendChart } from '../../components/charts/TrendChart';
import { Card } from '../../components/ui/Card';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { StatTile } from '../../components/ui/StatTile';
import {
  activeCampaign,
  atRiskMembers,
  campaignQualifications,
  leaderAverages,
  notDeleted,
  stageProgress,
  weeksChrono,
  weekTotal,
} from '../../domain/selectors';
import { useTracker } from '../../state/StoreContext';
import styles from './AnalyticsPage.module.css';

const TREND_META = {
  up: { icon: '▲', word: 'up', color: 'var(--good)' },
  down: { icon: '▼', word: 'down', color: 'var(--bad)' },
  flat: { icon: '–', word: 'flat', color: 'var(--text2)' },
} as const;

export default function AnalyticsPage() {
  const { snapshot } = useTracker();
  if (!snapshot) return null;

  // Attendance trend: weekly totals + trailing 4-week average.
  const weeks = weeksChrono(snapshot);
  const totals = weeks.map((w) => weekTotal(snapshot, w.id));
  const trendData = weeks.map((w, i) => {
    const window = totals.slice(Math.max(0, i - 3), i + 1);
    return {
      label: w.label || w.weekOf,
      value: totals[i],
      average: window.length ? window.reduce((a, b) => a + b, 0) / window.length : null,
    };
  });
  const latest = trendData[trendData.length - 1];
  let trendInsight = 'No weeks tracked yet — the trend starts with your first report.';
  if (latest && latest.average != null && latest.average > 0) {
    const diff = Math.round(((latest.value - latest.average) / latest.average) * 100);
    trendInsight =
      diff > 2
        ? `Latest week is ${diff}% above your 4-week average.`
        : diff < -2
          ? `Latest week is ${Math.abs(diff)}% below your 4-week average.`
          : 'Latest week is level with your 4-week average.';
  }

  // Campaign-derived sections.
  const campaign = activeCampaign(snapshot);
  const progress = campaign ? stageProgress(snapshot, campaign.id) : [];
  const campaignStates = campaign ? campaignQualifications(snapshot, campaign) : [];
  const funnelStages = progress.map((sp, i) => {
    const prev = progress[i - 1];
    const dropLabel = prev && prev.actual > 0 && i > 0 ? `· ${Math.round((sp.actual / prev.actual) * 100)}% of previous` : undefined;
    return { label: sp.stage.label, count: sp.actual, dropLabel };
  });
  const readinessRows = [
    { label: 'KGC eligible now', count: campaignStates.filter((state) => state.kgcEligible && !state.kgcCompleted).length },
    { label: 'Blocked only by KGC', count: campaignStates.filter((state) => state.actionKey === 'blocked_by_kgc').length },
    { label: 'Light Up ready', count: campaignStates.filter((state) => state.lightUpEligible && !state.lightUpCompleted).length },
    { label: 'LIV incomplete', count: campaignStates.filter((state) => state.lightUpCompleted && !state.livCompleted).length },
    { label: 'Water Baptism ready', count: campaignStates.filter((state) => state.waterBaptismEligible && !state.waterBaptismCompleted).length },
  ];

  // Group performance (comparison bars are relative to the best-performing group).
  const averages = leaderAverages(snapshot);
  const maxAvg = Math.max(1, ...averages.map((a) => a.avg));

  // Retention.
  const members = notDeleted(snapshot.members);
  const atRisk = atRiskMembers(snapshot);
  const engaged = members.length - atRisk.length;

  // Cycle over cycle.
  const stages = notDeleted(snapshot.stages).sort((a, b) => a.order - b.order);
  const stageLabels = stages.map((s) => s.label);
  const campaigns = notDeleted(snapshot.campaigns)
    .slice()
    .sort((a, b) => (a.start < b.start ? -1 : 1));
  const series = campaigns.map((c) => {
    const sp = stageProgress(snapshot, c.id);
    return { cycleName: c.name || 'Untitled', values: stages.map((s) => sp.find((x) => x.stage.key === s.key)?.actual ?? 0) };
  });

  return (
    <section className={`view ${styles.page}`}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div className={styles.kicker}>Insights</div>
          <h1 className={styles.h1}>Analytics</h1>
        </div>

        <div className={styles.grid}>
          <Card className={styles.fullWidth}>
            <h2 className={styles.cardTitle}>Attendance trend</h2>
            <p className={styles.insight}>{trendInsight}</p>
            {trendData.length > 0 ? <TrendChart title="Attendance trend" data={trendData} /> : <p className={styles.quietNote}>No data yet.</p>}
          </Card>

          <Card>
            <h2 className={styles.cardTitle}>Conversion funnel</h2>
            <p className={styles.cardSub}>{campaign ? campaign.name : 'No active campaign'}</p>
            {campaign && funnelStages.length > 0 ? (
              <FunnelChart title={`Conversion funnel — ${campaign.name}`} stages={funnelStages} />
            ) : (
              <p className={styles.quietNote}>Create a campaign to see how people move through the journey stages.</p>
            )}
          </Card>

          <Card>
            <h2 className={styles.cardTitle}>Qualification readiness</h2>
            <p className={styles.insight}>{campaign ? 'Person-level queues replace linear time-vs-total pacing.' : 'No active campaign.'}</p>
            {readinessRows.map((row) => (
              <div key={row.label} className={styles.retentionRow}>
                <span>{row.label}</span>
                <strong>{row.count}</strong>
              </div>
            ))}
          </Card>

          <Card>
            <h2 className={styles.cardTitle}>Group performance</h2>
            <p className={styles.cardSub}>Average weekly attendance, last 8 weeks — bars are relative to the top group.</p>
            {averages.length === 0 ? (
              <p className={styles.quietNote}>No life groups yet.</p>
            ) : (
              averages.map(({ group, avg, trend }) => {
                const meta = TREND_META[trend];
                return (
                  <div key={group.id} className={styles.groupRow}>
                    <span className={styles.groupName}>{group.name}</span>
                    <div className={styles.groupBar}>
                      <ProgressBar actual={avg} goal={maxAvg} label={`${group.name}: average ${avg.toFixed(1)} per week`} />
                    </div>
                    <span className={styles.groupAvg}>{avg.toFixed(1)}</span>
                    <span className={styles.trend} style={{ color: meta.color }}>
                      <span aria-hidden="true">{meta.icon}</span> {meta.word}
                    </span>
                  </div>
                );
              })
            )}
          </Card>

          <Card>
            <h2 className={styles.cardTitle}>Retention &amp; at-risk</h2>
            <p className={styles.cardSub}>At-risk = no check-in for {snapshot.config.atRiskWeeks} weeks or more.</p>
            <div className={styles.statPair}>
              <StatTile label="Engaged" value={engaged} />
              <StatTile label="At risk" value={atRisk.length} />
            </div>
            {atRisk.length === 0 ? (
              <p className={styles.quietNote}>No one is at risk right now.</p>
            ) : (
              <ul className={styles.riskList}>
                {atRisk.map((f) => (
                  <li key={f.member.id} className={styles.riskRow}>
                    <span className={styles.riskName}>{f.member.name}</span>
                    <span className={styles.riskMissed}>
                      missed {f.weeksMissed ?? '?'} week{f.weeksMissed === 1 ? '' : 's'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className={styles.fullWidth}>
            <h2 className={styles.cardTitle}>Cycle over cycle</h2>
            <p className={styles.cardSub}>Milestone actuals across campaign cycles, oldest to newest.</p>
            {series.length > 0 ? (
              <CycleCompareChart title="Cycle over cycle" stageLabels={stageLabels} series={series} />
            ) : (
              <p className={styles.quietNote}>Once you've run a campaign cycle, compare it against the next one here.</p>
            )}
          </Card>
        </div>
      </div>
    </section>
  );
}
