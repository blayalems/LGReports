import { getDB, type LocalSchema } from './db';
import type { IDBPDatabase, StoreNames } from 'idb';
import { createDemoSnapshot, createEmptySnapshot } from '../../domain/demoData';
import { newId } from '../../domain/ids';
import { nowISO } from '../../domain/dateUtils';
import { bumpRevision, revisioned } from '../../domain/factory';
import { ConflictError, type DomainCommand, type EntityType, type Revisioned, type SyncState, type TrackerSnapshot } from '../../domain/types';
import type { ConnectResult, TrackerRepository } from '../TrackerRepository';

type RevisionedStoreName =
  'stages' | 'groups' | 'members' | 'memberMilestones' | 'weeks' | 'meetings' | 'campaigns' | 'campaignMetrics' | 'rivals' | 'events' | 'config';

const REVISIONED_STORE_BY_ENTITY: Partial<Record<EntityType, RevisionedStoreName>> = {
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
};

/** Replace a store's full contents. _writeAll callers (seed/restore/reset) mean "this snapshot and nothing else" — merging old rows in would resurrect deleted data. */
async function replaceAll<T>(db: IDBPDatabase<LocalSchema>, store: StoreNames<LocalSchema>, items: T[]) {
  const tx = db.transaction(store, 'readwrite');
  await tx.store.clear();
  await Promise.all([...items.map((item) => tx.store.put(item as never)), tx.done]);
}

/**
 * Phase 1 backend: everything lives in this browser's IndexedDB. No PII ever touches
 * localStorage (see launch blocker: "localStorage-only PII") — IndexedDB is used
 * specifically so phase 4's offline queueing has somewhere durable to build on, and so
 * this store composes cleanly once phase 2 swaps in the Google-backed repository.
 */
export class LocalTrackerRepository implements TrackerRepository {
  private state: SyncState = 'saved';
  private listeners = new Set<(state: SyncState) => void>();
  private actorId: string;

  constructor(actorId: string) {
    this.actorId = actorId;
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
    try {
      await this.loadSnapshot();
      this.setState('saved');
      return { ok: true };
    } catch (err) {
      this.setState('error');
      return { ok: false, reason: 'unknown', message: String(err) };
    }
  }

  async disconnect(): Promise<void> {
    // Nothing to tear down for the local backend.
  }

  async loadSnapshot(): Promise<TrackerSnapshot> {
    this.setState('loading');
    const db = await getDB();
    const existing = await this._readAll(db);
    if (existing) {
      this.setState('saved');
      return existing;
    }
    const blank = createEmptySnapshot(this.actorId);
    await this._writeAll(db, blank);
    this.setState('saved');
    return blank;
  }

  async refresh(): Promise<TrackerSnapshot> {
    return this.loadSnapshot();
  }

  async restoreSnapshot(snapshot: TrackerSnapshot): Promise<void> {
    this.setState('saving');
    const db = await getDB();
    await this._writeAll(db, snapshot);
    this.setState('saved');
  }

  async seedDemoData(): Promise<void> {
    this.setState('saving');
    const db = await getDB();
    const demo = createDemoSnapshot(this.actorId);
    await this._writeAll(db, demo);
    this.setState('saved');
  }

  async saveCommand(command: DomainCommand): Promise<void> {
    this.setState('saving');
    const db = await getDB();
    try {
      if (command.entity.type === 'attendanceEvent') {
        await this._appendAttendanceEvent(db, command);
      } else if (command.entity.type === 'media') {
        await this._applyMedia(db, command);
      } else {
        const store = REVISIONED_STORE_BY_ENTITY[command.entity.type];
        if (!store) throw new Error(`Unsupported entity type: ${command.entity.type}`);
        await this._applyRevisioned(db, store, command);
      }
      await db.add('audit', {
        id: newId(),
        actorId: command.actorId,
        action: command.op,
        entityType: command.entity.type,
        entityId: command.entity.id,
        timestamp: nowISO(),
        summary: `${command.op} ${command.entity.type} ${command.entity.id}`,
      });
      this.setState('saved');
    } catch (err) {
      this.setState('error');
      throw err;
    }
  }

