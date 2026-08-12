import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Dialog } from '../../components/ui/Dialog';
import { DraftNumberInput } from '../../components/ui/DraftNumberInput';
import { nowISO, todayISO } from '../../domain/dateUtils';
import { newId } from '../../domain/ids';
import { activeCampaign, avatarColor, campaignQualification, initials, notDeleted } from '../../domain/selectors';
import type { Member, MemberStatus } from '../../domain/types';
import { showToast } from '../../hooks/useToast';
import { useTracker } from '../../state/StoreContext';
import styles from './MemberDialog.module.css';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const STATUSES: { value: MemberStatus; label: string }[] = [
  { value: 'vip', label: 'VIP' },
  { value: 'regular', label: 'Regular' },
  { value: 'leader', label: 'Leader' },
  { value: 'inactive', label: 'Inactive' },
];

export function MemberPhotoAvatar({ member, size = 44, className }: { member: Member; size?: number; className?: string }) {
  const { mediaRepository } = useTracker();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    if (member.photoMediaId) {
      void mediaRepository.read(member.photoMediaId).then((media) => {
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
  }, [member.photoMediaId, mediaRepository]);

  if (url) {
    return <img src={url} alt="" className={className} style={{ width: size, height: size }} />;
  }
  return (
    <span className={className} style={{ width: size, height: size, background: avatarColor(member.id) }} aria-hidden="true">
      {initials(member.name)}
    </span>
  );
}

export function MemberDialog({ member, onClose }: { member: Member; onClose: () => void }) {
  const { snapshot, dispatch, mediaRepository, actorId } = useTracker();
  const latestRevision = useRef(member.revision);
  const editQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    latestRevision.current = Math.max(latestRevision.current, member.revision);
  }, [member.revision]);

  if (!snapshot) return null;

  const groups = notDeleted(snapshot.groups);
  const stages = notDeleted(snapshot.stages).sort((a, b) => a.order - b.order);
  const milestones = notDeleted(snapshot.memberMilestones).filter((ms) => ms.memberId === member.id);
  const focusCampaign =
    activeCampaign(snapshot) ??
    notDeleted(snapshot.campaigns)
      .filter((campaign) => campaign.start > todayISO())
      .sort((a, b) => a.start.localeCompare(b.start))[0];
  const qualification = focusCampaign ? campaignQualification(snapshot, focusCampaign, member) : null;

  const update = (payload: Partial<Member>) => {
    const run = async () => {
      const baseRevision = latestRevision.current;
      await dispatch({ entity: { type: 'member', id: member.id }, op: 'update', payload, baseRevision });
      latestRevision.current = baseRevision + 1;
    };
    const next = editQueue.current.then(run, run);
    editQueue.current = next.catch(() => undefined);
  };

  const onPhotoPick = async (e: ChangeEvent<HTMLInputElement>) => {
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
        ownerType: 'member',
        ownerId: member.id,
        driveFileId: null,
        localBlobKey: mediaId,
        createdAt: nowISO(),
        createdBy: actorId,
      },
    });
    await dispatch({ entity: { type: 'member', id: member.id }, op: 'update', payload: { photoMediaId: mediaId }, baseRevision: member.revision });
    showToast('Photo updated', 'success');
  };

  const toggleMilestone = (stageKey: string) => {
    const existing = milestones.find((ms) => ms.stageKey === stageKey);
    if (existing) {
      void dispatch({ entity: { type: 'memberMilestone', id: existing.id }, op: 'delete', payload: {}, baseRevision: existing.revision });
    } else {
      void dispatch({
        entity: { type: 'memberMilestone', id: newId() },
        op: 'create',
        payload: { memberId: member.id, stageKey, completedOn: todayISO() },
      });
    }
  };

  const onDelete = () => {
    if (!window.confirm(`Delete ${member.name || 'this member'}? Their attendance history stays in past reports.`)) return;
    void dispatch({ entity: { type: 'member', id: member.id }, op: 'delete', payload: {}, baseRevision: member.revision }).then(() => {
      showToast('Member deleted', 'info');
      onClose();
    });
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={member.name || 'New member'}
      variant="center"
      footer={
        <div className={styles.footer}>
          <button type="button" className={`pressable ${styles.deleteBtn}`} onClick={onDelete}>
            Delete
          </button>
          <button type="button" className={`pressable ${styles.doneBtn}`} onClick={onClose}>
            Done
          </button>
        </div>
      }
    >
      <div className={styles.profileTop}>
        <label className={styles.avatarBtn} title="Change photo">
          <span className="visually-hidden">Change photo</span>
          <input type="file" accept="image/*" onChange={(e) => void onPhotoPick(e)} style={{ display: 'none' }} />
          <MemberPhotoAvatar member={member} size={58} className={styles.avatar} />
        </label>
        <label style={{ flex: 1, minWidth: 0 }}>
          <span className="visually-hidden">Member name</span>
          <input
            className={styles.nameInput}
            defaultValue={member.name}
            placeholder="Member name"
            onBlur={(e) => {
              if (e.target.value !== member.name) update({ name: e.target.value });
            }}
          />
        </label>
      </div>

      <span className={styles.fieldLabel} id={`status-label-${member.id}`}>
        Status
      </span>
      <div className={styles.segment} role="group" aria-labelledby={`status-label-${member.id}`}>
        {STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            className={styles.segmentBtn}
            aria-pressed={member.status === s.value}
            onClick={() => update({ status: s.value })}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className={styles.fieldRow}>
        <label>
          <span className={styles.fieldLabel}>Phone</span>
          <input
            type="tel"
            className={styles.fieldInput}
            defaultValue={member.phone}
            placeholder="Phone number"
            onBlur={(e) => {
              if (e.target.value !== member.phone) update({ phone: e.target.value });
            }}
          />
        </label>
        <div>
          <span className={styles.fieldLabel} id={`bday-label-${member.id}`}>
            Birthday (month &amp; day)
          </span>
          <div className={styles.birthdayPair}>
            <label htmlFor={`member-${member.id}-birthday-month`}>
              <span className="visually-hidden">Birthday month</span>
              <select
                id={`member-${member.id}-birthday-month`}
                className={styles.fieldInput}
                value={member.birthdayMonth ?? ''}
                onChange={(e) => update({ birthdayMonth: e.target.value ? Number(e.target.value) : null })}
              >
                <option value="">— Month —</option>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label htmlFor={`member-${member.id}-birthday-day`}>
              <span className="visually-hidden">Birthday day</span>
              <DraftNumberInput
                id={`member-${member.id}-birthday-day`}
                min={1}
                max={31}
                className={styles.fieldInput}
                value={member.birthdayDay}
                placeholder="Day"
                onCommit={(value) => update({ birthdayDay: value })}
              />
            </label>
          </div>
        </div>
        <label>
          <span className={styles.fieldLabel}>Life group</span>
          <select className={styles.fieldInput} value={member.groupId ?? ''} onChange={(e) => update({ groupId: e.target.value || null })}>
            <option value="">— No group —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className={styles.fieldLabel}>Address</span>
          <input
            className={styles.fieldInput}
            defaultValue={member.address ?? ''}
            placeholder="Street, barangay…"
            onBlur={(e) => {
              if (e.target.value !== (member.address ?? '')) update({ address: e.target.value });
            }}
          />
        </label>
      </div>

      <label className={styles.notesField}>
        <span className={styles.fieldLabel}>Notes &amp; prayer requests</span>
        <textarea
          className={`${styles.fieldInput} ${styles.notesInput}`}
          rows={3}
          defaultValue={member.notes ?? ''}
          placeholder="Prayer requests, follow-up notes…"
          onBlur={(e) => {
            if (e.target.value !== (member.notes ?? '')) update({ notes: e.target.value });
          }}
        />
      </label>

      {qualification && (
        <section className={styles.cycleState} aria-labelledby={`cycle-state-${member.id}`}>
          <div className={styles.cycleStateHead}>
            <div>
              <span className={styles.fieldLabel} id={`cycle-state-${member.id}`}>
                Active-cycle qualification
              </span>
              <strong>{focusCampaign?.name}</strong>
            </div>
            <span>{qualification.blocker}</span>
          </div>
          <dl className={styles.cycleStateGrid}>
            <div>
              <dt>Life Group attendances</dt>
              <dd>{qualification.lifeGroupAttendanceCount}</dd>
            </div>
            <div>
              <dt>Knowing God</dt>
              <dd>
                {qualification.kgcCompleted
                  ? `Completed ${qualification.kgcCompletedOn ? new Date(`${qualification.kgcCompletedOn}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}`
                  : qualification.kgcEligible
                    ? 'Eligible now'
                    : `Needs ${Math.max(0, 2 - qualification.lifeGroupAttendanceCount)} more LG`}
              </dd>
            </div>
            <div>
              <dt>Light Up</dt>
              <dd>
                {qualification.lightUpCompleted
                  ? 'Completed'
                  : qualification.lightUpEligible
                    ? 'Ready'
                    : qualification.lifeGroupAttendanceCount >= 3
                      ? 'Blocked by KGC'
                      : 'Not yet ready'}
              </dd>
            </div>
            <div>
              <dt>Living in Victory</dt>
              <dd>{qualification.lightUpCompleted ? `${qualification.livProgress} / 2` : 'Locked — complete Light Up first'}</dd>
            </div>
            <div>
              <dt>Water Baptism</dt>
              <dd>{qualification.waterBaptismCompleted ? 'Completed' : qualification.waterBaptismEligible ? 'Ready' : 'Locked — complete Light Up first'}</dd>
            </div>
          </dl>
          <p>New Life Sunday and Beginning Your New Life do not block KGC or Light Up.</p>
        </section>
      )}

      <span className={styles.fieldLabel}>Legacy journey milestones</span>
      <div className={styles.milestones}>
        {stages.map((stage) => {
          const ms = milestones.find((x) => x.stageKey === stage.key);
          return (
            <div key={stage.id} className={styles.milestoneRow}>
              <button type="button" className={`tap-target-inline ${styles.milestoneToggle}`} aria-pressed={!!ms} onClick={() => toggleMilestone(stage.key)}>
                <span className={styles.milestoneMark} aria-hidden="true">
                  <svg
                    width="12"
                    height="12"
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
                {stage.label}
              </button>
              {ms && (
                <label>
                  <span className="visually-hidden">{stage.label} completed on</span>
                  <input
                    type="date"
                    className={styles.milestoneDate}
                    value={ms.completedOn ?? ''}
                    onChange={(e) =>
                      void dispatch({
                        entity: { type: 'memberMilestone', id: ms.id },
                        op: 'update',
                        payload: { completedOn: e.target.value || null },
                        baseRevision: ms.revision,
                      })
                    }
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>
    </Dialog>
  );
}
