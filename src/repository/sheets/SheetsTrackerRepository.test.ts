import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDemoSnapshot } from '../../domain/demoData';
import { nowISO } from '../../domain/dateUtils';
import { ConflictError, type DomainCommand } from '../../domain/types';
import { SheetsClient } from '../../lib/google/sheetsApi';
import { ALL_TABS, workbookValues, type TabName } from './schema';
import { createTrackerWorkbook, SheetsTrackerRepository, validateWorkbook, type AuthLike } from './SheetsTrackerRepository';

/**
 * In-memory stand-in for the Sheets values API, wired through global fetch.
 * Supports exactly the calls SheetsClient makes: batchGet, get/update range,
 * append, values:batchUpdate, spreadsheet create/get.
 */
class FakeSheetsServer {
  tabs = new Map<string, string[][]>();
  spreadsheetId = 'fake-spreadsheet-1';

  seed(values: Record<TabName, string[][]>) {
    for (const tab of ALL_TABS)
      this.tabs.set(
        tab,
        values[tab].map((r) => [...r]),
      );
  }

  private parseRange(range: string): { tab: string; r1: number | null; r2: number | null } {
    const decoded = decodeURIComponent(range).replace(/'/g, '');
    const [tab, cells] = decoded.split('!');
    if (!cells) return { tab, r1: null, r2: null };
    const nums = cells.match(/\d+/g);
    if (!nums) return { tab, r1: null, r2: null };
    return { tab, r1: Number(nums[0]), r2: Number(nums[1] ?? nums[0]) };
  }

  private getValues(range: string): string[][] {
    const { tab, r1, r2 } = this.parseRange(range);
    const rows = this.tabs.get(tab) ?? [];
    if (r1 == null) return rows;
    return rows.slice(r1 - 1, r2 ?? r1);
  }

  handle(url: string, init?: RequestInit): Response {
    const u = new URL(url);
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
    const path = decodeURIComponent(u.pathname);

    // POST /v4/spreadsheets  (create)
    if (path === '/v4/spreadsheets' && init?.method === 'POST') {
      const sheets = (body.sheets as { properties: { title: string } }[]) ?? [];
      for (const s of sheets) this.tabs.set(s.properties.title, []);
      return Response.json({ spreadsheetId: this.spreadsheetId });
    }
    // GET /v4/spreadsheets/<id>  (metadata)
    if (path === `/v4/spreadsheets/${this.spreadsheetId}` && (!init?.method || init.method === 'GET')) {
      return Response.json({
        spreadsheetId: this.spreadsheetId,
        sheets: [...this.tabs.keys()].map((title) => ({ properties: { title } })),
      });
    }
    // POST /v4/spreadsheets/<id>:batchUpdate (add missing compatibility tabs)
    if (path === `/v4/spreadsheets/${this.spreadsheetId}:batchUpdate` && init?.method === 'POST') {
      const requests = (body.requests as { addSheet?: { properties?: { title?: string } } }[]) ?? [];
      for (const request of requests) {
        const title = request.addSheet?.properties?.title;
        if (title && !this.tabs.has(title)) this.tabs.set(title, []);
      }
      return Response.json({});
    }
    // POST .../values:batchUpdate
    if (path.endsWith('/values:batchUpdate')) {
      const data = (body.data as { range: string; values: string[][] }[]) ?? [];
      for (const d of data) {
        const { tab } = this.parseRange(d.range);
        this.tabs.set(
          tab,
          d.values.map((r) => [...r]),
        );
      }
      return Response.json({});
    }
    // GET .../values:batchGet
    if (path.endsWith('/values:batchGet')) {
      const ranges = u.searchParams.getAll('ranges');
      return Response.json({ valueRanges: ranges.map((r) => ({ range: r, values: this.getValues(r) })) });
    }
    // POST .../values/<range>:append
    const appendMatch = path.match(/\/values\/(.+):append$/);
    if (appendMatch) {
      const { tab } = this.parseRange(appendMatch[1]);
      const rows = this.tabs.get(tab) ?? [];
      const newRows = (body.values as string[][]) ?? [];
      rows.push(...newRows.map((r) => [...r]));
      this.tabs.set(tab, rows);
      return Response.json({ updates: { updatedRange: `'${tab}'!A${rows.length}` } });
    }
    // GET or PUT .../values/<range>
    const rangeMatch = path.match(/\/values\/(.+)$/);
    if (rangeMatch) {
      if (init?.method === 'PUT') {
        const { tab, r1 } = this.parseRange(rangeMatch[1]);
        const rows = this.tabs.get(tab) ?? [];
        const values = (body.values as string[][]) ?? [];
        values.forEach((row, i) => {
          rows[(r1 ?? 1) - 1 + i] = [...row];
        });
        this.tabs.set(tab, rows);
        return Response.json({});
      }
      return Response.json({ range: rangeMatch[1], values: this.getValues(rangeMatch[1]) });
    }
    return new Response(JSON.stringify({ error: { message: `Unhandled fake route: ${path}` } }), { status: 500 });
  }
}

const auth: AuthLike = {
  getToken: async () => 'test-token',
  getEmail: () => 'leader@example.com',
  signOut: () => {},
};

let server: FakeSheetsServer;

beforeEach(() => {
  server = new FakeSheetsServer();
  vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('googleapis.com')) return Promise.resolve(server.handle(url, init));
    return Promise.reject(new Error(`Unexpected fetch: ${url}`));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeRepo(): SheetsTrackerRepository {
  return new SheetsTrackerRepository(auth, server.spreadsheetId);
}

function cmd(partial: Omit<DomainCommand, 'commandId' | 'actorId' | 'timestamp'>): DomainCommand {
  return { commandId: 'c-' + Math.random(), actorId: 'device-1', timestamp: nowISO(), ...partial };
}

describe('SheetsTrackerRepository', () => {
  it('provisions a workbook from a snapshot and round-trips it', async () => {
    const snapshot = createDemoSnapshot('actor-1');
    const client = new SheetsClient(() => auth.getToken(false));
    const id = await createTrackerWorkbook(client, 'Test Tracker', snapshot);
    expect(id).toBe(server.spreadsheetId);
    expect(await validateWorkbook(client, id)).toEqual({ ok: true });

    const repo = makeRepo();
    const loaded = await repo.loadSnapshot();
    expect(loaded.groups).toEqual(snapshot.groups);
    expect(loaded.config.church).toBe(snapshot.config.church);
    expect(loaded.meta.spreadsheetId).toBe(id);
    expect(repo.getSyncState()).toBe('saved');
  });

  it('updates a row with a revision bump attributed to the signed-in account', async () => {
    const snapshot = createDemoSnapshot('actor-1');
    server.seed(workbookValues(snapshot));
    const repo = makeRepo();
    await repo.loadSnapshot();

    const group = snapshot.groups[0];
    await repo.saveCommand(cmd({ entity: { type: 'group', id: group.id }, op: 'update', baseRevision: 1, payload: { location: 'New Hall' } }));

    const after = await repo.refresh();
    const updated = after.groups.find((g) => g.id === group.id)!;
    expect(updated.location).toBe('New Hall');
    expect(updated.revision).toBe(2);
    expect(updated.updatedBy).toBe('leader@example.com');
    // The write also left an audit row naming the account.
    expect(after.audit.some((a) => a.actorId === 'leader@example.com' && a.entityId === group.id)).toBe(true);
  });

  it('throws ConflictError when the live row moved past baseRevision', async () => {
    const snapshot = createDemoSnapshot('actor-1');
    server.seed(workbookValues(snapshot));
    const repo = makeRepo();
    await repo.loadSnapshot();
    const group = snapshot.groups[0];

    // Another leader edits the same row first.
    const other = makeRepo();
    await other.loadSnapshot();
    await other.saveCommand(cmd({ entity: { type: 'group', id: group.id }, op: 'update', baseRevision: 1, payload: { name: 'Renamed' } }));

    await expect(
      repo.saveCommand(cmd({ entity: { type: 'group', id: group.id }, op: 'update', baseRevision: 1, payload: { location: 'Stale write' } })),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(repo.getSyncState()).toBe('stale');
  });

  it('creates rows and tombstone-deletes them', async () => {
    server.seed(workbookValues(createDemoSnapshot('actor-1')));
    const repo = makeRepo();
    await repo.loadSnapshot();

    await repo.saveCommand(
      cmd({ entity: { type: 'group', id: 'g-new' }, op: 'create', payload: { name: 'Newbie', category: 'open', location: '', weeklyTarget: null } }),
    );
    let snap = await repo.refresh();
    const created = snap.groups.find((g) => g.id === 'g-new')!;
    expect(created.name).toBe('Newbie');
    expect(created.createdBy).toBe('leader@example.com');

    await repo.saveCommand(cmd({ entity: { type: 'group', id: 'g-new' }, op: 'delete', baseRevision: 1, payload: {} }));
    snap = await repo.refresh();
    expect(snap.groups.find((g) => g.id === 'g-new')!.deletedAt).not.toBeNull();
  });

  it('dedupes retried attendance-event appends by id', async () => {
    server.seed(workbookValues(createDemoSnapshot('actor-1')));
    const repo = makeRepo();
    const snap = await repo.loadSnapshot();
    const meeting = snap.meetings[0];
    const member = snap.members[0];

    const payload = { meetingId: meeting.id, memberId: member.id, action: 'checked_in', actorId: 'device-1', clientTimestamp: nowISO() };
    const command = cmd({ entity: { type: 'attendanceEvent', id: 'evt-1' }, op: 'append', payload });
    await repo.saveCommand(command);
    await repo.saveCommand(command); // retry
    const after = await repo.refresh();
    expect(after.attendanceEvents.filter((e) => e.id === 'evt-1')).toHaveLength(1);
  });

  it('provisions new campaign tabs on an otherwise valid legacy workbook', async () => {
    const values = workbookValues(createDemoSnapshot('actor-1'));
    for (const tab of ALL_TABS) {
      if (tab !== 'campaignSessions' && tab !== 'campaignAttendanceEvents')
        server.tabs.set(
          tab,
          values[tab].map((row) => [...row]),
        );
    }
    const client = new SheetsClient(() => auth.getToken(false));
    await expect(validateWorkbook(client, server.spreadsheetId)).resolves.toEqual({ ok: true });
    expect(server.tabs.get('campaignSessions')?.[0]).toContain('requirementKey');
    expect(server.tabs.get('campaignAttendanceEvents')?.[0]).toContain('sessionId');
  });

  it('rejects linking a non-tracker spreadsheet', async () => {
    server.tabs.set('Sheet1', [['hello']]);
    const client = new SheetsClient(() => auth.getToken(false));
    const result = await validateWorkbook(client, server.spreadsheetId);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('wrong-schema');
  });
});
