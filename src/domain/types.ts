// Domain contract shared by every screen and both TrackerRepository implementations
// (local/IndexedDB in phase 1, Google Sheets/Drive in phase 2). Keep this the single
// source of truth for entity shape so the Sheets schema and the UI never drift apart.

export type ID = string;

export type SyncState = 'disconnected' | 'connecting' | 'loading' | 'saving' | 'saved' | 'stale' | 'error';

export type ReportStatus = 'draft' | 'submitted' | 'reopened';

export type GroupCategory = 'leader' | 'open';

export type MemberStatus = 'vip' | 'regular' | 'leader' | 'inactive';

/** Fields every mutable (non-append-only) entity carries for optimistic concurrency + soft delete. */
export interface Revisioned {
  revision: number;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  /** Tombstone timestamp. Rows are never physically deleted — see spec: "tombstone instead of physical row deletion". */
  deletedAt: string | null;
}

// ---------- Core ----------

export interface Meta {
  trackerId: string;
  schemaVersion: number;
  spreadsheetId: string | null;
}

export interface Config extends Revisioned {
  id: 'config';
  church: string;
  network: string;
  overseer: string;
  theme: 'light' | 'dark' | 'auto';
  accent: string;
  atRiskWeeks: number;
  statusOptions: string[];
  logoMediaId: string | null;
  weekStart: 'sunday';
  sheetsConnected: boolean;
}

export interface Stage extends Revisioned {
  id: ID;
  key: string;
  label: string;
  order: number;
}

// ---------- People ----------

export interface Group extends Revisioned {
  id: ID;
  name: string;
  category: GroupCategory;
  location: string;
  weeklyTarget: number | null;
}

export interface Member extends Revisioned {
  id: ID;
  name: string;
  status: MemberStatus;
  groupId: ID | null;
  phone: string;
  address: string;
  /** Private care notes, including prayer requests and follow-up context. */
  notes: string;
  /** Month/day only, no year — privacy minimization default (see rebuild spec). */
  birthdayMonth: number | null;
  birthdayDay: number | null;
  photoMediaId: string | null;
}

export interface MemberMilestone extends Revisioned {
  id: ID;
  memberId: ID;
  stageKey: string;
  completedOn: string | null; // ISO date
}

// ---------- Reporting ----------

export interface Week extends Revisioned {
  id: ID;
  weekOf: string; // ISO date, Sunday
  label: string;
  network: string;
  overseer: string;
  status: ReportStatus;
  submittedAt: string | null;
  submittedBy: string | null;
}

export interface Meeting extends Revisioned {
  id: ID;
  weekId: ID;
  groupId: ID | null;
  leaderName: string;
  category: GroupCategory;
  start: string;
  end: string;
  status: string;
  date: string;
  location: string;
  photoMediaId: string | null;
  guestCount: number;
}

/** Append-only. Current attendance = latest event per (meetingId, memberId), see selectors.ts. */
export interface AttendanceEvent {
  id: ID; // client-generated event id, used to dedupe retries
  meetingId: ID;
  memberId: ID;
  action: 'checked_in' | 'checked_out';
  actorId: string;
  clientTimestamp: string;
}

// ---------- Programs ----------

export interface Campaign extends Revisioned {
  id: ID;
  name: string;
  start: string;
  end: string;
}

export interface CampaignMetric extends Revisioned {
  id: ID;
  campaignId: ID;
  /** e.g. a stage key for milestone goals, "growth.groupsGoal", or "weeklyVip:2" */
  metricKey: string;
  goal: number | null;
  actual: number | null;
  weekIndex: number | null;
}

export interface Rival extends Revisioned {
  id: ID;
  campaignId: ID;
  name: string;
  total: number;
}

export interface CampaignEvent extends Revisioned {
  id: ID;
  name: string;
  date: string | null;
  type: string;
  goal: number | null;
  actual: number | null;
  notes: string;
}

// ---------- Operations ----------

export interface MediaRecord {
  id: ID;
  kind: 'photo' | 'logo';
  ownerType: 'meeting' | 'member' | 'config';
  ownerId: string;
  /** Drive file id once phase 2 uploads it; null while only a local blob exists. */
  driveFileId: string | null;
  /** Local (IndexedDB) blob key, phase 1 / offline fallback. */
  localBlobKey: string | null;
  createdAt: string;
  createdBy: string;
}

export interface AuditEntry {
  id: ID; // client-generated event id
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  summary: string;
}

// ---------- Snapshot & commands ----------

export interface TrackerSnapshot {
  meta: Meta;
  config: Config;
  stages: Stage[];
  groups: Group[];
  members: Member[];
  memberMilestones: MemberMilestone[];
  weeks: Week[];
  meetings: Meeting[];
  attendanceEvents: AttendanceEvent[];
  campaigns: Campaign[];
  campaignMetrics: CampaignMetric[];
  rivals: Rival[];
  events: CampaignEvent[];
  media: MediaRecord[];
  audit: AuditEntry[];
}

export type EntityType =
  | 'config'
  | 'stage'
  | 'group'
  | 'member'
  | 'memberMilestone'
  | 'week'
  | 'meeting'
  | 'attendanceEvent'
  | 'campaign'
  | 'campaignMetric'
  | 'rival'
  | 'event'
  | 'media';

export interface DomainCommand<TPayload = unknown> {
  commandId: ID;
  actorId: string;
  /** Required for mutations of existing revisioned rows; omitted for creates/appends. */
  baseRevision?: number;
  entity: { type: EntityType; id: ID };
  op: 'create' | 'update' | 'delete' | 'append';
  payload: TPayload;
  timestamp: string;
}

export class ConflictError extends Error {
  entityType: EntityType;
  entityId: ID;
  expected: number;
  actual: number;

  constructor(entityType: EntityType, entityId: ID, expected: number, actual: number) {
    super(`Conflict on ${entityType}:${entityId} (expected rev ${expected}, got ${actual})`);
    this.entityType = entityType;
    this.entityId = entityId;
    this.expected = expected;
    this.actual = actual;
    this.name = 'ConflictError';
  }
}
