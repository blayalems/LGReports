import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDBForTests } from '../../repository/local/db';
import { renderWithProviders } from '../../test/renderWithProviders';
import EventsPage from './EventsPage';

beforeEach(async () => {
  await _resetDBForTests();
});

describe('EventsPage', () => {
  it('renders seeded events with per-leader attendance and per-group weekly targets', async () => {
    await renderWithProviders(<EventsPage />);
    expect(await screen.findByDisplayValue('Sample Retreat')).toBeInTheDocument();
    expect(screen.getByText('Weekly attendance targets per life group')).toBeInTheDocument();
    expect(screen.getAllByText('Alex Rivera')).toHaveLength(2);
    expect(screen.getByLabelText('Attendance goal for Alex Rivera at Sample Retreat')).toHaveValue(15);
    expect(screen.getByLabelText('Weekly target for Alex Rivera')).toHaveValue(5);
  });

  it("editing a leader's event attendance updates the stored breakdown and network total", async () => {
    const { repository } = await renderWithProviders(<EventsPage />);
    await screen.findByDisplayValue('Sample Retreat');
    const actualInput = screen.getByLabelText('Actual attendance for Alex Rivera at Sample Retreat');
    fireEvent.change(actualInput, { target: { value: '30' } });
    fireEvent.blur(actualInput);
    const goalInput = screen.getByLabelText('Attendance goal for Alex Rivera at Sample Retreat');
    fireEvent.change(goalInput, { target: { value: '20' } });
    fireEvent.blur(goalInput);
    await waitFor(async () => {
      const snap = await repository.refresh();
      const alex = snap.groups.find((group) => group.name === 'Alex Rivera')!;
      expect(snap.events[0].leaderAttendance?.[alex.id].actual).toBe(30);
      expect(snap.events[0].leaderAttendance?.[alex.id].goal).toBe(20);
      expect(snap.events[0].actual).toBe(30);
      expect(snap.events[0].goal).toBe(65);
    });
    expect(await screen.findByRole('img', { name: /network total: 30 of 65/i })).toBeInTheDocument();
  });

  it('adds a new event card', async () => {
    const user = userEvent.setup();
    const { repository } = await renderWithProviders(<EventsPage />);
    await screen.findByDisplayValue('Sample Retreat');
    await user.click(screen.getByRole('button', { name: /add event/i }));
    await waitFor(async () => {
      const snap = await repository.refresh();
      expect(snap.events).toHaveLength(2);
    });
    await waitFor(() => {
      expect(screen.getAllByLabelText('Event name')).toHaveLength(2);
    });
  });
});
