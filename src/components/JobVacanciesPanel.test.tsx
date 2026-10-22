import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JobPosting } from '../types/recruitment.types';

vi.mock('../lib/recruitmentData', () => ({
  formatPHDate: (value: string) => value.slice(0, 10),
}));
vi.mock('../hooks/useSalarySchedule', () => ({ useSalarySchedule: () => [] }));

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
  plantillaSlots: [{ id: `${id}-s1`, jobPostingId: id, slotNumber: 1, label: 'Plantilla 21', itemNumber: 'PLT-x', status: 'open' }],
  ...extra,
}) as unknown as JobPosting;

const jobs = [
  position('a', 'Engineer III', 'Active', { applicationDeadline: '2099-11-15' }),
  position('b', 'Engineer II', 'Filled'),
  position('c', 'Engineer I', 'Draft'),
  position('d', 'Nurse II', 'Draft', { department: 'City Health Office' }),
];

const renderPanel = (overrides: Partial<Parameters<typeof JobVacanciesPanel>[0]> = {}) => {
  const props = {
    jobs,
    loading: false,
    onOpenVacancy: vi.fn().mockResolvedValue(undefined),
    onUpdateDeadline: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<JobVacanciesPanel {...props} />);
  return props;
};

describe('JobVacanciesPanel', () => {
  it('lists only opened vacancies, not unopened positions', () => {
    renderPanel();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Engineer III')).toBeTruthy();
    expect(within(table).queryByText('Engineer I')).toBeNull();
    expect(within(table).queryByText('Nurse II')).toBeNull();
  });

  it('leaves filled plantillas out, and drops a posting once all of them are filled', () => {
    const slot = (id: string, n: number, status: 'open' | 'filled') =>
      ({ id: `${id}-${n}`, jobPostingId: id, slotNumber: n, label: `Plantilla ${n}`, itemNumber: `PLT-${id}-${n}`, status });
    renderPanel({
      jobs: [
        position('m', 'Clerk II', 'Active', { plantillaSlots: [slot('m', 31, 'open'), slot('m', 32, 'filled')] }),
        position('f', 'Administrative Aide IV (Clerk II)', 'Active', { plantillaSlots: [slot('f', 40, 'filled')] }),
      ],
    });
    const table = screen.getByRole('table');
    const row = within(table).getByText('Clerk II').closest('tr') as HTMLElement;
    expect(within(row).getByText('31')).toBeTruthy();
    expect(within(row).queryByText(/32/)).toBeNull();
    expect(within(table).queryByText('Administrative Aide IV (Clerk II)')).toBeNull();
  });

  it('suggests positions from one typed letter and blocks open or filled ones', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Open Vacant Job Position/ }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'e' } });

    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Engineer I'), expect.stringContaining('Engineer III')]),
    );
    const open = options.find((o) => o.textContent?.includes('Already open'));
    const filled = options.find((o) => o.textContent?.includes('Filled'));
    expect(open?.getAttribute('aria-disabled')).toBe('true');
    expect(filled?.getAttribute('aria-disabled')).toBe('true');
  });

  it('fills read-only details from the position and only asks for the deadline', async () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Open Vacant Job Position/ }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'nur' } });
    fireEvent.mouseDown(screen.getByRole('option', { name: /Nurse II/ }));

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('SG 19 · ₱51,357')).toBeTruthy();
    expect(within(dialog).getByText('Plantilla 21')).toBeTruthy();
    const submit = screen.getByRole('button', { name: 'Open Vacancy' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Application deadline/), { target: { value: '2099-12-01' } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await vi.waitFor(() => expect(props.onOpenVacancy).toHaveBeenCalledWith(jobs[3], '2099-12-01'));
  });

  it('edits only the deadline of an open vacancy', () => {
    const props = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /Edit Deadline/ }));
    expect(screen.queryByRole('combobox')).toBeNull();
    fireEvent.change(screen.getByLabelText(/Application deadline/), { target: { value: '2099-12-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Deadline' }));
    return vi.waitFor(() => expect(props.onUpdateDeadline).toHaveBeenCalledWith(jobs[0], '2099-12-20'));
  });
});
