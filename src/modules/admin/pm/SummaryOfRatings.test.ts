import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import {
  buildDeptCompletionRows,
  computeKPIs,
  groupByDept,
  restrictToActiveOffices,
  SummaryOfRatings,
  type IPCRRatingRecord,
} from './SummaryOfRatings';
import type { DepartmentSourceSemester } from '../../../lib/api/sorSemesterSource';

vi.mock('../../../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }));
vi.mock('./SemesterSummarySection', () => ({ SemesterSummarySection: () => null }));
vi.mock('./CompetencyGapPanel', () => ({ CompetencyGapPanel: () => null }));

const mockDeptSemesters: Record<string, DepartmentSourceSemester> = {
  'Office of the City Engineer': {
    department: 'Office of the City Engineer',
    cycleId: 7,
    periodTitle: 'July–December 2026',
    status: 'published',
    requiredCount: 20,
    approvedCount: 20,
    assessmentCompleteCount: 20,
  },
  'City Health Office': {
    department: 'City Health Office',
    cycleId: 6,
    periodTitle: 'January–June 2026',
    status: 'published',
    requiredCount: 15,
    approvedCount: 15,
    assessmentCompleteCount: 15,
  },
  'Budget Office': {
    department: 'Budget Office',
    cycleId: 6,
    periodTitle: 'January–June 2026',
    status: 'correction_pending',
    requiredCount: 10,
    approvedCount: 9,
    assessmentCompleteCount: 9,
  },
  'Legal Office': {
    department: 'Legal Office',
    cycleId: null,
    periodTitle: null,
    status: 'none',
    requiredCount: 0,
    approvedCount: 0,
    assessmentCompleteCount: 0,
  },
};

const mockRecords: Record<string, IPCRRatingRecord[]> = {
  'Office of the City Engineer': [
    {
      id: 'ENG-1',
      department: 'Office of the City Engineer',
      name: 'Cruz, Juan',
      position: 'Civil Engineer',
      period: 'July–December 2026',
      numericalRating: 4.5,
      remarks: '',
      submissionStatus: 'SUBMITTED',
    },
  ],
  'City Health Office': [
    {
      id: 'CHO-1',
      department: 'City Health Office',
      name: 'Reyes, Maria',
      position: 'Medical Officer',
      period: 'January–June 2026',
      numericalRating: 4.8,
      remarks: '',
      submissionStatus: 'SUBMITTED',
    },
  ],
  'Budget Office': [
    {
      id: 'BO-1',
      department: 'Budget Office',
      name: 'Santos, Pedro',
      position: 'Budget Analyst',
      period: 'January–June 2026',
      numericalRating: 4.25,
      remarks: '',
      submissionStatus: 'SUBMITTED',
    },
  ],
  'Legal Office': [],
};

vi.mock('../../../lib/api/sorSemesterSource', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/sorSemesterSource')>()),
  getDepartmentSourceSemester: vi.fn(async (dept: string) => {
    return (
      mockDeptSemesters[dept] ?? {
        department: dept,
        cycleId: null,
        periodTitle: null,
        status: 'none',
        requiredCount: 0,
        approvedCount: 0,
        assessmentCompleteCount: 0,
      }
    );
  }),
  getPublishedRecords: vi.fn(async (dept: string, _cycleId: number) => {
    return mockRecords[dept] ?? [];
  }),
}));

vi.mock('../../../lib/api/competencyGapAnalysis', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/api/competencyGapAnalysis')>();
  return {
    ...actual,
    getActiveHeadcountByDepartment: vi.fn(async () => {
      const map = new Map<string, { name: string; count: number }>();
      map.set('office of the city engineer', { name: 'Office of the City Engineer', count: 20 });
      map.set('city health office', { name: 'City Health Office', count: 15 });
      map.set('budget office', { name: 'Budget Office', count: 10 });
      map.set('legal office', { name: 'Legal Office', count: 5 });
      return map;
    }),
    getActiveOfficeKeys: vi.fn(async () => {
      const map = new Map<string, string>();
      map.set('office of the city engineer', 'Office of the City Engineer');
      map.set('city health office', 'City Health Office');
      map.set('budget office', 'Budget Office');
      map.set('legal office', 'Legal Office');
      return map;
    }),
  };
});

