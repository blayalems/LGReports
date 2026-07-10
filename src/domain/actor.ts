import { newId } from './ids';

const ACTOR_KEY = 'lgt_local_actor_id';

/**
 * A non-sensitive, opaque per-browser tag used only to attribute local edits in the
 * revision/audit trail. Not a name, email, or credential — safe under the "only
 * non-sensitive UI preferences in localStorage" rule. Phase 2 replaces this with the
 * signed-in Google account id once Sheets auth lands.
 */
export function getLocalActorId(): string {
  let id = localStorage.getItem(ACTOR_KEY);
  if (!id) {
    id = 'local-' + newId();
    localStorage.setItem(ACTOR_KEY, id);
  }
  return id;
}
