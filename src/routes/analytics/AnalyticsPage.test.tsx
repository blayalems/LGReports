import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDBForTests } from '../../repository/local/db';
import { renderWithProviders } from '../../test/renderWithProviders';
import AnalyticsPage from './AnalyticsPage';

beforeEach(async () => {
  await _resetDBForTests();
});

describe('AnalyticsPage', () => {
  it('renders all sections without crashing on demo data', async () => {
    await renderWithProviders(<AnalyticsPage />);
    expect(await screen.findByRole('heading', { name: 'Attendance trend' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Conversion funnel' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Qualification readiness' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Group performance' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /retention/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cycle over cycle' })).toBeInTheDocument();
  });

  it("trend chart's accessible summary reflects the seeded week's total", async () => {
    await renderWithProviders(<AnalyticsPage />);
    // Demo data: one week, total attendance 1 (a single guest).
    const chart = await screen.findByRole('img', { name: /attendance trend.*total 1/i });
    expect(chart).toBeInTheDocument();
  });

  it('retention tiles add up to the total member count', async () => {
    const { repository } = await renderWithProviders(<AnalyticsPage />);
    await screen.findByText('Engaged');
    const snap = await repository.refresh();
    const totalMembers = snap.members.filter((m) => !m.deletedAt).length;
    const engagedTile = screen.getByText('Engaged').parentElement!;
    const atRiskTile = screen.getByText('At risk').parentElement!;
    const engaged = Number(engagedTile.querySelector('span')?.textContent);
    const atRisk = Number(atRiskTile.querySelector('span')?.textContent);
    expect(engaged + atRisk).toBe(totalMembers);
  });

  it('renders gracefully with no data at all', async () => {
    await renderWithProviders(<AnalyticsPage />, { seed: false });
    expect(await screen.findByText(/no weeks tracked yet/i)).toBeInTheDocument();
    expect(screen.getAllByText(/no active campaign/i).length).toBeGreaterThan(0);
  });
});
