import { BarChart } from '../../components/charts/BarChart';
import { Card, CardButton } from '../../components/ui/Card';
import { StatTile } from '../../components/ui/StatTile';
import { daysBetween, formatDate, parseISODate, sundayOf, todayISO, weekLabelFor } from '../../domain/dateUtils';
import {
  activeCampaign,
  avatarColor,
  campaignQualifications,
  campaignSessionsFor,
  currentWeek,
  followUpQueue,
  initials,
  meetingAttendance,
  meetingsForWeek,
  notDeleted,
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

  const campaign =
    activeCampaign(snapshot) ??
    notDeleted(snapshot.campaigns)
      .filter((row) => row.start > todayISO())
      .sort((a, b) => a.start.localeCompare(b.start))[0];
  const campaignStates = campaign ? campaignQualifications(snapshot, campaign) : [];
  const kgcEligible = campaignStates.filter((state) => state.kgcEligible && !state.kgcCompleted).length;
  const lightUpReady = campaignStates.filter((state) => state.lightUpEligible && !state.lightUpCompleted).length;
  const blockedByKgc = campaignStates.filter((state) => state.actionKey === 'blocked_by_kgc').length;
  const nextCampaignSession = campaign ? campaignSessionsFor(snapshot, campaign.id).find((session) => session.dateStart >= todayISO()) : undefined;

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
          <CardButton className={styles.campaignTile} onClick={() => navigate('/campaign/kgc_eligible')}>
            <div className={styles.tileKicker}>{campaign?.name ?? 'Campaign'}</div>
            <div className={styles.tileValue}>{campaign ? kgcEligible : '—'}</div>
            <div className={styles.tileSub}>{campaign ? 'KGC eligible now · open queue' : 'No campaign yet — tap to create one'}</div>
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
              <h2 className={styles.cardTitle}>Pastoral follow-up</h2>
              <button type="button" className={`pressable ${styles.pillLink}`} onClick={() => navigate('/members')}>
                All members
              </button>
            </div>
            {queue.length > 0 ? (
              <ul className={styles.queueList}>
                {queue.slice(0, 3).map((f) => {
                  const tag = TAG_COLORS[f.tag];
                  return (
                    <li key={f.member.id}>
                      <button type="button" className={styles.queueRow} onClick={() => navigate('/members')}>
                        <span className={styles.avatar} style={{ background: avatarColor(f.member.id) }} aria-hidden="true">
                          {initials(f.member.name)}
                        </span>
                        <span className={styles.queueBody}>
                          <span className={styles.queueName}>{f.member.name}</span>
                          <span className={styles.queueSub}>{followUpSub(f)}</span>
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
              <p className={styles.quietNote}>Everyone has checked in recently.</p>
            )}
          </Card>
        </div>

        <div className={styles.row} style={{ marginBottom: 0 }}>
          <Card className={styles.cycleFocus}>
            <div className={styles.cardHead}>
              <div>
                <h2 className={styles.cardTitle}>{campaign ? 'Cycle 6 Focus' : 'Campaign focus'}</h2>
                {campaign && (
                  <p className={styles.focusNext}>
                    {nextCampaignSession
                      ? `Next: ${nextCampaignSession.name} · ${formatDate(nextCampaignSession.dateStart, { month: 'short', day: 'numeric' })}`
                      : 'No remaining scheduled milestone'}
                  </p>
                )}
              </div>
              <button type="button" className={`pressable ${styles.pillLink}`} onClick={() => navigate('/campaign')}>
                Full Action Queue
              </button>
            </div>
            {campaign ? (
              <div className={styles.focusGrid}>
                <button type="button" onClick={() => navigate('/campaign/kgc_eligible')}>
                  <strong>{kgcEligible}</strong>
                  <span>KGC eligible</span>
                </button>
                <button type="button" onClick={() => navigate('/campaign/light_up_ready')}>
                  <strong>{lightUpReady}</strong>
                  <span>Light Up ready</span>
                </button>
                <button type="button" onClick={() => navigate('/campaign/blocked_by_kgc')}>
                  <strong>{blockedByKgc}</strong>
                  <span>KGC-only blockers</span>
                </button>
              </div>
            ) : (
              <p className={styles.quietNote}>Set up the official Cycle 6 schedule from Campaign.</p>
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
