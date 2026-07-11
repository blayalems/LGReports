import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDBForTests } from '../../repository/local/db';
import { renderWithProviders } from '../../test/renderWithProviders';
import SettingsPage from './SettingsPage';

beforeEach(async () => {
  await _resetDBForTests();
});

describe('SettingsPage', () => {
  it('renders branding, roster, and milestone stages from the snapshot', async () => {
    await renderWithProviders(<SettingsPage />);
    expect(await screen.findByDisplayValue('Riverside Fellowship (sample)')).toBeInTheDocument();
    expect(screen.getByDisplayValue('New Life Sunday VIPs')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Alex Rivera')).toBeInTheDocument();
  });

  it('renaming a milestone stage persists', async () => {
    const { repository } = await renderWithProviders(<SettingsPage />);
    const input = await screen.findByDisplayValue('Water Baptism');
    fireEvent.change(input, { target: { value: 'Baptism Sunday' } });
    fireEvent.blur(input);
    await waitFor(async () => {
      const snap = await repository.refresh();
      expect(snap.stages.some((s) => s.label === 'Baptism Sunday')).toBe(true);
    });
  });

  it('theme and accent are real toggle buttons with pressed state', async () => {
    const user = userEvent.setup();
    const { repository } = await renderWithProviders(<SettingsPage />);
    const darkBtn = await screen.findByRole('button', { name: 'Dark' });
    await user.click(darkBtn);
    await waitFor(async () => {
      const snap = await repository.refresh();
      expect(snap.config.theme).toBe('dark');
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    });
    await user.click(screen.getByRole('button', { name: 'Plum accent' }));
    await waitFor(async () => {
      const snap = await repository.refresh();
      expect(snap.config.accent).toBe('#8A5CA0');
    });
  });

  it('shows a truthful data location note instead of a fake sync claim', async () => {
    await renderWithProviders(<SettingsPage />);
    expect(await screen.findByText(/saved on this device/i)).toBeInTheDocument();
    expect(screen.queryByText(/auto-synced/i)).not.toBeInTheDocument();
  });
});
