import { useEffect, useRef, useState } from 'react';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { DraftNumberInput } from '../../components/ui/DraftNumberInput';
import { newId } from '../../domain/ids';
import { toISODate } from '../../domain/dateUtils';
import { currentWeek, meetingAttendance, meetingsForWeek, notDeleted } from '../../domain/selectors';
import type { CampaignEvent, EventAttendanceTotal, Group } from '../../domain/types';
import { showToast } from '../../hooks/useToast';
import { useTracker } from '../../state/StoreContext';
import styles from './EventsPage.module.css';

const LEGACY_TOTAL_KEY = '__legacy_unassigned__';

function attendanceFor(event: CampaignEvent): Record<string, EventAttendanceTotal> {
  if (event.leaderAttendance && Object.keys(event.leaderAttendance).length > 0) return event.leaderAttendance;
  if ((event.actual ?? 0) > 0 || (event.goal ?? 0) > 0) {
    return { [LEGACY_TOTAL_KEY]: { actual: event.actual, goal: event.goal } };
  }
  return {};
}

function attendanceTotals(attendance: Record<string, EventAttendanceTotal>) {
  return Object.values(attendance).reduce<{ actual: number; goal: number }>(
    (total, row) => ({ actual: total.actual + (row.actual ?? 0), goal: total.goal + (row.goal ?? 0) }),
    { actual: 0, goal: 0 },
  );
}