const record = (id: string, department: string, numericalRating: number | null): IPCRRatingRecord => ({
  id,
  department,
  name: `Employee ${id}`,
  position: 'Clerk',
  period: 'January–June 2026',
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

describe('buildDeptCompletionRows with mixed semester publication', () => {
  it('populates published period, older semester flags, and correction_pending correctly', () => {
    const records = [
      record('1', 'Office of the City Engineer', 4.5),
      record('2', 'City Health Office', 4.8),
      record('3', 'Budget Office', 4.25),
    ];
    const testHeadcount = new Map([
      ['office of the city engineer', { name: 'Office of the City Engineer', count: 20 }],
      ['city health office', { name: 'City Health Office', count: 15 }],
      ['budget office', { name: 'Budget Office', count: 10 }],
      ['legal office', { name: 'Legal Office', count: 5 }],
    ]);
    const deptSemesters = new Map<string, DepartmentSourceSemester>([
      ['office of the city engineer', mockDeptSemesters['Office of the City Engineer']],
      ['city health office', mockDeptSemesters['City Health Office']],
      ['budget office', mockDeptSemesters['Budget Office']],
      ['legal office', mockDeptSemesters['Legal Office']],
    ]);

    const rows = buildDeptCompletionRows(records, testHeadcount, true, deptSemesters);
    const rowByDept = new Map(rows.map(r => [r.department, r]));

    const engineer = rowByDept.get('Office of the City Engineer')!;
    expect(engineer.period).toBe('July–December 2026');
    expect(engineer.status).toBe('published');
    expect(engineer.isOlderSemester).toBe(false);

    const health = rowByDept.get('City Health Office')!;
    expect(health.period).toBe('January–June 2026');
    expect(health.status).toBe('published');
    expect(health.isOlderSemester).toBe(true);

    const budget = rowByDept.get('Budget Office')!;
    expect(budget.period).toBe('January–June 2026');
    expect(budget.status).toBe('correction_pending');
    expect(budget.isOlderSemester).toBe(true);

    const legal = rowByDept.get('Legal Office')!;
    expect(legal.period).toBeNull();
    expect(legal.status).toBe('none');
    expect(legal.isOlderSemester).toBe(false);
  });

  it('scopes completion total to the published semester required count rather than post-semester headcount', () => {
    // Engineer has 20 active employees today, but 18 required in the published semester
    const engineerSem: DepartmentSourceSemester = {
      department: 'Office of the City Engineer',
      cycleId: 6,
      periodTitle: 'January–June 2026',
      status: 'published',
      requiredCount: 18,
      approvedCount: 18,
      assessmentCompleteCount: 18,
    };
    const testHeadcount = new Map([
      ['office of the city engineer', { name: 'Office of the City Engineer', count: 20 }],
    ]);
    const deptSemesters = new Map<string, DepartmentSourceSemester>([
      ['office of the city engineer', engineerSem],
    ]);

    const rows = buildDeptCompletionRows([], testHeadcount, true, deptSemesters);
    const engineer = rows.find(r => r.department === 'Office of the City Engineer')!;
    expect(engineer.total).toBe(18);
    expect(engineer.completed).toBe(18);
    expect(engineer.rate).toBe(1.0);
  });

  it('keeps KPIs and group averages independent without leaking across departments', () => {
    const records = [
      record('1', 'Office of the City Engineer', 4.5),
      record('2', 'City Health Office', 4.8),
      record('3', 'Budget Office', 2.5),
    ];

    const kpis = computeKPIs(records);
    expect(kpis.Total).toBe(3);
    expect(kpis['Very Satisfactory']).toBe(1);
    expect(kpis.Outstanding).toBe(1);
    expect(kpis.Unsatisfactory).toBe(1);

    const groups = groupByDept(records);
    expect(groups.get('Office of the City Engineer')?.avg).toBe(4.5);
    expect(groups.get('City Health Office')?.avg).toBe(4.8);
    expect(groups.get('Budget Office')?.avg).toBe(2.5);
  });
});

describe('SummaryOfRatings UI component', () => {
  it('renders department landing with mixed semester publication', async () => {
    await act(async () => {
      render(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(SummaryOfRatings, null),
        ),
      );
    });

    // Check departments are rendered
    expect(await screen.findByText('Office of the City Engineer')).toBeInTheDocument();
    expect(await screen.findByText('City Health Office')).toBeInTheDocument();
    expect(await screen.findByText('Budget Office')).toBeInTheDocument();
    expect(await screen.findByText('Legal Office')).toBeInTheDocument();

    // Check respective published semester labels
    expect(screen.getByText('July–December 2026')).toBeInTheDocument();
    expect(screen.getAllByText('January–June 2026').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('No completed semester')).toBeInTheDocument();

    // Check markers: Previous cycle and Correction pending
    expect(screen.getAllByText('Previous cycle').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Correction pending').length).toBeGreaterThanOrEqual(1);
  });

  it('drills into department with correction_pending marker and displays official score', async () => {
    await act(async () => {
      render(
        React.createElement(
          MemoryRouter,
          null,
          React.createElement(SummaryOfRatings, null),
        ),
      );
    });

    // Drill into Budget Office (which has correction_pending)
    const budgetBtn = await screen.findByText('Budget Office');
    await act(async () => {
      fireEvent.click(budgetBtn);
    });

    // Header displays department name
    expect(await screen.findByRole('heading', { level: 1, name: 'Budget Office' })).toBeInTheDocument();

    // Header subtitle displays Period: January–June 2026
    expect(screen.getByText(/Period: January–June 2026/)).toBeInTheDocument();

    // Explicit warning alert for correction_pending is displayed
    const alert = screen.getByTestId('correction-pending-alert');
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent('Correction pending: one or more records reopened');

    // Official rating is displayed from numericalRating (final_score = 4.25)
    expect(screen.getByText('Santos, Pedro')).toBeInTheDocument();
    expect(screen.getByText('4.25')).toBeInTheDocument();
  });
});
