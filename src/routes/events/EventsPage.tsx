import { useEffect, useRef, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { newId } from '../../domain/ids';
import { currentWeek, meetingAttendance, meetingsForWeek, notDeleted } from '../../domain/selectors';
import type { CampaignEvent } from '../../domain/types';
import { showToast } from '../../hooks/useToast';
import { useTracker } from '../../state/StoreContext';
import styles from './EventsPage.module.css';

function parseNum(value: string): number | null {
  return value === '' ? null : Math.max(0, Number(value));
}

function EventCard({ event, focusOnMount }: { event: CampaignEvent; focusOnMount: boolean }) {
  const { dispatch } = useTracker();
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusOnMount) nameRef.current?.focus();
  }, [focusOnMount]);

  const update = (payload: Partial<CampaignEvent>) => {
    void dispatch({ entity: { type: 'event', id: event.id }, op: 'update', payload, baseRevision: event.revision });
  };

  const onDelete = () => {
    if (!window.confirm(`Delete "${event.name || 'this event'}"?`)) return;
    void dispatch({ entity: { type: 'event', id: event.id }, op: 'delete', payload: {}, baseRevision: event.revision }).then(() =>
      showToast('Event deleted', 'info'),
    );
  };

  return (
    <Card className={styles.eventCard}>
      <div className={styles.eventTop}>
        <label style={{ flex: 1, minWidth: 0 }}>
          <span className="visually-hidden">Event name</span>
          <input
            ref={nameRef}
            className={styles.nameInput}
            style={{ width: '100%' }}
            defaultValue={event.name}
            placeholder="Event name"
            onBlur={(e) => {
              if (e.target.value !== event.name) update({ name: e.target.value });
            }}
          />
        </label>
        {event.type && <span className={styles.typeChip}>{event.type}</span>}
        <button type="button" className={styles.deleteBtn} aria-label={`Delete event ${event.name || ''}`} onClick={onDelete}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
          </svg>
        </button>
      </div>

      <div className={styles.fieldRow}>
        <label>
          <span className={styles.fieldLabel}>Date</span>
          <input type="date" className={styles.fieldInput} value={event.date ?? ''} onChange={(e) => update({ date: e.target.value || null })} />
        </label>
        <label>
          <span className={styles.fieldLabel}>Type</span>
          <input
            className={styles.fieldInput}
            defaultValue={event.type}
            placeholder="Conference, Retreat…"
            onBlur={(e) => {
              if (e.target.value !== event.type) update({ type: e.target.value });
            }}
          />
        </label>
      </div>

      <div>
        <span className={styles.fieldLabel}>Attendance goal</span>
        <div className={styles.goalRow}>
          <label>
            <span className="visually-hidden">Actual attendance</span>
            <input
              type="number"
              min={0}
              className={styles.numInput}
              value={event.actual ?? ''}
              placeholder="0"
              onChange={(e) => update({ actual: parseNum(e.target.value) })}
            />
          </label>
          <span className={styles.numSep} aria-hidden="true">
            /
          </span>
          <label>
            <span className="visually-hidden">Attendance goal</span>
            <input
              type="number"
              min={0}
              className={styles.numInput}
              value={event.goal ?? ''}
              placeholder="0"
              onChange={(e) => update({ goal: parseNum(e.target.value) })}
            />
          </label>
          <div className={styles.barWrap}>
            <ProgressBar actual={event.actual ?? 0} goal={event.goal ?? 0} label={`${event.name || 'Event'}: ${event.actual ?? 0} of ${event.goal ?? 0}`} />
          </div>
        </div>
      </div>

      <label>
        <span className={styles.fieldLabel}>Notes</span>
        <input
          className={styles.fieldInput}
          defaultValue={event.notes}
          placeholder="Notes"
          onBlur={(e) => {
            if (e.target.value !== event.notes) update({ notes: e.target.value });
          }}
        />
      </label>
    </Card>
  );
}

export default function EventsPage() {
  const { snapshot, dispatch } = useTracker();
  const [newEventId, setNewEventId] = useState<string | null>(null);
  if (!snapshot) return null;

  // Dated upcoming events first, then undated, then past.
  const today = new Date().toISOString().slice(0, 10);
  const events = notDeleted(snapshot.events)
    .slice()
    .sort((a, b) => {
      const rank = (e: CampaignEvent) => (e.date && e.date >= today ? 0 : e.date ? 2 : 1);
      return rank(a) - rank(b) || (a.date ?? '').localeCompare(b.date ?? '');
    });
  const groups = notDeleted(snapshot.groups);
  const week = currentWeek(snapshot);

  const addEvent = async () => {
    const id = newId();
    await dispatch({
      entity: { type: 'event', id },
      op: 'create',
      payload: { name: '', date: null, type: '', goal: null, actual: null, notes: '' },
    });
    setNewEventId(id);
  };

  const groupActual = (groupId: string) =>
    week
      ? meetingsForWeek(snapshot, week.id)
          .filter((m) => m.groupId === groupId)
          .reduce((s, m) => s + meetingAttendance(snapshot, m), 0)
      : 0;

  return (
    <section className={`view ${styles.page}`}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div>
            <div className={styles.kicker}>Planning</div>
            <h1 className={styles.h1}>Events &amp; Goals</h1>
          </div>
          <button type="button" className={`pressable ${styles.primaryBtn}`} onClick={() => void addEvent()}>
            + Add event
          </button>
        </div>

        {events.length === 0 ? (
          <Card style={{ marginBottom: 16 }}>
            <EmptyState icon="📅" title="No events yet" hint="Add retreats, conferences, and special Sundays to set goals and count down to them." />
          </Card>
        ) : (
          <div className={styles.grid}>
            {events.map((e) => (
              <EventCard key={e.id} event={e} focusOnMount={e.id === newEventId} />
            ))}
          </div>
        )}

        <Card>
          <h2 className={styles.targetsTitle}>Weekly attendance targets per life group</h2>
          <p className={styles.targetsHint}>
            {week ? `Progress against this week's report (${week.label}).` : 'No report started this week yet — targets show 0 until one exists.'}
          </p>
          {groups.length === 0 ? (
            <EmptyState icon="🌱" title="No life groups yet" hint="Set up your roster in Settings — targets appear here per group." />
          ) : (
            groups.map((g) => {
              const actual = groupActual(g.id);
              const goal = g.weeklyTarget ?? 0;
              return (
                <div key={g.id} className={styles.targetRow}>
                  <span className={styles.targetName}>{g.name}</span>
                  <div className={styles.targetBar}>
                    <ProgressBar actual={actual} goal={goal} label={`${g.name}: ${actual} of ${goal} this week`} />
                  </div>
                  <span className={styles.targetNums}>
                    <strong>{actual}</strong> / {goal}
                  </span>
                  <label>
                    <span className="visually-hidden">Weekly target for {g.name}</span>
                    <input
                      type="number"
                      min={0}
                      className={styles.numInput}
                      value={g.weeklyTarget ?? ''}
                      placeholder="0"
                      onChange={(e) =>
                        void dispatch({
                          entity: { type: 'group', id: g.id },
                          op: 'update',
                          payload: { weeklyTarget: parseNum(e.target.value) },
                          baseRevision: g.revision,
                        })
                      }
                    />
                  </label>
                </div>
              );
            })
          )}
        </Card>
      </div>
    </section>
  );
}
