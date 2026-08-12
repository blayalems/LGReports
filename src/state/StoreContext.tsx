import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { newId } from '../domain/ids';
import { nowISO } from '../domain/dateUtils';
import type { DomainCommand, EntityType, SyncState, TrackerSnapshot } from '../domain/types';
import type { TrackerRepository } from '../repository/TrackerRepository';
import type { MediaRepository } from '../repository/MediaRepository';
import { useAnnounce } from '../hooks/useAnnounce';

export type PendingCommand<TPayload = unknown> = {
  entity: { type: EntityType; id: string };
  op: 'create' | 'update' | 'delete' | 'append';
  payload: TPayload;
  baseRevision?: number;
};

interface StoreContextValue {
  snapshot: TrackerSnapshot | null;
  syncState: SyncState;
  actorId: string;
  isFirstRun: boolean;
  dispatch: (command: PendingCommand) => Promise<void>;
  refresh: () => Promise<void>;
  repository: TrackerRepository;
  mediaRepository: MediaRepository;
  startBlank: () => void;
  startDemo: () => Promise<void>;
}

const StoreContext = createContext<StoreContextValue | null>(null);

function currentRevision(snapshot: TrackerSnapshot | null, type: EntityType, id: string): number | undefined {
  if (!snapshot) return undefined;
  if (type === 'config') return snapshot.config.id === id ? snapshot.config.revision : undefined;

  const collections: Partial<Record<EntityType, readonly { id: string; revision: number }[]>> = {
    stage: snapshot.stages,
    group: snapshot.groups,
    member: snapshot.members,
    memberMilestone: snapshot.memberMilestones,
    week: snapshot.weeks,
    meeting: snapshot.meetings,
    campaign: snapshot.campaigns,
    campaignSession: snapshot.campaignSessions,
    campaignMetric: snapshot.campaignMetrics,
    rival: snapshot.rivals,
    event: snapshot.events,
  };
  return collections[type]?.find((row) => row.id === id)?.revision;
}

export function StoreProvider({
  repository,
  mediaRepository,
  actorId,
  children,
}: {
  repository: TrackerRepository;
  mediaRepository: MediaRepository;
  actorId: string;
  children: ReactNode;
}) {
  const [snapshot, setSnapshot] = useState<TrackerSnapshot | null>(null);
  const [syncState, setSyncState] = useState<SyncState>(repository.getSyncState());
  const [dismissedFirstRun, setDismissedFirstRun] = useState(false);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const snapshotRef = useRef<TrackerSnapshot | null>(null);
  const mountedRef = useRef(true);
  const announce = useAnnounce();

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  useEffect(() => repository.onSyncStateChange(setSyncState), [repository]);

  useEffect(() => {
    let cancelled = false;
    repository
      .loadSnapshot()
      .then((snap) => {
        if (!cancelled) {
          snapshotRef.current = snap;
          setSnapshot(snap);
        }
      })
      .catch(() => {
        // Remote backend without a live session: snapshot stays null and the
        // repository reports 'disconnected'/'error' — App renders the sign-in gate.
      });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const refresh = useCallback(async () => {
    const snap = await repository.refresh();
    if (mountedRef.current) {
      snapshotRef.current = snap;
      setSnapshot(snap);
    }
  }, [repository]);

  // Remote source of truth: re-fetch when the tab regains focus and every 60s while
  // visible, so one leader's edits show up on another leader's open screen.
  useEffect(() => {
    if (!repository.isRemote) return;
    const tryRefresh = () => {
      if (document.visibilityState === 'visible') refresh().catch(() => undefined);
    };
    const interval = setInterval(tryRefresh, 60_000);
    document.addEventListener('visibilitychange', tryRefresh);
    window.addEventListener('focus', tryRefresh);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tryRefresh);
      window.removeEventListener('focus', tryRefresh);
    };
  }, [repository, refresh]);

  const dispatch = useCallback(
    (partial: PendingCommand) => {
      const run = async () => {
        const latestRevision = currentRevision(snapshotRef.current, partial.entity.type, partial.entity.id);
        const baseRevision =
          partial.baseRevision !== undefined && latestRevision !== undefined && latestRevision > partial.baseRevision ? latestRevision : partial.baseRevision;
        const command: DomainCommand = {
          commandId: newId(),
          actorId,
          timestamp: nowISO(),
          ...partial,
          baseRevision,
        };
        try {
          await repository.saveCommand(command);
          await refresh();
        } catch (err) {
          // An app/provider teardown can close the repository while a fire-and-forget
          // UI command is finishing. There is no mounted surface left to announce to.
          if (!mountedRef.current) return;
          announce(`Couldn't save that change. ${err instanceof Error ? err.message : ''}`, 'assertive');
          throw err;
        }
      };
      // Serialize dispatches so rapid interactions can't interleave read/bump/write.
      const next = queueRef.current.then(run, run);
      queueRef.current = next.catch(() => undefined);
      return next;
    },
    [actorId, repository, refresh, announce],
  );

  const startBlank = useCallback(() => setDismissedFirstRun(true), []);
  const startDemo = useCallback(async () => {
    if (repository.seedDemoData) {
      await repository.seedDemoData();
      await refresh();
    }
    setDismissedFirstRun(true);
  }, [repository, refresh]);

  const isFirstRun = useMemo(() => {
    if (dismissedFirstRun || !snapshot) return false;
    return snapshot.groups.length === 0 && snapshot.members.length === 0 && snapshot.weeks.length === 0;
  }, [snapshot, dismissedFirstRun]);

  const value = useMemo<StoreContextValue>(
    () => ({ snapshot, syncState, actorId, isFirstRun, dispatch, refresh, repository, mediaRepository, startBlank, startDemo }),
    [snapshot, syncState, actorId, isFirstRun, dispatch, refresh, repository, mediaRepository, startBlank, startDemo],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useTracker(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useTracker must be used within a StoreProvider');
  return ctx;
}

/** Convenience for read screens: throws until the first snapshot loads (caller shows a loading state). */
export function useSnapshot(): TrackerSnapshot {
  const { snapshot } = useTracker();
  if (!snapshot) throw new Error('Snapshot not loaded yet');
  return snapshot;
}
