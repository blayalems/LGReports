// Workbook schema: one tab per entity collection, header row first, one row per record.
// This module is pure (rows <-> entities) so the mapping is unit-testable without any
// network. Column ORDER here is the wire contract with the shared Google Sheet —
// append new columns at the end, never reorder, and bump SCHEMA_VERSION on breaking change.
//
// All writes go through the Sheets values API with valueInputOption=RAW, so a value
// like "=IMPORTRANGE(...)" is stored as literal text and never executed as a formula
// (spec: "never execute payload text as a formula").

import type {
  AttendanceEvent,
  AuditEntry,
  Campaign,
  CampaignEvent,
  CampaignMetric,
  Config,
  Group,
  MediaRecord,
  Meeting,
  Member,
  MemberMilestone,
  Rival,
  Stage,
  TrackerSnapshot,
  Week,
} from '../../domain/types';

export const SCHEMA_VERSION = 1;

type FieldKind = 'string' | 'stringOrNull' | 'number' | 'numberOrNull' | 'boolean' | 'json';

interface FieldSpec {
  key: string;
  kind: FieldKind;
}

const f = (key: string, kind: FieldKind = 'string'): FieldSpec => ({ key, kind });

const REVISIONED: FieldSpec[] = [
  f('revision', 'number'),
  f('createdAt'),
  f('createdBy'),
  f('updatedAt'),
  f('updatedBy'),
  f('deletedAt', 'stringOrNull'),
];

export const TAB_SPECS = {
  _meta: [f('trackerId'), f('schemaVersion', 'number')],
  config: [
    f('id'),
    f('church'),
    f('network'),
    f('overseer'),
    f('theme'),
    f('accent'),
    f('atRiskWeeks', 'number'),
    f('statusOptions', 'json'),
    f('logoMediaId', 'stringOrNull'),
    f('weekStart'),
    f('sheetsConnected', 'boolean'),
    ...REVISIONED,
  ],
  stages: [f('id'), f('key'), f('label'), f('order', 'number'), ...REVISIONED],
  groups: [f('id'), f('name'), f('category'), f('location'), f('weeklyTarget', 'numberOrNull'), ...REVISIONED],
  members: [
    f('id'),
    f('name'),
    f('status'),
    f('groupId', 'stringOrNull'),
    f('phone'),
    f('birthdayMonth', 'numberOrNull'),
    f('birthdayDay', 'numberOrNull'),
    f('photoMediaId', 'stringOrNull'),
    ...REVISIONED,
  ],
  memberMilestones: [f('id'), f('memberId'), f('stageKey'), f('completedOn', 'stringOrNull'), ...REVISIONED],
  weeks: [
    f('id'),
    f('weekOf'),
    f('label'),
    f('network'),
    f('overseer'),
    f('status'),
    f('submittedAt', 'stringOrNull'),
    f('submittedBy', 'stringOrNull'),
    ...REVISIONED,
  ],
  meetings: [
    f('id'),
    f('weekId'),
    f('groupId', 'stringOrNull'),
    f('leaderName'),
    f('category'),
    f('start'),
    f('end'),
    f('status'),
    f('date'),
    f('location'),
    f('photoMediaId', 'stringOrNull'),
    f('guestCount', 'number'),
    ...REVISIONED,
  ],
  attendanceEvents: [f('id'), f('meetingId'), f('memberId'), f('action'), f('actorId'), f('clientTimestamp')],
  campaigns: [f('id'), f('name'), f('start'), f('end'), ...REVISIONED],
  campaignMetrics: [
    f('id'),
    f('campaignId'),
    f('metricKey'),
    f('goal', 'numberOrNull'),
    f('actual', 'numberOrNull'),
    f('weekIndex', 'numberOrNull'),
    ...REVISIONED,
  ],
  rivals: [f('id'), f('campaignId'), f('name'), f('total', 'number'), ...REVISIONED],
  events: [
    f('id'),
    f('name'),
    f('date', 'stringOrNull'),
    f('type'),
    f('goal', 'numberOrNull'),
    f('actual', 'numberOrNull'),
    f('notes'),
    ...REVISIONED,
  ],
  media: [f('id'), f('kind'), f('ownerType'), f('ownerId'), f('driveFileId', 'stringOrNull'), f('localBlobKey', 'stringOrNull'), f('createdAt'), f('createdBy')],
  audit: [f('id'), f('actorId'), f('action'), f('entityType'), f('entityId'), f('timestamp'), f('summary')],
} as const;

