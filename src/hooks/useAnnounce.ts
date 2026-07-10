// Tiny pub/sub so any component can push a screen-reader announcement without needing
// a React context above it (StoreContext itself announces save failures). The single
// <LiveRegion/> mounted once in AppShell is the only subscriber that renders anything.

type Politeness = 'polite' | 'assertive';
type Listener = (message: string, politeness: Politeness) => void;

const listeners = new Set<Listener>();

export function subscribeAnnouncements(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function announce(message: string, politeness: Politeness = 'polite') {
  listeners.forEach((l) => l(message, politeness));
}

export function useAnnounce() {
  return announce;
}
