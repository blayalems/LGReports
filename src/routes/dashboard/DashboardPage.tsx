import { BarChart } from '../../components/charts/BarChart';
import { Card, CardButton } from '../../components/ui/Card';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { StatTile } from '../../components/ui/StatTile';
import { daysBetween, formatDate, parseISODate, sundayOf, weekLabelFor } from '../../domain/dateUtils';
import {
  activeCampaign,
  avatarColor,
  campaignOverallPct,
  currentWeek,
  followUpQueue,
  initials,
  meetingAttendance,
  meetingsForWeek,
  notDeleted,
  stageProgress,
  upcomingBirthdays,
  upcomingEvents,
  weeksChrono,
  weekTotal,
  type FollowUp,
} from '../../domain/selectors';
import { useRouter } from '../../router/HashRouter';
import { useTracker } from '../../state/StoreContext';
import styles from './DashboardPage.module.css';

const TAG_COLORS: Record<FollowUp['tag'], { color: string; bg: string }> = {
  VIP: { color: 'var(--accent)', bg: 'var(--accent-soft)' },
  'At risk': { color: 'var(--bad)', bg: 'color-mix(in oklab, var(--bad) 14%, transparent)' },
  New: { color: 'var(--good)', bg: 'color-mix(in oklab, var(--good) 14%, transparent)' },
};

function followUpSub(f: FollowUp): string {
  if (f.weeksMissed == null) return 'Not checked in yet';
  if (f.weeksMissed === 0) return 'Seen this week';
  return `Missed ${f.weeksMissed} week${f.weeksMissed === 1 ? '' : 's'}`;
}

function countdownLabel(daysAway: number): string {
  if (daysAway === 0) return 'today';
  if (daysAway === 1) return 'tomorrow';
  return `in ${daysAway} days`;
}

