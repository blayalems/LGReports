// Settings-driven flows for adopting a shared workbook. Both flows end by saving
// the (non-sensitive) connection prefs; the caller reloads the page so main.tsx
// rebuilds the app around the Sheets repository.

import type { TrackerSnapshot } from '../../domain/types';
import { GoogleAuth } from '../../lib/google/gis';
import { parseSpreadsheetId, SheetsApiError, SheetsClient } from '../../lib/google/sheetsApi';
import { saveConnection } from '../connection';
import { createTrackerWorkbook, validateWorkbook } from './SheetsTrackerRepository';

export interface FlowResult {
  ok: boolean;
  message?: string;
}

async function signIn(clientId: string): Promise<{ auth: GoogleAuth; client: SheetsClient } | FlowResult> {
  if (!clientId.trim()) {
    return { ok: false, message: 'Enter your Google OAuth Client ID first (see the setup guide).' };
  }
  const auth = new GoogleAuth(clientId.trim());
  const token = await auth.getToken(true);
  if (!token) return { ok: false, message: 'Google sign-in was cancelled or blocked. Allow popups for this site and try again.' };
  return { auth, client: new SheetsClient((interactive) => auth.getToken(interactive)) };
}

function describeError(err: unknown): string {
  if (err instanceof SheetsApiError && (err.status === 403 || err.status === 404)) {
    return "That workbook isn't shared with this Google account (or the id is wrong). Ask the overseer to share it as Editor.";
  }
  return err instanceof Error ? err.message : String(err);
}

/** Adopt an existing tracker workbook (the overseer shares it; each leader links it once). */
export async function linkExistingWorkbook(clientId: string, workbookRef: string): Promise<FlowResult> {
  const spreadsheetId = parseSpreadsheetId(workbookRef);
  if (!spreadsheetId) return { ok: false, message: 'Paste the workbook link (docs.google.com/spreadsheets/…) or its id.' };
  const session = await signIn(clientId);
  if ('ok' in session) return session;
  try {
    const validation = await validateWorkbook(session.client, spreadsheetId);
    if (!validation.ok) return { ok: false, message: validation.message };
    saveConnection({ backend: 'sheets', clientId: clientId.trim(), spreadsheetId });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: describeError(err) };
  }
}

/** Create a brand-new shared workbook, seeded from this device's current data. */
export async function createSharedWorkbook(clientId: string, title: string, snapshot: TrackerSnapshot): Promise<FlowResult> {
  const session = await signIn(clientId);
  if ('ok' in session) return session;
  try {
    const spreadsheetId = await createTrackerWorkbook(session.client, title, snapshot);
    saveConnection({ backend: 'sheets', clientId: clientId.trim(), spreadsheetId });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: describeError(err) };
  }
}
