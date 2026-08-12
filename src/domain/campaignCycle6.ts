import type { CampaignProgramKey, CampaignSession } from './types';

export const CYCLE6_CAMPAIGN = {
  name: 'One More for Jesus Campaign Cycle 6',
  start: '2026-09-01',
  end: '2026-11-30',
} as const;

export type CampaignSessionTemplate = Omit<
  CampaignSession,
  'id' | 'campaignId' | 'revision' | 'createdAt' | 'createdBy' | 'updatedAt' | 'updatedBy' | 'deletedAt'
>;

const worshipSchedules = [
  ['10:00', '11:30'],
  ['13:00', '14:30'],
  ['15:00', '16:30'],
] as const;

const classSchedules = [
  ['10:00', '12:00'],
  ['13:00', '15:00'],
  ['15:10', '17:10'],
] as const;

function offerings(
  programKey: CampaignProgramKey,
  name: string,
  dates: readonly string[],
  schedules: readonly (readonly [string, string])[],
  venue: string,
  requirementKeyFor: (date: string) => string,
): CampaignSessionTemplate[] {
  return dates.flatMap((date) =>
    schedules.map(([startTime, endTime]) => ({
      programKey,
      requirementKey: requirementKeyFor(date),
      name,
      dateStart: date,
      dateEnd: date,
      startTime,
      endTime,
      venue,
      notes: '',
    })),
  );
}

export const CYCLE6_SESSION_TEMPLATES: CampaignSessionTemplate[] = [
  {
    programKey: 'prayparations',
    requirementKey: 'prayparations',
    name: 'PRAYparations',
    dateStart: '2026-08-24',
    dateEnd: '2026-09-12',
    startTime: null,
    endTime: null,
    venue: null,
    notes: 'Per Network or Cluster',
  },
  ...offerings(
    'nls',
    'New Life Sunday',
    ['2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04'],
    worshipSchedules,
    'The Lighthouse, Quimpo Boulevard',
    (date) => `nls:${date}`,
  ),
  ...offerings('kgc', 'Knowing God Class', ['2026-09-27', '2026-10-04'], classSchedules, 'The Lighthouse Training Hall', () => 'kgc:any'),
  {
    programKey: 'light_up',
    requirementKey: 'light-up:any',
    name: 'Light Up Retreat — Healing and Deliverance Retreat',
    dateStart: '2026-10-10',
    dateEnd: '2026-10-11',
    startTime: null,
    endTime: null,
    venue: 'The Lighthouse, Quimpo Boulevard',
    notes: '',
  },
  {
    programKey: 'light_up',
    requirementKey: 'light-up:any',
    name: 'Light Up Retreat — Healing and Deliverance Retreat',
    dateStart: '2026-10-17',
    dateEnd: '2026-10-18',
    startTime: null,
    endTime: null,
    venue: 'The Lighthouse, Quimpo Boulevard',
    notes: '',
  },
  ...offerings('liv', 'Living in Victory Class', ['2026-10-25', '2026-11-01'], classSchedules, 'The Lighthouse Training Hall', (date) => `liv:${date}`),
  {
    programKey: 'water_baptism',
    requirementKey: 'water-baptism',
    name: 'Water Baptism',
    dateStart: '2026-11-07',
    dateEnd: '2026-11-07',
    startTime: '06:00',
    endTime: null,
    venue: 'Mergrande Ocean Resort, Talomo, Davao City',
    notes: '',
  },
];

export const CAMPAIGN_PRINCIPLES = [
  'Be connected to the One who created you, who loves you most, and who wants to change your life if you allow Him. Go to Him in repentance and faith.',
  'Ignorance destroys, and knowledge builds up. Return to God’s original design and live holistically where knowledge is intellectual, practical, and relational.',
] as const;

export const ESSENTIAL_ELEMENTS = [
  'PRAYPARATIONS',
  'NEW LIFE SUNDAYS',
  'LIFE GROUP',
  'INTENTIONAL INVITATION',
  'COMEBACK STRATEGIES',
  'WELCOMING ATMOSPHERE',
  'PRACTICAL ACTS OF KINDNESS',
  'FAITHFUL FOLLOW-UP',
  'BEGINNING YOUR NEW LIFE IN CHRIST DISCUSSIONS',
  'LIGHT UP RETREAT — A HEALING & DELIVERANCE RETREAT',
] as const;

export const PROGRAM_LABELS: Record<CampaignProgramKey, string> = {
  prayparations: 'PRAYparations',
  nls: 'New Life Sunday',
  kgc: 'Knowing God Class',
  light_up: 'Light Up Retreat',
  liv: 'Living in Victory',
  water_baptism: 'Water Baptism',
};

export const CHECKIN_PROGRAMS: CampaignProgramKey[] = ['kgc', 'light_up', 'liv', 'water_baptism'];
