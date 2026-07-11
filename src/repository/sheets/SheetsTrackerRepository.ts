import { nowISO } from '../../domain/dateUtils';
import { newId } from '../../domain/ids';
import { bumpRevision, revisioned } from '../../domain/factory';
import { ConflictError, type DomainCommand, type Revisioned, type SyncState, type TrackerSnapshot } from '../../domain/types';
import { NeedsSignInError, SheetsApiError, SheetsClient } from '../../lib/google/sheetsApi';
import type { ConnectResult, TrackerRepository } from '../TrackerRepository';
import {
  ALL_TABS,
  entityToRow,
  headersMatch,
  parseWorkbook,
  rowRange,
  rowToEntity,
  workbookValues,
  type ParsedWorkbook,
  type TabName,
} from './schema';

/** The slice of GoogleAuth this repository needs — injectable for tests. */
export interface AuthLike {
  getToken(interactive: boolean): Promise<string | null>;
  getEmail(): string | null;
  signOut(): void;
}

const TAB_BY_ENTITY: Record<string, TabName> = {
  config: 'config',
  stage: 'stages',
  group: 'groups',
  member: 'members',
  memberMilestone: 'memberMilestones',
  week: 'weeks',
  meeting: 'meetings',
  campaign: 'campaigns',
  campaignMetric: 'campaignMetrics',
  rival: 'rivals',
  event: 'events',
  media: 'media',
};

/**
 * Phase 2 backend: a shared Google Sheets workbook is the source of truth. Every
 * trusted leader signs in with their own Google account and edits the same workbook
 * (shared to them as Editors via normal Drive sharing). Optimistic concurrency rides
 * on the per-row `revision` column: before every update we re-read the live row and
 * refuse (ConflictError) if someone else changed it since this client last saw it.
 * Sheets has no transactions, so a small write race window remains — acceptable for
 * a trusted team of this size, and the append-only attendance log is race-free.
 */
export class SheetsTrackerRepository implements TrackerRepository {
  readonly isRemote = true;

  private auth: AuthLike;
  private client: SheetsClient;
  private spreadsheetId: string;
  private state: SyncState = 'disconnected';
  private listeners = new Set<(state: SyncState) => void>();
  private cache: ParsedWorkbook | null = null;
  private appendedEventIds = new Set<string>();

  constructor(auth: AuthLike, spreadsheetId: string) {
    this.auth = auth;
    this.spreadsheetId = spreadsheetId;
    this.client = new SheetsClient((interactive) => auth.getToken(interactive));
  }

  getSpreadsheetId(): string {
    return this.spreadsheetId;
  }

  getAccountEmail(): string | null {
    return this.auth.getEmail();
  }

  getSyncState(): SyncState {
    return this.state;
  }

