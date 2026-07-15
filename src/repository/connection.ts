// Which backend this browser uses, persisted across reloads. Contains ONLY
// non-sensitive identifiers: the public OAuth client id and the workbook's
// spreadsheet id. Never tokens, never emails, never member data — those rules
// are launch blockers, not preferences.

const KEY = 'lgt_connection_v1';

export interface SheetsConnection {
  backend: 'sheets';
  clientId: string;
  spreadsheetId: string;
}

export function loadConnection(): SheetsConnection | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SheetsConnection>;
    if (parsed.backend === 'sheets' && typeof parsed.clientId === 'string' && typeof parsed.spreadsheetId === 'string') {
      return parsed as SheetsConnection;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveConnection(connection: SheetsConnection): void {
  localStorage.setItem(KEY, JSON.stringify(connection));
}

export function clearConnection(): void {
  localStorage.removeItem(KEY);
}

/** Build-time default OAuth client id (public), overridable per-deployment via .env. */
export function defaultClientId(): string {
  return (import.meta.env?.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? '';
}
