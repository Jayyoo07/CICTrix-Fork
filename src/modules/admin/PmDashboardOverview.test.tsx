import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { IPCRRatingRecord } from './pm/SummaryOfRatings';
import { OTHER_OFFICE_LABEL, PmDashboardOverview, summarizeResults, summarizeSubmission, type IpcrStatus } from './PmDashboardOverview';

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

const TODAY = new Date(2026, 9, 16);
const status = (dept: string, daysFromToday: number, forwarded = false): IpcrStatus => ({
  dept,
  dueDate: new Date(2026, 9, 16 + daysFromToday),
  forwarded,
});
const fromNow = (days: number) => new Date(Date.now() + days * 86400000);

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
  const ACTIVE = new Map([
    ['health', 'Health'],
    ['engineer', 'Engineer'],
  ]);
  const sum = (rows: { [k: string]: unknown }[], key: string) => rows.reduce((n, r) => n + (r[key] as number), 0);

  it('puts every employee in exactly one bucket, so totals equal the rows', () => {
    const summary = summarizeSubmission(
      [
        status('health', -2, true), // forwarded beats overdue
        status('Health', -2),
        status('Health', 45),
        status('Engineer', 10),
        status('Engineer', 0),
        status('Legal', -1), // inactive office
        status('', 5), // no office
      ],
      ACTIVE,
      TODAY,
    );
    expect(summary).toMatchObject({ completed: 1, overdue: 2, dueSoon: 3, notYetDue: 1, total: 7, rate: 14 });
    expect(summary.completed + summary.overdue + summary.dueSoon + summary.notYetDue).toBe(summary.total);
    for (const key of ['completed', 'overdue', 'dueSoon', 'notYetDue', 'total']) {
      expect(sum(summary.rows as unknown as { [k: string]: unknown }[], key)).toBe(summary[key as keyof typeof summary]);
    }
    // Office names come from the active list; inactive and blank offices share the last row.
    expect(summary.rows.map((r) => [r.department, r.completed, r.overdue, r.dueSoon, r.notYetDue])).toEqual([
      ['Engineer', 0, 0, 2, 0],
      ['Health', 1, 1, 0, 1],
      [OTHER_OFFICE_LABEL, 0, 1, 1, 0],
    ]);
  });

  it('breaks rate ties by overdue, then due soon, then not submitted', () => {
    const summary = summarizeSubmission(
      [status('Small', 90), status('Big', 90), status('Big', 90), status('Soon', 10), status('Late', -1)],
      null,
      TODAY,
    );
    expect(summary.rows.map((r) => r.department)).toEqual(['Late', 'Soon', 'Big', 'Small']);
  });

  it('has no rate when there is nobody to track', () => {
    expect(summarizeSubmission([], ACTIVE, TODAY)).toMatchObject({ total: 0, rate: null, rows: [] });
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
        // The component reads the real clock, so these dates are relative to now.
        statuses={[
          { dept: 'City Health Office', dueDate: fromNow(-3), forwarded: false },
          { dept: 'City Health Office', dueDate: fromNow(60), forwarded: true },
          { dept: 'Office of the City Engineer', dueDate: fromNow(90), forwarded: false },
          { dept: 'Legal', dueDate: fromNow(5), forwarded: false },
        ]}
        statusesLoading={false}
        onOpenSummary={() => {}}
      />,
    );
    // 1 forwarded of 4 Active employees.
    const value = await screen.findByText('1 of 4 submitted');
    expect(value.parentElement?.textContent).toBe('25%1 of 4 submitted');
    expect(screen.getByRole('img', { name: 'Submitted 1, overdue 1, due in 30 days 1, not yet due 1' })).toBeTruthy();
    expect(screen.getAllByText('1 overdue')).toHaveLength(1);
    // The inactive office's employee is counted in its own row, not dropped.
    expect(screen.getByText(OTHER_OFFICE_LABEL)).toBeTruthy();
    expect(screen.getByText('Last2, First2')).toBeTruthy();
    expect(screen.getByText('View all (1) ›')).toBeTruthy();
  });

  it('shows an error instead of zeros when the tracker fails', async () => {
    render(<PmDashboardOverview statuses={null} statusesLoading={false} onOpenSummary={() => {}} />);
    expect(await screen.findByText("We couldn't load IPCR submissions. Refresh the page to try again.")).toBeTruthy();
    expect(screen.queryByText(/submitted$/)).toBeNull();
  });
});
