import type { ChangeEvent } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatDate, sundayOf, toISODate } from '../../domain/dateUtils';
import { newId } from '../../domain/ids';
import { meetingsForWeek, notDeleted, weeksChrono, weekTotal } from '../../domain/selectors';
import type { Week } from '../../domain/types';
import { showToast } from '../../hooks/useToast';
import { parseWeekWorkbook, type ParsedRow } from '../../lib/xlsx/reader';
import { useRouter } from '../../router/HashRouter';
import { useTracker } from '../../state/StoreContext';
import styles from './HistoryPage.module.css';

function weekOfFromRows(rows: ParsedRow[]): string {
  const firstDated = rows.find((r) => r.date);
  if (!firstDated) return '';
  const d = new Date(firstDated.date);
  return Number.isNaN(d.getTime()) ? '' : toISODate(sundayOf(d));
}

export default function HistoryPage() {
  const { snapshot, dispatch, actorId } = useTracker();
  const { navigate } = useRouter();
  if (!snapshot) return null;

  const weeks = weeksChrono(snapshot).slice().reverse();
  const currentSunday = toISODate(sundayOf(new Date()));

  const duplicateWeek = async (src: Week) => {
    const weekId = newId();
    await dispatch({
      entity: { type: 'week', id: weekId },
      op: 'create',
      payload: {
        weekOf: '',
        label: `${src.label || 'Week'} (copy)`,
        network: src.network,
        overseer: src.overseer,
        status: 'draft',
        submittedAt: null,
        submittedBy: null,
      },
    });
    // Copy the roster shape only — attendance/check-ins never carry over to a new week.
    for (const m of meetingsForWeek(snapshot, src.id)) {
      await dispatch({
        entity: { type: 'meeting', id: newId() },
        op: 'create',
        payload: {
          weekId,
          groupId: m.groupId,
          leaderName: m.leaderName,
          category: m.category,
          start: m.start,
          end: m.end,
          status: '',
          date: '',
          location: m.location,
          photoMediaId: null,
          guestCount: 0,
        },
      });
    }
    showToast('Week duplicated', 'success');
  };

  const deleteWeek = async (week: Week) => {
    if (notDeleted(snapshot.weeks).length <= 1) {
      showToast('Keep at least one week', 'error');
      return;
    }
    if (!window.confirm(`Delete "${week.label || 'this week'}" and its records?`)) return;
    for (const m of meetingsForWeek(snapshot, week.id)) {
      await dispatch({ entity: { type: 'meeting', id: m.id }, op: 'delete', payload: {}, baseRevision: m.revision });
    }
    await dispatch({ entity: { type: 'week', id: week.id }, op: 'delete', payload: {}, baseRevision: week.revision });
    showToast('Week deleted', 'info');
  };

  const importXlsx = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = await parseWeekWorkbook(await file.arrayBuffer());
      if (!parsed || parsed.rows.length === 0) {
        showToast("Couldn't find a report layout in that file", 'error');
        return;
      }
      const weekId = newId();
      await dispatch({
        entity: { type: 'week', id: weekId },
        op: 'create',
        payload: {
          weekOf: weekOfFromRows(parsed.rows),
          label: parsed.weekLabel || file.name.replace(/\.xlsx$/i, ''),
          network: parsed.network || snapshot.config.network,
          overseer: parsed.overseer || snapshot.config.overseer,
          status: parsed.dateSubmitted ? 'submitted' : 'draft',
          submittedAt: parsed.dateSubmitted || null,
          submittedBy: parsed.dateSubmitted ? actorId : null,
        },
      });
      for (const row of parsed.rows) {
        await dispatch({
          entity: { type: 'meeting', id: newId() },
          op: 'create',
          payload: {
            weekId,
            groupId: null,
            leaderName: row.leader,
            category: row.section,
            start: row.start,
            end: row.end,
            status: row.status,
            date: row.date,
            location: row.location,
            photoMediaId: null,
            // Imported totals arrive as aggregates — kept as guest count so
            // week totals stay right without inventing per-member check-ins.
            guestCount: row.attendance || 0,
          },
        });
      }
      showToast(`Imported "${parsed.weekLabel || file.name}" (${parsed.rows.length} rows)`, 'success');
    } catch {
      showToast("Couldn't read that .xlsx file", 'error');
    }
  };

  return (
    <section className={`view ${styles.page}`}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div>
            <div className={styles.kicker}>Archive</div>
            <h1 className={styles.h1}>Weekly history</h1>
          </div>
          <label className={`pressable ${styles.importBtn}`}>
            <input type="file" accept=".xlsx" onChange={(e) => void importXlsx(e)} style={{ display: 'none' }} />
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 15V3M7 8l5-5 5 5" />
              <path d="M4 21h16" />
            </svg>
            Import .xlsx report
          </label>
        </div>

        {weeks.length === 0 ? (
          <EmptyState icon="🗂️" title="No weeks yet" hint="Start a weekly report or import an existing .xlsx to build your archive." />
        ) : (
          <div className={styles.list}>
            {weeks.map((week) => {
              const meetings = meetingsForWeek(snapshot, week.id);
              return (
                <div key={week.id} className={`glasscard ${styles.row}`}>
                  <div className={styles.rowMain}>
                    <div className={styles.rowTitleWrap}>
                      <h2 className={styles.rowTitle}>{week.label || 'Untitled week'}</h2>
                      {week.weekOf === currentSunday && <span className={styles.currentBadge}>Current</span>}
                      {week.status === 'submitted' && <span className={styles.statusBadge}>Submitted</span>}
                    </div>
                    <div className={styles.rowSub}>
                      {week.weekOf ? `Week of ${formatDate(week.weekOf)}` : 'No date'}
                      {week.submittedAt ? ` · submitted ${formatDate(week.submittedAt.slice(0, 10))}` : ''}
                    </div>
                  </div>
                  <div className={styles.stats}>
                    <div className={styles.stat}>
                      <div className={styles.statNum}>{weekTotal(snapshot, week.id)}</div>
                      <div className={styles.statLabel}>Attend</div>
                    </div>
                    <div className={styles.stat}>
                      <div className={styles.statNum}>{meetings.length}</div>
                      <div className={styles.statLabel}>Groups</div>
                    </div>
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={`pressable ${styles.openBtn}`}
                      aria-label={`Open ${week.label || 'week'}`}
                      onClick={() => navigate(`/report/${week.id}`)}
                    >
                      Open
                    </button>
                    <button type="button" className={styles.iconBtn} aria-label={`Duplicate ${week.label || 'week'}`} onClick={() => void duplicateWeek(week)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <rect x="9" y="9" width="12" height="12" rx="2" />
                        <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                      </svg>
                    </button>
                    <button type="button" className={styles.iconBtn} aria-label={`Delete ${week.label || 'week'}`} onClick={() => void deleteWeek(week)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
