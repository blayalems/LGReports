import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { _resetDBForTests } from '../../repository/local/db';
import { renderWithProviders } from '../../test/renderWithProviders';
import { AppShell } from './AppShell';

vi.mock('../../hooks/useMediaQuery', () => ({
  useMediaQuery: () => false,
}));

beforeEach(async () => {
  await _resetDBForTests();
});

describe('AppShell', () => {
  it('focuses main content without replacing the hash route', async () => {
    const user = userEvent.setup();
    await renderWithProviders(
      <AppShell>
        <p>Route content</p>
      </AppShell>,
    );
    window.location.hash = '#/members';

    await user.click(screen.getByRole('link', { name: /skip to main content/i }));

    expect(window.location.hash).toBe('#/members');
    expect(screen.getByRole('main')).toHaveFocus();
  });
});
