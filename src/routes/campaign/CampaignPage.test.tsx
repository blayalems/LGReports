import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDBForTests } from '../../repository/local/db';
import { renderWithProviders } from '../../test/renderWithProviders';
import CampaignPage from './CampaignPage';

beforeEach(async () => {
  await _resetDBForTests();
});

describe('CampaignPage', () => {
  it("renders the seeded campaign's stage progress", async () => {
    await renderWithProviders(<CampaignPage />);
    expect(await screen.findByText('Milestone goals')).toBeInTheDocument();
    // Demo data seeds the six default stages with goals.
    expect(screen.getAllByText('New Life Sunday VIPs').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Water Baptism').length).toBeGreaterThan(0);
  });

  it('editing a milestone actual updates the stored metric', async () => {
    const { repository } = await renderWithProviders(<CampaignPage />);
    await screen.findByText('Milestone goals');
    const actualInputs = screen.getAllByLabelText('Actual');
    fireEvent.change(actualInputs[0], { target: { value: '25' } });
    fireEvent.blur(actualInputs[0]);
    await waitFor(async () => {
      const snap = await repository.refresh();
      const vipMetric = snap.campaignMetrics.find((m) => m.metricKey === 'vip');
      expect(vipMetric?.actual).toBe(25);
    });
  });

  it('pace badge always carries a text label, not just color', async () => {
    await renderWithProviders(<CampaignPage />);
    await screen.findByText('Milestone goals');
    expect(screen.getByText(/ahead|on track|behind/i)).toBeInTheDocument();
  });
});
