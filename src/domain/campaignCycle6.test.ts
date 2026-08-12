import { describe, expect, it } from 'vitest';
import { CAMPAIGN_PRINCIPLES, CYCLE6_CAMPAIGN, CYCLE6_SESSION_TEMPLATES, ESSENTIAL_ELEMENTS, missingCycle6SessionTemplates } from './campaignCycle6';

describe('official Cycle 6 template', () => {
  it('encodes every authorized date, schedule, venue, and independent LIV requirement', () => {
    expect(CYCLE6_CAMPAIGN).toEqual({ name: 'One More for Jesus Campaign Cycle 6', start: '2026-09-01', end: '2026-11-30' });
    expect(CYCLE6_SESSION_TEMPLATES).toHaveLength(28);

    const pray = CYCLE6_SESSION_TEMPLATES.filter((row) => row.programKey === 'prayparations');
    expect(pray).toMatchObject([
      { dateStart: '2026-08-24', dateEnd: '2026-09-12', startTime: null, endTime: null, venue: null, notes: 'Per Network or Cluster' },
    ]);

    const nls = CYCLE6_SESSION_TEMPLATES.filter((row) => row.programKey === 'nls');
    expect(new Set(nls.map((row) => row.dateStart))).toEqual(new Set(['2026-09-13', '2026-09-20', '2026-09-27', '2026-10-04']));
    expect(new Set(nls.map((row) => `${row.startTime}-${row.endTime}`))).toEqual(new Set(['10:00-11:30', '13:00-14:30', '15:00-16:30']));
    expect(nls.every((row) => row.venue === 'The Lighthouse, Quimpo Boulevard')).toBe(true);

    const kgc = CYCLE6_SESSION_TEMPLATES.filter((row) => row.programKey === 'kgc');
    expect(kgc).toHaveLength(6);
    expect(new Set(kgc.map((row) => row.dateStart))).toEqual(new Set(['2026-09-27', '2026-10-04']));
    expect(new Set(kgc.map((row) => `${row.startTime}-${row.endTime}`))).toEqual(new Set(['10:00-12:00', '13:00-15:00', '15:10-17:10']));
    expect(kgc.every((row) => row.requirementKey === 'kgc:any' && row.venue === 'The Lighthouse Training Hall')).toBe(true);

    const lightUp = CYCLE6_SESSION_TEMPLATES.filter((row) => row.programKey === 'light_up');
    expect(lightUp.map((row) => [row.dateStart, row.dateEnd])).toEqual([
      ['2026-10-10', '2026-10-11'],
      ['2026-10-17', '2026-10-18'],
    ]);
    expect(lightUp.every((row) => row.requirementKey === 'light-up:any' && row.venue === 'The Lighthouse, Quimpo Boulevard')).toBe(true);

    const liv = CYCLE6_SESSION_TEMPLATES.filter((row) => row.programKey === 'liv');
    expect(liv).toHaveLength(6);
    expect(new Set(liv.map((row) => row.requirementKey))).toEqual(new Set(['liv:2026-10-25', 'liv:2026-11-01']));
    expect(new Set(liv.map((row) => `${row.startTime}-${row.endTime}`))).toEqual(new Set(['10:00-12:00', '13:00-15:00', '15:10-17:10']));
    expect(liv.every((row) => row.venue === 'The Lighthouse Training Hall')).toBe(true);

    expect(CYCLE6_SESSION_TEMPLATES.filter((row) => row.programKey === 'water_baptism')).toMatchObject([
      {
        dateStart: '2026-11-07',
        dateEnd: '2026-11-07',
        startTime: '06:00',
        endTime: null,
        venue: 'Mergrande Ocean Resort, Talomo, Davao City',
        requirementKey: 'water-baptism',
      },
    ]);
  });

  it('keeps the two campaign principles and all 10 essential elements as practice guidance', () => {
    expect(CAMPAIGN_PRINCIPLES).toHaveLength(2);
    expect(CAMPAIGN_PRINCIPLES[0]).toContain('repentance and faith');
    expect(CAMPAIGN_PRINCIPLES[1]).toContain('intellectual, practical, and relational');
    expect(ESSENTIAL_ELEMENTS).toHaveLength(10);
    expect(ESSENTIAL_ELEMENTS).toEqual([
      'PRAYPARATIONS',
      'NEW LIFE SUNDAYS',
      'LIFE GROUP',
      'INTENTIONAL INVITATION',
      'COMEBACK STRATEGIES',
      'WELCOMING ATMOSPHERE',
      'PRACTICAL ACTS OF KINDNESS',
      'FAITHFUL FOLLOW-UP',
      'BEGINNING YOUR NEW LIFE IN CHRIST DISCUSSIONS',
      'LIGHT UP RETREAT — A HEALING & DELIVERANCE RETREAT',
    ]);
  });

  it('repairs only missing official slots and preserves edited schedule fields', () => {
    const existing = CYCLE6_SESSION_TEMPLATES.slice(0, -1).map((row, index) => ({
      ...row,
      dateStart: index === 13 ? '2026-09-28' : row.dateStart,
      startTime: index === 13 ? '09:30' : row.startTime,
      venue: index === 13 ? 'Edited venue' : row.venue,
    }));
    expect(missingCycle6SessionTemplates(existing)).toEqual([CYCLE6_SESSION_TEMPLATES.at(-1)]);
    expect(missingCycle6SessionTemplates(CYCLE6_SESSION_TEMPLATES)).toEqual([]);
  });
});
