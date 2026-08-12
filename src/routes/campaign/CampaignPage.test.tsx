import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { CYCLE6_CAMPAIGN, CYCLE6_SESSION_TEMPLATES } from '../../domain/campaignCycle6';
import { createEmptySnapshot } from '../../domain/demoData';
import { revisioned } from '../../domain/factory';
import { _resetDBForTests } from '../../repository/local/db';
import { LocalTrackerRepository } from '../../repository/local/LocalTrackerRepository';
import { renderWithProviders } from '../../test/renderWithProviders';
import CampaignPage from './CampaignPage';

beforeEach(async () => {
  await _resetDBForTests();
});

async function seedCycle6() {
  const repo = new LocalTrackerRepository('seed');
  const snapshot = createEmptySnapshot('seed');
  const metadata = revisioned('seed', '2026-08-01T00:00:00.000Z');
  snapshot.config = { ...snapshot.config, church: 'Sample Church', network: 'Sample Network' };
  snapshot.groups = [{ id: 'group', name: 'Fictional Leader', category: 'open', location: '', weeklyTarget: null, ...metadata }];
  snapshot.members = [
    {
      id: 'one-away',
      name: 'One Away Person',
      status: 'vip',
      groupId: 'group',
      phone: '',
      address: '',
      notes: '',
      birthdayMonth: null,
      birthdayDay: null,
      photoMediaId: null,
      ...metadata,
    },
    {
      id: 'eligible',
      name: 'KGC Eligible Person',
      status: 'vip',
      groupId: 'group',
      phone: '',
      address: '',
      notes: '',
      birthdayMonth: null,
      birthdayDay: null,
      photoMediaId: null,
      ...metadata,
    },
    {
      id: 'blocked',
      name: 'Blocked Person',
      status: 'vip',
      groupId: 'group',
      phone: '',
      address: '',
      notes: '',
      birthdayMonth: null,
      birthdayDay: null,
      photoMediaId: null,
      ...metadata,
    },
    {
      id: 'light-ready',
      name: 'Light Ready Person',
      status: 'regular',
      groupId: 'group',
      phone: '',
      address: '',
      notes: '',
      birthdayMonth: null,
      birthdayDay: null,
      photoMediaId: null,
      ...metadata,
    },
    {
      id: 'liv-one',
      name: 'LIV One Person',
      status: 'regular',
      groupId: 'group',
      phone: '',
      address: '',
      notes: '',
      birthdayMonth: null,
      birthdayDay: null,
      photoMediaId: null,
      ...metadata,
    },
  ];
  snapshot.campaigns = [{ id: 'cycle6', ...CYCLE6_CAMPAIGN, ...metadata }];
  const pastDate: Record<string, string> = {
    prayparations: '2026-07-01',
    nls: '2026-07-05',
    kgc: '2026-08-01',
    light_up: '2026-08-02',
    water_baptism: '2026-08-05',
  };
  snapshot.campaignSessions = CYCLE6_SESSION_TEMPLATES.map((session, index) => {
    const livDate = session.programKey === 'liv' ? (session.dateStart === '2026-10-25' ? '2026-08-03' : '2026-08-04') : null;
    const date = livDate ?? pastDate[session.programKey] ?? session.dateStart;
    return {
      id: `session-${index}`,
      campaignId: 'cycle6',
      ...session,
      dateStart: date,
      dateEnd: date,
      requirementKey: session.programKey === 'liv' ? `liv:${date}` : session.requirementKey,
      ...metadata,
    };
  });

  const attendanceCounts: Record<string, number> = { 'one-away': 1, eligible: 2, blocked: 3, 'light-ready': 3, 'liv-one': 3 };
  for (let index = 0; index < 3; index += 1) {
    const date = `2026-07-${String(1 + index * 7).padStart(2, '0')}`;
    const weekId = `week-${index}`;
    const meetingId = `meeting-${index}`;
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
      leaderName: 'Fictional Leader',
      category: 'open',
      start: '',
      end: '',
      status: 'Active',
      date,
      location: '',
      photoMediaId: null,
      guestCount: 5,
      ...metadata,
    });
    for (const member of snapshot.members) {
      if (attendanceCounts[member.id] > index)
        snapshot.attendanceEvents.push({
          id: `lg-${index}-${member.id}`,
          meetingId,
          memberId: member.id,
          action: 'checked_in',
          actorId: 'seed',
          clientTimestamp: `${date}T08:00:00.000Z`,
        });
    }
  }

  const attend = (memberId: string, program: 'kgc' | 'light_up' | 'liv', date?: string) => {
    const session = snapshot.campaignSessions.find((row) => row.programKey === program && (!date || row.dateStart === date))!;
    snapshot.campaignAttendanceEvents.push({
      id: `program-${memberId}-${program}-${date ?? 'any'}`,
      campaignId: 'cycle6',
      sessionId: session.id,
      memberId,
      action: 'checked_in',
      actorId: 'seed',
      clientTimestamp: `${session.dateStart}T12:00:00.000Z`,
    });
  };
  attend('light-ready', 'kgc', '2026-08-01');
  attend('liv-one', 'kgc', '2026-08-01');
  attend('liv-one', 'light_up', '2026-08-02');
  attend('liv-one', 'liv', '2026-08-03');
  await repo.restoreSnapshot(snapshot);
}

