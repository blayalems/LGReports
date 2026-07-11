import { useEffect, useRef, useState } from 'react';
import { SyncStatusChip } from '../../components/ui/SyncStatusChip';
import { formatDate, nowISO, parseISODate, sundayOf, toISODate, weekLabelFor } from '../../domain/dateUtils';
import { newId } from '../../domain/ids';
import { currentWeek, meetingAttendance, meetingsForWeek, notDeleted, weeksChrono } from '../../domain/selectors';
import type { Meeting, TrackerSnapshot, Week } from '../../domain/types';
import { showToast } from '../../hooks/useToast';
import { buildWeekWorkbook, downloadBlob, type ReportRow } from '../../lib/xlsx/writer';
import { useTracker } from '../../state/StoreContext';
import { CheckinDialog } from './CheckinDialog';
import { MeetingCard } from './MeetingCard';
import styles from './ReportPage.module.css';

function rowsFor(snapshot: TrackerSnapshot, meetings: Meeting[]): ReportRow[] {
  return meetings.map((m) => ({
    leader: m.leaderName,
    start: m.start,
    end: m.end,
    attendance: meetingAttendance(snapshot, m),
    status: m.status,
    date: m.date,
    location: m.location,
  }));
}

export default function ReportPage({ params }: { params: string[] }) {
  const { snapshot, dispatch, refresh, syncState, actorId } = useTracker();
  const [selectedId, setSelectedId] = useState<string | null>(params[0] ?? null);
  const [checkinMeetingId, setCheckinMeetingId] = useState<string | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const bootstrappedRef = useRef(false);

  const createWeek = async (snap: TrackerSnapshot, sunday: Date) => {
    const weekId = newId();
    await dispatch({
      entity: { type: 'week', id: weekId },
      op: 'create',
      payload: {
        weekOf: toISODate(sunday),
        label: weekLabelFor(sunday),
        network: snap.config.network,
        overseer: snap.config.overseer,
        status: 'draft',
        submittedAt: null,
        submittedBy: null,
      },
    });
    // Pre-fill one meeting row per roster group, matching the original workflow.
    for (const group of notDeleted(snap.groups)) {
      await dispatch({
        entity: { type: 'meeting', id: newId() },
        op: 'create',
        payload: {
          weekId,
          groupId: group.id,
          leaderName: group.name,
          category: group.category,
          start: '',
          end: '',
          status: '',
          date: '',
          location: group.location || '',
          photoMediaId: null,
          guestCount: 0,
        },
      });
    }
    setSelectedId(weekId);
    return weekId;
  };

  // First visit with no explicit week: make sure the current Sunday's week exists.
  useEffect(() => {
    if (!snapshot || bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    if (params[0]) return;
    if (!currentWeek(snapshot)) {
      void createWeek(snapshot, sundayOf(new Date())).then(() => showToast('Started this week from your roster', 'info'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, params]);

  if (!snapshot) return null;

  const chrono = weeksChrono(snapshot);
  const week: Week | undefined =
    (selectedId && notDeleted(snapshot.weeks).find((w) => w.id === selectedId)) || currentWeek(snapshot) || chrono[chrono.length - 1];

  const meetings = week ? meetingsForWeek(snapshot, week.id) : [];
  const leaderMeetings = meetings.filter((m) => m.category === 'leader');
  const openMeetings = meetings.filter((m) => m.category === 'open');
  const editable = !week || week.status !== 'submitted';
  const incomplete = meetings.filter((m) => !m.date && !m.status);

  const updateWeek = (payload: Partial<Week>) => {
    if (!week) return;
    void dispatch({ entity: { type: 'week', id: week.id }, op: 'update', payload, baseRevision: week.revision });
  };

  const addWeek = () => {
    let sunday = sundayOf(new Date());
    const latest = chrono[chrono.length - 1];
    const latestDate = latest ? parseISODate(latest.weekOf) : null;
    if (latestDate && latestDate >= sunday) {
      sunday = new Date(latestDate);
      sunday.setDate(sunday.getDate() + 7);
    }
    void createWeek(snapshot, sunday).then(() => showToast(`Week of ${weekLabelFor(sunday)} started`, 'success'));
  };

  const addRow = (category: 'leader' | 'open') => {
    if (!week) return;
    void dispatch({
      entity: { type: 'meeting', id: newId() },
      op: 'create',
      payload: {
        weekId: week.id,
        groupId: null,
        leaderName: '',
        category,
        start: '',
        end: '',
        status: '',
        date: '',
        location: '',
        photoMediaId: null,
        guestCount: 0,
      },
    });
  };

  const submit = async () => {
    if (!week) return;
    if (incomplete.length > 0) {
      setShowValidation(true);
      showToast(`${incomplete.length} row${incomplete.length === 1 ? ' needs' : 's need'} a date or a status before submitting`, 'error');
      return;
    }
    await dispatch({
      entity: { type: 'week', id: week.id },
      op: 'update',
      payload: { status: 'submitted', submittedAt: nowISO(), submittedBy: actorId },
      baseRevision: week.revision,
    });
    setShowValidation(false);
    showToast('Report submitted', 'success');
  };

  const reopen = async () => {
    if (!week) return;
    await dispatch({
      entity: { type: 'week', id: week.id },
      op: 'update',
      payload: { status: 'reopened', submittedAt: nowISO(), submittedBy: actorId },
      baseRevision: week.revision,
    });
    showToast('Report reopened for edits', 'info');
  };

  const syncNow = async () => {
    await refresh();
    showToast('Refreshed from this device', 'info');
  };

  const exportXlsx = () => {
    if (!week) return;
    const blob = buildWeekWorkbook({
      weekLabel: week.label,
      network: week.network,
      overseer: week.overseer,
      dateSubmitted: week.submittedAt ? week.submittedAt.slice(0, 10) : '',
      leaderRows: rowsFor(snapshot, leaderMeetings),
      openRows: rowsFor(snapshot, openMeetings),
    });
    downloadBlob(`${week.label || 'Week'} - Life Group Report.xlsx`, blob);
    showToast('Exported .xlsx', 'success');
  };

  const attLeader = leaderMeetings.reduce((s, m) => s + meetingAttendance(snapshot, m), 0);
  const attOpen = openMeetings.reduce((s, m) => s + meetingAttendance(snapshot, m), 0);
  const checkinMeeting = checkinMeetingId ? meetings.find((m) => m.id === checkinMeetingId) : undefined;

  const sections: { category: 'leader' | 'open'; title: string; list: Meeting[]; headClass: string }[] = [
    { category: 'leader', title: "Leader's Life Group", list: leaderMeetings, headClass: styles.sectionHeadLeader },
    { category: 'open', title: 'Open Life Group', list: openMeetings, headClass: styles.sectionHeadOpen },
  ];

  return (
    <section className={`view ${styles.page}`}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div>
            <div className={styles.kicker}>Data entry</div>
            <h1 className={styles.h1}>Weekly Report</h1>
            <div className={styles.statusLine}>
              <SyncStatusChip state={syncState} />
              {week?.status === 'submitted' && (
                <span className={styles.submittedNote}>
                  Submitted {week.submittedAt ? formatDate(week.submittedAt.slice(0, 10)) : ''} by {week.submittedBy || 'unknown'}
                </span>
              )}
              {week?.status === 'reopened' && <span className={styles.submittedNote}>Reopened for edits</span>}
            </div>
          </div>
          <div className={styles.toolbar}>
            <div className={styles.weekPicker}>
              <label className={styles.weekPickerLabel} htmlFor="report-week-select">
                Week
              </label>
              <select id="report-week-select" className={styles.weekSelect} value={week?.id ?? ''} onChange={(e) => setSelectedId(e.target.value)}>
                {chrono
                  .slice()
                  .reverse()
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.label || w.weekOf || 'Untitled week'}
                    </option>
                  ))}
              </select>
              <button type="button" className={`pressable ${styles.addWeekBtn}`} onClick={addWeek} aria-label="Start a new week">
                +
              </button>
            </div>
            <button type="button" className={`pressable ${styles.ghostBtn}`} onClick={() => window.print()}>
              Print
            </button>
            <button type="button" className={`pressable ${styles.syncBtn}`} onClick={() => void syncNow()}>
              Sync
            </button>
            <button type="button" className={`pressable ${styles.ghostBtn}`} onClick={exportXlsx}>
              Export .xlsx
            </button>
            {editable ? (
              <button type="button" className={`pressable ${styles.primaryBtn}`} onClick={() => void submit()}>
                Submit report
              </button>
            ) : (
              <button type="button" className={`pressable ${styles.ghostBtn}`} onClick={() => void reopen()}>
                Reopen for edits
              </button>
            )}
          </div>
        </div>

        {week && (
          <div className={styles.headerCard}>
            {editable ? (
              <>
                <label className={styles.fieldLabel}>
                  Network / Ministry
                  <input
                    className={styles.fieldInput}
                    defaultValue={week.network}
                    placeholder="e.g. North Network"
                    onBlur={(e) => {
                      if (e.target.value !== week.network) updateWeek({ network: e.target.value });
                    }}
                  />
                </label>
                <label className={styles.fieldLabel}>
                  Network Overseer
                  <input
                    className={styles.fieldInput}
                    defaultValue={week.overseer}
                    placeholder="Overseer name"
                    onBlur={(e) => {
                      if (e.target.value !== week.overseer) updateWeek({ overseer: e.target.value });
                    }}
                  />
                </label>
                <label className={styles.fieldLabel}>
                  Week Covered
                  <input
                    className={styles.fieldInput}
                    defaultValue={week.label}
                    placeholder="e.g. MAR 8 - MAR 14"
                    onBlur={(e) => {
                      if (e.target.value !== week.label) updateWeek({ label: e.target.value });
                    }}
                  />
                </label>
              </>
            ) : (
              <>
                <div>
                  <span className={styles.fieldLabel}>Network / Ministry</span>
                  <div className={styles.fieldValue}>{week.network || '—'}</div>
                </div>
                <div>
                  <span className={styles.fieldLabel}>Network Overseer</span>
                  <div className={styles.fieldValue}>{week.overseer || '—'}</div>
                </div>
                <div>
                  <span className={styles.fieldLabel}>Week Covered</span>
                  <div className={styles.fieldValue}>{week.label || '—'}</div>
                </div>
              </>
            )}
            <div>
              <span className={styles.fieldLabel}>Submitted</span>
              <div className={styles.fieldValue}>
                {week.submittedAt ? `${formatDate(week.submittedAt.slice(0, 10))} · ${week.submittedBy || ''}` : 'Not yet submitted'}
              </div>
            </div>
          </div>
        )}

        {showValidation && incomplete.length > 0 && (
          <p className={styles.validationNote} role="alert">
            These rows need a date or a status before the report can be submitted:{' '}
            <strong>{incomplete.map((m) => m.leaderName || 'unnamed row').join(', ')}</strong>
          </p>
        )}

        {sections.map((sec) => (
          <div className={styles.section} key={sec.category}>
            <div className={`${styles.sectionHead} ${sec.headClass}`}>
              <div className={styles.sectionTitleWrap}>
                <h2 className={styles.sectionTitle}>{sec.title}</h2>
                <span className={styles.sectionChip}>
                  {sec.list.length} group{sec.list.length === 1 ? '' : 's'}
                </span>
              </div>
              {editable && (
                <button type="button" className={`pressable ${styles.addRowBtn}`} onClick={() => addRow(sec.category)}>
                  + Add row
                </button>
              )}
            </div>
            <div className={styles.cardList}>
              {sec.list.length === 0 && <p style={{ color: 'var(--text3)', fontSize: 13.5, margin: '6px 8px' }}>No groups in this section yet.</p>}
              {sec.list.map((m, i) => (
                <MeetingCard
                  key={m.id}
                  meeting={m}
                  index={i}
                  editable={editable}
                  invalid={showValidation && !m.date && !m.status}
                  onOpenCheckin={setCheckinMeetingId}
                />
              ))}
            </div>
          </div>
        ))}

        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <h2 className={styles.summaryTitle}>Summary of groups</h2>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Total Life Groups</span>
              <span className={styles.summaryValue}>{meetings.length}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Open Life Groups</span>
              <span className={styles.summaryValue}>{openMeetings.length}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Leader's Life Groups</span>
              <span className={styles.summaryValue}>{leaderMeetings.length}</span>
            </div>
          </div>
          <div className={`${styles.summaryCard} ${styles.summaryCardAccent}`}>
            <h2 className={styles.summaryTitle}>Total attendance</h2>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Open Life Group</span>
              <span className={styles.summaryValue}>{attOpen}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel}>Leader's Life Group</span>
              <span className={styles.summaryValue}>{attLeader}</span>
            </div>
            <div className={styles.summaryRow}>
              <span className={styles.summaryLabel} style={{ fontWeight: 700 }}>
                Total
              </span>
              <span className={styles.grandTotal}>{attOpen + attLeader}</span>
            </div>
          </div>
        </div>
      </div>

      {checkinMeeting && editable && <CheckinDialog meeting={checkinMeeting} onClose={() => setCheckinMeetingId(null)} />}
    </section>
  );
}
