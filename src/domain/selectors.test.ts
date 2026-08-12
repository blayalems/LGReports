import { describe, expect, it } from 'vitest';
import { createEmptySnapshot } from './demoData';
import { CYCLE6_CAMPAIGN, CYCLE6_SESSION_TEMPLATES } from './campaignCycle6';
import { revisioned } from './factory';
import { parseISODate } from './dateUtils';
import { activeCampaign, campaignQualification, canAttendCampaignSession, campaignWeeks, upcomingEvents } from './selectors';
import type { AttendanceEvent, CampaignAttendanceEvent, Member, TrackerSnapshot } from './types';

describe('upcomingEvents', () => {
  it("includes today's events even when the cutoff time is later than midnight", () => {
    const snapshot = createEmptySnapshot('test');
    const metadata = revisioned('test', '2026-07-15T00:00:00.000Z');
    snapshot.events = [
      { id: 'past', name: 'Yesterday', date: '2026-07-14', type: '', goal: null, actual: null, notes: '', ...metadata },
      { id: 'today', name: 'Today', date: '2026-07-15', type: '', goal: null, actual: null, notes: '', ...metadata },
      { id: 'future', name: 'Tomorrow', date: '2026-07-16', type: '', goal: null, actual: null, notes: '', ...metadata },
    ];

    expect(upcomingEvents(snapshot, new Date(2026, 6, 15, 18, 30)).map((event) => event.id)).toEqual(['today', 'future']);
  });

  it('excludes undated, invalid, and deleted events', () => {
    const snapshot = createEmptySnapshot('test');
    const metadata = revisioned('test', '2026-07-15T00:00:00.000Z');
    snapshot.events = [
      { id: 'valid', name: 'Valid', date: '2026-07-15', type: '', goal: null, actual: null, notes: '', ...metadata },
      { id: 'undated', name: 'Undated', date: null, type: '', goal: null, actual: null, notes: '', ...metadata },
      { id: 'invalid', name: 'Invalid', date: 'not-a-date', type: '', goal: null, actual: null, notes: '', ...metadata },
      { id: 'deleted', name: 'Deleted', date: '2026-07-16', type: '', goal: null, actual: null, notes: '', ...metadata, deletedAt: '2026-07-15T01:00:00.000Z' },
    ];

    expect(upcomingEvents(snapshot, new Date(2026, 6, 15, 23, 59)).map((event) => event.id)).toEqual(['valid']);
  });
});

describe('campaignWeeks', () => {
  it('creates Sunday-start ranges and clips labels to campaign dates', () => {
    const campaign = {
      id: 'campaign',
      name: 'Cycle',
      start: '2026-08-12',
      end: '2026-08-23',
      ...revisioned('test', '2026-08-12T00:00:00.000Z'),
    };
    expect(campaignWeeks(campaign)).toEqual([
      { index: 0, start: '2026-08-09', end: '2026-08-15', label: 'Aug 12 - Aug 15' },
      { index: 1, start: '2026-08-16', end: '2026-08-22', label: 'Aug 16 - Aug 22' },
      { index: 2, start: '2026-08-23', end: '2026-08-29', label: 'Aug 23 - Aug 23' },
    ]);
  });

  it('rejects impossible ISO dates instead of allowing JavaScript date rollover', () => {
    expect(parseISODate('2026-02-31')).toBeNull();
  });
});

describe('activeCampaign', () => {
  it('prefers the active campaign with a tracked schedule when date ranges overlap', () => {
    const snapshot = createEmptySnapshot('test');
    const metadata = revisioned('test', '2026-08-13T00:00:00.000Z');
    snapshot.campaigns = [
      { id: 'legacy', name: 'Legacy cycle', start: '2026-08-01', end: '2026-12-01', ...metadata },
      { id: 'cycle6', name: 'Cycle 6', start: '2026-09-01', end: '2026-11-30', ...metadata },
    ];
    snapshot.campaignSessions = [
      {
        id: 'session',
        campaignId: 'cycle6',
        programKey: 'kgc',
        name: 'Knowing God Class',
        dateStart: '2026-09-27',
        dateEnd: '2026-09-27',
        startTime: '10:00',
        endTime: '12:00',
        venue: '',
        requirementKey: 'kgc:any',
        notes: '',
        ...metadata,
      },
    ];

    expect(activeCampaign(snapshot, new Date('2026-11-08T00:00:00+08:00'))?.id).toBe('cycle6');
  });
});

