import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS, GROUPS, badgeVariant, countFor, filterRecords, formatDate, pageList, toCsv, typeLabel,
  type ArchiveRecord,
} from './model';

const rec = (over: Partial<ArchiveRecord>): ArchiveRecord => ({
  key: over.key ?? Math.random().toString(),
  group: 'applicants', type: 'Disqualified', name: 'Ana Reyes', ref: 'REF-2026-0141',
  position: 'Administrative Aide IV', department: 'HRMO', date: '2026-10-24T08:00:00Z',
  ...over,
});

const records: ArchiveRecord[] = [
  rec({ key: 'a', name: 'Ana Reyes', date: '2026-10-24T08:00:00Z' }),
  rec({ key: 'b', name: 'Mark Lim', ref: 'REF-2026-0098', type: 'Not Selected', department: 'CEO', date: '2026-10-21T08:00:00Z' }),
  rec({ key: 'c', group: 'employees', type: 'Resigned', name: 'Eduardo Lacson', ref: 'EMP-2015-0310', date: '2026-08-15' }),
];

describe('filterRecords', () => {
  it('keeps only the group, newest first by default', () => {
    expect(filterRecords(records, 'applicants', EMPTY_FILTERS).map((r) => r.key)).toEqual(['a', 'b']);
  });

  it('matches the search on name, ref or position, not department', () => {
    expect(filterRecords(records, 'applicants', { ...EMPTY_FILTERS, query: '0098' }).map((r) => r.key)).toEqual(['b']);
    expect(filterRecords(records, 'applicants', { ...EMPTY_FILTERS, query: 'aide' }).map((r) => r.key)).toEqual(['a', 'b']);
    expect(filterRecords(records, 'applicants', { ...EMPTY_FILTERS, query: 'hrmo' })).toEqual([]);
  });

  it('filters by type, department and an inclusive date range', () => {
    expect(filterRecords(records, 'applicants', { ...EMPTY_FILTERS, type: 'Not Selected' }).map((r) => r.key)).toEqual(['b']);
    expect(filterRecords(records, 'applicants', { ...EMPTY_FILTERS, department: 'HRMO' }).map((r) => r.key)).toEqual(['a']);
    expect(filterRecords(records, 'applicants', { ...EMPTY_FILTERS, from: '2026-10-21', to: '2026-10-21' }).map((r) => r.key)).toEqual(['b']);
  });

  it('sorts oldest first and by name', () => {
    expect(filterRecords(records, 'applicants', { ...EMPTY_FILTERS, sort: 'old' }).map((r) => r.key)).toEqual(['b', 'a']);
    expect(filterRecords(records, 'applicants', { ...EMPTY_FILTERS, sort: 'az' }).map((r) => r.key)).toEqual(['a', 'b']);
  });
});

describe('countFor', () => {
  it('counts per group and type under the search', () => {
    expect(countFor(records, 'applicants', '')).toBe(2);
    expect(countFor(records, 'applicants', '', 'Disqualified')).toBe(1);
    expect(countFor(records, 'employees', 'lacson')).toBe(1);
    expect(countFor(records, 'employees', 'reyes')).toBe(0);
  });
});

describe('labels and badges', () => {
  it('maps §10 variants and keeps categories as tint', () => {
    expect(badgeVariant('Disqualified')).toBe('error');
    expect(badgeVariant('Not Selected')).toBe('neutral');
    expect(badgeVariant('Promoted')).toBe('tint');
  });

  it('shows the en dash for the hyphenated DB value', () => {
    expect(typeLabel('Withdrawn - Hired Elsewhere')).toBe('Withdrawn – Hired Elsewhere');
  });

  it('formats dates as MMM DD, YYYY and tolerates blanks', () => {
    expect(formatDate('2026-10-24T08:00:00Z')).toBe('Oct 24, 2026');
    expect(formatDate('')).toBe('—');
  });
});

describe('pageList', () => {
  it('lists every page up to 7, then first, last and current ±1', () => {
    expect(pageList(0, 3)).toEqual([0, 1, 2]);
    expect(pageList(5, 12)).toEqual([0, null, 4, 5, 6, null, 11]);
    expect(pageList(0, 12)).toEqual([0, 1, null, 11]);
  });
});

describe('toCsv', () => {
  it('quotes cells with commas and quotes', () => {
    const csv = toCsv(GROUPS[1], [rec({ name: 'Reyes, Ana', reason: 'Said "no"' })]);
    expect(csv.split('\n')[1]).toBe('"Reyes, Ana",REF-2026-0141,Administrative Aide IV,HRMO,Disqualified,"Said ""no""",Oct 24, 2026'.replace('Oct 24, 2026', '"Oct 24, 2026"'));
  });
});
