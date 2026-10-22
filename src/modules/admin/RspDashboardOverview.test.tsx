import { render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RspDashboardOverview, type OverviewApplicant, type OverviewFunnelStage, type OverviewJob } from './RspDashboardOverview';

vi.mock('../../lib/api/succession', () => ({
  getSuccessionDashboardOverview: () =>
    Promise.resolve({
      ok: true,
      data: {
        positions: [
          { id: 'p1', title: 'City Engineer', departmentName: 'Engineering', incumbentName: 'A', incumbentLeavingDate: '2027-03-01', requiredSuccessorsCount: 1, successorCount: 0 },
          { id: 'p2', title: 'City Treasurer', departmentName: 'Finance', incumbentName: 'B', incumbentLeavingDate: null, requiredSuccessorsCount: 2, successorCount: 1 },
          { id: 'p3', title: 'HRMO Head', departmentName: 'HR', incumbentName: 'C', incumbentLeavingDate: null, requiredSuccessorsCount: 1, successorCount: 2 },
        ],
        talentPool: [
          { employeeId: 'e1', departmentName: 'Finance' },
          { employeeId: 'e2', departmentName: 'HR' },
        ],
      },
    }),
}));

const job = (id: number, department: string, status: OverviewJob['status'], created_at: string, applicationDeadline?: string): OverviewJob =>
  ({ id, title: `Job ${id}`, department, status, created_at, applicationDeadline });

const applicant = (id: string, status: string, extra: Partial<OverviewApplicant> = {}): OverviewApplicant => ({
  id,
  full_name: id,
  position: 'Engineer V',
  office: 'Engineering',
  status,
  created_at: '2026-10-01T00:00:00Z',
  ...extra,
});

const stageOf = (status: string) => status as OverviewFunnelStage;

const renderOverview = (applicants: OverviewApplicant[], evaluated = new Set<string>()) =>
  render(
    <RspDashboardOverview
      jobs={[
        job(1, 'Engineering', 'Open', '2026-10-10', '2026-10-20'),
        job(2, 'Engineering', 'Open', '2026-06-01'),
        job(3, 'Finance', 'Reviewing', '2026-09-01'),
      ]}
      applicants={applicants}
      evaluatedApplicantIds={evaluated}
      stageOf={stageOf}
      onOpenJobs={() => {}}
      onOpenApplicants={() => {}}
      onOpenQualified={() => {}}
      onOpenSuccession={() => {}}
      onOpenNewHired={() => {}}
    />,
  );

const statValue = (label: string) => {
  const labelEl = [...document.querySelectorAll('.rd-stat .l')].find((el) => el.textContent === label);
  if (!labelEl) throw new Error(`No stat labelled "${label}"`);
  return (labelEl.closest('.rd-stat') as HTMLElement).querySelector('.v')?.textContent;
};

describe('RspDashboardOverview', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 9, 0));
  });
  afterAll(() => vi.useRealTimers());

  it('derives posting KPIs from status, deadline and posted date', () => {
    renderOverview([]);
    expect(statValue('Open')).toBe('2');
    expect(statValue('Closing ≤ 7d')).toBe('1');
    expect(statValue('Vacant 90d+')).toBe('1');
    expect(statValue('Under review')).toBe('1');
  });

  it('counts the funnel cumulatively in the system order', () => {
    renderOverview([
      applicant('a1', 'pending'),
      applicant('a2', 'shortlisted'),
      applicant('a3', 'qualified'),
      applicant('a4', 'hired'),
      applicant('a5', 'notQualified'),
    ]);
    const funnel = [...document.querySelectorAll('.rd-fun')].map((row) => row.textContent);
    expect(funnel).toEqual(['Received5', 'Shortlisted3', 'Qualified2', 'Hired1']);
    expect(statValue('Unscreened')).toContain('1');
  });

  it('groups scheduled applicants into sessions and flags interviews with no scores', () => {
    renderOverview(
      [
        applicant('a1', 'shortlisted', { exam_date: '2026-10-16', exam_time: '09:00', venue: 'Room 204' }),
        applicant('a2', 'shortlisted', { exam_date: '2026-10-16', exam_time: '09:00' }),
        applicant('a3', 'shortlisted', { interview_date: '2026-10-13', interview_time: '14:00' }),
        applicant('a4', 'shortlisted', { interview_date: '2026-10-12', interview_time: '14:00' }),
      ],
      new Set(['a4']),
    );
    expect(statValue('Sessions this week')).toContain('1');
    expect(statValue('Interview scores not encoded')).toBe('1');
    expect(screen.getByText('Written exam · Engineer V')).toBeTruthy();
    expect(screen.getByText(/2 applicants · Room 204/)).toBeTruthy();
    expect(screen.getByText('Scores missing')).toBeTruthy();
  });

  it('shows succession coverage and risk', async () => {
    renderOverview([]);
    await waitFor(() => expect(statValue('Key positions')).toBe('3'));
    expect(statValue('No successor')).toBe('1');
    expect(statValue('Leaving ≤ 24 mo')).toBe('1');
    expect(statValue('Talent pool')).toBe('2');
    const tables = document.querySelectorAll('.rd-table');
    const firstRow = tables[tables.length - 1].querySelector('tbody tr') as HTMLElement;
    expect(firstRow.textContent).toContain('City Engineer');
    expect(firstRow.textContent).toContain('High');
  });
});
