import { beforeEach, describe, expect, it } from 'vitest';
import { LocalTrackerRepository } from './LocalTrackerRepository';
import { _resetDBForTests } from './db';
import { ConflictError } from '../../domain/types';
import { blankConfig } from '../../domain/demoData';
import { revisioned } from '../../domain/factory';

async function seedVersionOneDatabase() {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open('lgtracker_local_v1', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('meta', { keyPath: 'trackerId' });
      db.createObjectStore('config', { keyPath: 'id' });
      db.createObjectStore('stages', { keyPath: 'id' });
      db.createObjectStore('groups', { keyPath: 'id' });
      db.createObjectStore('members', { keyPath: 'id' });
      db.createObjectStore('memberMilestones', { keyPath: 'id' });
      db.createObjectStore('weeks', { keyPath: 'id' });
      db.createObjectStore('meetings', { keyPath: 'id' }).createIndex('weekId', 'weekId');
      db.createObjectStore('attendanceEvents', { keyPath: 'id' }).createIndex('meetingId', 'meetingId');
      db.createObjectStore('campaigns', { keyPath: 'id' });
      db.createObjectStore('campaignMetrics', { keyPath: 'id' }).createIndex('campaignId', 'campaignId');
      db.createObjectStore('rivals', { keyPath: 'id' }).createIndex('campaignId', 'campaignId');
      db.createObjectStore('events', { keyPath: 'id' });
      db.createObjectStore('media', { keyPath: 'id' });
      db.createObjectStore('audit', { keyPath: 'id' });
      db.createObjectStore('blobs', { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(['meta', 'config', 'groups'], 'readwrite');
      tx.objectStore('meta').put({ trackerId: 'legacy-tracker', schemaVersion: 1, spreadsheetId: null });
      tx.objectStore('config').put(blankConfig('legacy-actor'));
      tx.objectStore('groups').put({
        id: 'legacy-group',
        name: 'Legacy Life Group',
        category: 'open',
        location: '',
        weeklyTarget: null,
        ...revisioned('legacy-actor', '2026-01-01T00:00:00.000Z'),
      });
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
}

beforeEach(async () => {
  await _resetDBForTests();
});

describe('LocalTrackerRepository', () => {
  it('bootstraps a blank snapshot on first load', async () => {
    const repo = new LocalTrackerRepository('actor-1');
    const snap = await repo.loadSnapshot();
    expect(snap.groups).toHaveLength(0);
    expect(snap.members).toHaveLength(0);
    expect(snap.stages.length).toBeGreaterThan(0);
    expect(repo.getSyncState()).toBe('saved');
  });

  it('upgrades a v1 IndexedDB in place without clearing existing records', async () => {
    await seedVersionOneDatabase();

    const snapshot = await new LocalTrackerRepository('actor-1').loadSnapshot();

    expect(snapshot.meta.schemaVersion).toBe(2);
    expect(snapshot.groups).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'legacy-group', name: 'Legacy Life Group' })]));
    expect(snapshot.campaignSessions).toEqual([]);
    expect(snapshot.campaignAttendanceEvents).toEqual([]);
  });

  it('creates, updates, and tombstone-deletes a group', async () => {
    const repo = new LocalTrackerRepository('actor-1');
    await repo.loadSnapshot();

    await repo.saveCommand({
      commandId: 'c1',
      actorId: 'actor-1',
      timestamp: new Date().toISOString(),
      entity: { type: 'group', id: 'g1' },
      op: 'create',
      payload: { name: 'Alex Rivera', category: 'leader', location: '', weeklyTarget: null },
    });

    let snap = await repo.refresh();
    const group = snap.groups.find((g) => g.id === 'g1')!;
    expect(group.name).toBe('Alex Rivera');
    expect(group.revision).toBe(1);

    await repo.saveCommand({
      commandId: 'c2',
      actorId: 'actor-1',
      timestamp: new Date().toISOString(),
      entity: { type: 'group', id: 'g1' },
      op: 'update',
      baseRevision: 1,
      payload: { location: 'Main hall' },
    });
    snap = await repo.refresh();
    const updated = snap.groups.find((g) => g.id === 'g1')!;
    expect(updated.location).toBe('Main hall');
    expect(updated.revision).toBe(2);

    await repo.saveCommand({
      commandId: 'c3',
      actorId: 'actor-1',
      timestamp: new Date().toISOString(),
      entity: { type: 'group', id: 'g1' },
      op: 'delete',
      baseRevision: 2,
      payload: {},
    });
    snap = await repo.refresh();
    const deleted = snap.groups.find((g) => g.id === 'g1')!;
    expect(deleted.deletedAt).not.toBeNull();
  });

  it('throws ConflictError on stale baseRevision', async () => {
    const repo = new LocalTrackerRepository('actor-1');
    await repo.loadSnapshot();
    await repo.saveCommand({
      commandId: 'c1',
      actorId: 'actor-1',
      timestamp: new Date().toISOString(),
      entity: { type: 'group', id: 'g1' },
      op: 'create',
      payload: { name: 'Alex Rivera', category: 'leader', location: '', weeklyTarget: null },
    });
    await expect(
      repo.saveCommand({
        commandId: 'c2',
        actorId: 'actor-1',
        timestamp: new Date().toISOString(),
        entity: { type: 'group', id: 'g1' },
        op: 'update',
        baseRevision: 99,
        payload: { location: 'Nope' },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('dedupes append-only attendance events by id', async () => {
    const repo = new LocalTrackerRepository('actor-1');
    await repo.loadSnapshot();
    const cmd = {
      commandId: 'c1',
      actorId: 'actor-1',
      timestamp: new Date().toISOString(),
      entity: { type: 'attendanceEvent' as const, id: 'evt-1' },
      op: 'append' as const,
      payload: { meetingId: 'm1', memberId: 'mem1', action: 'checked_in', actorId: 'actor-1', clientTimestamp: new Date().toISOString() },
    };
    await repo.saveCommand(cmd);
    await repo.saveCommand(cmd); // retry with same id
    const snap = await repo.refresh();
    expect(snap.attendanceEvents).toHaveLength(1);
  });

  it('seedDemoData populates fictional sample records', async () => {
    const repo = new LocalTrackerRepository('actor-1');
    await repo.loadSnapshot();
    await repo.seedDemoData!();
    const snap = await repo.refresh();
    expect(snap.groups.length).toBeGreaterThan(0);
    expect(snap.members.length).toBeGreaterThan(0);
    // Sanity: none of the launch-blocker real names leaked into the fixture.
    expect(snap.members.some((m) => /lemuel|lloyd|victor|arnie/i.test(m.name))).toBe(false);
  });

  it('rejects a malformed backup before replacing any existing data', async () => {
    const repo = new LocalTrackerRepository('actor-1');
    await repo.loadSnapshot();
    await repo.seedDemoData!();
    const before = await repo.refresh();
    const malformed = structuredClone(before);

    malformed.config.church = 'This must not be persisted';
    malformed.groups = [];
    delete (malformed.members[0] as Partial<(typeof malformed.members)[number]>).phone;

    await expect(repo.restoreSnapshot(malformed)).rejects.toThrow('Invalid tracker backup');
    expect(await repo.refresh()).toEqual(before);
  });

  it('normalizes legacy backups without member address and notes fields', async () => {
    const repo = new LocalTrackerRepository('actor-1');
    await repo.loadSnapshot();
    await repo.seedDemoData!();
    const legacy = structuredClone(await repo.refresh());

    for (const member of legacy.members) {
      delete (member as Partial<typeof member>).address;
      delete (member as Partial<typeof member>).notes;
    }

    await expect(repo.restoreSnapshot(legacy)).resolves.toBeUndefined();
    const restored = await repo.refresh();
    expect(restored.members.every((member) => member.address === '' && member.notes === '')).toBe(true);
  });

  it('restores a v1 backup with no campaign-session collections', async () => {
    const repo = new LocalTrackerRepository('actor-1');
    await repo.loadSnapshot();
    await repo.seedDemoData!();
    const legacy = structuredClone(await repo.refresh());
    delete (legacy as Partial<typeof legacy>).campaignSessions;
    delete (legacy as Partial<typeof legacy>).campaignAttendanceEvents;

    await expect(repo.restoreSnapshot(legacy)).resolves.toBeUndefined();
    const restored = await repo.refresh();
    expect(restored.campaignSessions).toEqual([]);
    expect(restored.campaignAttendanceEvents).toEqual([]);
    expect(restored.memberMilestones.length).toBe(legacy.memberMilestones.length);
  });

  it('persists campaign sessions and dedupes campaign attendance events', async () => {
    const repo = new LocalTrackerRepository('actor-1');
    await repo.loadSnapshot();
    await repo.saveCommand({
      commandId: 'session',
      actorId: 'actor-1',
      timestamp: new Date().toISOString(),
      entity: { type: 'campaignSession', id: 'session-1' },
      op: 'create',
      payload: {
        campaignId: 'campaign',
        programKey: 'kgc',
        requirementKey: 'kgc:any',
        name: 'KGC',
        dateStart: '2026-09-27',
        dateEnd: '2026-09-27',
        startTime: '10:00',
        endTime: '12:00',
        venue: null,
        notes: '',
      },
    });
    const attendance = {
      commandId: 'attendance',
      actorId: 'actor-1',
      timestamp: new Date().toISOString(),
      entity: { type: 'campaignAttendanceEvent' as const, id: 'campaign-event-1' },
      op: 'append' as const,
      payload: {
        campaignId: 'campaign',
        sessionId: 'session-1',
        memberId: 'member-1',
        action: 'checked_in',
        actorId: 'actor-1',
        clientTimestamp: new Date().toISOString(),
      },
    };
    await repo.saveCommand(attendance);
    await repo.saveCommand(attendance);
    const snapshot = await repo.refresh();
    expect(snapshot.campaignSessions).toHaveLength(1);
    expect(snapshot.campaignAttendanceEvents).toHaveLength(1);
  });

  it('rolls back every snapshot store when an IndexedDB write fails', async () => {
    const repo = new LocalTrackerRepository('actor-1');
    await repo.loadSnapshot();
    await repo.seedDemoData!();
    const before = await repo.refresh();
    const replacement = structuredClone(before);

    replacement.config.church = 'This must roll back';
    replacement.groups = [];
    replacement.audit.push({
      id: 'uncloneable-audit',
      actorId: 'actor-1',
      action: 'restore',
      entityType: 'snapshot',
      entityId: replacement.meta.trackerId,
      timestamp: new Date().toISOString(),
      summary: 'Force a structured-clone failure',
      callback: () => undefined,
    } as unknown as (typeof replacement.audit)[number]);

    await expect(repo.restoreSnapshot(replacement)).rejects.toThrow();
    expect(await repo.refresh()).toEqual(before);
  });
});
