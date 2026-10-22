import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JobPosting } from '../types/recruitment.types';

vi.mock('../lib/recruitmentData', () => ({
  formatPHDate: (value: string) => value.slice(0, 10),
}));

import { JobVacanciesPanel } from './JobVacanciesPanel';

const position = (id: string, title: string, status: JobPosting['status'], extra: Partial<JobPosting> = {}) => ({
  id,
  title,
  status,
  department: 'City Engineering Office',
  salaryGrade: 19,
  monthlySalary: 51357,
  employmentStatus: 'Permanent',
  eligibility: 'RA 1080 (Civil Engineer)',
  training: '8 hours',
  applicationDeadline: '',
  postedDate: '2026-10-10T00:00:00.000Z',
  qualifications: { education: 'BS Civil Engineering', experience: { years: 2, field: 'Engineering' }, skills: [], certifications: [] },
  plantillaSlots: [{ id: `${id}-s1`, jobPostingId: id, slotNumber: 1, label: `Plantilla ${id.charCodeAt(0)}`, itemNumber: 'PLT-x', status: 'open' }],
  ...extra,
}) as unknown as JobPosting;

const jobs = [
  position('a', 'Engineer III', 'Active', { applicationDeadline: '2099-11-15' }),
  position('b', 'Engineer II', 'Active', { applicationDeadline: '2020-01-01' }), // deadline passed
  position('c', 'Engineer I', 'Closed'),
  position('d', 'Nurse II', 'Draft', { department: 'City Health Office' }),
];

const renderPanel = (overrides: Partial<Parameters<typeof JobVacanciesPanel>[0]> = {}) => {
  const props = {
    jobs,
    loading: false,
    applicantCounts: new Map([['a', 7]]),
    activeVacancies: new Map([['a', { jobPostingId: 'a', openedOn: '2026-10-20', deadline: '2099-11-15' }]]),
    onOpenVacancy: vi.fn().mockResolvedValue(true),
    onClose: vi.fn(),
    onDetails: vi.fn(),
    onApplicants: vi.fn(),
    onCreatePosition: vi.fn(),
    ...overrides,
  };
  render(<JobVacanciesPanel {...props} />);
  return props;
};

describe('JobVacanciesPanel', () => {
  it('lists only open vacancies, with date opened and applicants', () => {
    renderPanel();
    const table = screen.getByRole('table');
    const row = within(table).getByText('Engineer III').closest('tr') as HTMLElement;
    expect(within(row).getByText('2026-10-20')).toBeTruthy();
    expect(within(row).getByText('7')).toBeTruthy();
    expect(within(table).queryByText('Engineer II')).toBeNull();
    expect(within(table).queryByText('Engineer I')).toBeNull();
    expect(within(table).queryByText('Nurse II')).toBeNull();
  });

  it('shows the empty state when nothing is open', () => {
    renderPanel({ jobs: [jobs[2], jobs[3]] });
    expect(screen.getByText(/No open vacancies\. Click 'Open Vacant Job Position' to open one\./)).toBeTruthy();
  });

  it('closes, opens details and applicants from the row', () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Close Vacancy/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Applicants' }));
    expect(props.onClose).toHaveBeenCalledWith(jobs[0]);
    expect(props.onDetails).toHaveBeenCalledWith(jobs[0]);
    expect(props.onApplicants).toHaveBeenCalledWith(jobs[0]);
    expect(screen.queryByRole('button', { name: /Edit Deadline/ })).toBeNull();
  });

  it('offers closed positions and shows open ones as Already open', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Open Vacant Job Position/ }));
    fireEvent.change(screen.getByRole('combobox', { name: /Job position/ }), { target: { value: 'e' } });

    const options = screen.getAllByRole('option');
    const open = options.find((o) => o.textContent?.includes('Engineer III'));
    const expired = options.find((o) => o.textContent?.includes('Engineer II') && !o.textContent?.includes('III'));
    expect(open?.getAttribute('aria-disabled')).toBe('true');
    expect(open?.textContent).toContain('Already open');
    expect(expired?.getAttribute('aria-disabled')).toBe('false');
  });

  it('says when no closed position matches and links to Create Job Position', () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Open Vacant Job Position/ }));
    fireEvent.change(screen.getByRole('combobox', { name: /Job position/ }), { target: { value: 'zzz' } });
    expect(screen.getByText('No matching job position found.')).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Create Job Position' }));
    expect(props.onCreatePosition).toHaveBeenCalled();
  });

  it('opens a picked position with a deadline, date opened and remarks', async () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Open Vacant Job Position/ }));
    fireEvent.change(screen.getByRole('combobox', { name: /Job position/ }), { target: { value: 'nur' } });
    fireEvent.mouseDown(screen.getByRole('option', { name: /Nurse II/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('SG 19 · ₱51,357')).toBeTruthy();
    const submit = screen.getByRole('button', { name: 'Open Vacancy' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Application deadline/), { target: { value: '2020-01-01' } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Application deadline/), { target: { value: '2099-12-01' } });
    fireEvent.change(screen.getByLabelText(/Date opened/), { target: { value: '2099-11-01' } });
    fireEvent.change(screen.getByLabelText(/Remarks/), { target: { value: 'Second call' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await vi.waitFor(() => expect(props.onOpenVacancy).toHaveBeenCalledWith(jobs[3], {
      deadline: '2099-12-01', openedOn: '2099-11-01', remarks: 'Second call',
    }));
  });
});
