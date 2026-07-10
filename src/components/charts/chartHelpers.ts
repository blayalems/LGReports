export function formatPct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Concise aria-label summary; full detail always lives in the paired <table>. */
export function summarize(parts: string[]): string {
  return parts.join('. ');
}
