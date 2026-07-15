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
  it('renders seeded events and per-group targets', async () => {
    await renderWithProviders(<EventsPage />);
    expect(await screen.findByDisplayValue('Sample Retreat')).toBeInTheDocument();
    expect(screen.getByText('Weekly attendance targets per life group')).toBeInTheDocument();
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
    expect(screen.getByLabelText('Weekly target for Alex Rivera')).toHaveValue(5);
  });

  it("editing an event's actual attendance updates its progress bar", async () => {
    const { repository } = await renderWithProviders(<EventsPage />);
    await screen.findByDisplayValue('Sample Retreat');
    const actualInput = screen.getByLabelText('Actual attendance');
    fireEvent.change(actualInput, { target: { value: '30' } });
    fireEvent.blur(actualInput);
    await waitFor(async () => {
      const snap = await repository.refresh();
      expect(snap.events[0].actual).toBe(30);
    });
    // Seeded goal is 60, so the bar reads 30 of 60.
    expect(await screen.findByRole('img', { name: /30 of 60/i })).toBeInTheDocument();
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
