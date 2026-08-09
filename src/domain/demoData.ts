// Blank first-run state + an explicitly opt-in, entirely fictional demo dataset.
// Nothing here may resemble the real church/network/leaders from the original
// prototype — that data was a launch blocker (real names shipped as seed data).
// The migration wizard (phase 3) never touches this module: real backups map
// straight into a snapshot, demo data is neither a source nor a merge target.

import { newId } from './ids';
import { nowISO, toISODate } from './dateUtils';
import { revisioned } from './factory';
import type { Config, Meta, Stage, TrackerSnapshot } from './types';

const DEFAULT_STAGE_DEFS = [
  { key: 'vip', label: 'New Life Sunday VIPs' },
  { key: 'bynl', label: 'Beginning Your New Life' },
  { key: 'kg', label: 'Knowing God Class' },
  { key: 'lu', label: 'Light Up Retreat' },
  { key: 'liv', label: 'Living in Victory Class' },
  { key: 'wb', label: 'Water Baptism' },
];

export function defaultStages(actorId: string): Stage[] {
  const now = nowISO();
  return DEFAULT_STAGE_DEFS.map((s, i) => ({
    id: newId(),
    key: s.key,
    label: s.label,
    order: i,
    ...revisioned(actorId, now),
  }));
}

export function blankMeta(): Meta {
  return { trackerId: newId(), schemaVersion: 1, spreadsheetId: null };
}

export function blankConfig(actorId: string): Config {
  return {
    id: 'config',
    church: '',
    network: '',
    overseer: '',
    theme: 'light',
    accent: '#0E7C6B',
    atRiskWeeks: 3,
    statusOptions: ['Active', 'No Meeting'],
    logoMediaId: null,
    weekStart: 'sunday',
    sheetsConnected: false,
    ...revisioned(actorId),
  };
}

/** True first-run state: no groups, members, weeks, or campaigns — just setup defaults. */
export function createEmptySnapshot(actorId: string): TrackerSnapshot {
  return {
    meta: blankMeta(),
    config: blankConfig(actorId),
    stages: defaultStages(actorId),
    groups: [],
    members: [],
    memberMilestones: [],
    weeks: [],
    meetings: [],
    attendanceEvents: [],
    campaigns: [],
    campaignMetrics: [],
    rivals: [],
    events: [],
    media: [],
    audit: [],
  };
}

/**
 * Explicitly opt-in sample data so a brand-new leader can see the app populated
 * before entering real records. Every name below is fictional.
 */
export function createDemoSnapshot(actorId: string): TrackerSnapshot {
  const now = nowISO();
  const snap = createEmptySnapshot(actorId);
  snap.config = { ...snap.config, church: 'Riverside Fellowship (sample)', network: 'Sample Network', overseer: 'Sample Overseer' };

  const groupDefs = [
    { name: 'Alex Rivera', category: 'leader' as const, target: 5 },
    { name: 'Jordan Lee', category: 'open' as const, target: 4 },
    { name: 'Sam Patel', category: 'open' as const, target: 4 },
    { name: 'Taylor Kim', category: 'open' as const, target: 4 },
  ];
  const groups = groupDefs.map((g) => ({
    id: newId(),
    name: g.name,
    category: g.category,
    location: '',
    weeklyTarget: g.target,
    ...revisioned(actorId, now),
  }));
  snap.groups = groups;

  const memberDefs = [
    { name: 'Alex Rivera', status: 'leader' as const, groupIdx: 0 },
    { name: 'Jordan Lee', status: 'leader' as const, groupIdx: 1 },
    { name: 'Sam Patel', status: 'leader' as const, groupIdx: 2 },
    { name: 'Taylor Kim', status: 'leader' as const, groupIdx: 3 },
    { name: 'Casey Morgan', status: 'vip' as const, groupIdx: 1 },
    { name: 'Riley Chen', status: 'regular' as const, groupIdx: 2 },
  ];
  snap.members = memberDefs.map((m) => ({
    id: newId(),
    name: m.name,
    status: m.status,
    groupId: groups[m.groupIdx].id,
    phone: '',
    address: '',
    notes: '',
    birthdayMonth: null,
    birthdayDay: null,
    photoMediaId: null,
    ...revisioned(actorId, now),
  }));

  const sunday = new Date();
  sunday.setDate(sunday.getDate() - sunday.getDay());
  const weekId = newId();
  snap.weeks = [
    {
      id: weekId,
      weekOf: toISODate(sunday),
      label: 'Sample week',
      network: snap.config.network,
      overseer: snap.config.overseer,
      status: 'draft',
      submittedAt: null,
      submittedBy: null,
      ...revisioned(actorId, now),
    },
  ];
  snap.meetings = groups.map((g, i) => ({
    id: newId(),
    weekId,
    groupId: g.id,
    leaderName: g.name,
    category: g.category,
    start: '18:00',
    end: '19:30',
    status: 'Active',
    date: toISODate(sunday),
    location: '',
    photoMediaId: null,
    guestCount: i === 0 ? 1 : 0,
    ...revisioned(actorId, now),
  }));

  const campaignId = newId();
  snap.campaigns = [
    {
      id: campaignId,
      name: 'Sample Cycle',
      start: toISODate(sunday),
      end: toISODate(new Date(sunday.getTime() + 84 * 86_400_000)),
      ...revisioned(actorId, now),
    },
  ];
  snap.campaignMetrics = snap.stages.map((s, i) => ({
    id: newId(),
    campaignId,
    metricKey: s.key,
    goal: 40 - i * 5,
    actual: 10 - i,
    weekIndex: null,
    ...revisioned(actorId, now),
  }));
  snap.events = [
    {
      id: newId(),
      name: 'Sample Retreat',
      date: null,
      type: 'Retreat',
      goal: 60,
      actual: 0,
      notes: '',
      leaderAttendance: Object.fromEntries(groups.map((group) => [group.id, { actual: 0, goal: 15 }])),
      ...revisioned(actorId, now),
    },
  ];

  return snap;
}
