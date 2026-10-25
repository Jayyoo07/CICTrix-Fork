import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QualifiedApplicantsSection, type ApplicantRecord } from './QualifiedApplicantsSection';

const fetchWrittenExamTotals = vi.fn();
const saveWrittenExamTotal = vi.fn();
vi.mock('../lib/api/examTotalPoints', () => ({
  fetchWrittenExamTotals: (...args: unknown[]) => fetchWrittenExamTotals(...args),
  saveWrittenExamTotal: (...args: unknown[]) => saveWrittenExamTotal(...args),
}));

let role: string | null = 'rsp';
vi.mock('../lib/adminSession', () => ({ getAdminRole: () => role }));

const applicant = (id: string, full_name: string): ApplicantRecord => ({
  id,
  full_name,
  email: `${id}@example.com`,
  contact_number: '',
  position: 'Engineer I',
  office: "City Engineer's Office",
  status: 'Shortlisted',
  created_at: '2026-10-01',
  total_score: null,
  exam_date: '2026-10-20',
});

const applicants = [applicant('1', 'Ana Cruz'), applicant('2', 'Ben Lim')];

const openExamModal = async () => {
  render(<MemoryRouter><QualifiedApplicantsSection applicants={applicants} completedEvaluationIds={new Set()} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: /Exam Score/ }));
  return screen.getByRole('heading', { name: 'Written Examination Scores' }).closest('div[style]') as HTMLElement;
};

describe('Written exam total points', () => {
  beforeEach(() => {
    role = 'rsp';
    localStorage.clear();
    fetchWrittenExamTotals.mockResolvedValue({ ok: true, totals: { 'Engineer I': 50 } });
    saveWrittenExamTotal.mockResolvedValue({ ok: true });
  });

  it('shows the configured total in the folder table', async () => {
    render(<MemoryRouter><QualifiedApplicantsSection applicants={applicants} completedEvaluationIds={new Set()} /></MemoryRouter>);
    const row = (await screen.findByRole('cell', { name: /Engineer I/ })).closest('tr') as HTMLElement;
    await waitFor(() => expect(within(row).getByText('50')).toBeTruthy());
  });

  it('rejects a score above the total with an inline error', async () => {
    await openExamModal();
    fireEvent.change(await screen.findByLabelText('Written exam score for Ana Cruz, out of 50'), { target: { value: '60' } });
    expect(screen.getByText('Score cannot exceed the total points (50).')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Save Scores/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('blocks lowering the total below an entered score and names the applicant', async () => {
    await openExamModal();
    fireEvent.change(await screen.findByLabelText('Written exam score for Ana Cruz, out of 50'), { target: { value: '45' } });
    fireEvent.change(screen.getByLabelText('Total points'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Total' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Ana Cruz (45)');
    expect(saveWrittenExamTotal).not.toHaveBeenCalled();
  });

  it('saves a valid new total', async () => {
    await openExamModal();
    fireEvent.change(await screen.findByLabelText('Total points'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Total' }));
    await waitFor(() => expect(saveWrittenExamTotal).toHaveBeenCalledWith('Engineer I', 60));
    expect(await screen.findByText('Total points updated to 60.')).toBeTruthy();
  });

  it('tells the user the total was not changed when saving fails', async () => {
    saveWrittenExamTotal.mockResolvedValue({ ok: false, error: new Error('offline') });
    await openExamModal();
    fireEvent.change(await screen.findByLabelText('Total points'), { target: { value: '60' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update Total' }));
    expect((await screen.findByRole('alert')).textContent).toContain('The total was not changed');
  });

  it('is read-only for roles other than RSP', async () => {
    role = 'super-admin';
    await openExamModal();
    const input = (await screen.findByLabelText('Total points')) as HTMLInputElement;
    expect(input.readOnly).toBe(true);
    expect(screen.queryByRole('button', { name: 'Update Total' })).toBeNull();
  });
});
