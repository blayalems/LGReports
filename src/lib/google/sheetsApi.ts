// Minimal typed client for the two Google APIs phase 2 needs: Sheets values
// read/write and spreadsheet creation. Plain fetch — no SDK — so the whole
// surface is visible, testable with a mocked fetch, and adds zero bundle weight.

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export type GetToken = (interactive: boolean) => Promise<string | null>;

export class NeedsSignInError extends Error {
  constructor() {
    super('Google sign-in required');
    this.name = 'NeedsSignInError';
  }
}

export class SheetsApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'SheetsApiError';
  }
}

export interface ValueRange {
  range?: string;
  values?: (string | undefined)[][];
}

interface BatchGetResponse {
  valueRanges?: ValueRange[];
}

interface AppendResponse {
  updates?: { updatedRange?: string };
}

export interface SpreadsheetInfo {
  spreadsheetId: string;
  properties?: { title?: string };
  sheets?: { properties?: { title?: string; sheetId?: number } }[];
}

export class SheetsClient {
  private getToken: GetToken;

  constructor(getToken: GetToken) {
    this.getToken = getToken;
  }

  private async request<T>(url: string, init?: RequestInit): Promise<T> {
    let token = await this.getToken(false);
    if (!token) throw new NeedsSignInError();
    let res = await fetch(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    if (res.status === 401) {
      // Token expired mid-session: one silent retry, then give up to the sign-in gate.
      token = await this.getToken(false);
      if (!token) throw new NeedsSignInError();
      res = await fetch(url, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } });
    }
    if (!res.ok) {
      let message = `Google API error ${res.status}`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        if (body.error?.message) message = body.error.message;
      } catch {
        // keep the generic message
      }
      throw new SheetsApiError(res.status, message);
    }
    return (await res.json()) as T;
  }

  /** Reads whole tabs in one call. Returned ranges preserve request order. */
  async batchGet(spreadsheetId: string, ranges: string[]): Promise<ValueRange[]> {
    const params = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
    const data = await this.request<BatchGetResponse>(`${SHEETS_BASE}/${spreadsheetId}/values:batchGet?majorDimension=ROWS&${params}`);
    return data.valueRanges ?? [];
  }

  async getRange(spreadsheetId: string, range: string): Promise<(string | undefined)[][]> {
    const data = await this.request<ValueRange>(`${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?majorDimension=ROWS`);
    return data.values ?? [];
  }

  async updateRange(spreadsheetId: string, range: string, values: string[][]): Promise<void> {
    await this.request(`${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
    });
  }

  /** Appends one row; returns the 1-based row number it landed on (from the response range). */
  async appendRow(spreadsheetId: string, tab: string, row: string[]): Promise<number | null> {
    const range = `'${tab}'!A1`;
    const data = await this.request<AppendResponse>(
      `${SHEETS_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ range, majorDimension: 'ROWS', values: [row] }) },
    );
    const updated = data.updates?.updatedRange ?? '';
    const match = updated.match(/![A-Z]+(\d+)/);
    return match ? Number(match[1]) : null;
  }

  async batchUpdateValues(spreadsheetId: string, data: { range: string; values: string[][] }[]): Promise<void> {
    await this.request(`${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ valueInputOption: 'RAW', data: data.map((d) => ({ ...d, majorDimension: 'ROWS' })) }),
    });
  }

  async getSpreadsheet(spreadsheetId: string): Promise<SpreadsheetInfo> {
    return this.request<SpreadsheetInfo>(`${SHEETS_BASE}/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties(title,sheetId)`);
  }

  /** Creates a spreadsheet with the given tab titles; returns its id. */
  async createSpreadsheet(title: string, tabTitles: string[]): Promise<string> {
    const data = await this.request<SpreadsheetInfo>(SHEETS_BASE, {
      method: 'POST',
      body: JSON.stringify({
        properties: { title },
        sheets: tabTitles.map((t, i) => ({ properties: { title: t, index: i } })),
      }),
    });
    return data.spreadsheetId;
  }

  /** Adds any missing tabs to an existing spreadsheet. */
  async addSheets(spreadsheetId: string, tabTitles: string[]): Promise<void> {
    if (!tabTitles.length) return;
    await this.request(`${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests: tabTitles.map((title) => ({ addSheet: { properties: { title } } })) }),
    });
  }
}

/** Accepts a bare id or any docs.google.com URL and extracts the spreadsheet id. */
export function parseSpreadsheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}
