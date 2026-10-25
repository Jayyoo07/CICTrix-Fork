import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { DeptCompletionRow, IPCRRatingRecord } from './pm/SummaryOfRatings';
import { PmDashboardOverview, summarizeResults, summarizeSubmission, type PendingIpcr } from './PmDashboardOverview';

const record = (id: string, department: string, rating: number | null): IPCRRatingRecord => ({
  id,
  department,
  name: `Last${id}, First${id}`,
  position: 'Engineer II',
  period: 'January–June 2025',
  numericalRating: rating,
  remarks: '',
  submissionStatus: 'SUBMITTED',
});

const deptRow = (department: string, completed: number, total: number): DeptCompletionRow => ({
  department,
  completed,
  total,
  rate: total > 0 ? completed / total : null,
  lowCount: 0,
  nonSubmission: 0,
});

const TODAY = new Date(2026, 9, 16);
const pendingIpcr = (dept: string, daysFromToday: number, type: PendingIpcr['type'] = 'Regular'): PendingIpcr => ({
  dept,
  type,
  dueDate: new Date(2026, 9, 16 + daysFromToday),
});

vi.mock('../../lib/api/competencyGapAnalysis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api/competencyGapAnalysis')>();
  return {
    ...actual,
    getIPCRRecordsFromGapView: () =>
      Promise.resolve([
        record('1', 'City Health Office', 4.8),
        record('2', 'City Health Office', 2.4),
        record('3', 'Office of the City Engineer', 3.5),
      ]),
    getActiveHeadcountByDepartment: () =>
      Promise.resolve(
        new Map([
          ['city health office', { name: 'City Health Office', count: 4 }],
          ['office of the city engineer', { name: 'Office of the City Engineer', count: 2 }],
        ]),
      ),
    getActiveOfficeKeys: () =>
      Promise.resolve(
        new Map([
          ['city health office', 'City Health Office'],
          ['office of the city engineer', 'Office of the City Engineer'],
        ]),
      ),
  };
});

describe('summarizeSubmission', () => {
  it('totals rated IPCRs over headcount and counts overdue and due-soon per office', () => {
    const summary = summarizeSubmission(
      [deptRow('Health', 3, 4), deptRow('Engineer', 1, 4), deptRow('Empty', 0, 0)],
      [pendingIpcr('health', -2), pendingIpcr('Engineer', 10), pendingIpcr('Engineer', 45), pendingIpcr('Unassigned', -1)],
      TODAY,
    );
    expect(summary).toMatchObject({ completed: 4, total: 8, rate: 50, overdue: 2, dueSoon: 1 });
    // Offices with no employees are left out; matching ignores case.
    expect(summary.rows.map((r) => [r.department, r.overdue, r.dueSoon])).toEqual([
      ['Health', 1, 0],
      ['Engineer', 0, 1],
    ]);
  });

  it('has no rate when no office has employees', () => {
    expect(summarizeSubmission([], [], TODAY).rate).toBeNull();
  });
});

describe('summarizeResults', () => {
  it('averages rated IPCRs, buckets them and lists U and P lowest first', () => {
    const results = summarizeResults([
      record('a', 'Health', 4.9),
      record('b', 'Health', 4.1),
      record('c', 'Engineer', 2.5),
      record('d', 'Engineer', 1.5),
      record('e', 'Engineer', null),
    ]);
    expect(results.rated).toBe(4);
    expect(results.average).toBeCloseTo(3.25);
    expect(results.distribution).toEqual({ Outstanding: 1, 'Very Satisfactory': 1, Satisfactory: 0, Unsatisfactory: 1, Poor: 1 });
    expect(results.low.map((r) => r.id)).toEqual(['d', 'c']);
    expect(results.depts.map((d) => [d.department, d.rated])).toEqual([
      ['Health', 2],
      ['Engineer', 2],
    ]);
  });

  it('flags an office whose Outstanding share is at least twice the office-wide share', () => {
    const many = (dept: string, ratings: number[]) => ratings.map((r, i) => record(`${dept}${i}`, dept, r));
    const results = summarizeResults([
      ...many('HRMO', [4.9, 4.9, 4.9, 4.2, 4.2]),
      ...many('Treasury', [4.2, 4.2, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5]),
    ]);
    expect(results.inflation).toMatchObject({ department: 'HRMO', share: 0.6, officeShare: 0.2 });
  });

  it('handles ratings with no department', () => {
    const noDept = { ...record('x', '', 3.5), department: null as unknown as string };
    const results = summarizeResults([noDept, record('y', 'Health', 3.5)]);
    expect(results.depts).toHaveLength(2);
  });

  it('does not flag offices with fewer than five ratings', () => {
    const results = summarizeResults([record('a', 'Small', 4.9), record('b', 'Big', 3.5), record('c', 'Big', 3.5)]);
    expect(results.inflation).toBeNull();
  });
});

describe('PmDashboardOverview', () => {
  it('renders the submission rate, department rows and the intervention list', async () => {
    render(
      <PmDashboardOverview
        pending={[pendingIpcr('City Health Office', -3)]}
        onOpenSummary={() => {}}
      />,
    );
    // 3 rated of 6 active employees.
    const value = await screen.findByText('3 of 6');
    expect(value.parentElement?.textContent).toBe('50%3 of 6');
    // The overdue IPCR shows on the submission card and the City Health Office row.
    expect(screen.getAllByText('1 overdue')).toHaveLength(2);
    expect(screen.getByText('Last2, First2')).toBeTruthy();
    expect(screen.getByText('View all (1) ›')).toBeTruthy();
  });
});
