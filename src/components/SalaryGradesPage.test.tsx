import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalaryGradeRow } from '../lib/api/salaryGrades';
import { SalaryGradesPage } from './SalaryGradesPage';

vi.mock('./AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('./Sidebar', () => ({ Sidebar: () => null }));

/** Count queries for the impact line: 3 job posts + 2 plantilla items per grade. */
const countQuery = (count: number) => ({ select: () => ({ eq: () => Promise.resolve({ count }) }) });
vi.mock('../lib/supabase', () => ({
  supabase: { from: (table: string) => countQuery(table === 'job_postings' ? 3 : 2) },
}));

const listSalaryGrades = vi.fn();
const updateSalaryStep = vi.fn();
const addSalaryStep = vi.fn();
const deleteSalaryStep = vi.fn();
vi.mock('../lib/api/salaryGrades', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/api/salaryGrades')>()),
  listSalaryGrades: () => listSalaryGrades(),
  updateSalaryStep: (...a: unknown[]) => updateSalaryStep(...a),
  addSalaryStep: (...a: unknown[]) => addSalaryStep(...a),
  deleteSalaryStep: (...a: unknown[]) => deleteSalaryStep(...a),
}));

/** The full CSC schedule: SG 1–33, Step 1 only, except SG 2 which also has Step 2. */
const schedule: SalaryGradeRow[] = Array.from({ length: 33 }, (_, i) => {
  const grade = i + 1;
  const amount = 10000 + grade * 1000;
  const steps = [{ salaryGrade: grade, step: 1, monthlySalary: amount, updatedAt: null }];
  if (grade === 2) steps.push({ salaryGrade: 2, step: 2, monthlySalary: 12500, updatedAt: null });
  return { salaryGrade: grade, steps, hiringRate: amount, lastUpdated: null };
});

const renderPage = async () => {
  render(
    <MemoryRouter>
      <SalaryGradesPage />
    </MemoryRouter>,
  );
  await screen.findByText('SG 1');
};

const gradesShown = () => screen.getAllByRole('rowheader').map((cell) => cell.textContent);

const openDrawer = (grade: number) => {
  fireEvent.click(screen.getByRole('button', { name: `Edit SG ${grade}` }));
  return screen.getByRole('dialog', { name: `Edit SG ${grade}` });
};

beforeEach(() => {
  vi.clearAllMocks();
  listSalaryGrades.mockResolvedValue({ ok: true, data: schedule });
  updateSalaryStep.mockResolvedValue({ ok: true, data: {} });
  addSalaryStep.mockResolvedValue({ ok: true, data: {} });
  deleteSalaryStep.mockResolvedValue({ ok: true, data: true });
});

describe('SalaryGradesPage table', () => {
  it('is read-only and shows formatted amounts, with a dash for unset steps', async () => {
    await renderPage();

    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    const sg1 = screen.getByRole('rowheader', { name: 'SG 1' }).closest('tr')!;
    expect(within(sg1).getByText('₱11,000')).toBeInTheDocument();
    expect(within(sg1).getAllByLabelText('Not set')).toHaveLength(7);
  });

  it('shows the first 10 grades and the entries count', async () => {
    await renderPage();

    expect(gradesShown()).toEqual(Array.from({ length: 10 }, (_, i) => `SG ${i + 1}`));
    expect(screen.getByText('Showing 1–10 of 33 entries')).toBeInTheDocument();
    const pager = screen.getByRole('navigation', { name: 'Salary grade pages' });
    expect(within(pager).getByRole('button', { name: 'Previous' })).toBeDisabled();
    expect(within(pager).getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page');
  });

  it('moves between pages with Next and the page numbers', async () => {
    await renderPage();

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(gradesShown()[0]).toBe('SG 11');

    fireEvent.click(screen.getByRole('button', { name: 'Page 4' }));
    expect(gradesShown()).toEqual(['SG 31', 'SG 32', 'SG 33']);
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('search filters by grade number and returns to page 1', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Page 3' }));

    fireEvent.change(screen.getByPlaceholderText('Find SG…'), { target: { value: 'SG 3' } });
    expect(gradesShown()).toEqual(['SG 3', 'SG 30', 'SG 31', 'SG 32', 'SG 33']);
    expect(screen.queryByRole('navigation', { name: 'Salary grade pages' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('Find SG…'), { target: { value: '40' } });
    expect(screen.getByText(/No grade matches "40"/)).toBeInTheDocument();
  });
});

describe('SalaryGradesPage edit drawer', () => {
  it('opens for one grade and closes with Cancel and Esc without saving', async () => {
    await renderPage();

    let drawer = openDrawer(1);
    expect(within(drawer).getByLabelText(/Step 1/)).toHaveValue(11000);
    fireEvent.click(within(drawer).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    drawer = openDrawer(1);
    fireEvent.keyDown(drawer, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(updateSalaryStep).not.toHaveBeenCalled();
  });

  it('keeps Save disabled until something changes, and blocks an empty Step 1', async () => {
    await renderPage();
    const drawer = openDrawer(1);
    const save = within(drawer).getByRole('button', { name: 'Save SG 1' });
    expect(save).toBeDisabled();

    fireEvent.change(within(drawer).getByLabelText(/Step 1/), { target: { value: '' } });
    expect(within(drawer).getByText(/Step 1 is required/)).toBeInTheDocument();
    expect(save).toBeDisabled();
  });

  it('shows the job-post impact before a Step 1 change, then saves it', async () => {
    await renderPage();
    const drawer = openDrawer(1);

    fireEvent.change(within(drawer).getByLabelText(/Step 1/), { target: { value: '12000' } });
    expect(await within(drawer).findByText(/Saving updates 5 job posts and plantilla items at SG 1 to ₱12,000/)).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole('button', { name: 'Save SG 1' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(updateSalaryStep).toHaveBeenCalledWith(1, 1, 12000);
    expect(screen.getByText('SG 1 saved.')).toBeInTheDocument();
  });

  it('adds filled steps and removes cleared ones, without a Step 1 warning', async () => {
    await renderPage();
    const drawer = openDrawer(2);

    fireEvent.change(within(drawer).getByLabelText('Step 2'), { target: { value: '' } });
    fireEvent.change(within(drawer).getByLabelText('Step 3'), { target: { value: '13000' } });
    expect(within(drawer).queryByText(/Saving updates/)).not.toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole('button', { name: 'Save SG 2' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(deleteSalaryStep).toHaveBeenCalledWith(2, 2);
    expect(addSalaryStep).toHaveBeenCalledWith(2, 3, 13000);
    expect(updateSalaryStep).not.toHaveBeenCalled();
  });

  it('stays open and names the step when a save fails', async () => {
    addSalaryStep.mockResolvedValue({ ok: false, error: 'permission denied' });
    await renderPage();
    const drawer = openDrawer(1);

    fireEvent.change(within(drawer).getByLabelText('Step 2'), { target: { value: '11500' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save SG 1' }));

    // Names the step and explains it in plain language; the database text stays in the console.
    const message = await within(drawer).findByText(/Step 2 was not saved/);
    expect(message.textContent).toContain("You don't have permission");
    expect(message.textContent).not.toContain('permission denied');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