function cycleFixture(): {
  snapshot: TrackerSnapshot;
  member: Member;
  addLg: (date: string, events?: AttendanceEvent[]) => void;
  attend: (program: 'kgc' | 'light_up' | 'liv' | 'water_baptism', date?: string, time?: string) => void;
} {
  const snapshot = createEmptySnapshot('test');
  const metadata = revisioned('test', '2026-08-01T00:00:00.000Z');
  const campaign = { id: 'cycle6', ...CYCLE6_CAMPAIGN, ...metadata };
  const member: Member = {
    id: 'member',
    name: 'Fictional Candidate',
    status: 'vip',
    groupId: 'group',
    phone: '',
    address: '',
    notes: '',
    birthdayMonth: null,
    birthdayDay: null,
    photoMediaId: null,
    ...metadata,
  };
  snapshot.campaigns = [campaign];
  snapshot.campaignSessions = CYCLE6_SESSION_TEMPLATES.map((session, index) => ({ id: `session-${index}`, campaignId: campaign.id, ...session, ...metadata }));
  snapshot.members = [member];
  snapshot.groups = [{ id: 'group', name: 'Sample Life Group', category: 'open', location: '', weeklyTarget: null, ...metadata }];
  const addLg = (date: string, events?: AttendanceEvent[]) => {
    const meetingId = `meeting-${date}-${snapshot.meetings.length}`;
    const weekId = `week-${date}-${snapshot.weeks.length}`;
    snapshot.weeks.push({
      id: weekId,
      weekOf: date,
      label: date,
      network: '',
      overseer: '',
      status: 'draft',
      submittedAt: null,
      submittedBy: null,
      ...metadata,
    });
    snapshot.meetings.push({
      id: meetingId,
      weekId,
      groupId: 'group',
      leaderName: 'Sample Leader',
      category: 'open',
      start: '',
      end: '',
      status: 'Active',
      date,
      location: '',
      photoMediaId: null,
      guestCount: 0,
      ...metadata,
    });
    snapshot.attendanceEvents.push(
      ...(events ?? [
        {
          id: `attendance-${date}-${snapshot.attendanceEvents.length}`,
          meetingId,
          memberId: member.id,
          action: 'checked_in',
          actorId: 'test',
          clientTimestamp: `${date}T08:00:00.000Z`,
        },
      ]),
    );
  };
  const attend = (program: 'kgc' | 'light_up' | 'liv' | 'water_baptism', date?: string, time?: string) => {
    const session = snapshot.campaignSessions.find(
      (row) => row.programKey === program && (!date || row.dateStart === date) && (!time || row.startTime === time),
    );
    if (!session) throw new Error(`Missing ${program} session`);
    const event: CampaignAttendanceEvent = {
      id: `campaign-attendance-${snapshot.campaignAttendanceEvents.length}`,
      campaignId: campaign.id,
      sessionId: session.id,
      memberId: member.id,
      action: 'checked_in',
      actorId: 'test',
      clientTimestamp: `${session.dateStart}T12:00:00.000Z`,
    };
    snapshot.campaignAttendanceEvents.push(event);
  };
  return { snapshot, member, addLg, attend };
}

