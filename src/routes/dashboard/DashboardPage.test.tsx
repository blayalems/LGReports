import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDBForTests } from '../../repository/local/db';
import { renderWithProviders } from '../../test/renderWithProviders';
import DashboardPage from './DashboardPage';

beforeEach(async () => {
  await _resetDBForTests();
});

describe('DashboardPage', () => {
  it('renders KPI tiles from seeded demo data', async () => {
    await renderWithProviders(<DashboardPage />);
    expect(await screen.findByText('This week')).toBeInTheDocument();
    expect(screen.getByText('Life groups')).toBeInTheDocument();
    expect(screen.getByText('Members')).toBeInTheDocument();
    // Demo data seeds 4 groups and 6 members.
    expect(screen.getAllByText('4').length).toBeGreaterThan(0);
    expect(screen.getAllByText('6').length).toBeGreaterThan(0);
  });

  it("navigates to the report from the primary button", async () => {
    const user = userEvent.setup();
    await renderWithProviders(<DashboardPage />);
    await user.click(await screen.findByRole('button', { name: /this week's report/i }));
    expect(window.location.hash).toBe('#/report');
  });

  it('renders follow-up queue rows as accessible buttons', async () => {
    await renderWithProviders(<DashboardPage />);
    // Casey Morgan is the seeded VIP with no check-ins, so they appear in the queue.
    const row = await screen.findByRole('button', { name: /casey morgan/i });
    expect(row).toHaveTextContent('VIP');
  });
});
