import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { HashRouterProvider } from '../router/HashRouter';
import { LocalMediaRepository } from '../repository/local/LocalMediaRepository';
import { LocalTrackerRepository } from '../repository/local/LocalTrackerRepository';
import { StoreProvider } from '../state/StoreContext';

/**
 * Renders a screen inside the real providers against a fresh in-memory IndexedDB.
 * Callers must await this (the repository seeds before render) and should use
 * `findBy*` queries for the first assertion — the snapshot loads asynchronously.
 */
export async function renderWithProviders(ui: ReactElement, { seed = true }: { seed?: boolean } = {}) {
  const repository = new LocalTrackerRepository('test-actor');
  await repository.loadSnapshot();
  if (seed) await repository.seedDemoData();
  window.location.hash = '';
  const view = render(
    <StoreProvider repository={repository} mediaRepository={new LocalMediaRepository()} actorId="test-actor">
      <HashRouterProvider>{ui}</HashRouterProvider>
    </StoreProvider>,
  );
  return { repository, ...view };
}
