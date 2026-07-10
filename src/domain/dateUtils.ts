// Sunday-start week helpers shared by every screen. Kept dependency-free and pure
// so they're trivial to unit test and safe to call from selectors during render.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

export function sundayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay());
  return d;
}

export function toISODate(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function parseISODate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const parts = s.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  const [y, m, dd] = parts;
  return new Date(y, m - 1, dd);
}

export function weekLabelFor(sunday: Date): string {
  const sat = new Date(sunday);
  sat.setDate(sat.getDate() + 6);
  return `${MONTHS[sunday.getMonth()]} ${sunday.getDate()} - ${MONTHS[sat.getMonth()]} ${sat.getDate()}`;
}

export function formatDate(iso: string | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  const d = parseISODate(iso);
  if (!d) return '—';
  return d.toLocaleDateString('en-US', opts ?? { month: 'short', day: 'numeric', year: 'numeric' });
}

export function daysBetween(a: Date, b: Date): number {
  const ms = new Date(b).setHours(0, 0, 0, 0) - new Date(a).setHours(0, 0, 0, 0);
  return Math.round(ms / 86_400_000);
}

/** Next occurrence of a month/day (birthday/anniversary) from `from`, ignoring year. */
export function nextAnniversary(from: Date, month: number, day: number): Date {
  const year = from.getFullYear();
  let next = new Date(year, month - 1, day);
  if (daysBetween(from, next) < 0) next = new Date(year + 1, month - 1, day);
  return next;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function nowISO(): string {
  return new Date().toISOString();
}
