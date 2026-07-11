import { useEffect, useState, type ChangeEvent } from 'react';
import { formatDate, nowISO } from '../../domain/dateUtils';
import { newId } from '../../domain/ids';
import { meetingAttendance } from '../../domain/selectors';
import type { Meeting } from '../../domain/types';
import { showToast } from '../../hooks/useToast';
import { useTracker } from '../../state/StoreContext';
import styles from './MeetingCard.module.css';

function to12h(time: string): string {
  if (!time) return '—';
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h)) return time;
  const period = h >= 12 ? 'PM' : 'AM';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${period}`;
}

function MeetingPhoto({ meeting, editable }: { meeting: Meeting; editable: boolean }) {
  const { mediaRepository, dispatch, actorId } = useTracker();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    if (meeting.photoMediaId) {
      void mediaRepository.read(meeting.photoMediaId).then((media) => {
        if (media && !cancelled) {
          objectUrl = URL.createObjectURL(media.blob);
          setUrl(objectUrl);
        }
      });
    } else {
      setUrl(null);
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [meeting.photoMediaId, mediaRepository]);

  const onPick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const mediaId = newId();
    await mediaRepository.upload(mediaId, file);
    await dispatch({
      entity: { type: 'media', id: mediaId },
      op: 'create',
      payload: {
        kind: 'photo',
        ownerType: 'meeting',
        ownerId: meeting.id,
        driveFileId: null,
        localBlobKey: mediaId,
        createdAt: nowISO(),
        createdBy: actorId,
      },
    });
    await dispatch({ entity: { type: 'meeting', id: meeting.id }, op: 'update', payload: { photoMediaId: mediaId }, baseRevision: meeting.revision });
    showToast('Photo attached', 'success');
  };

  const onRemove = () => {
    void dispatch({ entity: { type: 'meeting', id: meeting.id }, op: 'update', payload: { photoMediaId: null }, baseRevision: meeting.revision });
  };

  return (
    <div className={styles.photoWrap}>
      {url && <img src={url} alt={`Meeting of ${meeting.leaderName || 'life group'}`} className={styles.photoThumb} />}
      {editable && (
        <>
          <label className={styles.photoPick} title={url ? 'Replace photo' : 'Add photo'}>
            <span className="visually-hidden">{url ? 'Replace meeting photo' : 'Add meeting photo'}</span>
            <input type="file" accept="image/*" onChange={(e) => void onPick(e)} style={{ display: 'none' }} />
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 8h3l2-2h6l2 2h3v11H4z" />
              <circle cx="12" cy="13" r="3" />
            </svg>
          </label>
          {url && (
            <button type="button" className={`tap-target-inline ${styles.photoRemove}`} onClick={onRemove}>
              remove
            </button>
          )}
        </>
      )}
      {!editable && !url && <span className={styles.photoRemove}>—</span>}
    </div>
  );
}

export interface MeetingCardProps {
  meeting: Meeting;
  index: number;
  editable: boolean;
  /** True when a submit attempt flagged this row as missing its date/status. */
  invalid: boolean;
  onOpenCheckin: (meetingId: string) => void;
}

/** One meeting = one card. Stacks cleanly at 320px; grows into a 4-column grid on wide screens. */
export function MeetingCard({ meeting, index, editable, invalid, onOpenCheckin }: MeetingCardProps) {
  const { snapshot, dispatch } = useTracker();
  if (!snapshot) return null;

  const attendance = meetingAttendance(snapshot, meeting);
  const statusOptions = snapshot.config.statusOptions;

  const update = (payload: Partial<Meeting>) => {
    void dispatch({ entity: { type: 'meeting', id: meeting.id }, op: 'update', payload, baseRevision: meeting.revision });
  };

  const onDelete = () => {
    if (!window.confirm(`Remove ${meeting.leaderName || 'this row'} from the report?`)) return;
    void dispatch({ entity: { type: 'meeting', id: meeting.id }, op: 'delete', payload: {}, baseRevision: meeting.revision });
  };

  return (
    <div className={`${styles.card} ${invalid ? styles.cardInvalid : ''}`}>
      <div className={styles.top}>
        <span className={styles.num} aria-hidden="true">
          {index + 1}
        </span>
        {editable ? (
          <label style={{ flex: 1, minWidth: 0 }}>
            <span className="visually-hidden">Life group leader</span>
            <input
              className={styles.leaderInput}
              defaultValue={meeting.leaderName}
              placeholder="Leader name"
              onBlur={(e) => {
                if (e.target.value !== meeting.leaderName) update({ leaderName: e.target.value });
              }}
            />
          </label>
        ) : (
          <span className={styles.leaderText}>{meeting.leaderName || 'Unnamed group'}</span>
        )}
        {editable && (
          <button type="button" className={styles.deleteBtn} onClick={onDelete} aria-label={`Remove ${meeting.leaderName || 'row'}`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
            </svg>
          </button>
        )}
      </div>

      <div className={styles.fields}>
        <div className={`${styles.field} ${styles.spanTwo}`}>
          <span className={styles.fieldLabel} id={`checkin-label-${meeting.id}`}>
            Attendance (from check-in)
          </span>
          {editable ? (
            <button
              type="button"
              className={`pressable ${styles.checkinBtn}`}
              onClick={() => onOpenCheckin(meeting.id)}
              aria-describedby={`checkin-label-${meeting.id}`}
            >
              <span className={styles.checkinCount}>{attendance}</span>
              Check-in
            </button>
          ) : (
            <div className={styles.fieldValue}>
              <span className={styles.checkinCount} style={{ marginRight: 6 }}>
                {attendance}
              </span>
              attended
            </div>
          )}
        </div>

        {editable ? (
          <>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Start</span>
              <input type="time" className={styles.fieldInput} value={meeting.start} onChange={(e) => update({ start: e.target.value })} />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>End</span>
              <input type="time" className={styles.fieldInput} value={meeting.end} onChange={(e) => update({ end: e.target.value })} />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Status</span>
              <select className={styles.fieldInput} value={meeting.status} onChange={(e) => update({ status: e.target.value })}>
                <option value="">—</option>
                {statusOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Date</span>
              <input type="date" className={styles.fieldInput} value={meeting.date} onChange={(e) => update({ date: e.target.value })} />
            </label>
            <label className={`${styles.field} ${styles.spanTwo}`}>
              <span className={styles.fieldLabel}>Location</span>
              <input
                className={styles.fieldInput}
                defaultValue={meeting.location}
                placeholder="Venue"
                onBlur={(e) => {
                  if (e.target.value !== meeting.location) update({ location: e.target.value });
                }}
              />
            </label>
          </>
        ) : (
          <>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Time</span>
              <div className={styles.fieldValue}>
                {meeting.start || meeting.end ? `${to12h(meeting.start)} – ${to12h(meeting.end)}` : '—'}
              </div>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Status</span>
              <div className={styles.fieldValue}>{meeting.status || '—'}</div>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Date</span>
              <div className={styles.fieldValue}>{formatDate(meeting.date)}</div>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Location</span>
              <div className={styles.fieldValue}>{meeting.location || '—'}</div>
            </div>
          </>
        )}

        <div className={`${styles.field} ${styles.spanTwo}`}>
          <span className={styles.fieldLabel}>Photo</span>
          <MeetingPhoto meeting={meeting} editable={editable} />
        </div>
      </div>
    </div>
  );
}
