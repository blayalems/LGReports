import { describe, expect, it } from 'vitest';
import { createDemoSnapshot } from '../../domain/demoData';
import type { Member } from '../../domain/types';
import { columnLetter, entityToRow, headersFor, headersMatch, parseWorkbook, rowToEntity, workbookValues } from './schema';

describe('sheets schema', () => {
  it('round-trips a full demo snapshot through workbook values', () => {
    const snapshot = createDemoSnapshot('actor-1');
    const values = workbookValues(snapshot);
    const { snapshot: parsed, rowIndex } = parseWorkbook(values);

    expect(parsed.meta.trackerId).toBe(snapshot.meta.trackerId);
    expect(parsed.config.church).toBe(snapshot.config.church);
    expect(parsed.config.statusOptions).toEqual(snapshot.config.statusOptions);
    expect(parsed.config.atRiskWeeks).toBe(snapshot.config.atRiskWeeks);
    expect(parsed.stages).toEqual(snapshot.stages);
    expect(parsed.groups).toEqual(snapshot.groups);
    expect(parsed.members).toEqual(snapshot.members);
    expect(parsed.weeks).toEqual(snapshot.weeks);
    expect(parsed.meetings).toEqual(snapshot.meetings);
    expect(parsed.campaigns).toEqual(snapshot.campaigns);
    expect(parsed.campaignMetrics).toEqual(snapshot.campaignMetrics);
    expect(parsed.events).toEqual(snapshot.events);

    // Row index points at 1-based sheet rows, data starting at 2.
    expect(rowIndex.groups.get(snapshot.groups[0].id)).toBe(2);
    expect(rowIndex.groups.get(snapshot.groups[3].id)).toBe(5);
  });

  it('preserves nulls vs zeros vs empty strings', () => {
    const member: Member = {
      id: 'm1',
      name: 'Pat Doe',
      status: 'regular',
      groupId: null,
      phone: '',
      address: '12 Sample Street',
      notes: 'Pray for a new job',
      birthdayMonth: null,
      birthdayDay: null,
      photoMediaId: null,
      revision: 3,
      createdAt: 'c',
      createdBy: 'a',
      updatedAt: 'u',
      updatedBy: 'a',
      deletedAt: null,
    };
    const row = entityToRow('members', member as unknown as Record<string, unknown>);
    const back = rowToEntity<Member>('members', row);
    expect(back).toEqual(member);
    expect(back.groupId).toBeNull();
    expect(back.address).toBe('12 Sample Street');
    expect(back.notes).toBe('Pray for a new job');
    expect(back.birthdayMonth).toBeNull();
    expect(back.revision).toBe(3);
  });

  it('stores formula-looking text as plain text, unchanged', () => {
    // RAW input keeps it literal; the mapping itself must not mangle or "fix" it.
    const row = entityToRow('groups', {
      id: 'g1',
      name: '=IMPORTRANGE("evil","A1")',
      category: 'open',
      location: '+1234',
      weeklyTarget: null,
      revision: 1,
      createdAt: '',
      createdBy: '',
      updatedAt: '',
      updatedBy: '',
      deletedAt: null,
    });
    expect(row[1]).toBe('=IMPORTRANGE("evil","A1")');
    const back = rowToEntity<{ name: string; location: string }>('groups', row);
    expect(back.name).toBe('=IMPORTRANGE("evil","A1")');
    expect(back.location).toBe('+1234');
  });

  it('detects header drift (hand-edited workbook)', () => {
    expect(headersMatch('members', headersFor('members'))).toBe(true);
    expect(headersMatch('members', ['id', 'fullName'])).toBe(false);
    expect(headersMatch('members', undefined)).toBe(false);
    // Extra appended columns are tolerated (forward compat).
    expect(headersMatch('members', [...headersFor('members'), 'futureColumn'])).toBe(true);
  });

  it('loads v1 member rows without the appended detail fields', () => {
    const currentHeaders = headersFor('members');
    const legacyHeaders = currentHeaders.slice(0, -2);
    const legacyRow = [
      'm-old',
      'Legacy Member',
      'regular',
      '',
      '+63 900 000 0000',
      '',
      '',
      '',
      '1',
      'created',
      'actor',
      'updated',
      'actor',
      '',
    ];

    expect(headersMatch('members', legacyHeaders)).toBe(true);
    const member = rowToEntity<Member>('members', legacyRow);
    expect(member.address).toBe('');
    expect(member.notes).toBe('');
  });

  it('skips blank rows and tolerates short rows from the values API', () => {
    const values = workbookValues(createDemoSnapshot('actor-1'));
    values.groups.push(['', '', '']); // blank row (deleted content)
    values.groups.push(['g-short', 'Shorty']); // trailing cells omitted by the API
    const { snapshot } = parseWorkbook(values);
    const short = snapshot.groups.find((g) => g.id === 'g-short')!;
    expect(short.name).toBe('Shorty');
    expect(short.weeklyTarget).toBeNull();
    expect(short.location).toBe('');
    expect(snapshot.groups.some((g) => g.id === '')).toBe(false);
  });

  it('computes A1 column letters', () => {
    expect(columnLetter(1)).toBe('A');
    expect(columnLetter(14)).toBe('N');
    expect(columnLetter(26)).toBe('Z');
    expect(columnLetter(27)).toBe('AA');
  });
});