describe('CampaignPage', () => {
  it('renders actionable priority counts and filters the exact KGC-eligible people', async () => {
    const user = userEvent.setup();
    await seedCycle6();
    await renderWithProviders(<CampaignPage />, { seed: false });
    const card = await screen.findByRole('button', { name: /KGC eligible now/i });
    expect(card).toHaveTextContent('2');
    await user.click(card);
    expect(screen.getByRole('button', { name: /KGC Eligible Person/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Blocked Person/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /One Away Person/i })).not.toBeInTheDocument();
  });

  it('shows the KGC-only blocker and member LIV 1/2 state', async () => {
    const user = userEvent.setup();
    await seedCycle6();
    await renderWithProviders(<CampaignPage params={['blocked_by_kgc']} />, { seed: false });
    expect(await screen.findByText('3 LG attendances reached — KGC is the only blocker')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /LIV 1\/2/i }));
    await user.click(screen.getByRole('button', { name: /LIV One Person/i }));
    expect(await screen.findByText('1 / 2')).toBeInTheDocument();
  });

  it('blocks KGC check-in below two named LG attendances', async () => {
    const user = userEvent.setup();
    const { repository } = await (async () => {
      await seedCycle6();
      return renderWithProviders(<CampaignPage />, { seed: false });
    })();
    await user.click(await screen.findByText(/Cycle schedule & event check-in/i));
    await user.click(screen.getAllByRole('button', { name: /Check in Knowing God Class/i })[0]);
    const blockedRow = (await screen.findAllByRole('button', { name: /One Away Person/i })).find((row) => row.getAttribute('aria-disabled') === 'true')!;
    expect(blockedRow).toHaveAttribute('aria-disabled', 'true');
    expect(blockedRow).toHaveTextContent('Needs 1 more Life Group attendance for KGC');
    fireEvent.click(blockedRow);
    await waitFor(async () => expect((await repository.refresh()).campaignAttendanceEvents.filter((event) => event.memberId === 'one-away')).toHaveLength(0));
  });

  it('shows hard blockers for Light Up, LIV, and Water Baptism check-in', async () => {
    const user = userEvent.setup();
    await seedCycle6();
    await renderWithProviders(<CampaignPage />, { seed: false });
    await user.click(await screen.findByText(/Cycle schedule & event check-in/i));
    for (const program of ['Light Up Retreat', 'Living in Victory', 'Water Baptism']) {
      await user.click(screen.getAllByRole('button', { name: new RegExp(`Check in ${program}`, 'i') })[0]);
      const row = (await screen.findAllByRole('button', { name: /One Away Person/i })).find((candidate) => candidate.getAttribute('aria-disabled') === 'true')!;
      expect(row).toHaveAttribute('aria-disabled', 'true');
      expect(row).toHaveTextContent(program === 'Light Up Retreat' ? /Needs 2 more Life Group attendances for Light Up/i : /Complete Light Up first/i);
      await user.click(screen.getByRole('button', { name: 'Done' }));
    }
  });

  it('keeps goals editable while derived Cycle 6 actuals are read-only', async () => {
    const user = userEvent.setup();
    await seedCycle6();
    const { repository } = await renderWithProviders(<CampaignPage />, { seed: false });
    expect(await screen.findAllByText('Derived')).toHaveLength(4);
    const actual = screen.getByLabelText('Knowing God Class derived actual');
    expect(actual.tagName).toBe('OUTPUT');
    const goal = screen.getByLabelText('Knowing God Class goal');
    await user.click(goal);
    await user.clear(goal);
    await user.type(goal, '44');
    await user.tab();
    await waitFor(async () => expect((await repository.refresh()).campaignMetrics.find((metric) => metric.metricKey === 'kg')?.goal).toBe(44));
  });
});
