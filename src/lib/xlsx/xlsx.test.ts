import { describe, expect, it } from 'vitest';
import { buildWeekWorkbook } from './writer';
import { parseWeekGrid, parseWeekWorkbook, gridFromSheetXml, parseSharedStrings } from './reader';

describe('xlsx writer/reader round trip (our own export format)', () => {
  it('parses back everything it wrote', async () => {
    const blob = buildWeekWorkbook({
      weekLabel: 'MAR 8 - MAR 14',
      network: 'Sample Network',
      overseer: 'Sample Overseer',
      dateSubmitted: '2026-03-15',
      leaderRows: [{ leader: 'Alex Rivera', start: '18:30', end: '20:45', attendance: 3, status: 'Active', date: '2026-03-10', location: 'Main hall' }],
      openRows: [
        { leader: 'Jordan Lee', start: '16:30', end: '17:30', attendance: 5, status: 'Active', date: '2026-03-08', location: '' },
        { leader: 'Sam Patel', start: '', end: '', attendance: 0, status: 'No Meeting', date: '', location: '' },
      ],
    });
    const buf = await blob.arrayBuffer();
    const parsed = await parseWeekWorkbook(buf);
    expect(parsed).not.toBeNull();
    expect(parsed!.weekLabel).toBe('MAR 8 - MAR 14');
    expect(parsed!.overseer).toBe('Sample Overseer');
    expect(parsed!.rows).toHaveLength(3);
    const alex = parsed!.rows.find((r) => r.leader === 'Alex Rivera');
    expect(alex).toMatchObject({ section: 'leader', start: '18:30', end: '20:45', attendance: 3, status: 'Active', date: '2026-03-10' });
    const jordan = parsed!.rows.find((r) => r.leader === 'Jordan Lee');
    expect(jordan).toMatchObject({ section: 'open', attendance: 5 });
  });
});

describe('legacy side-by-side template import (fictional fixture)', () => {
  // Structural fixture mirroring the real church template's merged-header layout,
  // with entirely fictional names — deliberately not a copy of any real workbook.
  const grid: (string | undefined)[][] = [
    [],
    [undefined, 'Sample Fellowship'],
    [undefined, 'Weekly Summary of Life Group Report'],
    [],
    [undefined, 'NETWORK OVERSEER :', undefined, 'Sample Overseer (Sample Network)', undefined, undefined, undefined, undefined, undefined, 'DATE SUBMITTED :'],
    [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'WEEK COVERED :', undefined, 'MAR 1 - MAR 7'],
    [undefined, "LEADER'S LIFE GROUP", undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'OPEN LIFE GROUP'],
    [
      undefined,
      'LIFE GROUP LEADER',
      undefined,
      'TIME DURATION',
      undefined,
      'ATTENDANCE',
      'CELL STATUS',
      'Date',
      undefined,
      'LIFE GROUP LEADER',
      undefined,
      'TIME DURATION',
      undefined,
      'ATTENDANCE',
      'CELL STATUS',
      'Date',
    ],
    [undefined, undefined, undefined, 'START', 'END', undefined, undefined, undefined, undefined, undefined, undefined, 'START', 'END'],
    [
      undefined,
      '1',
      'Riley Chen',
      '6:30 PM',
      '8:45 PM',
      '3',
      'ACTIVE',
      '3/3/26',
      undefined,
      '1',
      'Casey Morgan (Sunday)',
      '4:30 PM',
      '5:30 PM',
      '5',
      'ACTIVE',
      '3/8/26',
    ],
    [
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      '2',
      'Taylor Kim',
      'NO MEETING',
      undefined,
      undefined,
      'ACTIVE',
    ],
    [],
    [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, 'TOTAL ATTENDANCE', '', '', '8'],
  ];

  it('detects the merged rownum+name layout and both sections', () => {
    const parsed = parseWeekGrid(grid);
    expect(parsed).not.toBeNull();
    expect(parsed!.weekLabel).toBe('MAR 1 - MAR 7');
    expect(parsed!.rows).toHaveLength(3);
    const riley = parsed!.rows.find((r) => r.leader === 'Riley Chen');
    expect(riley).toMatchObject({ section: 'leader', start: '18:30', end: '20:45', attendance: 3, date: '2026-03-03' });
    const casey = parsed!.rows.find((r) => r.leader === 'Casey Morgan (Sunday)');
    expect(casey).toMatchObject({ section: 'open', attendance: 5 });
    const taylor = parsed!.rows.find((r) => r.leader === 'Taylor Kim');
    expect(taylor).toMatchObject({ section: 'open', start: '', end: '', status: 'ACTIVE' });
  });
});

describe('grid/shared-string helpers', () => {
  it('resolves shared string references', () => {
    const shared = parseSharedStrings('<sst><si><t>Hello</t></si><si><t>World</t></si></sst>');
    expect(shared).toEqual(['Hello', 'World']);
    const xml = '<row r="1"><c r="A1" t="s"><v>1</v></c></row>';
    const grid = gridFromSheetXml(xml, shared);
    expect(grid[0][0]).toBe('World');
  });

  it('decodes XML entities in shared and inline strings', () => {
    const shared = parseSharedStrings('<sst><si><t>Grace &amp; Truth &lt;LG&gt; &quot;North&quot; &apos;A&apos; &#35;1 &#x1F64F;</t></si></sst>');
    expect(shared).toEqual([`Grace & Truth <LG> "North" 'A' #1 🙏`]);

    const xml =
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Rock &amp; Water</t></is></c><c r="B1" t="inlineStr"><is><r><t>Life </t></r><r><t>Group &lt;3</t></r></is></c></row>';
    const grid = gridFromSheetXml(xml, []);
    expect(grid[0]).toEqual(['Rock & Water', 'Life Group <3']);
  });
});