export type TabName = keyof typeof TAB_SPECS;

export const ALL_TABS = Object.keys(TAB_SPECS) as TabName[];

/** Tab that stores each snapshot collection (config/_meta handled specially). */
export const TAB_BY_COLLECTION: Record<TabName, keyof TrackerSnapshot | null> = {
  _meta: null,
  config: null,
  stages: 'stages',
  groups: 'groups',
  members: 'members',
  memberMilestones: 'memberMilestones',
  weeks: 'weeks',
  meetings: 'meetings',
  attendanceEvents: 'attendanceEvents',
  campaigns: 'campaigns',
  campaignMetrics: 'campaignMetrics',
  rivals: 'rivals',
  events: 'events',
  media: 'media',
  audit: 'audit',
};

export function headersFor(tab: TabName): string[] {
  return TAB_SPECS[tab].map((spec) => spec.key);
}

function toCell(value: unknown, kind: FieldKind): string {
  switch (kind) {
    case 'boolean':
      return value ? 'TRUE' : 'FALSE';
    case 'json':
      return JSON.stringify(value ?? null);
    case 'number':
      return String(typeof value === 'number' && Number.isFinite(value) ? value : 0);
    case 'numberOrNull':
      return value == null ? '' : String(value);
    case 'stringOrNull':
      return value == null ? '' : String(value);
    default:
      return value == null ? '' : String(value);
  }
}

function fromCell(cell: string | undefined, kind: FieldKind): unknown {
  const raw = cell ?? '';
  switch (kind) {
    case 'boolean':
      return raw.toUpperCase() === 'TRUE';
    case 'json':
      try {
        return raw === '' ? null : JSON.parse(raw);
      } catch {
        return null;
      }
    case 'number': {
      const n = Number(raw);
      return Number.isFinite(n) ? n : 0;
    }
    case 'numberOrNull': {
      if (raw === '') return null;
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    }
    case 'stringOrNull':
      return raw === '' ? null : raw;
    default:
      return raw;
  }
}

export function entityToRow(tab: TabName, entity: Record<string, unknown>): string[] {
  return TAB_SPECS[tab].map((spec) => toCell(entity[spec.key], spec.kind));
}

export function rowToEntity<T>(tab: TabName, row: (string | undefined)[]): T {
  const out: Record<string, unknown> = {};
  TAB_SPECS[tab].forEach((spec, i) => {
    out[spec.key] = fromCell(row[i], spec.kind);
  });
  return out as T;
}

/**
 * Parses a whole tab (header row + data rows) into entities. Skips rows without an
 * id in the first column and tolerates a header row whose columns are a superset
 * (a future schema may append columns; older clients simply ignore them).
 */
export function parseTab<T>(tab: TabName, rows: (string | undefined)[][] | undefined): T[] {
  if (!rows || rows.length < 2) return [];
  return rows
    .slice(1)
    .filter((row) => (row[0] ?? '') !== '')
    .map((row) => rowToEntity<T>(tab, row));
}

/** Header mismatch means someone hand-edited the workbook structure — refuse rather than corrupt. */
export function headersMatch(tab: TabName, headerRow: (string | undefined)[] | undefined): boolean {
  const expected = headersFor(tab);
  if (!headerRow) return false;
  return expected.every((h, i) => (headerRow[i] ?? '').trim() === h);
}

export interface ParsedWorkbook {
  snapshot: TrackerSnapshot;
  /** id -> 1-based sheet row number (data starts at row 2), per tab — used to address updates. */
  rowIndex: Record<TabName, Map<string, number>>;
}

