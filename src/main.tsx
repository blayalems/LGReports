import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { StoreProvider } from './state/StoreContext';
import { HashRouterProvider } from './router/HashRouter';
import { LocalTrackerRepository } from './repository/local/LocalTrackerRepository';
import { LocalMediaRepository } from './repository/local/LocalMediaRepository';
import { getLocalActorId } from './domain/actor';

const actorId = getLocalActorId();
const repository = new LocalTrackerRepository(actorId);
const mediaRepository = new LocalMediaRepository();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider repository={repository} mediaRepository={mediaRepository} actorId={actorId}>
      <HashRouterProvider>
        <App />
      </HashRouterProvider>
    </StoreProvider>
  </StrictMode>,
);
