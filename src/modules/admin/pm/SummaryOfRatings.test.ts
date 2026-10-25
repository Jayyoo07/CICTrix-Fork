import { describe, expect, it } from 'vitest';
import { buildDeptCompletionRows, restrictToActiveOffices, type IPCRRatingRecord } from './SummaryOfRatings';

const record = (id: string, department: string, numericalRating: number | null): IPCRRatingRecord => ({
  id,
  department,
  name: `Employee ${id}`,
  position: 'Clerk',
  period: 'January–June 2025',
  numericalRating,
  remarks: '',
  submissionStatus: 'SUBMITTED',
});

const headcount = new Map([
  ['legal', { name: 'Legal', count: 6 }],
  ['office of the city engineer', { name: 'Office of The City Engineer', count: 23 }],
]);

const activeOffices = new Map([
  ['office of the city engineer', 'Office of the City Engineer'],
  ['city health office', 'City Health Office'],
]);

describe('restrictToActiveOffices', () => {
  it('drops inactive offices and lists active offices with nobody yet', () => {
    const scoped = restrictToActiveOffices(
      [record('1', 'Legal', 4), record('2', 'Office of The City Engineer', 3.5)],
      headcount,
      activeOffices,
    );

    expect(scoped.records.map(r => r.id)).toEqual(['2']);
    const rows = buildDeptCompletionRows(scoped.records, scoped.headcount, true);
    expect(rows.map(r => [r.department, r.completed, r.total])).toEqual([
      ['City Health Office', 0, 0],
      ['Office of The City Engineer', 1, 23],
    ]);
  });

  it('leaves the data unfiltered when the office lookup failed', () => {
    const records = [record('1', 'Legal', 4)];
    const scoped = restrictToActiveOffices(records, headcount, null);
    expect(scoped.records).toBe(records);
    expect(scoped.headcount).toBe(headcount);
  });
});
