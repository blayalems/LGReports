// Pure derived-data functions shared across screens. Nothing here mutates state or
// talks to a repository — screens call these with a TrackerSnapshot and render the result.
// Keeping this centralized means Dashboard/Analytics/Members never duplicate (and drift on)
// the same "what counts as at-risk" or "what's this week's total" logic.

import { daysBetween, nextAnniversary, parseISODate, sundayOf, toISODate } from './dateUtils';
import type {
  AttendanceEvent,
  Campaign,
  CampaignAttendanceEvent,
  CampaignMetric,
  CampaignProgramKey,
  CampaignSession,
  Group,
  Meeting,
  Member,
  Stage,
  TrackerSnapshot,
  Week,
} from './types';

export function notDeleted<T extends { deletedAt: string | null }>(items: T[]): T[] {
  return items.filter((x) => !x.deletedAt);
}

// ---------- Weeks & meetings ----------

export function weeksChrono(snapshot: TrackerSnapshot): Week[] {
  return notDeleted(snapshot.weeks)
    .slice()
    .sort((a, b) => (a.weekOf < b.weekOf ? -1 : a.weekOf > b.weekOf ? 1 : 0));
}

/** The Week row for the current (today's) Sunday-start week, if one has been created yet. */
export function currentWeek(snapshot: TrackerSnapshot, today = new Date()): Week | undefined {
  const iso = toISODate(sundayOf(today));
  return notDeleted(snapshot.weeks).find((w) => w.weekOf === iso);
}

export function meetingsForWeek(snapshot: TrackerSnapshot, weekId: string): Meeting[] {
  return notDeleted(snapshot.meetings).filter((m) => m.weekId === weekId);
}

/** Current checked-in member ids for a meeting: latest event per member, chronological. */
export function currentAttendeeIds(events: AttendanceEvent[], meetingId: string): Set<string> {
  const byMember = new Map<string, AttendanceEvent>();
  for (const ev of events) {
    if (ev.meetingId !== meetingId) continue;
    const existing = byMember.get(ev.memberId);
    if (!existing || existing.clientTimestamp <= ev.clientTimestamp) {
      byMember.set(ev.memberId, ev);
    }
  }
  const present = new Set<string>();
  for (const [memberId, ev] of byMember) {
    if (ev.action === 'checked_in') present.add(memberId);
  }
  return present;
}

/** Attendance is always derived, never hand-typed: checked-in members + guest count. */
export function meetingAttendance(snapshot: TrackerSnapshot, meeting: Meeting): number {
  return currentAttendeeIds(snapshot.attendanceEvents, meeting.id).size + (meeting.guestCount || 0);
}

export function weekTotal(snapshot: TrackerSnapshot, weekId: string): number {
  return meetingsForWeek(snapshot, weekId).reduce((sum, m) => sum + meetingAttendance(snapshot, m), 0);
}

// ---------- Members ----------

export function memberLastSeenISO(snapshot: TrackerSnapshot, memberId: string): string | null {
  let last: string | null = null;
  for (const meeting of notDeleted(snapshot.meetings)) {
    const attendees = currentAttendeeIds(snapshot.attendanceEvents, meeting.id);
    if (!attendees.has(memberId)) continue;
    const week = snapshot.weeks.find((w) => w.id === meeting.weekId);
    const when = week?.weekOf || meeting.date || '';
    if (when && (!last || when > last)) last = when;
  }
  return last;
}

export interface FollowUp {
  member: Member;
  weeksMissed: number | null;
  tag: 'VIP' | 'At risk' | 'New';
}

export function followUpQueue(snapshot: TrackerSnapshot, today = new Date()): FollowUp[] {
  const atRiskWeeks = snapshot.config.atRiskWeeks || 3;
  const todayISO = toISODate(today);
  const out: FollowUp[] = [];
  for (const member of notDeleted(snapshot.members)) {
    const lastSeen = memberLastSeenISO(snapshot, member.id);
    const weeksMissed = lastSeen ? Math.floor(daysBetween(parseISODate(lastSeen) ?? today, today) / 7) : null;
    if (member.status === 'vip' && (weeksMissed === null || weeksMissed >= 1)) {
      out.push({ member, weeksMissed, tag: 'VIP' });
    } else if (weeksMissed !== null && weeksMissed >= atRiskWeeks) {
      out.push({ member, weeksMissed, tag: 'At risk' });
    } else if (!lastSeen && member.createdAt >= todayISO) {
      out.push({ member, weeksMissed: null, tag: 'New' });
    }
  }
  return out.sort((a, b) => (b.weeksMissed ?? 99) - (a.weeksMissed ?? 99));
}

