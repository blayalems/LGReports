import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { _resetDBForTests } from '../../repository/local/db';
import { renderWithProviders } from '../../test/renderWithProviders';
import MembersPage from './MembersPage';

beforeEach(async () => {
  await _resetDBForTests();
});

describe('MembersPage', () => {
  it('renders seeded members', async () => {
    await renderWithProviders(<MembersPage />);
    expect(await screen.findByText('Casey Morgan')).toBeInTheDocument();
    expect(screen.getByText('Riley Chen')).toBeInTheDocument();
  });

  it('search filters the member list', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<MembersPage />);
    await screen.findByText('Casey Morgan');
    await user.type(screen.getByRole('searchbox', { name: /search members/i }), 'riley');
    await waitFor(() => {
      expect(screen.queryByText('Casey Morgan')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Riley Chen')).toBeInTheDocument();
  });

  it('opens an accessible profile dialog from a member card', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<MembersPage />);
    await user.click(await screen.findByRole('button', { name: /casey morgan/i }));
    const dialog = await screen.findByRole('dialog', { name: /casey morgan/i });
    expect(within(dialog).getByDisplayValue('Casey Morgan')).toBeInTheDocument();
  });

  it('status filter chips narrow the grid', async () => {
    const user = userEvent.setup();
    await renderWithProviders(<MembersPage />);
    await screen.findByText('Casey Morgan');
    const vipChip = screen.getByRole('button', { name: 'VIP' });
    await user.click(vipChip);
    expect(vipChip).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => {
      expect(screen.queryByText('Riley Chen')).not.toBeInTheDocument();
    });
    expect(screen.getByText('Casey Morgan')).toBeInTheDocument();
  });
});
