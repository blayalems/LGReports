import { useState } from 'react';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatDate } from '../../domain/dateUtils';
import { groupName, memberLastSeenISO, notDeleted } from '../../domain/selectors';
import type { MemberStatus } from '../../domain/types';
import { useTracker } from '../../state/StoreContext';
import { newId } from '../../domain/ids';
import { MemberDialog, MemberPhotoAvatar } from './MemberDialog';
import styles from './MembersPage.module.css';

type Filter = 'all' | MemberStatus;

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'vip', label: 'VIP' },
  { value: 'regular', label: 'Regular' },
  { value: 'leader', label: 'Leader' },
  { value: 'inactive', label: 'Inactive' },
];

const STATUS_META: Record<MemberStatus, { label: string; color: string; bg: string }> = {
  vip: { label: 'VIP', color: 'var(--accent)', bg: 'var(--accent-soft)' },
  regular: { label: 'Regular', color: 'var(--text2)', bg: 'var(--surface2)' },
  leader: { label: 'Leader', color: 'var(--good)', bg: 'color-mix(in oklab, var(--good) 13%, transparent)' },
  inactive: { label: 'Inactive', color: 'var(--text3)', bg: 'var(--surface2)' },
};

export default function MembersPage() {
  const { snapshot, dispatch } = useTracker();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);

  if (!snapshot) return null;

  const stages = notDeleted(snapshot.stages).sort((a, b) => a.order - b.order);
  const milestones = notDeleted(snapshot.memberMilestones);
  const q = query.trim().toLowerCase();

  const members = notDeleted(snapshot.members)
    .filter((m) => filter === 'all' || m.status === filter)
    .filter((m) => {
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.phone.toLowerCase().includes(q) ||
        groupName(snapshot, m.groupId).toLowerCase().includes(q)
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  const addMember = async () => {
    const id = newId();
    await dispatch({
      entity: { type: 'member', id },
      op: 'create',
      payload: { name: '', status: 'regular', groupId: null, phone: '', birthdayMonth: null, birthdayDay: null, photoMediaId: null },
    });
    setOpenMemberId(id);
  };

  const openMember = openMemberId ? notDeleted(snapshot.members).find((m) => m.id === openMemberId) : undefined;

  return (
    <section className={`view ${styles.page}`}>
      <div className={styles.inner}>
        <div className={styles.header}>
          <div>
            <div className={styles.kicker}>Network CRM</div>
            <h1 className={styles.h1}>Members</h1>
          </div>
          <button type="button" className={`pressable ${styles.primaryBtn}`} onClick={() => void addMember()}>
            + Add member
          </button>
        </div>

        <div className={styles.controls}>
          <label style={{ flex: 1, minWidth: 220 }}>
            <span className="visually-hidden">Search members</span>
            <input
              type="search"
              className={styles.search}
              placeholder="Search by name, phone, or group…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className={styles.chips} role="group" aria-label="Filter by status">
            {FILTERS.map((f) => (
              <button key={f.value} type="button" className={styles.chip} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {members.length === 0 ? (
          <EmptyState
            icon="👥"
            title={q || filter !== 'all' ? 'No members match' : 'No members yet'}
            hint={q || filter !== 'all' ? 'Try a different search or filter.' : 'Add your first member, or check people in from the weekly report.'}
          />
        ) : (
          <div className={styles.grid}>
            {members.map((m) => {
              const meta = STATUS_META[m.status];
              const lastSeen = memberLastSeenISO(snapshot, m.id);
              const doneKeys = new Set(milestones.filter((ms) => ms.memberId === m.id && ms.completedOn).map((ms) => ms.stageKey));
              return (
                <button key={m.id} type="button" className={`glasscard pressable ${styles.card}`} onClick={() => setOpenMemberId(m.id)}>
                  <span className={styles.cardTop}>
                    <MemberPhotoAvatar member={m} size={44} className={styles.avatar} />
                    <span style={{ minWidth: 0 }}>
                      <span className={styles.cardName} style={{ display: 'block' }}>
                        {m.name || 'Unnamed member'}
                      </span>
                      <span className={styles.cardGroup} style={{ display: 'block' }}>
                        {groupName(snapshot, m.groupId) || 'No group'}
                      </span>
                    </span>
                    <span className={styles.badge} style={{ color: meta.color, background: meta.bg }}>
                      {meta.label}
                    </span>
                  </span>
                  <span
                    className={styles.dots}
                    role="img"
                    aria-label={`Journey: ${doneKeys.size} of ${stages.length} milestones complete`}
                    title={stages.map((s) => `${doneKeys.has(s.key) ? '✓' : '·'} ${s.label}`).join(', ')}
                  >
                    {stages.map((s) => (
                      <span key={s.id} className={`${styles.dot} ${doneKeys.has(s.key) ? styles.dotDone : ''}`} />
                    ))}
                    <span className={styles.lastSeen} style={{ marginLeft: 'auto' }}>
                      {lastSeen ? `Last seen ${formatDate(lastSeen, { month: 'short', day: 'numeric' })}` : 'Never checked in'}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {openMember && <MemberDialog member={openMember} onClose={() => setOpenMemberId(null)} />}
    </section>
  );
}
