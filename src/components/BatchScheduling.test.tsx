import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PendingAssignmentList } from './PendingAssignmentList';
import { ScheduleApplicantsModal } from './ScheduleApplicantsModal';
import type { ApplicantRecord } from './QualifiedApplicantsSection';

const scheduleApplicantsBatch = vi.fn();
vi.mock('../lib/applicantSchedule', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/applicantSchedule')>()),
  fetchActiveInterviewers: async () => [],
  scheduleApplicantsBatch: (...args: unknown[]) => scheduleApplicantsBatch(...args),
}));

const applicant = (id: string, full_name: string, position: string, office: string): ApplicantRecord => ({
  id,
  full_name,
  email: `${id}@example.com`,
  contact_number: '',
  position,
  office,
  status: 'Shortlisted',
  created_at: '2026-10-01',
  total_score: null,
  reference_no: `REF-${id}`,
});

const applicants = [
  applicant('1', 'Ana Cruz', 'Engineer I', "City Engineer's Office"),
  applicant('2', 'Ben Lim', 'Engineer I', "City Engineer's Office"),
  applicant('3', 'Cara Dee', 'Budget Officer', 'City Budget Office'),
];

const renderPending = (rows: ApplicantRecord[] = applicants, completed: string[] = []) =>
  render(<PendingAssignmentList applicants={rows} completedEvaluationIds={new Set(completed)} />);

const selectedCount = () => screen.getByText(/applicants? selected/).textContent;
const filterDepartment = (value: string) =>
  fireEvent.change(screen.getByDisplayValue('All Departments'), { target: { value } });

describe('PendingAssignmentList', () => {
  it('lists every pending applicant in one table, with no levels to open', () => {
    renderPending();
    expect(screen.getAllByRole('row')).toHaveLength(applicants.length + 1);
    expect(screen.getByText('Cara Dee')).toBeTruthy();
  });

  it('leaves out Disqualified and Not Qualified applicants, even with a completed evaluation', () => {
    renderPending(
      [
        ...applicants,
        { ...applicant('4', 'Dan Out', 'Engineer I', "City Engineer's Office"), status: 'Disqualified' },
        { ...applicant('5', 'Eve Out', 'Engineer I', "City Engineer's Office"), status: 'Not Qualified' },
      ],
      ['4'],
    );
    expect(screen.queryByText('Dan Out')).toBeNull();
    expect(screen.queryByText('Eve Out')).toBeNull();
    expect(screen.getByText('Ana Cruz')).toBeTruthy();
  });

  it('selects only the filtered rows from the header checkbox', () => {
    renderPending();
    filterDepartment("City Engineer's Office");
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all 2 matching applicants' }));
    expect(selectedCount()).toBe('2 applicants selected');
  });

  it('keeps a selection when the filters change', () => {
    renderPending();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Cara Dee' }));
    filterDepartment("City Engineer's Office");
    expect(screen.queryByText('Cara Dee')).toBeNull();
    expect(selectedCount()).toBe('1 applicant selected');
    const header = screen.getByRole('checkbox', { name: 'Select all 2 matching applicants' }) as HTMLInputElement;
    expect(header.checked).toBe(false);
    expect(header.indeterminate).toBe(false);
  });
});

describe('ScheduleApplicantsModal', () => {
  const raters = [{ email: 'rater@example.com', name: 'Rita Rater', designation: '' }];

  it('rejects a past date without saving', () => {
    render(<ScheduleApplicantsModal applicants={applicants} raters={raters} onCancel={vi.fn()} onScheduled={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^Interview date/), { target: { value: '2000-01-01' } });
    fireEvent.change(screen.getByLabelText(/Assigned rater/), { target: { value: 'rater@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Schedule' }));

    expect(screen.getByRole('alert').textContent).toMatch(/interview date cannot be in the past/);
    expect(scheduleApplicantsBatch).not.toHaveBeenCalled();
  });

  it('requires the oral exam date', () => {
    render(<ScheduleApplicantsModal applicants={applicants} raters={raters} onCancel={vi.fn()} onScheduled={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/^Interview date/), { target: { value: '2099-01-15' } });
    fireEvent.change(screen.getByLabelText(/Assigned rater/), { target: { value: 'rater@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Schedule' }));

    expect(screen.getByRole('alert').textContent).toMatch(/Choose the oral examination date/);
    expect(scheduleApplicantsBatch).not.toHaveBeenCalled();
  });

  it('summarises the selection by position', () => {
    render(<ScheduleApplicantsModal applicants={applicants} raters={raters} onCancel={vi.fn()} onScheduled={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Schedule Applicants' });
    expect(within(dialog).getByText(/3 applicants across 2 positions/)).toBeTruthy();
  });

  it('sends the selection with the chosen session time and reports success', async () => {
    scheduleApplicantsBatch.mockResolvedValueOnce({ success: true, scheduled: 3, advanced: 3 });
    const onScheduled = vi.fn();
    render(<ScheduleApplicantsModal applicants={applicants} raters={raters} onCancel={vi.fn()} onScheduled={onScheduled} />);

    fireEvent.change(screen.getByLabelText(/^Interview date/), { target: { value: '2099-01-15' } });
    fireEvent.click(screen.getByLabelText('Interview: Afternoon (1:00 PM)'));
    fireEvent.change(screen.getByLabelText(/^Oral examination date/), { target: { value: '2099-01-16' } });
    fireEvent.change(screen.getByLabelText(/Assigned rater/), { target: { value: 'rater@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Schedule' }));

    await waitFor(() => expect(onScheduled).toHaveBeenCalled());
    expect(scheduleApplicantsBatch).toHaveBeenCalledWith(expect.objectContaining({
      interviewDate: '2099-01-15',
      interviewTime: '13:00',
      oralExamDate: '2099-01-16',
      oralExamTime: '08:00',
      raterEmail: 'rater@example.com',
      applicants: applicants.map((a) => ({ id: a.id, status: a.status })),
    }));
    expect(onScheduled.mock.calls[0][0]).toMatch(/Scheduled 3 applicants with Rita Rater: interview Jan 15, 2099, 1:00 PM; oral exam Jan 16, 2099, 8:00 AM/);
  });
});
