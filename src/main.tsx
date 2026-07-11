import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { StoreProvider } from './state/StoreContext';
import { HashRouterProvider } from './router/HashRouter';
import { LocalTrackerRepository } from './repository/local/LocalTrackerRepository';
import { LocalMediaRepository } from './repository/local/LocalMediaRepository';
import { SheetsTrackerRepository } from './repository/sheets/SheetsTrackerRepository';
import { loadConnection } from './repository/connection';
import { GoogleAuth } from './lib/google/gis';
import { getLocalActorId } from './domain/actor';
import type { TrackerRepository } from './repository/TrackerRepository';

// Backend selection happens once per page load from stored (non-sensitive) prefs.
// Sheets mode still uses the local actor id as fallback attribution until the
// Google session is live — the Sheets repository swaps in the signed-in email
// for every write it lands on the shared workbook.
const actorId = getLocalActorId();
const connection = loadConnection();

let repository: TrackerRepository;
if (connection) {
  const auth = new GoogleAuth(connection.clientId);
  repository = new SheetsTrackerRepository(auth, connection.spreadsheetId);
} else {
  repository = new LocalTrackerRepository(actorId);
}

// Photos stay in this device's IndexedDB in phase 2 (shared Drive media is a later
// phase — see docs/google-sheets-setup.md for why drive.file can't serve a team).
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
