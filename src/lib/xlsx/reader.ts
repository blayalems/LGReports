import { unzip } from './zip';

export interface ParsedRow {
  section: 'leader' | 'open';
  num: string;
  leader: string;
  start: string; // HH:MM 24h, best-effort
  end: string;
  attendance: number;
  status: string;
  date: string; // ISO, best-effort
  location: string;
}

export interface ParsedWeek {
  network: string;
  overseer: string;
  weekLabel: string;
  dateSubmitted: string;
  rows: ParsedRow[];
}

type Grid = (string | undefined)[][];

/** Decode XML character/entity references without interpreting any markup. */
function decodeXmlText(text: string): string {
  return text.replace(/&(?:amp|lt|gt|quot|apos|#(\d+)|#x([0-9A-Fa-f]+));/g, (entity, decimal: string | undefined, hex: string | undefined) => {
    if (decimal || hex) {
      const digits = decimal ?? hex;
      if (!digits) return entity;
      const codePoint = Number.parseInt(digits, decimal ? 10 : 16);
      if (codePoint <= 0x10ffff && !(codePoint >= 0xd800 && codePoint <= 0xdfff)) {
        return String.fromCodePoint(codePoint);
      }
      return entity;
    }

    switch (entity) {
      case '&amp;':
        return '&';
      case '&lt;':
        return '<';
      case '&gt;':
        return '>';
      case '&quot;':
        return '"';
      case '&apos;':
        return "'";
      default:
        return entity;
    }
  });
}

function textFromXmlNodes(xml: string): string {
  return [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => decodeXmlText(match[1])).join('');
}

