import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDBForTests } from '../../repository/local/db';
import { renderWithProviders } from '../../test/renderWithProviders';
import HistoryPage from './HistoryPage';

beforeEach(async () => {
  await _resetDBForTests();
});

describe('HistoryPage', () => {
  it('lists the seeded week with its totals and Current badge', async () => {
    await renderWithProviders(<HistoryPage />);
    expect(await screen.findByRole('heading', { name: 'Sample week' })).toBeInTheDocument();
    // Seeded week is dated this Sunday, so it's the current one.
    expect(screen.getByText('Current')).toBeInTheDocument();
    // Total attendance 1 (one guest), 4 groups.
    expect(screen.getByText('Attend')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('Open deep-links into the report for that week', async () => {
    const user = userEvent.setup();
    const { repository } = await renderWithProviders(<HistoryPage />);
    await user.click(await screen.findByRole('button', { name: /open sample week/i }));
    const snap = await repository.refresh();
    expect(window.location.hash).toBe(`#/report/${snap.weeks[0].id}`);
  });

  it('duplicates a week (roster shape only, fresh attendance)', async () => {
    const user = userEvent.setup();
    const { repository } = await renderWithProviders(<HistoryPage />);
    await user.click(await screen.findByRole('button', { name: /duplicate sample week/i }));
    await waitFor(async () => {
      const snap = await repository.refresh();
      expect(snap.weeks).toHaveLength(2);
      const copy = snap.weeks.find((w) => w.label.endsWith('(copy)'))!;
      const copyMeetings = snap.meetings.filter((m) => m.weekId === copy.id);
      expect(copyMeetings).toHaveLength(4);
      expect(copyMeetings.every((m) => m.guestCount === 0 && m.date === '')).toBe(true);
    });
  });
});
