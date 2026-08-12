import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { nowISO, todayISO } from '../../domain/dateUtils';
import { _resetDBForTests } from '../../repository/local/db';
import { LocalTrackerRepository } from '../../repository/local/LocalTrackerRepository';
import { renderWithProviders } from '../../test/renderWithProviders';
import ReportPage from './ReportPage';

beforeEach(async () => {
  await _resetDBForTests();
});

async function seedRoster() {
  // Groups only, no week — exercises the auto-create-from-roster path.
  const repo = new LocalTrackerRepository('seed-actor');
  await repo.loadSnapshot();
  const defs = [
    { id: 'g-lead', name: 'Morgan Blake', category: 'leader' },
    { id: 'g-open', name: 'Jesse Quinn', category: 'open' },
  ];
  for (const g of defs) {
    await repo.saveCommand({
      commandId: `seed-${g.id}`,
      actorId: 'seed-actor',
      timestamp: nowISO(),
      entity: { type: 'group', id: g.id },
      op: 'create',
      payload: { name: g.name, category: g.category, location: '', weeklyTarget: null },
    });
  }
  return repo;
}

describe('ReportPage', () => {
  it('auto-creates the current week pre-filled from the roster', async () => {
    await seedRoster();
    const { repository } = await renderWithProviders(<ReportPage params={[]} />, { seed: false });
    expect(await screen.findByDisplayValue('Morgan Blake')).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Jesse Quinn')).toBeInTheDocument();
    await waitFor(async () => {
      const snap = await repository.refresh();
      expect(snap.weeks).toHaveLength(1);
      expect(snap.meetings).toHaveLength(2);
      expect(snap.weeks[0].status).toBe('draft');
    });
  });

  it('shows attendance as a derived value (0 with no check-ins)', async () => {
    await seedRoster();
    const { repository } = await renderWithProviders(<ReportPage params={[]} />, { seed: false });
    await waitFor(
      async () => {
        expect((await repository.refresh()).meetings).toHaveLength(2);
      },
      { timeout: 10_000 },
    );
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /check-in/i })).toHaveLength(2);
    });
    for (const btn of screen.getAllByRole('button', { name: /check-in/i })) {
      expect(btn).toHaveTextContent('0');
    }
    // No hand-typed attendance input exists anywhere.
    expect(screen.queryByLabelText(/^attendance$/i)).not.toBeInTheDocument();
  });

  it('submits the report, recording status/when/who, and can reopen', async () => {
    const user = userEvent.setup();
    const { repository } = await renderWithProviders(<ReportPage params={[]} />, { seed: true });
    await screen.findByRole('button', { name: /submit report/i });
    // Demo meetings all carry a date + status, so submit is allowed.
    await user.click(screen.getByRole('button', { name: /submit report/i }));
    await waitFor(async () => {
      const snap = await repository.refresh();
      expect(snap.weeks[0].status).toBe('submitted');
      expect(snap.weeks[0].submittedAt).not.toBeNull();
      expect(snap.weeks[0].submittedBy).toBe('test-actor');
    });
    // Editing UI flips to read-only + a reopen affordance.
    const reopenBtn = await screen.findByRole('button', { name: /reopen for edits/i });
    await user.click(reopenBtn);
    await waitFor(async () => {
      const snap = await repository.refresh();
      expect(snap.weeks[0].status).toBe('reopened');
    });
  });

  it('quick-adds an unknown person as a named VIP and checks them in', async () => {
    const user = userEvent.setup();
    const { repository } = await renderWithProviders(<ReportPage params={[]} />, { seed: true });
    await user.click((await screen.findAllByRole('button', { name: /check-in/i }))[0]);
    const search = await screen.findByRole('searchbox', { name: /search or add a member/i });
    await user.type(search, 'Fictional New VIP');
    await user.click(screen.getByRole('button', { name: /add “Fictional New VIP” as VIP & check in/i }));
    await waitFor(() => expect(search).toHaveValue(''));
    await waitFor(async () => {
      const snapshot = await repository.refresh();
      const member = snapshot.members.find((row) => row.name === 'Fictional New VIP');
      expect(member?.status).toBe('vip');
      expect(snapshot.attendanceEvents.some((event) => event.memberId === member?.id && event.action === 'checked_in')).toBe(true);
    });
  });

  it('dates an undated meeting when the first named person is checked in', async () => {
    const user = userEvent.setup();
    const repo = await seedRoster();
    await repo.saveCommand({
      commandId: 'seed-member',
      actorId: 'seed-actor',
      timestamp: nowISO(),
      entity: { type: 'member', id: 'dated-member' },
      op: 'create',
      payload: {
        name: 'Fictional Dated Attendee',
        status: 'vip',
        groupId: 'g-lead',
        phone: '',
        address: '',
        notes: '',
        birthdayMonth: null,
        birthdayDay: null,
        photoMediaId: null,
      },
    });
    const { repository } = await renderWithProviders(<ReportPage params={[]} />, { seed: false });
    await user.click((await screen.findAllByRole('button', { name: /check-in/i }))[0]);
    await user.click(await screen.findByRole('button', { name: /Fictional Dated Attendee/i }));
    await waitFor(async () => {
      const snapshot = await repository.refresh();
      expect(snapshot.meetings.find((meeting) => meeting.groupId === 'g-lead')?.date).toBe(todayISO());
    });
  });
});
