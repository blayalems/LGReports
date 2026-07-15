import { describe, expect, it } from 'vitest';
import { createEmptySnapshot } from './demoData';
import { revisioned } from './factory';
import { upcomingEvents } from './selectors';

describe('upcomingEvents', () => {
  it("includes today's events even when the cutoff time is later than midnight", () => {
    const snapshot = createEmptySnapshot('test');
    const metadata = revisioned('test', '2026-07-15T00:00:00.000Z');
    snapshot.events = [
      { id: 'past', name: 'Yesterday', date: '2026-07-14', type: '', goal: null, actual: null, notes: '', ...metadata },
      { id: 'today', name: 'Today', date: '2026-07-15', type: '', goal: null, actual: null, notes: '', ...metadata },
      { id: 'future', name: 'Tomorrow', date: '2026-07-16', type: '', goal: null, actual: null, notes: '', ...metadata },
    ];

    expect(upcomingEvents(snapshot, new Date(2026, 6, 15, 18, 30)).map((event) => event.id)).toEqual(['today', 'future']);
  });

  it('excludes undated, invalid, and deleted events', () => {
    const snapshot = createEmptySnapshot('test');
    const metadata = revisioned('test', '2026-07-15T00:00:00.000Z');
    snapshot.events = [
      { id: 'valid', name: 'Valid', date: '2026-07-15', type: '', goal: null, actual: null, notes: '', ...metadata },
      { id: 'undated', name: 'Undated', date: null, type: '', goal: null, actual: null, notes: '', ...metadata },
      { id: 'invalid', name: 'Invalid', date: 'not-a-date', type: '', goal: null, actual: null, notes: '', ...metadata },
      { id: 'deleted', name: 'Deleted', date: '2026-07-16', type: '', goal: null, actual: null, notes: '', ...metadata, deletedAt: '2026-07-15T01:00:00.000Z' },
    ];

    expect(upcomingEvents(snapshot, new Date(2026, 6, 15, 23, 59)).map((event) => event.id)).toEqual(['valid']);
  });
});
