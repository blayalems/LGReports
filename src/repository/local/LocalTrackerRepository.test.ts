import { beforeEach, describe, expect, it } from 'vitest';
import { LocalTrackerRepository } from './LocalTrackerRepository';
import { _resetDBForTests } from './db';
import { ConflictError } from '../../domain/types';

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
