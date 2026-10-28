import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ from: vi.fn(), requests: [] as { ids: string[]; from: number; to: number }[] }));
vi.mock('../supabase', () => ({ supabase: { from: db.from } }));

import { getCurrentYearTrainingCounts } from './lndArchive';

type RecordRow = {
  id: string;
  employee_id: string;
  from_date: string | null;
  to_date: string | null;
  enrollment_id: string | null;
};

const now = new Date('2026-10-28T04:00:00Z');
const training = (id: string, employeeId = 'a', endDate: string | null = '2026-06-10'): RecordRow => ({
  id, employee_id: employeeId, from_date: '2026-06-09', to_date: endDate, enrollment_id: null,
});

function records(rows: RecordRow[], failAt?: number, reject = false, serverRowLimit = Infinity) {
  db.from.mockImplementation((table: string) => {
    expect(table).toBe('employee_training');
    let ids: string[] = [];
    const query = {
      select: () => query,
      in: (column: string, values: string[]) => {
        expect(column).toBe('employee_id');
        ids = values;
        return query;
      },
      order: () => query,
      range: async (from: number, to: number) => {
        db.requests.push({ ids, from, to });
        if (failAt === db.requests.length) {
          if (reject) throw new Error('Network unavailable');
          return { data: null, error: { message: 'Permission denied' } };
        }
        return { data: rows.filter((row) => ids.includes(row.employee_id))
          .slice(from, Math.min(to + 1, from + serverRowLimit)), error: null };
      },
    };
    return query;
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  db.requests.length = 0;
  records([]);
});

describe('current-year recorded training completions', () => {
  it('returns actual totals including zero and counts above the annual requirement', async () => {
    records([training('b1', 'b'), training('c1', 'c'), training('c2', 'c'),
      training('d1', 'd'), training('d2', 'd'), training('d3', 'd'), training('outside', 'other')]);

    const result = await getCurrentYearTrainingCounts(['a', 'b', 'c', 'd', 'a'], now);

    expect(result.ok).toBe(true);
    expect([...result.counts]).toEqual([['a', 0], ['b', 1], ['c', 2], ['d', 3]]);
    expect(db.requests[0].ids).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not query when no employee IDs are supplied', async () => {
    expect(await getCurrentYearTrainingCounts([], now)).toEqual({ ok: true, counts: new Map() });
    expect(db.from).not.toHaveBeenCalled();
  });

  it('uses the end date, falling back to the start date only when the end is absent', async () => {
    records([
      { ...training('cross-year'), from_date: '2025-12-30', to_date: '2026-01-02' },
      { ...training('fallback'), from_date: '2026-01-01', to_date: null },
      training('today', 'a', '2026-10-28'),
      training('prior', 'a', '2025-12-31'),
      training('future', 'a', '2026-10-29'),
      training('next-year', 'a', '2027-01-01'),
      { ...training('missing'), from_date: null, to_date: null },
      training('bad-end', 'a', 'not-a-date'),
      training('impossible-end', 'a', '2026-02-30'),
      { ...training('bad-fallback'), from_date: '2026-13-01', to_date: null },
    ]);

    expect((await getCurrentYearTrainingCounts(['a'], now)).counts.get('a')).toBe(3);
  });

  it.each([
    ['2025-12-31T15:59:59Z', 1],
    ['2025-12-31T16:00:00Z', 1],
  ])('uses Philippine calendar boundaries at %s', async (instant, expected) => {
    records([training('old-year', 'a', '2025-12-31'), training('new-year', 'a', '2026-01-01')]);
    const result = await getCurrentYearTrainingCounts(['a'], new Date(instant));
    expect(result.counts.get('a')).toBe(expected);
    // These records individually prove which year was chosen rather than just its total.
    records([training('old-year', 'a', '2025-12-31')]);
    expect((await getCurrentYearTrainingCounts(['a'], new Date(instant))).counts.get('a'))
      .toBe(instant === '2025-12-31T15:59:59Z' ? 1 : 0);
  });

  it('counts duplicate archive IDs and shared enrollment links only once per employee', async () => {
    const linked = { ...training('linked'), enrollment_id: 'enrollment-1' };
    records([linked, linked, { ...linked, id: 'linked-copy' }, training('standalone-1'), training('standalone-2'),
      { ...training('other-employee', 'b'), enrollment_id: 'enrollment-1' }]);

    expect([...(await getCurrentYearTrainingCounts(['a', 'b'], now)).counts]).toEqual([['a', 3], ['b', 1]]);
  });

  it('reads every page rather than truncating history at the API row limit', async () => {
    records(Array.from({ length: 1005 }, (_, index) => training(`record-${index}`)));
    expect((await getCurrentYearTrainingCounts(['a'], now)).counts.get('a')).toBe(1005);
    expect(db.requests.length).toBeGreaterThan(1);
    expect(db.requests[1].from).toBe(db.requests[0].to + 1);
  });

  it('batches large employee lists without losing the last employee', async () => {
    const ids = Array.from({ length: 301 }, (_, index) => `employee-${index}`);
    records([training('last', 'employee-300')]);
    const result = await getCurrentYearTrainingCounts(ids, now);
    expect(result.counts.size).toBe(301);
    expect(result.counts.get('employee-300')).toBe(1);
    expect(db.requests.length).toBeGreaterThan(1);
    expect(db.requests.every((request) => request.ids.length <= 150)).toBe(true);
  });

  it('does not treat a smaller server-side row cap as the end of history', async () => {
    records(Array.from({ length: 205 }, (_, index) => training(`record-${index}`)), undefined, false, 100);
    expect((await getCurrentYearTrainingCounts(['a'], now)).counts.get('a')).toBe(205);
  });

  it.each([false, true])('returns failure, never partial counts, when a later page fails (reject=%s)', async (reject) => {
    records(Array.from({ length: 1005 }, (_, index) => training(`record-${index}`)), 2, reject);
    const result = await getCurrentYearTrainingCounts(['a'], now);
    expect(result.ok).toBe(false);
    expect(result.counts.size).toBe(0);
    expect(result.error).toBeTruthy();
  });
});