export function atRiskMembers(snapshot: TrackerSnapshot, today = new Date()): FollowUp[] {
  return followUpQueue(snapshot, today).filter((f) => f.tag === 'At risk');
}

export interface UpcomingBirthday {
  member: Member;
  nextDate: Date;
  daysAway: number;
}

export function upcomingBirthdays(snapshot: TrackerSnapshot, withinDays = 14, from = new Date()): UpcomingBirthday[] {
  const out: UpcomingBirthday[] = [];
  for (const member of notDeleted(snapshot.members)) {
    if (!member.birthdayMonth || !member.birthdayDay) continue;
    const next = nextAnniversary(from, member.birthdayMonth, member.birthdayDay);
    const daysAway = daysBetween(from, next);
    if (daysAway >= 0 && daysAway <= withinDays) out.push({ member, nextDate: next, daysAway });
  }
  return out.sort((a, b) => a.daysAway - b.daysAway);
}

export function initials(name: string): string {
  return String(name || '?')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

const AV_COLORS = ['#0E7C6B', '#C4763B', '#5A6FBE', '#8A5CA0', '#B04A6E', '#3B8AA8', '#7A8A3B'];

export function avatarColor(id: string): string {
  let h = 0;
  for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 997;
  return AV_COLORS[h % AV_COLORS.length];
}

export function groupName(snapshot: TrackerSnapshot, groupId: string | null): string {
  if (!groupId) return '';
  return snapshot.groups.find((g) => g.id === groupId)?.name ?? '';
}

// ---------- Events ----------

export function upcomingEvents(snapshot: TrackerSnapshot, from = new Date()) {
  const startOfDay = parseISODate(toISODate(from));
  return notDeleted(snapshot.events)
    .filter((e) => {
      const eventDate = parseISODate(e.date);
      return eventDate != null && startOfDay != null && eventDate >= startOfDay;
    })
    .sort((a, b) => (a.date! < b.date! ? -1 : 1));
}

// ---------- Campaigns ----------

export function activeCampaign(snapshot: TrackerSnapshot, today = new Date()): Campaign | undefined {
  const todayISO = toISODate(today);
  const campaigns = notDeleted(snapshot.campaigns);
  const sessions = notDeleted(snapshot.campaignSessions ?? []);
  const scheduledCampaignIds = new Set(sessions.map((session) => session.campaignId));
  const active = campaigns
    .filter((campaign) => campaign.start <= todayISO && todayISO <= campaign.end)
    .sort((a, b) => Number(scheduledCampaignIds.has(b.id)) - Number(scheduledCampaignIds.has(a.id)) || b.start.localeCompare(a.start))[0];
  const futureCampaigns = campaigns.filter((campaign) => campaign.start > todayISO).sort((a, b) => a.start.localeCompare(b.start));
  if (active) {
    if (scheduledCampaignIds.has(active.id)) return active;
    const upcomingScheduled = futureCampaigns.find((campaign) => scheduledCampaignIds.has(campaign.id));
    if (upcomingScheduled) {
      const nextRelevantDate = [
        upcomingScheduled.start,
        ...sessions.filter((session) => session.campaignId === upcomingScheduled.id).map((session) => session.dateStart),
      ]
        .filter((date) => date >= todayISO)
        .sort()[0];
      const parsed = nextRelevantDate ? parseISODate(nextRelevantDate) : null;
      if (parsed && daysBetween(today, parsed) <= 30) return upcomingScheduled;
    }
    return active;
  }
  const future = futureCampaigns[0];
  if (future) return future;
  return campaigns.slice().sort((a, b) => (a.end > b.end ? -1 : 1))[0];
}

export function metricsForCampaign(snapshot: TrackerSnapshot, campaignId: string): CampaignMetric[] {
  return notDeleted(snapshot.campaignMetrics).filter((m) => m.campaignId === campaignId);
}

export interface CampaignWeekRange {
  index: number;
  start: string;
  end: string;
  label: string;
}

/** Sunday-start reporting weeks that intersect a campaign, capped to two years. */
export function campaignWeeks(campaign: Campaign): CampaignWeekRange[] {
  const campaignStart = parseISODate(campaign.start);
  const campaignEnd = parseISODate(campaign.end);
  if (!campaignStart || !campaignEnd || campaignEnd < campaignStart) return [];

  const firstSunday = sundayOf(campaignStart);
  const weeks: CampaignWeekRange[] = [];
  const cursor = new Date(firstSunday);
  while (cursor <= campaignEnd && weeks.length < 104) {
    const saturday = new Date(cursor);
    saturday.setDate(saturday.getDate() + 6);
    const visibleStart = cursor < campaignStart ? campaignStart : cursor;
    const visibleEnd = saturday > campaignEnd ? campaignEnd : saturday;
    const labelStart = visibleStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const labelEnd = visibleEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    weeks.push({
      index: weeks.length,
      start: toISODate(cursor),
      end: toISODate(saturday),
      label: `${labelStart} - ${labelEnd}`,
    });
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

export function campaignCurrentWeekIndex(campaign: Campaign, today = new Date()): number {
  const weeks = campaignWeeks(campaign);
  if (weeks.length === 0) return 0;
  const todayISO = toISODate(today);
  const containing = weeks.find((week) => week.start <= todayISO && todayISO <= week.end);
  if (containing) return containing.index;
  return todayISO < weeks[0].start ? 0 : weeks.length - 1;
}

export interface StageProgress {
  stage: Stage;
  goal: number;
  actual: number;
  pct: number;
}

export function stageProgress(snapshot: TrackerSnapshot, campaignId: string): StageProgress[] {
  const metrics = metricsForCampaign(snapshot, campaignId);
  return notDeleted(snapshot.stages)
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((stage) => {
      const derivedActual = derivedCampaignActual(snapshot, campaignId, stage.key);
      const legacyMetric = metrics.find((metric) => metric.metricKey === stage.key && metric.weekIndex == null);
      const goal = legacyMetric?.goal ?? 0;
      const actual = derivedActual ?? legacyMetric?.actual ?? 0;
      return { stage, goal, actual, pct: goal > 0 ? actual / goal : 0 };
    });
}

// ---------- Cycle qualification & person-level campaign attendance ----------

export function currentCampaignSessionAttendeeIds(events: CampaignAttendanceEvent[], sessionId: string): Set<string> {
  const byMember = new Map<string, CampaignAttendanceEvent>();
  for (const event of events) {
    if (event.sessionId !== sessionId) continue;
    const existing = byMember.get(event.memberId);
    if (!existing || existing.clientTimestamp <= event.clientTimestamp) byMember.set(event.memberId, event);
  }
  return new Set([...byMember].filter(([, event]) => event.action === 'checked_in').map(([memberId]) => memberId));
}

export function campaignSessionsFor(snapshot: TrackerSnapshot, campaignId: string, programKey?: CampaignProgramKey): CampaignSession[] {
  return notDeleted(snapshot.campaignSessions ?? [])
    .filter((session) => session.campaignId === campaignId && (!programKey || session.programKey === programKey))
    .slice()
    .sort((a, b) => a.dateStart.localeCompare(b.dateStart) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.name.localeCompare(b.name));
}

/** Distinct dated Life Group meetings where the named person is currently checked in. */
export function lifeGroupAttendanceDates(snapshot: TrackerSnapshot, memberId: string, throughISO = '9999-12-31'): string[] {
  const dates: string[] = [];
  for (const meeting of notDeleted(snapshot.meetings)) {
    // A reporting-week start is not evidence that an undated meeting happened
    // before a historical campaign session. Named check-in records only become
    // qualification evidence once the meeting has an actual local calendar date.
    const meetingDate = meeting.date;
    if (!meetingDate || meetingDate > throughISO) continue;
    if (currentAttendeeIds(snapshot.attendanceEvents, meeting.id).has(memberId)) dates.push(meetingDate);
  }
  return dates.sort();
}

function attendedSessions(
  snapshot: TrackerSnapshot,
  campaignId: string,
  memberId: string,
  throughISO: string,
  programKey?: CampaignProgramKey,
): CampaignSession[] {
  return campaignSessionsFor(snapshot, campaignId, programKey).filter(
    (session) => session.dateStart <= throughISO && currentCampaignSessionAttendeeIds(snapshot.campaignAttendanceEvents ?? [], session.id).has(memberId),
  );
}

function legacyMilestoneDate(snapshot: TrackerSnapshot, memberId: string, stageKey: string, throughISO: string): string | null {
  return (
    notDeleted(snapshot.memberMilestones)
      .filter((milestone) => milestone.memberId === memberId && milestone.stageKey === stageKey && milestone.completedOn && milestone.completedOn <= throughISO)
      .sort((a, b) => (a.completedOn ?? '').localeCompare(b.completedOn ?? ''))[0]?.completedOn ?? null
  );
}

function completedDate(
  snapshot: TrackerSnapshot,
  campaignId: string,
  memberId: string,
  programKey: CampaignProgramKey,
  legacyStageKey: string,
  throughISO: string,
): string | null {
  const configured = campaignSessionsFor(snapshot, campaignId, programKey);
  if (configured.length > 0) return attendedSessions(snapshot, campaignId, memberId, throughISO, programKey)[0]?.dateStart ?? null;
  return legacyMilestoneDate(snapshot, memberId, legacyStageKey, throughISO);
}

export type CampaignActionKey =
  'needs_two_lg' | 'one_lg_away' | 'kgc_eligible' | 'blocked_by_kgc' | 'light_up_ready' | 'complete_light_up' | 'liv_incomplete' | 'baptism_ready' | 'complete';

export interface CampaignQualification {
  member: Member;
  campaign: Campaign;
  asOf: string;
  lifeGroupAttendanceDates: string[];
  lifeGroupAttendanceCount: number;
  kgcEligible: boolean;
  kgcCompleted: boolean;
  kgcCompletedOn: string | null;
  lightUpEligible: boolean;
  lightUpCompleted: boolean;
  lightUpCompletedOn: string | null;
  livSession1Attended: boolean;
  livSession2Attended: boolean;
  livProgress: 0 | 1 | 2;
  livCompleted: boolean;
  waterBaptismEligible: boolean;
  waterBaptismCompleted: boolean;
  waterBaptismCompletedOn: string | null;
  blocker: string;
  actionKey: CampaignActionKey;
  nextAction: string;
  deadline: string | null;
}

function nextSessionDate(snapshot: TrackerSnapshot, campaignId: string, programKey: CampaignProgramKey, afterISO: string): string | null {
  return campaignSessionsFor(snapshot, campaignId, programKey).find((session) => session.dateStart >= afterISO)?.dateStart ?? null;
}

function lastSessionDate(snapshot: TrackerSnapshot, campaignId: string, programKey: CampaignProgramKey, throughISO: string): string | null {
  return (
    campaignSessionsFor(snapshot, campaignId, programKey)
      .filter((session) => session.dateStart <= throughISO)
      .at(-1)?.dateStart ?? null
  );
}

function actionDetails(
  snapshot: TrackerSnapshot,
  campaign: Campaign,
  asOf: string,
  state: Omit<CampaignQualification, 'blocker' | 'actionKey' | 'nextAction' | 'deadline'>,
): Pick<CampaignQualification, 'blocker' | 'actionKey' | 'nextAction' | 'deadline'> {
  if (state.lightUpCompleted && state.livProgress < 2) {
    const nextLiv = nextSessionDate(snapshot, campaign.id, 'liv', asOf);
    const nextBaptism = nextSessionDate(snapshot, campaign.id, 'water_baptism', asOf);
    const nextAction = nextLiv
      ? state.livProgress === 1
        ? 'Attend the remaining Living in Victory Sunday'
        : 'Start Living in Victory; Water Baptism is also unlocked'
      : nextBaptism
        ? 'LIV dates have passed; confirm Water Baptism and arrange LIV follow-up'
        : 'Follow up on incomplete Living in Victory';
    return {
      blocker: `Living in Victory: ${state.livProgress} of 2 completed`,
      actionKey: 'liv_incomplete',
      nextAction,
      deadline: nextLiv ?? nextBaptism ?? lastSessionDate(snapshot, campaign.id, 'liv', asOf) ?? lastSessionDate(snapshot, campaign.id, 'water_baptism', asOf),
    };
  }
  if (state.lightUpCompleted && !state.waterBaptismCompleted) {
    return {
      blocker: 'Ready for Water Baptism',
      actionKey: 'baptism_ready',
      nextAction: 'Confirm Water Baptism attendance',
      deadline: nextSessionDate(snapshot, campaign.id, 'water_baptism', asOf) ?? lastSessionDate(snapshot, campaign.id, 'water_baptism', asOf),
    };
  }
  if (state.lightUpEligible && !state.lightUpCompleted) {
    return {
      blocker: 'Ready for Light Up',
      actionKey: 'light_up_ready',
      nextAction: 'Confirm a Light Up Retreat weekend',
      deadline: nextSessionDate(snapshot, campaign.id, 'light_up', asOf) ?? lastSessionDate(snapshot, campaign.id, 'light_up', asOf),
    };
  }
  if (state.lifeGroupAttendanceCount >= 3 && !state.kgcCompleted) {
    return {
      blocker: '3 LG attendances reached — KGC is the only blocker',
      actionKey: 'blocked_by_kgc',
      nextAction: 'Invite to the next Knowing God Class',
      deadline: nextSessionDate(snapshot, campaign.id, 'kgc', asOf) ?? lastSessionDate(snapshot, campaign.id, 'kgc', asOf),
    };
  }
  if (state.kgcEligible && !state.kgcCompleted) {
    return {
      blocker: 'KGC eligible',
      actionKey: 'kgc_eligible',
      nextAction: 'Invite to the next Knowing God Class',
      deadline: nextSessionDate(snapshot, campaign.id, 'kgc', asOf) ?? lastSessionDate(snapshot, campaign.id, 'kgc', asOf),
    };
  }
  if (state.kgcCompleted && state.lifeGroupAttendanceCount < 3) {
    return {
      blocker: 'Needs 1 more Life Group attendance for Light Up',
      actionKey: 'complete_light_up',
      nextAction: 'Invite back to Life Group',
      deadline: nextSessionDate(snapshot, campaign.id, 'light_up', asOf) ?? lastSessionDate(snapshot, campaign.id, 'light_up', asOf),
    };
  }
  if (state.lifeGroupAttendanceCount === 1) {
    return {
      blocker: 'Needs 1 more Life Group attendance for KGC',
      actionKey: 'one_lg_away',
      nextAction: 'Invite back to Life Group',
      deadline: nextSessionDate(snapshot, campaign.id, 'kgc', asOf) ?? lastSessionDate(snapshot, campaign.id, 'kgc', asOf),
    };
  }
  if (!state.lightUpCompleted) {
    return {
      blocker: 'Needs 2 Life Group attendances for KGC',
      actionKey: 'needs_two_lg',
      nextAction: 'Connect through a named Life Group check-in',
      deadline: nextSessionDate(snapshot, campaign.id, 'kgc', asOf) ?? lastSessionDate(snapshot, campaign.id, 'kgc', asOf),
    };
  }
  return { blocker: 'Campaign path completed', actionKey: 'complete', nextAction: 'Continue faithful follow-up', deadline: null };
}

export function campaignQualification(
  snapshot: TrackerSnapshot,
  campaign: Campaign,
  member: Member,
  asOfDate: Date | string = new Date(),
): CampaignQualification {
  const asOf = typeof asOfDate === 'string' ? asOfDate.slice(0, 10) : toISODate(asOfDate);
  const lgDates = lifeGroupAttendanceDates(snapshot, member.id, asOf);
  const kgcCompletedOn = completedDate(snapshot, campaign.id, member.id, 'kgc', 'kg', asOf);
  const lightUpCompletedOn = completedDate(snapshot, campaign.id, member.id, 'light_up', 'lu', asOf);
  const waterBaptismCompletedOn = completedDate(snapshot, campaign.id, member.id, 'water_baptism', 'wb', asOf);
  const livSessions = campaignSessionsFor(snapshot, campaign.id, 'liv');
  const livRequirements = [...new Set(livSessions.map((session) => session.requirementKey))].sort();
  const attendedLivRequirements = new Set(attendedSessions(snapshot, campaign.id, member.id, asOf, 'liv').map((session) => session.requirementKey));
  let livProgress: 0 | 1 | 2;
  if (livRequirements.length > 0) livProgress = Math.min(2, attendedLivRequirements.size) as 0 | 1 | 2;
  else livProgress = legacyMilestoneDate(snapshot, member.id, 'liv', asOf) ? 2 : 0;
  const base = {
    member,
    campaign,
    asOf,
    lifeGroupAttendanceDates: lgDates,
    lifeGroupAttendanceCount: lgDates.length,
    kgcEligible: lgDates.length >= 2,
    kgcCompleted: Boolean(kgcCompletedOn),
    kgcCompletedOn,
    lightUpEligible: lgDates.length >= 3 && Boolean(kgcCompletedOn),
    lightUpCompleted: Boolean(lightUpCompletedOn),
    lightUpCompletedOn,
    livSession1Attended: Boolean(livRequirements[0] && attendedLivRequirements.has(livRequirements[0])),
    livSession2Attended: Boolean(livRequirements[1] && attendedLivRequirements.has(livRequirements[1])),
    livProgress,
    livCompleted: livProgress === 2,
    waterBaptismEligible: Boolean(lightUpCompletedOn),
    waterBaptismCompleted: Boolean(waterBaptismCompletedOn),
    waterBaptismCompletedOn,
  };
  return { ...base, ...actionDetails(snapshot, campaign, asOf, base) };
}

export function campaignQualifications(snapshot: TrackerSnapshot, campaign: Campaign, asOf: Date | string = new Date()): CampaignQualification[] {
  return notDeleted(snapshot.members)
    .filter((member) => member.status !== 'inactive')
    .map((member) => campaignQualification(snapshot, campaign, member, asOf));
}

export function canAttendCampaignSession(
  snapshot: TrackerSnapshot,
  campaign: Campaign,
  session: CampaignSession,
  member: Member,
): { allowed: boolean; reason: string } {
  const state = campaignQualification(snapshot, campaign, member, session.dateStart);
  if (session.programKey === 'kgc') {
    return state.kgcEligible
      ? { allowed: true, reason: 'KGC eligible' }
      : {
          allowed: false,
          reason: `Needs ${2 - state.lifeGroupAttendanceCount} more Life Group attendance${state.lifeGroupAttendanceCount === 1 ? '' : 's'} for KGC`,
        };
  }
  if (session.programKey === 'light_up') {
    if (state.lifeGroupAttendanceCount < 3)
      return {
        allowed: false,
        reason: `Needs ${3 - state.lifeGroupAttendanceCount} more Life Group attendance${state.lifeGroupAttendanceCount === 2 ? '' : 's'} for Light Up`,
      };
    if (!state.kgcCompleted) return { allowed: false, reason: 'KGC is the only blocker' };
    return { allowed: true, reason: 'Ready for Light Up' };
  }
  if (session.programKey === 'liv') {
    return state.lightUpCompleted ? { allowed: true, reason: 'Light Up completed' } : { allowed: false, reason: 'Complete Light Up first' };
  }
  if (session.programKey === 'water_baptism') {
    return state.lightUpCompleted ? { allowed: true, reason: 'Ready for Water Baptism' } : { allowed: false, reason: 'Complete Light Up first' };
  }
  return { allowed: true, reason: 'Informational campaign event' };
}

export function derivedCampaignActual(snapshot: TrackerSnapshot, campaignId: string, stageKey: string): number | null {
  if (campaignSessionsFor(snapshot, campaignId).length === 0) return null;
  const campaign = notDeleted(snapshot.campaigns).find((row) => row.id === campaignId);
  if (!campaign) return null;
  const states = campaignQualifications(snapshot, campaign);
  if (stageKey === 'kg') return states.filter((state) => state.kgcCompleted).length;
  if (stageKey === 'lu') return states.filter((state) => state.lightUpCompleted).length;
  if (stageKey === 'liv') return states.filter((state) => state.livCompleted).length;
  if (stageKey === 'wb') return states.filter((state) => state.waterBaptismCompleted).length;
  return null;
}

// ---------- Group / leader comparison ----------

export function leaderAverages(snapshot: TrackerSnapshot, weeksBack = 8): { group: Group; avg: number; trend: 'up' | 'down' | 'flat' }[] {
  const chrono = weeksChrono(snapshot).slice(-weeksBack);
  return notDeleted(snapshot.groups).map((group) => {
    const totals = chrono.map((wk) =>
      meetingsForWeek(snapshot, wk.id)
        .filter((m) => m.groupId === group.id)
        .reduce((s, m) => s + meetingAttendance(snapshot, m), 0),
    );
    const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
    const half = Math.floor(totals.length / 2);
    const firstHalf = totals.slice(0, half).reduce((a, b) => a + b, 0) / (half || 1);
    const secondHalf = totals.slice(half).reduce((a, b) => a + b, 0) / (totals.length - half || 1);
    const trend = secondHalf > firstHalf + 0.5 ? 'up' : secondHalf < firstHalf - 0.5 ? 'down' : 'flat';
    return { group, avg, trend };
  });
}