describe('Cycle 6 qualification rules', () => {
  it('requires exactly two named LG attendances for KGC and ignores NLS/BNYL', () => {
    const { snapshot, member, addLg } = cycleFixture();
    const campaign = snapshot.campaigns[0];
    expect(campaignQualification(snapshot, campaign, member, '2026-09-26').kgcEligible).toBe(false);
    addLg('2026-09-01');
    expect(campaignQualification(snapshot, campaign, member, '2026-09-26')).toMatchObject({
      lifeGroupAttendanceCount: 1,
      kgcEligible: false,
      actionKey: 'one_lg_away',
    });
    addLg('2026-09-08');
    expect(campaignQualification(snapshot, campaign, member, '2026-09-26')).toMatchObject({
      lifeGroupAttendanceCount: 2,
      kgcEligible: true,
      kgcCompleted: false,
    });
    expect(snapshot.memberMilestones).toHaveLength(0);
  });

  it('one KGC offering completes KGC and a second date is not required', () => {
    const { snapshot, member, addLg, attend } = cycleFixture();
    addLg('2026-09-01');
    addLg('2026-09-08');
    attend('kgc', '2026-09-27', '10:00');
    expect(campaignQualification(snapshot, snapshot.campaigns[0], member, '2026-10-01')).toMatchObject({ kgcCompleted: true, kgcCompletedOn: '2026-09-27' });
  });

  it('requires 3 LG plus KGC for Light Up and names KGC as the only blocker', () => {
    const { snapshot, member, addLg, attend } = cycleFixture();
    addLg('2026-09-01');
    addLg('2026-09-08');
    attend('kgc', '2026-09-27');
    expect(campaignQualification(snapshot, snapshot.campaigns[0], member, '2026-10-01').lightUpEligible).toBe(false);
    addLg('2026-09-15');
    expect(campaignQualification(snapshot, snapshot.campaigns[0], member, '2026-10-01').lightUpEligible).toBe(true);

    const withoutKgc = cycleFixture();
    withoutKgc.addLg('2026-09-01');
    withoutKgc.addLg('2026-09-08');
    withoutKgc.addLg('2026-09-15');
    expect(campaignQualification(withoutKgc.snapshot, withoutKgc.snapshot.campaigns[0], withoutKgc.member, '2026-10-01')).toMatchObject({
      lightUpEligible: false,
      actionKey: 'blocked_by_kgc',
      blocker: '3 LG attendances reached — KGC is the only blocker',
    });
  });

  it('requires Light Up before LIV and two distinct LIV Sundays for completion', () => {
    const fixture = cycleFixture();
    fixture.addLg('2026-09-01');
    fixture.addLg('2026-09-08');
    fixture.addLg('2026-09-15');
    fixture.attend('kgc', '2026-09-27');
    const campaign = fixture.snapshot.campaigns[0];
    const oct25 = fixture.snapshot.campaignSessions.find((session) => session.programKey === 'liv' && session.dateStart === '2026-10-25')!;
    expect(canAttendCampaignSession(fixture.snapshot, campaign, oct25, fixture.member)).toEqual({ allowed: false, reason: 'Complete Light Up first' });
    fixture.attend('light_up', '2026-10-10');
    fixture.attend('liv', '2026-10-25', '10:00');
    expect(campaignQualification(fixture.snapshot, campaign, fixture.member, '2026-10-26')).toMatchObject({ livProgress: 1, livCompleted: false });
    fixture.attend('liv', '2026-10-25', '13:00');
    expect(campaignQualification(fixture.snapshot, campaign, fixture.member, '2026-10-26')).toMatchObject({ livProgress: 1, livCompleted: false });
    fixture.attend('liv', '2026-11-01', '15:10');
    expect(campaignQualification(fixture.snapshot, campaign, fixture.member, '2026-11-02')).toMatchObject({ livProgress: 2, livCompleted: true });
  });

  it('treats November 1 alone as LIV 1/2, not completion', () => {
    const fixture = cycleFixture();
    fixture.addLg('2026-09-01');
    fixture.addLg('2026-09-08');
    fixture.addLg('2026-09-15');
    fixture.attend('kgc', '2026-09-27');
    fixture.attend('light_up', '2026-10-10');
    fixture.attend('liv', '2026-11-01');
    expect(campaignQualification(fixture.snapshot, fixture.snapshot.campaigns[0], fixture.member, '2026-11-02')).toMatchObject({
      livProgress: 1,
      livSession1Attended: false,
      livSession2Attended: true,
      livCompleted: false,
    });
  });

  it('allows Water Baptism after Light Up even when LIV is incomplete', () => {
    const fixture = cycleFixture();
    fixture.addLg('2026-09-01');
    fixture.addLg('2026-09-08');
    fixture.addLg('2026-09-15');
    fixture.attend('kgc', '2026-09-27');
    const baptism = fixture.snapshot.campaignSessions.find((session) => session.programKey === 'water_baptism')!;
    expect(canAttendCampaignSession(fixture.snapshot, fixture.snapshot.campaigns[0], baptism, fixture.member).allowed).toBe(false);
    fixture.attend('light_up', '2026-10-10');
    expect(campaignQualification(fixture.snapshot, fixture.snapshot.campaigns[0], fixture.member, '2026-11-06')).toMatchObject({
      waterBaptismEligible: true,
      livCompleted: false,
    });
    expect(canAttendCampaignSession(fixture.snapshot, fixture.snapshot.campaigns[0], baptism, fixture.member).allowed).toBe(true);
  });

  it('ignores guestCount, deduplicates a person per meeting, and honors latest check-out', () => {
    const fixture = cycleFixture();
    fixture.addLg('2026-09-01');
    fixture.snapshot.meetings[0].guestCount = 20;
    fixture.snapshot.attendanceEvents.push({
      id: 'duplicate-in',
      meetingId: fixture.snapshot.meetings[0].id,
      memberId: fixture.member.id,
      action: 'checked_in',
      actorId: 'test',
      clientTimestamp: '2026-09-01T09:00:00.000Z',
    });
    expect(campaignQualification(fixture.snapshot, fixture.snapshot.campaigns[0], fixture.member, '2026-09-02').lifeGroupAttendanceCount).toBe(1);
    fixture.snapshot.attendanceEvents.push({
      id: 'latest-out',
      meetingId: fixture.snapshot.meetings[0].id,
      memberId: fixture.member.id,
      action: 'checked_out',
      actorId: 'test',
      clientTimestamp: '2026-09-01T10:00:00.000Z',
    });
    expect(campaignQualification(fixture.snapshot, fixture.snapshot.campaigns[0], fixture.member, '2026-09-02').lifeGroupAttendanceCount).toBe(0);
  });

  it('does not let future LG attendance qualify a person for an earlier KGC', () => {
    const fixture = cycleFixture();
    fixture.addLg('2026-09-20');
    fixture.addLg('2026-10-01');
    const firstKgc = fixture.snapshot.campaignSessions.find((session) => session.programKey === 'kgc' && session.dateStart === '2026-09-27')!;
    expect(canAttendCampaignSession(fixture.snapshot, fixture.snapshot.campaigns[0], firstKgc, fixture.member).allowed).toBe(false);
  });
});