  private async _appendAttendanceEvent(db: IDBPDatabase<LocalSchema>, command: DomainCommand) {
    if (command.op !== 'append') throw new Error('attendanceEvent only supports append');
    const existing = await db.get('attendanceEvents', command.entity.id);
    if (existing) return; // dedupe retried event id
    await db.add('attendanceEvents', { id: command.entity.id, ...(command.payload as object) } as never);
  }

  private async _applyMedia(db: IDBPDatabase<LocalSchema>, command: DomainCommand) {
    if (command.op === 'create') {
      await db.put('media', { id: command.entity.id, ...(command.payload as object) } as never);
    } else if (command.op === 'delete') {
      await db.delete('media', command.entity.id);
    } else {
      const existing = await db.get('media', command.entity.id);
      if (!existing) throw new Error(`media ${command.entity.id} not found`);
      await db.put('media', { ...existing, ...(command.payload as object) } as never);
    }
  }

  private async _applyRevisioned(db: IDBPDatabase<LocalSchema>, store: RevisionedStoreName, command: DomainCommand) {
    if (command.op === 'create') {
      const entity = { id: command.entity.id, ...(command.payload as object), ...revisioned(command.actorId) };
      await db.put(store, entity as never);
      return;
    }
    const existing = (await db.get(store, command.entity.id)) as (Revisioned & { id: string }) | undefined;
    if (!existing) throw new Error(`${store} ${command.entity.id} not found`);
    if (command.baseRevision !== undefined && existing.revision !== command.baseRevision) {
      throw new ConflictError(command.entity.type, command.entity.id, command.baseRevision, existing.revision);
    }
    if (command.op === 'delete') {
      await db.put(store, bumpRevision({ ...existing, deletedAt: nowISO() }, command.actorId) as never);
      return;
    }
    const merged = bumpRevision({ ...existing, ...(command.payload as object) }, command.actorId);
    await db.put(store, merged as never);
  }

  private async _readAll(db: IDBPDatabase<LocalSchema>): Promise<TrackerSnapshot | null> {
    const configs = await db.getAll('config');
    if (!configs.length) return null;
    const [meta] = await db.getAll('meta');
    const [stages, groups, members, memberMilestones, weeks, meetings, attendanceEvents, campaigns, campaignMetrics, rivals, events, media, audit] =
      await Promise.all([
        db.getAll('stages'),
        db.getAll('groups'),
        db.getAll('members'),
        db.getAll('memberMilestones'),
        db.getAll('weeks'),
        db.getAll('meetings'),
        db.getAll('attendanceEvents'),
        db.getAll('campaigns'),
        db.getAll('campaignMetrics'),
        db.getAll('rivals'),
        db.getAll('events'),
        db.getAll('media'),
        db.getAll('audit'),
      ]);
    return {
      meta: meta ?? { trackerId: newId(), schemaVersion: 1, spreadsheetId: null },
      config: configs[0],
      stages,
      groups,
      members,
      memberMilestones,
      weeks,
      meetings,
      attendanceEvents,
      campaigns,
      campaignMetrics,
      rivals,
      events,
      media,
      audit,
    };
  }

  private async _writeAll(db: IDBPDatabase<LocalSchema>, snap: TrackerSnapshot) {
    await replaceAll(db, 'meta', [snap.meta]);
    await replaceAll(db, 'config', [snap.config]);
    await replaceAll(db, 'stages', snap.stages);
    await replaceAll(db, 'groups', snap.groups);
    await replaceAll(db, 'members', snap.members);
    await replaceAll(db, 'memberMilestones', snap.memberMilestones);
    await replaceAll(db, 'weeks', snap.weeks);
    await replaceAll(db, 'meetings', snap.meetings);
    await replaceAll(db, 'attendanceEvents', snap.attendanceEvents);
    await replaceAll(db, 'campaigns', snap.campaigns);
    await replaceAll(db, 'campaignMetrics', snap.campaignMetrics);
    await replaceAll(db, 'rivals', snap.rivals);
    await replaceAll(db, 'events', snap.events);
    await replaceAll(db, 'media', snap.media);
    await replaceAll(db, 'audit', snap.audit);
  }
}
