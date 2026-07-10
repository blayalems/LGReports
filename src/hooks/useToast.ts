import { announce } from './useAnnounce';

export type ToastKind = 'success' | 'error' | 'info';

type Listener = (message: string, kind: ToastKind) => void;

const listeners = new Set<Listener>();

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shows a transient visual toast AND announces it to screen readers — one call does both. */
export function showToast(message: string, kind: ToastKind = 'success') {
  listeners.forEach((l) => l(message, kind));
  announce(message, kind === 'error' ? 'assertive' : 'polite');
}

export function useToast() {
  return showToast;
}
