import { newId } from './ids';
import { nowISO } from './dateUtils';
import type { Revisioned } from './types';

export function revisioned(actorId: string, now = nowISO()): Revisioned {
  return { revision: 1, createdAt: now, createdBy: actorId, updatedAt: now, updatedBy: actorId, deletedAt: null };
}

export function bumpRevision<T extends Revisioned>(entity: T, actorId: string, now = nowISO()): T {
  return { ...entity, revision: entity.revision + 1, updatedAt: now, updatedBy: actorId };
}

export { newId };
