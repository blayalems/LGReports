import { useMemo, useRef, useState } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { nowISO, todayISO } from '../../domain/dateUtils';
import { newId } from '../../domain/ids';
import { avatarColor, currentAttendeeIds, groupName, initials, meetingAttendance, notDeleted } from '../../domain/selectors';
import type { Meeting, Member } from '../../domain/types';
import { showToast } from '../../hooks/useToast';
import { useTracker } from '../../state/StoreContext';
import styles from './CheckinDialog.module.css';

/**
 * Bottom-sheet check-in: the leader taps members present and adjusts a guest counter.
 * Attendance is always derived from these events + guests — never hand-typed.
 */
export function CheckinDialog({ meeting, onClose }: { meeting: Meeting; onClose: () => void }) {
  const { snapshot, dispatch, actorId } = useTracker();
  const [query, setQuery] = useState('');
  const meetingDateUpdate = useRef<Promise<void> | null>(null);

  const members = useMemo(() => {
    if (!snapshot) return [];
    const active = notDeleted(snapshot.members).filter((m) => m.status !== 'inactive');
    const q = query.trim().toLowerCase();
    const filtered = q ? active.filter((m) => m.name.toLowerCase().includes(q)) : active;
    // Members of this meeting's group sort first — they're the likely attendees.
    return filtered.slice().sort((a, b) => {
      const aOwn = a.groupId === meeting.groupId ? 0 : 1;
      const bOwn = b.groupId === meeting.groupId ? 0 : 1;
      return aOwn - bOwn || a.name.localeCompare(b.name);
    });
  }, [snapshot, query, meeting.groupId]);

  if (!snapshot) return null;

  const present = currentAttendeeIds(snapshot.attendanceEvents, meeting.id);
  const total = meetingAttendance(snapshot, meeting);
  const canAdd = query.trim().length > 0 && !members.some((m) => m.name.trim().toLowerCase() === query.trim().toLowerCase());

  const ensureMeetingDate = async () => {
    if (meeting.date) return;
    meetingDateUpdate.current ??= dispatch({
      entity: { type: 'meeting', id: meeting.id },
      op: 'update',
      payload: { date: todayISO() },
      baseRevision: meeting.revision,
    }).catch((error: unknown) => {
      meetingDateUpdate.current = null;
      throw error;
    });
    await meetingDateUpdate.current;
  };

  const toggle = async (member: Member) => {
    await ensureMeetingDate();
    await dispatch({
      entity: { type: 'attendanceEvent', id: newId() },
      op: 'append',
      payload: {
        meetingId: meeting.id,
        memberId: member.id,
        action: present.has(member.id) ? 'checked_out' : 'checked_in',
        actorId,
        clientTimestamp: nowISO(),
      },
    });
  };

  const addNewMember = async (status: 'vip' | 'regular') => {
    const name = query.trim();
    const memberId = newId();
    await ensureMeetingDate();
    await dispatch({
      entity: { type: 'member', id: memberId },
      op: 'create',
      payload: {
        name,
        status,
        groupId: meeting.groupId,
        phone: '',
        address: '',
        notes: '',
        birthdayMonth: null,
        birthdayDay: null,
        photoMediaId: null,
      },
    });
    await dispatch({
      entity: { type: 'attendanceEvent', id: newId() },
      op: 'append',
      payload: { meetingId: meeting.id, memberId, action: 'checked_in', actorId, clientTimestamp: nowISO() },
    });
    setQuery('');
    showToast(`${name} added as ${status === 'vip' ? 'VIP' : 'regular'} and checked in`, 'success');
  };

  const campaignTracking = notDeleted(snapshot.campaigns).some((campaign) => campaign.end >= todayISO());

  const setGuests = (delta: number) => {
    const next = Math.max(0, (meeting.guestCount || 0) + delta);
    if (next === meeting.guestCount) return;
    void dispatch({
      entity: { type: 'meeting', id: meeting.id },
      op: 'update',
      payload: { guestCount: next },
      baseRevision: meeting.revision,
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Check-in — ${meeting.leaderName || 'Life group'}`}
      variant="sheet"
      headerExtra={
        <div className={styles.totalChip}>
          <div className={styles.totalNum}>{total}</div>
          <div className={styles.totalLabel}>Total</div>
        </div>
      }
      footer={
        <div className={styles.footer}>
          <div className={styles.guestCounter}>
            <button type="button" className={styles.guestBtn} onClick={() => setGuests(-1)} aria-label="One guest fewer">
              −
            </button>
            <div className={styles.guestReadout}>
              <div className={styles.guestNum}>{meeting.guestCount || 0}</div>
              <div className={styles.guestLabel}>Guests</div>
            </div>
            <button type="button" className={`${styles.guestBtn} ${styles.guestBtnPlus}`} onClick={() => setGuests(1)} aria-label="One guest more">
              +
            </button>
          </div>
          <button type="button" className={`pressable ${styles.doneBtn}`} onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      <p className={styles.hint}>Tap named people who attended · total updates automatically</p>
      {campaignTracking && (
        <p className={styles.campaignNotice}>Anonymous guests cannot accumulate KGC or Light Up qualification until they are added as a named person.</p>
      )}
      <label>
        <span className="visually-hidden">Search or add a member</span>
        <input type="search" className={styles.search} placeholder="Search or add a member…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <ul className={styles.list}>
        {members.map((m) => {
          const isPresent = present.has(m.id);
          return (
            <li key={m.id}>
              <button type="button" className={styles.memberRow} aria-pressed={isPresent} onClick={() => void toggle(m)}>
                <span className={styles.avatar} style={{ background: avatarColor(m.id) }} aria-hidden="true">
                  {initials(m.name)}
                </span>
                <span className={styles.memberBody}>
                  <span className={styles.memberName}>{m.name}</span>
                  <span className={styles.memberSub}>{groupName(snapshot, m.groupId) || 'No group'}</span>
                </span>
                <span className={styles.check} aria-hidden="true">
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 12.5 10 18 20 6" />
                  </svg>
                </span>
              </button>
            </li>
          );
        })}
        {canAdd && (
          <li>
            <div className={styles.addChoices}>
              <button type="button" className={styles.addNew} onClick={() => void addNewMember('vip')}>
                <span className={styles.addNewBadge} aria-hidden="true">
                  +
                </span>
                Add “{query.trim()}” as VIP &amp; check in
              </button>
              <button type="button" className={styles.addRegular} onClick={() => void addNewMember('regular')}>
                Add as regular instead
              </button>
            </div>
          </li>
        )}
      </ul>
    </Dialog>
  );
}
