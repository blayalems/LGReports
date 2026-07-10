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
  const announce = useAnnounce();

  useEffect(() => repository.onSyncStateChange(setSyncState), [repository]);

  useEffect(() => {
    let cancelled = false;
    repository.loadSnapshot().then((snap) => {
      if (!cancelled) setSnapshot(snap);
    });
    return () => {
      cancelled = true;
    };
  }, [repository]);

  const refresh = useCallback(async () => {
    const snap = await repository.refresh();
    setSnapshot(snap);
  }, [repository]);

  const dispatch = useCallback(
    (partial: PendingCommand) => {
      const run = async () => {
        const command: DomainCommand = {
          commandId: newId(),
          actorId,
          timestamp: nowISO(),
          ...partial,
        };
        try {
          await repository.saveCommand(command);
          await refresh();
        } catch (err) {
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