export default function DashboardPage() {
  const { snapshot } = useTracker();
  const { navigate } = useRouter();
  if (!snapshot) return null;

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const todayLabel = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const chrono = weeksChrono(snapshot);
  const thisWeek = currentWeek(snapshot);
  const weekLabel = thisWeek?.label || weekLabelFor(sundayOf(now));

  const activeWk = thisWeek ?? chrono[chrono.length - 1];
  const total = activeWk ? weekTotal(snapshot, activeWk.id) : 0;
  const prevWk = activeWk ? chrono[chrono.indexOf(activeWk) - 1] : undefined;
  const delta = prevWk ? total - weekTotal(snapshot, prevWk.id) : null;
  const deltaBadge =
    delta == null
      ? undefined
      : delta > 0
        ? { text: `▲ +${delta}`, color: 'var(--good)' }
        : delta < 0
          ? { text: `▼ ${delta}`, color: 'var(--bad)' }
          : { text: '— level', color: 'var(--text2)' };

  const groups = notDeleted(snapshot.groups);
  const activeGroups = activeWk
    ? new Set(
        meetingsForWeek(snapshot, activeWk.id)
          .filter((m) => m.groupId && meetingAttendance(snapshot, m) > 0)
          .map((m) => m.groupId),
      ).size
    : 0;

  const members = notDeleted(snapshot.members);
  const vips = members.filter((m) => m.status === 'vip').length;

  const campaign = activeCampaign(snapshot);
  const progress = campaign ? stageProgress(snapshot, campaign.id) : [];
  const cyclePct = campaign ? Math.round(campaignOverallPct(progress) * 100) : null;

  const bars = chrono.slice(-6).map((wk) => ({ label: wk.label, value: weekTotal(snapshot, wk.id) }));
  const queue = followUpQueue(snapshot);
  const birthdays = upcomingBirthdays(snapshot);
  const events = upcomingEvents(snapshot).slice(0, 4);

  return (
    <section className={`view ${styles.page}`}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div>
            <div className={styles.kicker}>{todayLabel}</div>
            <h1 className={styles.h1}>{greeting}</h1>
            <div className={styles.weekLine}>
              Reporting week — <strong>{weekLabel}</strong>
            </div>
          </div>
          <button type="button" className={`pressable ${styles.primaryBtn}`} onClick={() => navigate('/report')}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            This week's report
          </button>
        </div>

        <div className={styles.kpiGrid}>
          <StatTile label="This week" value={total} delta={deltaBadge} sub="total attendance · vs last week" />
          <StatTile label="Life groups" value={groups.length} sub={`${activeGroups} met this week`} />
          <StatTile label="Members" value={members.length} sub={`${vips} VIP${vips === 1 ? '' : 's'} in the pipeline`} />
          <CardButton className={styles.campaignTile} onClick={() => navigate('/campaign')}>
            <div className={styles.tileKicker}>{campaign?.name ?? 'Campaign'}</div>
            <div className={styles.tileValue}>{cyclePct == null ? '—' : `${cyclePct}%`}</div>
            <div className={styles.tileSub}>{campaign ? 'overall goal progress · open campaign' : 'No campaign yet — tap to create one'}</div>
          </CardButton>
        </div>

        <div className={styles.row}>
          <Card>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Attendance by week</h2>
              <span className={styles.cardMeta}>
                {chrono.length} week{chrono.length === 1 ? '' : 's'} tracked
              </span>
            </div>
            {bars.length > 0 ? (
              <BarChart title="Attendance by week" data={bars} />
            ) : (
              <p className={styles.quietNote}>No weeks yet — your first report starts the chart.</p>
            )}
          </Card>

          <Card>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Follow-up queue</h2>
              <button type="button" className={`pressable ${styles.pillLink}`} onClick={() => navigate('/members')}>
                All members
              </button>
            </div>
            {queue.length > 0 ? (
              <ul className={styles.queueList} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {queue.slice(0, 6).map((f) => {
                  const tag = TAG_COLORS[f.tag];
                  return (
                    <li key={f.member.id}>
                      <button type="button" className={styles.queueRow} onClick={() => navigate('/members')}>
                        <span className={styles.avatar} style={{ background: avatarColor(f.member.id) }} aria-hidden="true">
                          {initials(f.member.name)}
                        </span>
                        <span className={styles.queueBody}>
                          <span className={styles.queueName} style={{ display: 'block' }}>
                            {f.member.name}
                          </span>
                          <span className={styles.queueSub} style={{ display: 'block' }}>
                            {followUpSub(f)}
                          </span>
                        </span>
                        <span className={styles.tag} style={{ color: tag.color, background: tag.bg }}>
                          {f.tag}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div className={styles.allClear}>
                <div className={styles.mark} aria-hidden="true">
                  ✓
                </div>
                Everyone's been checked in recently. Great shepherding!
              </div>
            )}
          </Card>
        </div>

        <div className={styles.row} style={{ marginBottom: 0 }}>
          <Card>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>{campaign ? `${campaign.name} goals` : 'Campaign goals'}</h2>
              <button type="button" className={`pressable ${styles.pillLink}`} onClick={() => navigate('/campaign')}>
                Open campaign
              </button>
            </div>
            {campaign && progress.length > 0 ? (
              <div className={styles.stageList}>
                {progress.map((sp) => (
                  <div key={sp.stage.id}>
                    <div className={styles.stageTop}>
                      <span className={styles.stageName}>{sp.stage.label}</span>
                      <span className={styles.stageNums}>
                        <strong>{sp.actual}</strong> / {sp.goal}
                      </span>
                    </div>
                    <ProgressBar actual={sp.actual} goal={sp.goal} label={`${sp.stage.label}: ${sp.actual} of ${sp.goal}`} />
                  </div>
                ))}
              </div>
            ) : (
              <p className={styles.quietNote}>No campaign yet — set up your first cycle from the Campaign screen.</p>
            )}
          </Card>

          <div className={styles.sideStack}>
            <Card>
              <div className={styles.cardHead} style={{ marginBottom: 11 }}>
                <h2 className={styles.cardTitle}>
                  <span aria-hidden="true">🎂 </span>Birthdays soon
                </h2>
              </div>
              {birthdays.length > 0 ? (
                <div className={styles.miniList}>
                  {birthdays.map((b) => (
                    <button type="button" key={b.member.id} className={styles.birthdayRow} onClick={() => navigate('/members')}>
                      <span className={styles.birthdayName}>{b.member.name}</span>
                      <span className={styles.birthdayDate}>
                        {b.nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {countdownLabel(b.daysAway)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.quietNote}>No birthdays in the next 14 days.</p>
              )}
            </Card>

            <Card style={{ flex: 1 }}>
              <div className={styles.cardHead} style={{ marginBottom: 11 }}>
                <h2 className={styles.cardTitle}>Upcoming events</h2>
                <button type="button" className={`pressable ${styles.pillLink}`} onClick={() => navigate('/events')}>
                  All events
                </button>
              </div>
              {events.length > 0 ? (
                <div className={styles.miniList}>
                  {events.map((ev) => {
                    const evDate = parseISODate(ev.date);
                    const daysAway = evDate ? daysBetween(now, evDate) : null;
                    return (
                      <div key={ev.id} className={styles.eventRow}>
                        <div style={{ minWidth: 0 }}>
                          <div className={styles.eventName}>{ev.name || 'Untitled event'}</div>
                          <div className={styles.eventDate}>{formatDate(ev.date)}</div>
                        </div>
                        {daysAway != null && <span className={styles.countdown}>{countdownLabel(daysAway)}</span>}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className={styles.quietNote}>No dated events coming up — add them in Events &amp; Goals.</p>
              )}
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
