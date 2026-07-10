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
});
