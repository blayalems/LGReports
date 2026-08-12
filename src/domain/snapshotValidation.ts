import type {
  AttendanceEvent,
  AuditEntry,
  Campaign,
  CampaignAttendanceEvent,
  CampaignEvent,
  CampaignMetric,
  CampaignSession,
  Config,
  Group,
  MediaRecord,
  Meeting,
  Member,
  MemberMilestone,
  Meta,
  Revisioned,
  Rival,
  Stage,
  TrackerSnapshot,
  Week,
} from './types';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || isNumber(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function isRevisioned(value: UnknownRecord): value is UnknownRecord & Revisioned {
  return (
    Number.isInteger(value.revision) &&
    isString(value.createdAt) &&
    isString(value.createdBy) &&
    isString(value.updatedAt) &&
    isString(value.updatedBy) &&
    isNullableString(value.deletedAt)
  );
}

function isMeta(value: unknown): value is Meta {
  return isRecord(value) && isString(value.trackerId) && Number.isInteger(value.schemaVersion) && isNullableString(value.spreadsheetId);
}

function isConfig(value: unknown): value is Config {
  return (
    isRecord(value) &&
    isRevisioned(value) &&
    value.id === 'config' &&
    isString(value.church) &&
    isString(value.network) &&
    isString(value.overseer) &&
    (value.theme === 'light' || value.theme === 'dark' || value.theme === 'auto') &&
    isString(value.accent) &&
    isNumber(value.atRiskWeeks) &&
    isStringArray(value.statusOptions) &&
    isNullableString(value.logoMediaId) &&
    value.weekStart === 'sunday' &&
    typeof value.sheetsConnected === 'boolean'
  );
}

function isStage(value: unknown): value is Stage {
  return isRecord(value) && isRevisioned(value) && isString(value.id) && isString(value.key) && isString(value.label) && isNumber(value.order);
}

function isGroup(value: unknown): value is Group {
  return (
    isRecord(value) &&
    isRevisioned(value) &&
    isString(value.id) &&
    isString(value.name) &&
    (value.category === 'leader' || value.category === 'open') &&
    isString(value.location) &&
    isNullableNumber(value.weeklyTarget)
  );
}

function isMember(value: unknown): value is Member {
  return (
    isRecord(value) &&
    isRevisioned(value) &&
    isString(value.id) &&
    isString(value.name) &&
    (value.status === 'vip' || value.status === 'regular' || value.status === 'leader' || value.status === 'inactive') &&
    isNullableString(value.groupId) &&
    isString(value.phone) &&
    (value.address === undefined || isString(value.address)) &&
    (value.notes === undefined || isString(value.notes)) &&
    isNullableNumber(value.birthdayMonth) &&
    isNullableNumber(value.birthdayDay) &&
    isNullableString(value.photoMediaId)
  );
}

function isMemberMilestone(value: unknown): value is MemberMilestone {
  return (
    isRecord(value) && isRevisioned(value) && isString(value.id) && isString(value.memberId) && isString(value.stageKey) && isNullableString(value.completedOn)
  );
}

function isWeek(value: unknown): value is Week {
  return (
    isRecord(value) &&
    isRevisioned(value) &&
    isString(value.id) &&
    isString(value.weekOf) &&
    isString(value.label) &&
    isString(value.network) &&
    isString(value.overseer) &&
    (value.status === 'draft' || value.status === 'submitted' || value.status === 'reopened') &&
    isNullableString(value.submittedAt) &&
    isNullableString(value.submittedBy)
  );
}

function isMeeting(value: unknown): value is Meeting {
  return (
    isRecord(value) &&
    isRevisioned(value) &&
    isString(value.id) &&
    isString(value.weekId) &&
    isNullableString(value.groupId) &&
    isString(value.leaderName) &&
    (value.category === 'leader' || value.category === 'open') &&
    isString(value.start) &&
    isString(value.end) &&
    isString(value.status) &&
    isString(value.date) &&
    isString(value.location) &&
    isNullableString(value.photoMediaId) &&
    isNumber(value.guestCount)
  );
}

function isAttendanceEvent(value: unknown): value is AttendanceEvent {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.meetingId) &&
    isString(value.memberId) &&
    (value.action === 'checked_in' || value.action === 'checked_out') &&
    isString(value.actorId) &&
    isString(value.clientTimestamp)
  );
}

function isCampaign(value: unknown): value is Campaign {
  return isRecord(value) && isRevisioned(value) && isString(value.id) && isString(value.name) && isString(value.start) && isString(value.end);
}

function isCampaignSession(value: unknown): value is CampaignSession {
  return (
    isRecord(value) &&
    isRevisioned(value) &&
    isString(value.id) &&
    isString(value.campaignId) &&
    ['prayparations', 'nls', 'kgc', 'light_up', 'liv', 'water_baptism'].includes(String(value.programKey)) &&
    isString(value.requirementKey) &&
    isString(value.name) &&
    isString(value.dateStart) &&
    isString(value.dateEnd) &&
    isNullableString(value.startTime) &&
    isNullableString(value.endTime) &&
    isNullableString(value.venue) &&
    isString(value.notes)
  );
}

