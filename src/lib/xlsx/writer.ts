import { zip } from './zip';

export interface ReportRow {
  leader: string;
  start: string; // "HH:MM" 24h from <input type="time">
  end: string;
  attendance: number;
  status: string;
  date: string; // ISO
  location: string;
}

export interface WeekExportData {
  weekLabel: string;
  network: string;
  overseer: string;
  dateSubmitted: string;
  leaderRows: ReportRow[];
  openRows: ReportRow[];
  timeFormat?: '12h' | '24h';
}

function formatTime(hhmm: string, fmt: '12h' | '24h'): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  if (fmt === '24h') return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function esc(x: unknown): string {
  return String(x ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function colName(n: number): string {
  let name = '';
  n++;
  while (n > 0) {
    const m = (n - 1) % 26;
    name = String.fromCharCode(65 + m) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sheetXml(rows: (string | number)[][]): string {
  let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>';
  rows.forEach((row, ri) => {
    xml += `<row r="${ri + 1}">`;
    row.forEach((cell, ci) => {
      const ref = colName(ci) + (ri + 1);
      if (cell === '' || cell == null) return;
      if (typeof cell === 'number') xml += `<c r="${ref}"><v>${cell}</v></c>`;
      else xml += `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(cell)}</t></is></c>`;
    });
    xml += '</row>';
  });
  return xml + '</sheetData></worksheet>';
}

export function weekReportRows(data: WeekExportData): (string | number)[][] {
  const fmt = data.timeFormat ?? '12h';
  const rows: (string | number)[][] = [];
  rows.push(['WEEKLY SUMMARY OF LIFE GROUP REPORT']);
  rows.push(['NETWORK:', data.network, 'WEEK COVERED:', data.weekLabel, 'OVERSEER:', data.overseer, 'DATE SUBMITTED:', data.dateSubmitted]);
  rows.push([]);

  const section = (title: string, list: ReportRow[]) => {
    rows.push([title]);
    rows.push(['#', 'LIFE GROUP LEADER', 'START', 'END', 'ATTENDANCE', 'STATUS', 'DATE', 'LOCATION']);
    let total = 0;
    list.forEach((r, i) => {
      total += Number(r.attendance) || 0;
      rows.push([i + 1, r.leader, formatTime(r.start, fmt), formatTime(r.end, fmt), Number(r.attendance) || 0, r.status, r.date, r.location]);
    });
    rows.push(['', 'SUBTOTAL', '', '', total, '', '', '']);
    rows.push([]);
  };

  section("LEADER'S LIFE GROUP", data.leaderRows);
  section('OPEN LIFE GROUP', data.openRows);
  const grandTotal = [...data.leaderRows, ...data.openRows].reduce((a, r) => a + (Number(r.attendance) || 0), 0);
  rows.push(['TOTAL ATTENDANCE', '', '', '', grandTotal, '', '', '']);

  const maxLen = Math.max(...rows.map((r) => r.length));
  return rows.map((r) => {
    const padded = r.slice();
    while (padded.length < maxLen) padded.push('');
    return padded;
  });
}

export function buildWeekWorkbook(data: WeekExportData): Blob {
  const rows = weekReportRows(data);
  const files = [
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    },
    {
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Weekly Report" sheetId="1" r:id="rId1"/></sheets></workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    },
    { name: 'xl/worksheets/sheet1.xml', data: sheetXml(rows) },
  ];
  return zip(files);
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
