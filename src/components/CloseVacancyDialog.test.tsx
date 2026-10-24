import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JobPosting } from '../types/recruitment.types';

vi.mock('../lib/recruitmentData', () => ({
  formatPHDate: (value: string) => value.slice(0, 10),
}));
vi.mock('../lib/supabase', () => ({ supabase: {} }));

import { CloseVacancyDialog } from './CloseVacancyDialog';

const job = { id: 'a', title: 'Engineer III', status: 'Active', applicationDeadline: '2099-11-15' } as JobPosting;

describe('CloseVacancyDialog', () => {
  it('names the position and deadline', () => {
    render(<CloseVacancyDialog job={job} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole('heading', { name: 'Close this vacancy early?' })).toBeTruthy();
    expect(screen.getByText(/before its deadline of 2099-11-15\. Existing applications will be kept\./)).toBeTruthy();
  });

  it('needs a reason, and remarks when the reason is Other', async () => {
    const onConfirm = vi.fn().mockResolvedValue(true);
    render(<CloseVacancyDialog job={job} onCancel={vi.fn()} onConfirm={onConfirm} />);
    const submit = screen.getByRole('button', { name: 'Close Vacancy' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText(/Reason for closing/), { target: { value: 'Other' } });
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Remarks/), { target: { value: 'Reorganisation' } });
    expect(submit.disabled).toBe(false);

    fireEvent.click(submit);
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Other', 'Reorganisation'));
  });

  it('closes without remarks for a listed reason', async () => {
    const onConfirm = vi.fn().mockResolvedValue(true);
    render(<CloseVacancyDialog job={job} onCancel={vi.fn()} onConfirm={onConfirm} />);
    fireEvent.change(screen.getByLabelText(/Reason for closing/), { target: { value: 'Sufficient applicants' } });
    fireEvent.click(screen.getByRole('button', { name: 'Close Vacancy' }));
    await vi.waitFor(() => expect(onConfirm).toHaveBeenCalledWith('Sufficient applicants', ''));
  });
});
