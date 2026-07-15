// Pure derived-data functions shared across screens. Nothing here mutates state or
// talks to a repository — screens call these with a TrackerSnapshot and render the result.
// Keeping this centralized means Dashboard/Analytics/Members never duplicate (and drift on)
// the same "what counts as at-risk" or "what's this week's total" logic.

import { daysBetween, nextAnniversary, parseISODate, sundayOf, toISODate } from './dateUtils';
import type { AttendanceEvent, Campaign, CampaignMetric, Group, Meeting, Member, Stage, TrackerSnapshot, Week } from './types';

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
  const active = campaigns.find((c) => c.start <= todayISO && todayISO <= c.end);
  if (active) return active;
  const future = campaigns.filter((c) => c.start > todayISO).sort((a, b) => (a.start < b.start ? -1 : 1))[0];
  if (future) return future;
  return campaigns.slice().sort((a, b) => (a.end > b.end ? -1 : 1))[0];
}

export function metricsForCampaign(snapshot: TrackerSnapshot, campaignId: string): CampaignMetric[] {
  return notDeleted(snapshot.campaignMetrics).filter((m) => m.campaignId === campaignId);
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
    .sort((a, b) => a.order - b.order)
    .map((stage) => {
      const metric = metrics.find((m) => m.metricKey === stage.key);
      const goal = metric?.goal ?? 0;
      const actual = metric?.actual ?? 0;
      return { stage, goal, actual, pct: goal > 0 ? Math.min(1, actual / goal) : 0 };
    });
}

export function campaignOverallPct(progress: StageProgress[]): number {
  const totalGoal = progress.reduce((s, p) => s + p.goal, 0);
  const totalActual = progress.reduce((s, p) => s + p.actual, 0);
  return totalGoal > 0 ? totalActual / totalGoal : 0;
}

export function campaignTimePct(campaign: Campaign, today = new Date()): number {
  const start = parseISODate(campaign.start)?.getTime() ?? 0;
  const end = parseISODate(campaign.end)?.getTime() ?? 0;
  if (end <= start) return 0;
  const elapsed = today.getTime() - start;
  return Math.min(1, Math.max(0, elapsed / (end - start)));
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