export function parseWorkbook(valuesByTab: Partial<Record<TabName, (string | undefined)[][]>>): ParsedWorkbook {
  const metaRow = (valuesByTab._meta ?? [])[1] ?? [];
  const meta = rowToEntity<{ trackerId: string; schemaVersion: number }>('_meta', metaRow);
  const configs = parseTab<Config>('config', valuesByTab.config);
  if (!configs.length) throw new Error('Workbook has no config row');

  const snapshot: TrackerSnapshot = {
    meta: { trackerId: meta.trackerId, schemaVersion: meta.schemaVersion, spreadsheetId: null },
    config: configs[0],
    stages: parseTab<Stage>('stages', valuesByTab.stages),
    groups: parseTab<Group>('groups', valuesByTab.groups),
    members: parseTab<Member>('members', valuesByTab.members),
    memberMilestones: parseTab<MemberMilestone>('memberMilestones', valuesByTab.memberMilestones),
    weeks: parseTab<Week>('weeks', valuesByTab.weeks),
    meetings: parseTab<Meeting>('meetings', valuesByTab.meetings),
    attendanceEvents: parseTab<AttendanceEvent>('attendanceEvents', valuesByTab.attendanceEvents),
    campaigns: parseTab<Campaign>('campaigns', valuesByTab.campaigns),
    campaignMetrics: parseTab<CampaignMetric>('campaignMetrics', valuesByTab.campaignMetrics),
    rivals: parseTab<Rival>('rivals', valuesByTab.rivals),
    events: parseTab<CampaignEvent>('events', valuesByTab.events),
    media: parseTab<MediaRecord>('media', valuesByTab.media),
    audit: parseTab<AuditEntry>('audit', valuesByTab.audit),
  };

  const rowIndex = {} as Record<TabName, Map<string, number>>;
  for (const tab of ALL_TABS) {
    const map = new Map<string, number>();
    const rows = valuesByTab[tab] ?? [];
    rows.slice(1).forEach((row, i) => {
      const id = row[0] ?? '';
      if (id) map.set(id, i + 2);
    });
    rowIndex[tab] = map;
  }
  return { snapshot, rowIndex };
}

/** Full workbook contents (headers + rows) for provisioning a new spreadsheet from a snapshot. */
export function workbookValues(snapshot: TrackerSnapshot): Record<TabName, string[][]> {
  const rowsFor = (tab: TabName, items: Record<string, unknown>[]): string[][] => [
    headersFor(tab),
    ...items.map((item) => entityToRow(tab, item)),
  ];
  return {
    _meta: rowsFor('_meta', [{ trackerId: snapshot.meta.trackerId, schemaVersion: SCHEMA_VERSION }]),
    config: rowsFor('config', [snapshot.config as unknown as Record<string, unknown>]),
    stages: rowsFor('stages', snapshot.stages as unknown as Record<string, unknown>[]),
    groups: rowsFor('groups', snapshot.groups as unknown as Record<string, unknown>[]),
    members: rowsFor('members', snapshot.members as unknown as Record<string, unknown>[]),
    memberMilestones: rowsFor('memberMilestones', snapshot.memberMilestones as unknown as Record<string, unknown>[]),
    weeks: rowsFor('weeks', snapshot.weeks as unknown as Record<string, unknown>[]),
    meetings: rowsFor('meetings', snapshot.meetings as unknown as Record<string, unknown>[]),
    attendanceEvents: rowsFor('attendanceEvents', snapshot.attendanceEvents as unknown as Record<string, unknown>[]),
    campaigns: rowsFor('campaigns', snapshot.campaigns as unknown as Record<string, unknown>[]),
    campaignMetrics: rowsFor('campaignMetrics', snapshot.campaignMetrics as unknown as Record<string, unknown>[]),
    rivals: rowsFor('rivals', snapshot.rivals as unknown as Record<string, unknown>[]),
    events: rowsFor('events', snapshot.events as unknown as Record<string, unknown>[]),
    media: rowsFor('media', snapshot.media as unknown as Record<string, unknown>[]),
    audit: rowsFor('audit', snapshot.audit as unknown as Record<string, unknown>[]),
  };
}

/** Column letter for a 1-based column count, e.g. 6 -> "F" (all tabs stay well under 26·27 columns). */
export function columnLetter(count: number): string {
  let s = '';
  let n = count;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function rowRange(tab: TabName, rowNum: number): string {
  return `'${tab}'!A${rowNum}:${columnLetter(TAB_SPECS[tab].length)}${rowNum}`;
}