function isCampaignAttendanceEvent(value: unknown): value is CampaignAttendanceEvent {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.campaignId) &&
    isString(value.sessionId) &&
    isString(value.memberId) &&
    (value.action === 'checked_in' || value.action === 'checked_out') &&
    isString(value.actorId) &&
    isString(value.clientTimestamp)
  );
}

function isCampaignMetric(value: unknown): value is CampaignMetric {
  return (
    isRecord(value) &&
    isRevisioned(value) &&
    isString(value.id) &&
    isString(value.campaignId) &&
    isString(value.metricKey) &&
    isNullableNumber(value.goal) &&
    isNullableNumber(value.actual) &&
    isNullableNumber(value.weekIndex)
  );
}

function isRival(value: unknown): value is Rival {
  return isRecord(value) && isRevisioned(value) && isString(value.id) && isString(value.campaignId) && isString(value.name) && isNumber(value.total);
}

function isCampaignEvent(value: unknown): value is CampaignEvent {
  const leaderAttendance = value && isRecord(value) ? value.leaderAttendance : undefined;
  const hasValidLeaderAttendance =
    leaderAttendance === undefined ||
    leaderAttendance === null ||
    (isRecord(leaderAttendance) &&
      Object.values(leaderAttendance).every((total) => isRecord(total) && isNullableNumber(total.actual) && isNullableNumber(total.goal)));
  return (
    isRecord(value) &&
    isRevisioned(value) &&
    isString(value.id) &&
    isString(value.name) &&
    isNullableString(value.date) &&
    isString(value.type) &&
    isNullableNumber(value.goal) &&
    isNullableNumber(value.actual) &&
    isString(value.notes) &&
    hasValidLeaderAttendance
  );
}

function isMediaRecord(value: unknown): value is MediaRecord {
  return (
    isRecord(value) &&
    isString(value.id) &&
    (value.kind === 'photo' || value.kind === 'logo') &&
    (value.ownerType === 'meeting' || value.ownerType === 'member' || value.ownerType === 'config') &&
    isString(value.ownerId) &&
    isNullableString(value.driveFileId) &&
    isNullableString(value.localBlobKey) &&
    isString(value.createdAt) &&
    isString(value.createdBy)
  );
}

function isAuditEntry(value: unknown): value is AuditEntry {
  return (
    isRecord(value) &&
    isString(value.id) &&
    isString(value.actorId) &&
    isString(value.action) &&
    isString(value.entityType) &&
    isString(value.entityId) &&
    isString(value.timestamp) &&
    isString(value.summary)
  );
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every(guard);
}

function hasUniqueIds(items: { id: string }[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

/** Runtime guard for untrusted JSON backups. It checks every snapshot collection and every required entity field. */
export function isTrackerSnapshot(value: unknown): value is TrackerSnapshot {
  if (!isRecord(value) || !isMeta(value.meta) || !isConfig(value.config)) return false;

  const collections = {
    stages: isArrayOf(value.stages, isStage) ? value.stages : null,
    groups: isArrayOf(value.groups, isGroup) ? value.groups : null,
    members: isArrayOf(value.members, isMember) ? value.members : null,
    memberMilestones: isArrayOf(value.memberMilestones, isMemberMilestone) ? value.memberMilestones : null,
    weeks: isArrayOf(value.weeks, isWeek) ? value.weeks : null,
    meetings: isArrayOf(value.meetings, isMeeting) ? value.meetings : null,
    attendanceEvents: isArrayOf(value.attendanceEvents, isAttendanceEvent) ? value.attendanceEvents : null,
    campaigns: isArrayOf(value.campaigns, isCampaign) ? value.campaigns : null,
    campaignSessions: isArrayOf(value.campaignSessions, isCampaignSession) ? value.campaignSessions : null,
    campaignAttendanceEvents: isArrayOf(value.campaignAttendanceEvents, isCampaignAttendanceEvent) ? value.campaignAttendanceEvents : null,
    campaignMetrics: isArrayOf(value.campaignMetrics, isCampaignMetric) ? value.campaignMetrics : null,
    rivals: isArrayOf(value.rivals, isRival) ? value.rivals : null,
    events: isArrayOf(value.events, isCampaignEvent) ? value.events : null,
    media: isArrayOf(value.media, isMediaRecord) ? value.media : null,
    audit: isArrayOf(value.audit, isAuditEntry) ? value.audit : null,
  };

  return Object.values(collections).every((items) => items !== null && hasUniqueIds(items));
}

export function assertTrackerSnapshot(value: unknown): asserts value is TrackerSnapshot {
  if (!isTrackerSnapshot(value)) throw new TypeError('Invalid tracker backup');
}

/** Adds collections introduced after v1 before validating an imported backup. */
export function normalizeTrackerSnapshot(value: unknown): TrackerSnapshot {
  if (!isRecord(value)) throw new TypeError('Invalid tracker backup');
  const normalized = {
    ...value,
    campaignSessions: Array.isArray(value.campaignSessions) ? value.campaignSessions : [],
    campaignAttendanceEvents: Array.isArray(value.campaignAttendanceEvents) ? value.campaignAttendanceEvents : [],
  };
  assertTrackerSnapshot(normalized);
  return normalized;
}