  onSyncStateChange(listener: (state: SyncState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(next: SyncState) {
    this.state = next;
    this.listeners.forEach((l) => l(next));
  }

  async connect(): Promise<ConnectResult> {
    this.setState('connecting');
    const token = await this.auth.getToken(true);
    if (!token) {
      this.setState('disconnected');
      return { ok: false, reason: 'access-denied', message: 'Google sign-in was cancelled or blocked.' };
    }
    try {
      const validation = await validateWorkbook(this.client, this.spreadsheetId);
      if (!validation.ok) {
        this.setState('error');
        return validation;
      }
      await this.refresh();
      return { ok: true };
    } catch (err) {
      this.setState('error');
      if (err instanceof SheetsApiError && (err.status === 403 || err.status === 404)) {
        return { ok: false, reason: 'access-denied', message: 'That workbook is not shared with this Google account.' };
      }
      return { ok: false, reason: 'network', message: err instanceof Error ? err.message : String(err) };
    }
  }

  async disconnect(): Promise<void> {
    this.auth.signOut();
    this.cache = null;
    this.setState('disconnected');
  }

  async loadSnapshot(): Promise<TrackerSnapshot> {
    const token = await this.auth.getToken(false);
    if (!token) {
      this.setState('disconnected');
      throw new NeedsSignInError();
    }
    return this.refresh();
  }

  async refresh(): Promise<TrackerSnapshot> {
    this.setState('loading');
    try {
      const ranges = ALL_TABS.map((tab) => `'${tab}'`);
      const valueRanges = await this.client.batchGet(this.spreadsheetId, ranges);
      const valuesByTab: Partial<Record<TabName, (string | undefined)[][]>> = {};
      ALL_TABS.forEach((tab, i) => {
        valuesByTab[tab] = valueRanges[i]?.values ?? [];
      });
      const parsed = parseWorkbook(valuesByTab);
      parsed.snapshot.meta.spreadsheetId = this.spreadsheetId;
      this.cache = parsed;
      this.setState('saved');
      return parsed.snapshot;
    } catch (err) {
      this.setState(err instanceof NeedsSignInError ? 'disconnected' : 'error');
      throw err;
    }
  }

  async saveCommand(command: DomainCommand): Promise<void> {
    this.setState('saving');
    try {
      // Attribute writes to the signed-in Google account so the shared audit trail
      // says who did what — the whole point of a multi-leader workbook.
      const actorId = this.auth.getEmail() ?? command.actorId;

      if (command.entity.type === 'attendanceEvent') {
        await this.appendAttendanceEvent({ ...command, actorId });
      } else {
        const tab = TAB_BY_ENTITY[command.entity.type];
        if (!tab) throw new Error(`Unsupported entity type: ${command.entity.type}`);
        if (command.op === 'create') {
          await this.createRow(tab, command, actorId);
        } else {
          await this.mutateRow(tab, command, actorId);
        }
      }

      // Audit is best-effort: the data write above already succeeded.
      try {
        await this.client.appendRow(
          this.spreadsheetId,
          'audit',
          entityToRow('audit', {
            id: newId(),
            actorId,
            action: command.op,
            entityType: command.entity.type,
            entityId: command.entity.id,
            timestamp: nowISO(),
            summary: `${command.op} ${command.entity.type} ${command.entity.id}`,
          }),
        );
      } catch {
        // swallow — losing one audit row must not fail the user's save
      }
      this.setState('saved');
    } catch (err) {
      this.setState(err instanceof NeedsSignInError ? 'disconnected' : err instanceof ConflictError ? 'stale' : 'error');
      throw err;
    }
  }

  private async appendAttendanceEvent(command: DomainCommand): Promise<void> {
    if (command.op !== 'append') throw new Error('attendanceEvent only supports append');
    const id = command.entity.id;
    const known = this.appendedEventIds.has(id) || this.cache?.snapshot.attendanceEvents.some((e) => e.id === id);
    if (known) return; // retried command — already durable
    const row = entityToRow('attendanceEvents', { id, ...(command.payload as object), actorId: command.actorId });
    await this.client.appendRow(this.spreadsheetId, 'attendanceEvents', row);
    this.appendedEventIds.add(id);
  }

  private async createRow(tab: TabName, command: DomainCommand, actorId: string): Promise<void> {
    const entity = { id: command.entity.id, ...(command.payload as object), ...(tab === 'media' ? {} : revisioned(actorId)) };
    const rowNum = await this.client.appendRow(this.spreadsheetId, tab, entityToRow(tab, entity as Record<string, unknown>));
    if (rowNum && this.cache) this.cache.rowIndex[tab].set(command.entity.id, rowNum);
  }

  private async mutateRow(tab: TabName, command: DomainCommand, actorId: string, isRetry = false): Promise<void> {
    let rowNum = this.cache?.rowIndex[tab].get(command.entity.id);
    if (!rowNum) {
      await this.refresh();
      rowNum = this.cache?.rowIndex[tab].get(command.entity.id);
      this.setState('saving');
    }
    if (!rowNum) throw new Error(`${tab} row ${command.entity.id} not found in workbook`);

    // Re-read the live row so the conflict check runs against the sheet, not our cache.
    const liveRows = await this.client.getRange(this.spreadsheetId, rowRange(tab, rowNum));
    const live = rowToEntity<Record<string, unknown> & Revisioned & { id: string }>(tab, liveRows[0] ?? []);
    if (live.id !== command.entity.id) {
      // Rows moved under us (someone sorted/deleted rows in the sheet UI) — re-sync and retry once.
      if (isRetry) throw new Error(`${tab} row ${command.entity.id} keeps moving — try again after the sheet settles`);
      await this.refresh();
      this.setState('saving');
      return this.mutateRow(tab, command, actorId, true);
    }

    if (tab !== 'media' && command.baseRevision !== undefined && live.revision !== command.baseRevision) {
      throw new ConflictError(command.entity.type, command.entity.id, command.baseRevision, live.revision);
    }

    let merged: Record<string, unknown>;
    if (command.op === 'delete') {
      merged = tab === 'media' ? { ...live, id: '' } : bumpRevision({ ...live, deletedAt: nowISO() }, actorId);
    } else {
      merged = tab === 'media' ? { ...live, ...(command.payload as object) } : bumpRevision({ ...live, ...(command.payload as object) }, actorId);
    }
    await this.client.updateRange(this.spreadsheetId, rowRange(tab, rowNum), [entityToRow(tab, merged)]);
  }
}

/** Checks that every expected tab exists with matching headers. */
export async function validateWorkbook(client: SheetsClient, spreadsheetId: string): Promise<ConnectResult> {
  const info = await client.getSpreadsheet(spreadsheetId);
  const titles = new Set((info.sheets ?? []).map((s) => s.properties?.title ?? ''));
  const missing = ALL_TABS.filter((tab) => !titles.has(tab));
  if (missing.length === ALL_TABS.length) {
    return { ok: false, reason: 'wrong-schema', message: 'That spreadsheet is not a Life Group Tracker workbook. Use "Create new workbook" instead.' };
  }
  if (missing.length > 0) {
    return { ok: false, reason: 'wrong-schema', message: `Workbook is missing tabs: ${missing.join(', ')}` };
  }
  const headerRanges = ALL_TABS.map((tab) => `'${tab}'!1:1`);
  const headerRows = await client.batchGet(spreadsheetId, headerRanges);
  const bad = ALL_TABS.filter((tab, i) => !headersMatch(tab, headerRows[i]?.values?.[0]));
  if (bad.length > 0) {
    return { ok: false, reason: 'wrong-schema', message: `Workbook columns were changed by hand on: ${bad.join(', ')}` };
  }
  return { ok: true };
}

/** Creates a brand-new tracker workbook seeded from `snapshot`; returns its spreadsheet id. */
export async function createTrackerWorkbook(client: SheetsClient, title: string, snapshot: TrackerSnapshot): Promise<string> {
  const spreadsheetId = await client.createSpreadsheet(title, [...ALL_TABS]);
  const values = workbookValues(snapshot);
  await client.batchUpdateValues(
    spreadsheetId,
    ALL_TABS.map((tab) => ({ range: `'${tab}'!A1`, values: values[tab] })),
  );
  return spreadsheetId;
}