function EventCard({ event, groups, focusOnMount }: { event: CampaignEvent; groups: Group[]; focusOnMount: boolean }) {
  const { dispatch } = useTracker();
  const nameRef = useRef<HTMLInputElement>(null);
  const attendanceFromSnapshot = attendanceFor(event);
  const attendanceRef = useRef(attendanceFromSnapshot);

  useEffect(() => {
    if (focusOnMount) nameRef.current?.focus();
  }, [focusOnMount]);

  useEffect(() => {
    attendanceRef.current = attendanceFromSnapshot;
  }, [event, attendanceFromSnapshot]);

  const update = (payload: Partial<CampaignEvent>) => {
    void dispatch({ entity: { type: 'event', id: event.id }, op: 'update', payload, baseRevision: event.revision });
  };

  const updateAttendance = (groupId: string, field: keyof EventAttendanceTotal, value: number | null) => {
    const currentAttendance = attendanceRef.current;
    const currentRow = currentAttendance[groupId] ?? { actual: null, goal: null };
    const leaderAttendance = {
      ...currentAttendance,
      [groupId]: { ...currentRow, [field]: value },
    };
    // Keep rapid Actual -> Goal edits from rebuilding the second payload from a
    // stale render while the first revision is still saving.
    attendanceRef.current = leaderAttendance;
    const totals = attendanceTotals(leaderAttendance);
    update({ leaderAttendance, actual: totals.actual, goal: totals.goal });
  };

  const attendance = attendanceFromSnapshot;
  const totals = attendanceTotals(attendance);

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
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
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

      <fieldset className={styles.attendanceFieldset}>
        <legend className={styles.fieldLabel}>Attendance per leader</legend>
        {groups.length === 0 ? (
          <p className={styles.attendanceEmpty}>Add life groups in Settings to assign attendance goals by leader.</p>
        ) : (
          <div className={styles.attendanceTable}>
            <div className={`${styles.attendanceRow} ${styles.attendanceHead}`} aria-hidden="true">
              <span>Leader</span>
              <span>Actual</span>
              <span>Goal</span>
            </div>
            {groups.map((group) => {
              const row = attendance[group.id] ?? { actual: null, goal: null };
              return (
                <div key={group.id} className={styles.attendanceRow}>
                  <span className={styles.leaderName} title={group.name}>
                    {group.name}
                  </span>
                  <label htmlFor={`event-${event.id}-group-${group.id}-actual`}>
                    <span className="visually-hidden">
                      Actual attendance for {group.name} at {event.name || 'this event'}
                    </span>
                    <DraftNumberInput
                      id={`event-${event.id}-group-${group.id}-actual`}
                      min={0}
                      className={styles.numInput}
                      value={row.actual}
                      placeholder="0"
                      onCommit={(value) => updateAttendance(group.id, 'actual', value)}
                    />
                  </label>
                  <label htmlFor={`event-${event.id}-group-${group.id}-goal`}>
                    <span className="visually-hidden">
                      Attendance goal for {group.name} at {event.name || 'this event'}
                    </span>
                    <DraftNumberInput
                      id={`event-${event.id}-group-${group.id}-goal`}
                      min={0}
                      className={styles.numInput}
                      value={row.goal}
                      placeholder="0"
                      onCommit={(value) => updateAttendance(group.id, 'goal', value)}
                    />
                  </label>
                </div>
              );
            })}
            {attendance[LEGACY_TOTAL_KEY] && (
              <div className={`${styles.attendanceRow} ${styles.legacyRow}`}>
                <span className={styles.leaderName}>Unassigned legacy total</span>
                <label htmlFor={`event-${event.id}-legacy-actual`}>
                  <span className="visually-hidden">Unassigned actual attendance at {event.name || 'this event'}</span>
                  <DraftNumberInput
                    id={`event-${event.id}-legacy-actual`}
                    min={0}
                    className={styles.numInput}
                    value={attendance[LEGACY_TOTAL_KEY].actual}
                    placeholder="0"
                    onCommit={(value) => updateAttendance(LEGACY_TOTAL_KEY, 'actual', value)}
                  />
                </label>
                <label htmlFor={`event-${event.id}-legacy-goal`}>
                  <span className="visually-hidden">Unassigned attendance goal at {event.name || 'this event'}</span>
                  <DraftNumberInput
                    id={`event-${event.id}-legacy-goal`}
                    min={0}
                    className={styles.numInput}
                    value={attendance[LEGACY_TOTAL_KEY].goal}
                    placeholder="0"
                    onCommit={(value) => updateAttendance(LEGACY_TOTAL_KEY, 'goal', value)}
                  />
                </label>
              </div>
            )}
          </div>
        )}
        <div className={styles.goalRow}>
          <span className={styles.totalLabel}>Network total</span>
          <strong className={styles.totalValue}>
            {totals.actual} / {totals.goal}
          </strong>
          <div className={styles.barWrap}>
            <ProgressBar actual={totals.actual} goal={totals.goal} label={`${event.name || 'Event'} network total: ${totals.actual} of ${totals.goal}`} />
          </div>
        </div>
      </fieldset>

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
  const today = toISODate(new Date());
  const events = notDeleted(snapshot.events)
    .slice()
    .sort((a, b) => {
      const rank = (e: CampaignEvent) => (e.date && e.date >= today ? 0 : e.date ? 2 : 1);
      return rank(a) - rank(b) || (a.date ?? '').localeCompare(b.date ?? '');
    });
  const groups = notDeleted(snapshot.groups)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));
  const week = currentWeek(snapshot);

  const addEvent = async () => {
    const id = newId();
    await dispatch({
      entity: { type: 'event', id },
      op: 'create',
      payload: { name: '', date: null, type: '', goal: 0, actual: 0, notes: '', leaderAttendance: {} },
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
              <EventCard key={e.id} event={e} groups={groups} focusOnMount={e.id === newEventId} />
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
                  <label htmlFor={`group-${g.id}-weekly-target`}>
                    <span className="visually-hidden">Weekly target for {g.name}</span>
                    <DraftNumberInput
                      id={`group-${g.id}-weekly-target`}
                      min={0}
                      className={styles.numInput}
                      value={g.weeklyTarget}
                      placeholder="0"
                      onCommit={(value) =>
                        void dispatch({
                          entity: { type: 'group', id: g.id },
                          op: 'update',
                          payload: { weeklyTarget: value },
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