function excelSerialToISO(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 60000) return null;
  // Excel's epoch is 1899-12-30 (accounting for the historical 1900 leap-year bug).
  const ms = Math.round((serial - 25569) * 86_400_000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function dayFractionToHHMM(fraction: number): string | null {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) return null;
  const totalMinutes = Math.round(fraction * 24 * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function maybeNumeric(s: string | undefined): number | null {
  if (s == null || s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeTime(raw: string | undefined): string {
  if (!raw) return '';
  const n = maybeNumeric(raw);
  if (n != null) return dayFractionToHHMM(n) ?? '';
  // "6:30 PM" -> "18:30"
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (m) {
    let h = Number(m[1]);
    const min = Number(m[2]);
    const period = m[3]?.toUpperCase();
    if (period === 'PM' && h !== 12) h += 12;
    if (period === 'AM' && h === 12) h = 0;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  return raw;
}

function normalizeDate(raw: string | undefined): string {
  if (!raw) return '';
  const n = maybeNumeric(raw);
  if (n != null) return excelSerialToISO(n) ?? raw;
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return `${year}-${String(Number(m[1])).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
  }
  return raw;
}

function findCell(grid: Grid, matcher: (v: string) => boolean, afterRow = 0): { row: number; col: number } | null {
  for (let r = afterRow; r < grid.length; r++) {
    const row = grid[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      const v = row[c];
      if (v && matcher(v)) return { row: r, col: c };
    }
  }
  return null;
}

function findAllMatches(grid: Grid, matcher: (v: string) => boolean): { row: number; col: number }[] {
  const out: { row: number; col: number }[] = [];
  grid.forEach((row, r) => {
    (row ?? []).forEach((v, c) => {
      if (v && matcher(v)) out.push({ row: r, col: c });
    });
  });
  return out;
}

function labelValue(grid: Grid, labelMatcher: (v: string) => boolean): string {
  const hit = findCell(grid, labelMatcher);
  if (!hit) return '';
  const row = grid[hit.row] ?? [];
  for (let c = hit.col + 1; c < row.length; c++) {
    if (row[c]) return row[c] as string;
  }
  return '';
}

/**
 * Parses either our own export layout (single column per field) or the legacy
 * church template's side-by-side, merged-header layout — detected per section
 * rather than assumed, since the two put the leader name in different columns.
 */
export function parseWeekGrid(grid: Grid): ParsedWeek | null {
  const network = labelValue(grid, (v) => /^network\s*[:/]?/i.test(v.trim()));
  const overseer = labelValue(grid, (v) => /overseer/i.test(v));
  const weekLabel = labelValue(grid, (v) => /week\s*covered/i.test(v));
  const dateSubmitted = labelValue(grid, (v) => /date submitted/i.test(v));

  const sectionMarkers = [
    ...findAllMatches(grid, (v) => /leader.?s life group/i.test(v)).map((m) => ({ ...m, name: 'leader' as const })),
    ...findAllMatches(grid, (v) => /open life group/i.test(v)).map((m) => ({ ...m, name: 'open' as const })),
  ];
  if (!sectionMarkers.length) return null;

  const headerMarkers = findAllMatches(grid, (v) => /life group leader/i.test(v));
  if (!headerMarkers.length) return null;

  // Each header block belongs to whichever section marker is closest above it
  // (same row for side-by-side templates, an earlier row for stacked exports),
  // tie-broken by column distance.
  const blocks = headerMarkers.map((h) => {
    const candidates = sectionMarkers.filter((s) => s.row <= h.row);
    const pool = candidates.length ? candidates : sectionMarkers;
    const best = pool.reduce((a, b) => {
      if (b.row !== a.row) return b.row > a.row ? b : a;
      return Math.abs(b.col - h.col) < Math.abs(a.col - h.col) ? b : a;
    });
    return { col: h.col, row: h.row, section: best.name };
  });

  const rows: ParsedRow[] = [];
  blocks.forEach((block) => {
    const laterHeaderRows = blocks.filter((b) => b.row > block.row).map((b) => b.row);
    const dataEnd = laterHeaderRows.length ? Math.min(...laterHeaderRows) : grid.length;
    const c = block.col;

    for (let r = block.row + 1; r < dataEnd; r++) {
      const gridRow = grid[r] ?? [];
      const joined = gridRow.filter(Boolean).join(' ').toUpperCase();
      if (/SUBTOTAL|TOTAL ATTENDANCE/.test(joined)) continue;

      // Legacy template: rownum sits at `c`, name at `c+1` (header cell is merged over both).
      // Our own export: name sits directly at `c`, no separate rownum column.
      const legacyName = gridRow[c + 1];
      const legacyNum = gridRow[c];
      const isLegacy = !!legacyName && /[a-z]/i.test(legacyName) && (!legacyNum || /^\d+$/.test(legacyNum));
      const base = isLegacy ? c + 1 : c;
      const name = gridRow[base];
      if (!name || /^(life group leader|#)$/i.test(name)) continue;

      const start = gridRow[base + 1];
      const end = gridRow[base + 2];
      const attendance = gridRow[base + 3];
      const status = gridRow[base + 4];
      const date = gridRow[base + 5];
      const location = gridRow[base + 6];
      const noMeeting = /no meeting/i.test(start ?? '') || /no meeting/i.test(status ?? '');

      rows.push({
        section: block.section,
        num: (isLegacy ? legacyNum : String(rows.length + 1)) ?? '',
        leader: name,
        start: noMeeting ? '' : normalizeTime(start),
        end: noMeeting ? '' : normalizeTime(end),
        attendance: Number(attendance) || 0,
        status: status ?? (noMeeting ? 'No Meeting' : ''),
        date: normalizeDate(date),
        location: location ?? '',
      });
    }
  });

  if (!rows.length) return null;
  return { network, overseer, weekLabel, dateSubmitted, rows };
}

export function gridFromSheetXml(sheetXml: string, sharedStrings: string[]): Grid {
  const grid: Grid = [];
  for (const rowMatch of sheetXml.matchAll(/<row[^>]*?r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const ri = Number(rowMatch[1]) - 1;
    grid[ri] = grid[ri] ?? [];
    for (const cellMatch of rowMatch[2].matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      let ci = 0;
      for (const ch of cellMatch[1]) ci = ci * 26 + (ch.charCodeAt(0) - 64);
      ci--;
      const attrs = cellMatch[3] ?? '';
      const inner = cellMatch[4] ?? '';
      const typeMatch = attrs.match(/t="(\w+)"/);
      const type = typeMatch ? typeMatch[1] : '';
      let val = '';
      if (type === 'inlineStr') {
        val = textFromXmlNodes(inner);
      } else {
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        if (v != null) val = type === 's' ? (sharedStrings[Number(v)] ?? '') : v;
      }
      grid[ri][ci] = val;
    }
  }
  return grid;
}

export function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => textFromXmlNodes(match[1]));
}

export async function parseWeekWorkbook(buf: ArrayBuffer): Promise<ParsedWeek | null> {
  const files = await unzip(buf);
  const sheetKey = Object.keys(files).find((k) => /^xl\/worksheets\/sheet1\.xml$/.test(k));
  if (!sheetKey) return null;
  const shared = parseSharedStrings(files['xl/sharedStrings.xml']);
  const grid = gridFromSheetXml(files[sheetKey], shared);
  return parseWeekGrid(grid);
}
