import { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { Dialog } from '../../components/ui/Dialog';
import { DraftNumberInput } from '../../components/ui/DraftNumberInput';
import { EmptyState } from '../../components/ui/EmptyState';
import { ProgressBar } from '../../components/ui/ProgressBar';
import {
  CAMPAIGN_PRINCIPLES,
  CHECKIN_PROGRAMS,
  CYCLE6_CAMPAIGN,
  CYCLE6_SESSION_TEMPLATES,
  ESSENTIAL_ELEMENTS,
  PROGRAM_LABELS,
} from '../../domain/campaignCycle6';
import { daysBetween, formatDate, nowISO, parseISODate, todayISO, toISODate } from '../../domain/dateUtils';
import { newId } from '../../domain/ids';
import {
  campaignQualification,
  campaignQualifications,
  campaignSessionsFor,
  campaignWeeks,
  canAttendCampaignSession,
  currentCampaignSessionAttendeeIds,
  derivedCampaignActual,
  groupName,
  memberLastSeenISO,
  metricsForCampaign,
  notDeleted,
  stageProgress,
  type CampaignActionKey,
  type CampaignQualification,
} from '../../domain/selectors';
import type { Campaign, CampaignProgramKey, CampaignSession, Member, MemberStatus, TrackerSnapshot } from '../../domain/types';
import { showToast } from '../../hooks/useToast';
import { useRouter } from '../../router/HashRouter';
import { useTracker } from '../../state/StoreContext';
import { MemberDialog } from '../members/MemberDialog';
import styles from './CampaignPage.module.css';

type QueueFilter =
  | 'all'
  | 'one_lg_away'
  | 'kgc_eligible'
  | 'kgc_completed'
  | 'blocked_by_kgc'
  | 'light_up_ready'
  | 'light_up_completed'
  | 'liv_zero'
  | 'liv_one'
  | 'liv_complete'
  | 'baptism_ready'
  | 'baptized'
  | 'at_risk';

const FILTERS: { key: QueueFilter; label: string }[] = [
  { key: 'all', label: 'All people' },
  { key: 'one_lg_away', label: '1 LG away' },
  { key: 'kgc_eligible', label: 'KGC eligible' },
  { key: 'kgc_completed', label: 'KGC completed' },
  { key: 'blocked_by_kgc', label: 'Blocked by KGC' },
  { key: 'light_up_ready', label: 'Light Up ready' },
  { key: 'light_up_completed', label: 'Light Up completed' },
  { key: 'liv_zero', label: 'LIV 0/2' },
  { key: 'liv_one', label: 'LIV 1/2' },
  { key: 'liv_complete', label: 'LIV 2/2' },
  { key: 'baptism_ready', label: 'Baptism ready' },
  { key: 'baptized', label: 'Baptized' },
  { key: 'at_risk', label: 'At risk' },
];
const QUICK_FILTER_KEYS: QueueFilter[] = ['all', 'one_lg_away', 'kgc_eligible', 'blocked_by_kgc', 'light_up_ready', 'liv_one', 'baptism_ready', 'at_risk'];

const ACTION_PRIORITY: Record<CampaignActionKey, number> = {
  blocked_by_kgc: 0,
  kgc_eligible: 1,
  light_up_ready: 2,
  one_lg_away: 3,
  liv_incomplete: 4,
  baptism_ready: 5,
  needs_two_lg: 6,
  complete_light_up: 7,
  complete: 8,
};

function campaignToFocus(snapshot: TrackerSnapshot, selectedId: string | null): Campaign | undefined {
  const campaigns = notDeleted(snapshot.campaigns)
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
  if (selectedId) return campaigns.find((campaign) => campaign.id === selectedId);
  const today = todayISO();
  return (
    campaigns.find((campaign) => campaign.start <= today && campaign.end >= today) ?? campaigns.find((campaign) => campaign.start > today) ?? campaigns.at(-1)
  );
}

function deadlineLabel(date: string | null): string {
  if (!date) return 'No remaining scheduled date';
  const parsed = parseISODate(date);
  if (!parsed) return formatDate(date);
  const days = daysBetween(new Date(), parsed);
  if (days === 0) return `Today · ${formatDate(date, { month: 'short', day: 'numeric' })}`;
  if (days === 1) return `Tomorrow · ${formatDate(date, { month: 'short', day: 'numeric' })}`;
  if (days > 1) return `${formatDate(date, { month: 'short', day: 'numeric' })} · ${days} days`;
  return formatDate(date, { month: 'short', day: 'numeric' });
}

function timeLabel(session: CampaignSession): string {
  if (!session.startTime) return '';
  const format = (value: string) => {
    const [hour, minute] = value.split(':').map(Number);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${suffix}`;
  };
  return session.endTime ? `${format(session.startTime)}–${format(session.endTime)}` : format(session.startTime);
}

function statusMatches(state: CampaignQualification, filter: QueueFilter, snapshot: TrackerSnapshot): boolean {
  if (filter === 'all') return true;
  if (filter === 'one_lg_away') return state.actionKey === 'one_lg_away';
  if (filter === 'kgc_eligible') return state.kgcEligible && !state.kgcCompleted;
  if (filter === 'kgc_completed') return state.kgcCompleted;
  if (filter === 'blocked_by_kgc') return state.actionKey === 'blocked_by_kgc';
  if (filter === 'light_up_ready') return state.actionKey === 'light_up_ready';
  if (filter === 'light_up_completed') return state.lightUpCompleted;
  if (filter === 'liv_zero') return state.lightUpCompleted && state.livProgress === 0;
  if (filter === 'liv_one') return state.lightUpCompleted && state.livProgress === 1;
  if (filter === 'liv_complete') return state.livCompleted;
  if (filter === 'baptism_ready') return state.waterBaptismEligible && !state.waterBaptismCompleted;
  if (filter === 'baptized') return state.waterBaptismCompleted;
  const lastSeen = memberLastSeenISO(snapshot, state.member.id);
  if (!lastSeen) return true;
  const parsed = parseISODate(lastSeen);
  return parsed ? daysBetween(parsed, new Date()) >= snapshot.config.atRiskWeeks * 7 : true;
}

function queueCopy(state: CampaignQualification, filter: QueueFilter): { status: string; action: string } {
  if (filter === 'kgc_completed')
    return { status: 'Knowing God completed', action: state.lightUpEligible ? 'Confirm a Light Up weekend' : 'Build the third named Life Group attendance' };
  if (filter === 'light_up_completed') return { status: 'Light Up completed', action: 'Follow up for Living in Victory and Water Baptism' };
  if (filter === 'liv_zero') return { status: 'Living in Victory: 0 of 2 completed', action: 'Attend both required Sundays' };
  if (filter === 'liv_one') return { status: 'Living in Victory: 1 of 2 completed', action: 'Attend the remaining required Sunday' };
  if (filter === 'liv_complete') return { status: 'Living in Victory: 2 of 2 completed', action: 'Continue faithful follow-up' };
  if (filter === 'baptism_ready') return { status: 'Ready for Water Baptism', action: 'Confirm Water Baptism attendance' };
  if (filter === 'baptized') return { status: 'Water Baptism completed', action: 'Continue faithful follow-up' };
  if (filter === 'at_risk') return { status: 'Attendance follow-up at risk', action: 'Reconnect personally before the next deadline' };
  return { status: state.blocker, action: state.nextAction };
}

function KpiCard({ label, count, detail, active, onClick }: { label: string; count: number; detail: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={styles.kpiCard} aria-pressed={active} onClick={onClick}>
      <span className={styles.kpiLabel}>{label}</span>
      <strong className={styles.kpiValue}>{count}</strong>
      <span className={styles.kpiDetail}>{detail}</span>
      <span className={styles.kpiLink}>View people →</span>
    </button>
  );
}

function SessionCheckinDialog({ campaign, session, onClose }: { campaign: Campaign; session: CampaignSession; onClose: () => void }) {
  const { snapshot, dispatch, actorId } = useTracker();
  const [query, setQuery] = useState('');
  if (!snapshot) return null;
  const present = currentCampaignSessionAttendeeIds(snapshot.campaignAttendanceEvents, session.id);
  const q = query.trim().toLowerCase();
  const rows = notDeleted(snapshot.members)
    .filter(
      (member) =>
        member.status !== 'inactive' && (!q || member.name.toLowerCase().includes(q) || groupName(snapshot, member.groupId).toLowerCase().includes(q)),
    )
    .map((member) => ({
      member,
      gate: canAttendCampaignSession(snapshot, campaign, session, member),
      state: campaignQualification(snapshot, campaign, member, session.dateStart),
    }))
    .sort((a, b) => Number(b.gate.allowed) - Number(a.gate.allowed) || a.member.name.localeCompare(b.member.name));

  const toggle = async (member: Member, allowed: boolean) => {
    const checkedIn = present.has(member.id);
    if (!checkedIn && !allowed) {
      showToast('Correct the source attendance first — eligibility cannot be overridden.', 'error');
      return;
    }
    await dispatch({
      entity: { type: 'campaignAttendanceEvent', id: newId() },
      op: 'append',
      payload: {
        campaignId: campaign.id,
        sessionId: session.id,
        memberId: member.id,
        action: checkedIn ? 'checked_out' : 'checked_in',
        actorId,
        clientTimestamp: nowISO(),
      },
    });
    showToast(`${member.name} ${checkedIn ? 'checked out' : 'checked in'}`, checkedIn ? 'info' : 'success');
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`${PROGRAM_LABELS[session.programKey]} check-in`}
      variant="sheet"
      headerExtra={<span className={styles.sessionCount}>{present.size} checked in</span>}
      footer={
        <button type="button" className={`pressable ${styles.primaryBtn}`} onClick={onClose}>
          Done
        </button>
      }
    >
      <div className={styles.checkinMeta}>
        <strong>{formatDate(session.dateStart, { weekday: 'short', month: 'short', day: 'numeric' })}</strong>
        {timeLabel(session) && <span>{timeLabel(session)}</span>}
        {session.venue && <span>{session.venue}</span>}
      </div>
      <label>
        <span className="visually-hidden">Search people by name or Life Group</span>
        <input
          className={styles.search}
          type="search"
          placeholder="Search name or Life Group…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <p className={styles.eligibleNote}>Eligible people appear first. Blocked check-ins explain which source record needs correction.</p>
      <ul className={styles.checkinList}>
        {rows.map(({ member, gate, state }) => {
          const checkedIn = present.has(member.id);
          return (
            <li key={member.id}>
              <button
                type="button"
                className={styles.checkinRow}
                aria-pressed={checkedIn}
                aria-disabled={!checkedIn && !gate.allowed}
                onClick={() => void toggle(member, gate.allowed)}
              >
                <span className={styles.checkinBody}>
                  <strong>{member.name || 'Unnamed person'}</strong>
                  <span>
                    {groupName(snapshot, member.groupId) || 'No Life Group'} · {state.lifeGroupAttendanceCount} named LG
                  </span>
                  <span className={gate.allowed ? styles.readyText : styles.blockedText}>{gate.reason}</span>
                </span>
                <span className={checkedIn ? styles.checkedBadge : gate.allowed ? styles.quickBadge : styles.lockedBadge}>
                  {checkedIn ? 'Checked in' : gate.allowed ? 'Check in' : 'Blocked'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

function Timeline({ snapshot, campaign, states }: { snapshot: TrackerSnapshot; campaign: Campaign; states: CampaignQualification[] }) {
  const today = todayISO();
  const unique = new Map<string, CampaignSession>();
  for (const session of campaignSessionsFor(snapshot, campaign.id)) {
    const key = `${session.programKey}:${session.requirementKey}:${session.dateStart}`;
    if (!unique.has(key)) unique.set(key, session);
  }
  const milestones = [...unique.values()].sort((a, b) => a.dateStart.localeCompare(b.dateStart));
  const next = milestones.find((session) => session.dateStart >= today);
  const kgcWaiting = states.filter((state) => state.kgcEligible && !state.kgcCompleted).length;
  const lightReady = states.filter((state) => state.lightUpEligible && !state.lightUpCompleted).length;
  const blockedKgc = states.filter((state) => state.actionKey === 'blocked_by_kgc').length;
  const livOne = states.filter((state) => state.livProgress === 1).length;
  let focusCopy = 'Keep named Life Group attendance current so every person has a clear next action.';
  if (next?.programKey === 'kgc') focusCopy = `${kgcWaiting} people are KGC eligible. ${next.name} is ${deadlineLabel(next.dateStart).toLowerCase()}.`;
  else if (next?.programKey === 'light_up') focusCopy = `${lightReady} people are Light Up ready. ${blockedKgc} more are blocked only by KGC.`;
  else if (next?.programKey === 'liv') focusCopy = `${livOne} Light Up graduates have completed 1 of 2 Living in Victory Sundays.`;

  return (
    <Card className={styles.fullWidth}>
      <div className={styles.cardHead}>
        <div>
          <span className={styles.eyebrow}>Milestone-aware timeline</span>
          <h2 className={styles.cardTitle}>{next ? `Next: ${PROGRAM_LABELS[next.programKey]}` : 'Campaign schedule'}</h2>
          <p className={styles.cardHint}>{focusCopy}</p>
        </div>
        {next && <span className={styles.deadlineBadge}>{deadlineLabel(next.dateStart)}</span>}
      </div>
      <ol className={styles.timeline}>
        {milestones.map((session) => {
          const past = session.dateEnd < today;
          const current = session.id === next?.id;
          return (
            <li
              key={`${session.programKey}:${session.requirementKey}:${session.dateStart}`}
              className={current ? styles.timelineCurrent : past ? styles.timelinePast : ''}
            >
              <span className={styles.timelineDot} aria-hidden="true" />
              <strong>{PROGRAM_LABELS[session.programKey]}</strong>
              <time dateTime={session.dateStart}>{formatDate(session.dateStart, { month: 'short', day: 'numeric' })}</time>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function WeeklyProgress({ snapshot, campaign }: { snapshot: TrackerSnapshot; campaign: Campaign }) {
  const rows = campaignWeeks(campaign).map((week) => {
    const states = campaignQualifications(snapshot, campaign, week.end);
    return {
      ...week,
      namedLg: states.filter((state) => state.lifeGroupAttendanceDates.some((date) => date >= week.start && date <= week.end)).length,
      kgcCompleted: states.filter((state) => state.kgcCompleted).length,
      lightReady: states.filter((state) => state.lightUpEligible && !state.lightUpCompleted).length,
      lightCompleted: states.filter((state) => state.lightUpCompleted).length,
      livCompleted: states.filter((state) => state.livCompleted).length,
      baptized: states.filter((state) => state.waterBaptismCompleted).length,
    };
  });
  return (
    <Card className={styles.fullWidth}>
      <div className={styles.cardHead}>
        <div>
          <span className={styles.eyebrow}>Weekly progress report</span>
          <h2 className={styles.cardTitle}>Named people moving through the path</h2>
          <p className={styles.cardHint}>Weekly LG is unique named people that week; downstream stages are cumulative completions.</p>
        </div>
      </div>
      <div className={styles.weeklyGrid}>
        {rows.map((row) => (
          <article key={row.index} className={styles.weekCard}>
            <time>{row.label}</time>
            <dl>
              <div>
                <dt>Named LG</dt>
                <dd>{row.namedLg}</dd>
              </div>
              <div>
                <dt>KGC done</dt>
                <dd>{row.kgcCompleted}</dd>
              </div>
              <div>
                <dt>Light Up ready</dt>
                <dd>{row.lightReady}</dd>
              </div>
              <div>
                <dt>Light Up done</dt>
                <dd>{row.lightCompleted}</dd>
              </div>
              <div>
                <dt>LIV 2/2</dt>
                <dd>{row.livCompleted}</dd>
              </div>
              <div>
                <dt>Baptized</dt>
                <dd>{row.baptized}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </Card>
  );
}

function ScheduleEditor({ snapshot, campaign, onCheckin }: { snapshot: TrackerSnapshot; campaign: Campaign; onCheckin: (session: CampaignSession) => void }) {
  const { dispatch } = useTracker();
  const [newProgram, setNewProgram] = useState<CampaignProgramKey>('kgc');
  const sessions = campaignSessionsFor(snapshot, campaign.id);
  const grouped = new Map<CampaignProgramKey, CampaignSession[]>();
  sessions.forEach((session) => grouped.set(session.programKey, [...(grouped.get(session.programKey) ?? []), session]));
  const update = (session: CampaignSession, payload: Partial<CampaignSession>) =>
    void dispatch({ entity: { type: 'campaignSession', id: session.id }, op: 'update', payload, baseRevision: session.revision });
  const addOffering = () => {
    const requirementId = newId();
    void dispatch({
      entity: { type: 'campaignSession', id: newId() },
      op: 'create',
      payload: {
        campaignId: campaign.id,
        programKey: newProgram,
        requirementKey: `${newProgram}:${requirementId}`,
        name: PROGRAM_LABELS[newProgram],
        dateStart: campaign.start,
        dateEnd: campaign.start,
        startTime: null,
        endTime: null,
        venue: null,
        notes: '',
      },
    });
  };

  return (
    <Card className={styles.fullWidth}>
      <details>
        <summary className={styles.summaryRow}>
          <span>
            <strong>Cycle schedule &amp; event check-in</strong>
            <small>{sessions.length} editable offerings · KGC, Light Up, LIV and Baptism check-in</small>
          </span>
          <span>Open schedule</span>
        </summary>
        <div className={styles.scheduleGroups}>
          <div className={styles.addOffering}>
            <label>
              <span className="visually-hidden">Program for new offering</span>
              <select value={newProgram} onChange={(event) => setNewProgram(event.target.value as CampaignProgramKey)}>
                {Object.entries(PROGRAM_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className={`pressable ${styles.secondaryBtn}`} onClick={addOffering}>
              + Add offering
            </button>
          </div>
          {sessions.length === 0 && <p className={styles.cardHint}>No offerings yet. Add one here or apply the official Cycle 6 template.</p>}
          {[...grouped].map(([program, rows]) => (
            <section key={program} className={styles.scheduleGroup}>
              <div className={styles.scheduleGroupHead}>
                <h3>{PROGRAM_LABELS[program]}</h3>
                <span>
                  {rows.length} offering{rows.length === 1 ? '' : 's'}
                </span>
              </div>
              {rows.map((session) => (
                <div key={session.id} className={styles.sessionRow}>
                  <label>
                    <span>Date</span>
                    <input
                      type="date"
                      value={session.dateStart}
                      onChange={(event) =>
                        update(session, {
                          dateStart: event.target.value,
                          dateEnd: session.dateEnd === session.dateStart ? event.target.value : session.dateEnd,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span>Ends</span>
                    <input type="date" min={session.dateStart} value={session.dateEnd} onChange={(event) => update(session, { dateEnd: event.target.value })} />
                  </label>
                  <label>
                    <span>Start</span>
                    <input type="time" value={session.startTime ?? ''} onChange={(event) => update(session, { startTime: event.target.value || null })} />
                  </label>
                  <label>
                    <span>End time</span>
                    <input type="time" value={session.endTime ?? ''} onChange={(event) => update(session, { endTime: event.target.value || null })} />
                  </label>
                  <label className={styles.venueField}>
                    <span>Venue</span>
                    <input
                      defaultValue={session.venue ?? ''}
                      placeholder="Not provided"
                      onBlur={(event) => event.target.value !== (session.venue ?? '') && update(session, { venue: event.target.value || null })}
                    />
                  </label>
                  {CHECKIN_PROGRAMS.includes(program) && (
                    <button
                      type="button"
                      className={`pressable ${styles.checkinBtn}`}
                      aria-label={`Check in ${PROGRAM_LABELS[program]} on ${session.dateStart}${session.startTime ? ` at ${session.startTime}` : ''}`}
                      onClick={() => onCheckin(session)}
                    >
                      Check in
                    </button>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
      </details>
    </Card>
  );
}

export default function CampaignPage({ params = [] }: { params?: string[] }) {
  const { snapshot, dispatch } = useTracker();
  const { navigate } = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<QueueFilter>((FILTERS.some((filter) => filter.key === params[0]) ? params[0] : 'all') as QueueFilter);
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | MemberStatus>('all');
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);
  const [checkinSessionId, setCheckinSessionId] = useState<string | null>(null);
  if (!snapshot) return null;

  const campaigns = notDeleted(snapshot.campaigns)
    .slice()
    .sort((a, b) => a.start.localeCompare(b.start));
  const campaign = campaignToFocus(snapshot, selectedId);

  const createCycle6 = async () => {
    const existing = campaigns.find((row) => row.name === CYCLE6_CAMPAIGN.name);
    if (existing) {
      setSelectedId(existing.id);
      showToast('Cycle 6 is already available', 'info');
      return;
    }
    const campaignId = newId();
    await dispatch({ entity: { type: 'campaign', id: campaignId }, op: 'create', payload: CYCLE6_CAMPAIGN });
    for (const session of CYCLE6_SESSION_TEMPLATES) {
      await dispatch({ entity: { type: 'campaignSession', id: newId() }, op: 'create', payload: { campaignId, ...session } });
    }
    setSelectedId(campaignId);
    showToast('Official Cycle 6 schedule added — goals are ready for you to set', 'success');
  };

  const addCampaign = async () => {
    const id = newId();
    const start = todayISO();
    const end = new Date();
    end.setDate(end.getDate() + 90);
    await dispatch({ entity: { type: 'campaign', id }, op: 'create', payload: { name: 'New Cycle', start, end: toISODate(end) } });
    setSelectedId(id);
  };

  if (!campaign) {
    return (
      <section className={`view ${styles.page}`}>
        <div className={styles.inner}>
          <div className={styles.header}>
            <div>
              <span className={styles.eyebrow}>One More for Jesus</span>
              <h1 className={styles.h1}>Campaign command center</h1>
            </div>
          </div>
          <Card className={styles.emptyCard}>
            <EmptyState
              icon=""
              title="Start with the official Cycle 6 plan"
              hint="Add the authorized September–November schedule. Goals stay blank until your network sets them."
            />
            <div className={styles.emptyActions}>
              <button type="button" className={`pressable ${styles.primaryBtn}`} onClick={() => void createCycle6()}>
                Apply OMJ Cycle 6 schedule
              </button>
              <button type="button" className={`pressable ${styles.secondaryBtn}`} onClick={() => void addCampaign()}>
                Create a different cycle
              </button>
            </div>
          </Card>
        </div>
      </section>
    );
  }

  const sessions = campaignSessionsFor(snapshot, campaign.id);
  const states = campaignQualifications(snapshot, campaign);
  const groups = notDeleted(snapshot.groups)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const metrics = metricsForCampaign(snapshot, campaign.id);
  const progress = stageProgress(snapshot, campaign.id);
  const q = query.trim().toLowerCase();
  const visibleStates = states
    .filter((state) => statusMatches(state, activeFilter, snapshot))
    .filter((state) => groupFilter === 'all' || state.member.groupId === groupFilter)
    .filter((state) => statusFilter === 'all' || state.member.status === statusFilter)
    .filter((state) => !q || state.member.name.toLowerCase().includes(q) || groupName(snapshot, state.member.groupId).toLowerCase().includes(q))
    .sort(
      (a, b) =>
        ACTION_PRIORITY[a.actionKey] - ACTION_PRIORITY[b.actionKey] ||
        (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') ||
        a.member.name.localeCompare(b.member.name),
    );

  const counts = {
    kgcEligible: states.filter((state) => state.kgcEligible && !state.kgcCompleted).length,
    oneAway: states.filter((state) => state.actionKey === 'one_lg_away').length,
    blockedKgc: states.filter((state) => state.actionKey === 'blocked_by_kgc').length,
    lightReady: states.filter((state) => state.actionKey === 'light_up_ready').length,
    livIncomplete: states.filter((state) => state.lightUpCompleted && !state.livCompleted).length,
    baptismReady: states.filter((state) => state.waterBaptismEligible && !state.waterBaptismCompleted).length,
  };

  const updateCampaign = (payload: Partial<Campaign>) =>
    void dispatch({ entity: { type: 'campaign', id: campaign.id }, op: 'update', payload, baseRevision: campaign.revision });
  const goalMetric = (stageKey: string) => metrics.find((metric) => metric.metricKey === stageKey && metric.weekIndex == null);
  const setMetric = (stageKey: string, patch: { goal?: number | null; actual?: number | null }) => {
    const existing = goalMetric(stageKey);
    if (existing) void dispatch({ entity: { type: 'campaignMetric', id: existing.id }, op: 'update', payload: patch, baseRevision: existing.revision });
    else
      void dispatch({
        entity: { type: 'campaignMetric', id: newId() },
        op: 'create',
        payload: { campaignId: campaign.id, metricKey: stageKey, goal: patch.goal ?? null, actual: patch.actual ?? null, weekIndex: null },
      });
  };
  const chooseFilter = (filter: QueueFilter, groupId = groupFilter) => {
    setActiveFilter(filter);
    setGroupFilter(groupId);
    const queueElement = document.getElementById('campaign-action-queue');
    if (queueElement && typeof queueElement.scrollIntoView === 'function') queueElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const openMember = openMemberId ? notDeleted(snapshot.members).find((member) => member.id === openMemberId) : undefined;
  const checkinSession = checkinSessionId ? sessions.find((session) => session.id === checkinSessionId) : undefined;

  return (
    <section className={`view ${styles.page}`}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>One More for Jesus</span>
            <h1 className={styles.h1}>Retention &amp; qualification</h1>
            <p className={styles.intro}>Move identifiable people toward Knowing God and Light Up before each deadline.</p>
          </div>
          <div className={styles.cycleTabs} role="tablist" aria-label="Campaign cycles">
            {campaigns.map((row) => (
              <button key={row.id} type="button" role="tab" aria-selected={row.id === campaign.id} onClick={() => setSelectedId(row.id)}>
                {row.name || 'Untitled cycle'}
              </button>
            ))}
            <button type="button" aria-label="Create another cycle" onClick={() => void addCampaign()}>
              +
            </button>
          </div>
        </header>

        <Card className={styles.campaignHero}>
          <div className={styles.heroFields}>
            <label>
              <span>Campaign</span>
              <input defaultValue={campaign.name} onBlur={(event) => event.target.value !== campaign.name && updateCampaign({ name: event.target.value })} />
            </label>
            <label>
              <span>Starts</span>
              <input type="date" value={campaign.start} onChange={(event) => updateCampaign({ start: event.target.value })} />
            </label>
            <label>
              <span>Ends</span>
              <input type="date" value={campaign.end} onChange={(event) => updateCampaign({ end: event.target.value })} />
            </label>
          </div>
          {sessions.length === 0 && (
            <div className={styles.templateCallout}>
              <span>This cycle has no person-level schedule yet.</span>
              <button type="button" className={`pressable ${styles.secondaryBtn}`} onClick={() => void createCycle6()}>
                Add official Cycle 6 instead
              </button>
            </div>
          )}
        </Card>

        <div className={styles.kpiGrid} aria-label="Priority campaign queues">
          <KpiCard
            label="KGC eligible now"
            count={counts.kgcEligible}
            detail="2+ named LG · no KGC"
            active={activeFilter === 'kgc_eligible'}
            onClick={() => chooseFilter('kgc_eligible')}
          />
          <KpiCard
            label="1 LG away from KGC"
            count={counts.oneAway}
            detail="Invite back this week"
            active={activeFilter === 'one_lg_away'}
            onClick={() => chooseFilter('one_lg_away')}
          />
          <KpiCard
            label="Light Up blocked by KGC"
            count={counts.blockedKgc}
            detail="3+ LG · KGC only blocker"
            active={activeFilter === 'blocked_by_kgc'}
            onClick={() => chooseFilter('blocked_by_kgc')}
          />
          <KpiCard
            label="Light Up ready"
            count={counts.lightReady}
            detail="3+ LG · KGC complete"
            active={activeFilter === 'light_up_ready'}
            onClick={() => chooseFilter('light_up_ready')}
          />
          <KpiCard
            label="LIV incomplete"
            count={counts.livIncomplete}
            detail="Light Up complete · 0/2 or 1/2"
            active={activeFilter === 'liv_one'}
            onClick={() => chooseFilter('liv_one')}
          />
          <KpiCard
            label="Water Baptism ready"
            count={counts.baptismReady}
            detail="Light Up complete · not baptized"
            active={activeFilter === 'baptism_ready'}
            onClick={() => chooseFilter('baptism_ready')}
          />
        </div>

        <Timeline snapshot={snapshot} campaign={campaign} states={states} />
        <WeeklyProgress snapshot={snapshot} campaign={campaign} />

        <div className={styles.twoColumn}>
          <Card id="campaign-action-queue" className={styles.queueCard}>
            <div className={styles.cardHead}>
              <div>
                <span className={styles.eyebrow}>Action Queue</span>
                <h2 className={styles.cardTitle}>{FILTERS.find((filter) => filter.key === activeFilter)?.label}</h2>
                <p className={styles.cardHint}>Name → status → blocker → next action → deadline</p>
              </div>
              <span className={styles.resultCount}>{visibleStates.length} people</span>
            </div>
            <div className={styles.filterChips} role="group" aria-label="Quick filters">
              {FILTERS.filter((filter) => QUICK_FILTER_KEYS.includes(filter.key)).map((filter) => (
                <button key={filter.key} type="button" aria-pressed={activeFilter === filter.key} onClick={() => chooseFilter(filter.key)}>
                  {filter.label}
                </button>
              ))}
            </div>
            <div className={styles.queueControls}>
              <label>
                <span className="visually-hidden">Search candidate</span>
                <input
                  className={styles.search}
                  type="search"
                  value={query}
                  placeholder="Search name or group…"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <label>
                <span className="visually-hidden">Filter by Life Group</span>
                <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
                  <option value="all">All Life Groups</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="visually-hidden">Filter by member status</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as 'all' | MemberStatus)}>
                  <option value="all">All statuses</option>
                  <option value="vip">VIP</option>
                  <option value="regular">Regular</option>
                  <option value="leader">Leader</option>
                </select>
              </label>
            </div>
            {visibleStates.length === 0 ? (
              <EmptyState icon="" title="No people in this queue" hint="Try another filter, or record named Life Group attendance." />
            ) : (
              <ul className={styles.queueList}>
                {visibleStates.map((state) => {
                  const copy = queueCopy(state, activeFilter);
                  return (
                    <li key={state.member.id}>
                      <button type="button" className={styles.personRow} onClick={() => setOpenMemberId(state.member.id)}>
                        <span className={styles.personMain}>
                          <strong>{state.member.name || 'Unnamed person'}</strong>
                          <span>
                            {groupName(snapshot, state.member.groupId) || 'No Life Group'} · {state.lifeGroupAttendanceCount} named LG
                          </span>
                        </span>
                        <span className={styles.personStatus}>
                          <strong>{copy.status}</strong>
                          <span>{copy.action}</span>
                        </span>
                        <span className={styles.personDeadline}>{deadlineLabel(state.deadline)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <div className={styles.cardHead}>
              <div>
                <span className={styles.eyebrow}>Goals &amp; actuals</span>
                <h2 className={styles.cardTitle}>Funnel checkpoints</h2>
                <p className={styles.cardHint}>Goals stay editable. KGC, Light Up, LIV and Baptism actuals come from named session records.</p>
              </div>
            </div>
            <div className={styles.goalList}>
              {progress.map((row) => {
                const derived = derivedCampaignActual(snapshot, campaign.id, row.stage.key) != null;
                const actualInputId = `campaign-${campaign.id}-${row.stage.key}-actual`;
                const goalInputId = `campaign-${campaign.id}-${row.stage.key}-goal`;
                return (
                  <div key={row.stage.id} className={styles.goalRow}>
                    <div className={styles.goalTop}>
                      <strong>{row.stage.label}</strong>
                      <span>{derived ? 'Derived' : 'Manual / legacy'}</span>
                    </div>
                    <div className={styles.goalInputs}>
                      {derived ? (
                        <span className={styles.goalField}>
                          <span>Actual</span>
                          <output aria-label={`${row.stage.label} derived actual`}>{row.actual}</output>
                        </span>
                      ) : (
                        <label htmlFor={actualInputId}>
                          <span>Actual</span>
                          <DraftNumberInput
                            id={actualInputId}
                            aria-label={`${row.stage.label} manual actual`}
                            min={0}
                            value={goalMetric(row.stage.key)?.actual}
                            onCommit={(actual) => setMetric(row.stage.key, { actual })}
                          />
                        </label>
                      )}
                      <span>/</span>
                      <label htmlFor={goalInputId}>
                        <span>Goal</span>
                        <DraftNumberInput
                          id={goalInputId}
                          aria-label={`${row.stage.label} goal`}
                          min={0}
                          value={goalMetric(row.stage.key)?.goal}
                          onCommit={(goal) => setMetric(row.stage.key, { goal })}
                        />
                      </label>
                    </div>
                    <ProgressBar actual={row.actual} goal={row.goal} label={`${row.stage.label}: ${row.actual} of ${row.goal || 'unset'}`} />
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        <Card className={styles.fullWidth}>
          <div className={styles.cardHead}>
            <div>
              <span className={styles.eyebrow}>Leader accountability</span>
              <h2 className={styles.cardTitle}>Follow-up by Life Group</h2>
              <p className={styles.cardHint}>Use these counts for ownership and coaching, not competition.</p>
            </div>
          </div>
          <div className={styles.leaderTableWrap}>
            <table className={styles.leaderTable}>
              <thead>
                <tr>
                  <th>Life Group / owner</th>
                  <th>Connected</th>
                  <th>KGC eligible</th>
                  <th>KGC done</th>
                  <th>Blocked by KGC</th>
                  <th>Light Up ready</th>
                  <th>Light Up done</th>
                  <th>LIV 0/2</th>
                  <th>LIV 1/2</th>
                  <th>LIV 2/2</th>
                  <th>Baptism ready</th>
                  <th>Baptized</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => {
                  const rows = states.filter((state) => state.member.groupId === group.id);
                  const cell = (label: string, value: number, filter: QueueFilter) => (
                    <td>
                      <button type="button" aria-label={`${group.name}: ${label} ${value}`} onClick={() => chooseFilter(filter, group.id)}>
                        {value}
                      </button>
                    </td>
                  );
                  return (
                    <tr key={group.id}>
                      <th scope="row">{group.name}</th>
                      {cell('connected', rows.length, 'all')}
                      {cell('KGC eligible', rows.filter((s) => s.kgcEligible && !s.kgcCompleted).length, 'kgc_eligible')}
                      {cell('KGC completed', rows.filter((s) => s.kgcCompleted).length, 'kgc_completed')}
                      {cell('blocked by KGC', rows.filter((s) => s.actionKey === 'blocked_by_kgc').length, 'blocked_by_kgc')}
                      {cell('Light Up ready', rows.filter((s) => s.actionKey === 'light_up_ready').length, 'light_up_ready')}
                      {cell('Light Up completed', rows.filter((s) => s.lightUpCompleted).length, 'light_up_completed')}
                      {cell('LIV zero of two', rows.filter((s) => s.lightUpCompleted && s.livProgress === 0).length, 'liv_zero')}
                      {cell('LIV one of two', rows.filter((s) => s.livProgress === 1).length, 'liv_one')}
                      {cell('LIV two of two', rows.filter((s) => s.livCompleted).length, 'liv_complete')}
                      {cell('Baptism ready', rows.filter((s) => s.waterBaptismEligible && !s.waterBaptismCompleted).length, 'baptism_ready')}
                      {cell('Baptized', rows.filter((s) => s.waterBaptismCompleted).length, 'baptized')}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <ScheduleEditor snapshot={snapshot} campaign={campaign} onCheckin={(session) => setCheckinSessionId(session.id)} />

        <Card className={styles.fullWidth}>
          <details>
            <summary className={styles.summaryRow}>
              <span>
                <strong>Campaign Playbook · 10 Essential Elements</strong>
                <small>Practice guide — not qualification gates</small>
              </span>
              <span>Open playbook</span>
            </summary>
            <div className={styles.playbook}>
              {CAMPAIGN_PRINCIPLES.map((principle) => (
                <blockquote key={principle}>{principle}</blockquote>
              ))}
              <ol>
                {ESSENTIAL_ELEMENTS.map((element) => (
                  <li key={element}>{element}</li>
                ))}
              </ol>
              <p>
                <strong>Qualification reminder:</strong> New Life Sunday and Beginning Your New Life are not prerequisites for Knowing God or Light Up.
              </p>
            </div>
          </details>
        </Card>

        <div className={styles.mobileQueueCta}>
          <button type="button" className={`pressable ${styles.primaryBtn}`} onClick={() => navigate('/campaign/all')}>
            Open Action Queue
          </button>
        </div>
      </div>
      {openMember && <MemberDialog member={openMember} onClose={() => setOpenMemberId(null)} />}
      {checkinSession && <SessionCheckinDialog campaign={campaign} session={checkinSession} onClose={() => setCheckinSessionId(null)} />}
    </section>
  );
}
