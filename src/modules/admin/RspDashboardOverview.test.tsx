import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RspDashboardOverview, type OverviewApplicant, type OverviewFunnelStage, type OverviewJob } from './RspDashboardOverview';

const BASE_POSITIONS = [
  { id: 'p3', title: 'HRMO Head', departmentId: 'd-hr', departmentName: 'HR', incumbentName: 'C', incumbentLeavingDate: null, successorCount: 2 },
  { id: 'p2', title: 'City Treasurer', departmentId: 'd-fin', departmentName: 'Finance', incumbentName: 'B', incumbentLeavingDate: null, successorCount: 1 },
  { id: 'p4', title: 'City Assessor', departmentId: 'd-fin', departmentName: 'Finance', incumbentName: 'D', incumbentLeavingDate: null, successorCount: null },
  { id: 'p1', title: 'City Engineer', departmentId: 'd-eng', departmentName: 'Engineering', incumbentName: 'A', incumbentLeavingDate: '2027-03-01', successorCount: 0 },
];

// Swapped per test: the View all modal needs more rows than the card shows.
const succession = vi.hoisted(() => ({ positions: [] as unknown[] }));

vi.mock('../../lib/api/succession', () => ({
  getSuccessionDashboardOverview: () =>
    Promise.resolve({
      ok: true,
      data: {
        positions: succession.positions,
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

const handlers = {
  onOpenJobs: vi.fn(),
  onOpenApplicants: vi.fn(),
  onOpenQualified: vi.fn(),
  onOpenNewHired: vi.fn(),
  onOpenSuccessionPosition: vi.fn(),
};

const renderOverview = (applicants: OverviewApplicant[], evaluated = new Set<string>()) =>
  render(
    <MemoryRouter>
    <RspDashboardOverview
      jobs={[
        job(1, 'Engineering', 'Open', '2026-10-10', '2026-10-20'),
        job(2, 'Engineering', 'Open', '2026-06-01'),
        job(3, 'Finance', 'Reviewing', '2026-09-01'),
      ]}
      applicants={applicants}
      evaluatedApplicantIds={evaluated}
      stageOf={stageOf}
      onOpenJobs={handlers.onOpenJobs}
      onOpenApplicants={handlers.onOpenApplicants}
      onOpenQualified={handlers.onOpenQualified}
      onOpenSuccession={() => {}}
      onOpenSuccessionPosition={handlers.onOpenSuccessionPosition}
      onOpenNewHired={handlers.onOpenNewHired}
    />
    </MemoryRouter>,
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
  beforeEach(() => {
    succession.positions = BASE_POSITIONS;
  });

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

  it('opens the list behind each applicant tile and funnel row', () => {
    Object.values(handlers).forEach((fn) => fn.mockClear());
    renderOverview([applicant('a1', 'pending')]);
    const card = screen.getByRole('heading', { name: 'Applicants' }).closest('.rd-card') as HTMLElement;
    const click = (name: RegExp) => fireEvent.click(within(card).getByRole('button', { name }));

    click(/^All applicants/);
    click(/^This quarter/);
    click(/^Unscreened/);
    click(/^Received/);
    click(/^Shortlisted/);
    expect(handlers.onOpenApplicants).toHaveBeenCalledTimes(5);

    click(/^Per vacancy/);
    expect(handlers.onOpenJobs).toHaveBeenCalledTimes(1);

    within(card).getAllByRole('button', { name: /^Qualified/ }).forEach((button) => fireEvent.click(button));
    expect(handlers.onOpenQualified).toHaveBeenCalledTimes(2);

    click(/^Hired/);
    expect(handlers.onOpenNewHired).toHaveBeenCalledTimes(1);
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

  it('lists key positions with ranked successor counts, fewest first', async () => {
    renderOverview([]);
    await screen.findByRole('link', { name: /Open City Engineer/ });
    const rows = screen.getAllByRole('link', { name: /^Open / }).map((row) => [
      row.querySelector('.rd-pri')?.textContent,
      row.querySelector('td.n')?.textContent?.trim(),
    ]);
    // A count the engine could not compute shows "—" and sorts last.
    expect(rows).toEqual([['City Engineer', '0'], ['City Treasurer', '1'], ['HRMO Head', '2'], ['City Assessor', '—']]);
    const headers = [...document.querySelectorAll('.rd-table')].pop()!.querySelectorAll('th');
    expect([...headers].map((th) => th.textContent)).toEqual(['Key position', 'Incumbent leaves', 'Successors', 'Open']);
    expect(document.querySelector('.rd-sec:last-child .rd-stat')).toBeNull();
    expect(screen.queryByRole('button', { name: /View all/ })).toBeNull();
  });

  it('opens a key position on the Succession Planning page', async () => {
    handlers.onOpenSuccessionPosition.mockClear();
    renderOverview([]);
    fireEvent.click(await screen.findByRole('link', { name: /Open City Treasurer/ }));
    expect(handlers.onOpenSuccessionPosition).toHaveBeenCalledWith('d-fin', 'p2');
    fireEvent.keyDown(screen.getByRole('link', { name: /Open HRMO Head/ }), { key: 'Enter' });
    expect(handlers.onOpenSuccessionPosition).toHaveBeenLastCalledWith('d-hr', 'p3');
  });

  it('lists every key position in the View all modal with search and pages', async () => {
    handlers.onOpenSuccessionPosition.mockClear();
    succession.positions = [
      ...BASE_POSITIONS,
      ...Array.from({ length: 9 }, (_, i) => ({
        id: `x${i}`, title: `Engineer ${i + 1}`, departmentId: 'd-eng', departmentName: 'Engineering',
        incumbentName: null, incumbentLeavingDate: null, successorCount: 3,
      })),
    ];
    renderOverview([]);
    fireEvent.click(await screen.findByRole('button', { name: 'View all (13) →' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Showing 1–8 of 13 entries')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '2' }));
    expect(within(dialog).getByText('Showing 9–13 of 13 entries')).toBeTruthy();

    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'treasurer' } });
    expect(within(dialog).getByText('Showing 1–1 of 1 entries')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('link', { name: /Open City Treasurer/ }));
    expect(handlers.onOpenSuccessionPosition).toHaveBeenCalledWith('d-fin', 'p2', { replace: true });
  });
});
