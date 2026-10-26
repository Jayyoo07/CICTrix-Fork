import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { QualifiedApplicantsSection, type ApplicantRecord } from './QualifiedApplicantsSection';

vi.mock('../lib/api/examTotalPoints', () => ({
  fetchWrittenExamTotals: vi.fn().mockResolvedValue({ ok: true, totals: {} }),
  saveWrittenExamTotal: vi.fn(),
}));
vi.mock('../lib/adminSession', () => ({ getAdminRole: () => 'rsp' }));

const applicants: ApplicantRecord[] = [{
  id: '1', full_name: 'Ana Cruz', email: 'a@x.ph', contact_number: '', position: 'Engineer I',
  office: "City Engineer's Office", status: 'Shortlisted', created_at: '2026-10-01', total_score: null,
}];

describe('Applicant Score folder Back button', () => {
  it('returns from a position folder to the folder list', async () => {
    render(<MemoryRouter><QualifiedApplicantsSection applicants={applicants} completedEvaluationIds={new Set()} /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('cell', { name: /Engineer I/ }));
    expect(await screen.findByRole('heading', { name: 'Engineer I' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('heading', { name: 'Engineer I' })).not.toBeInTheDocument();
    expect(await screen.findByText('Total Qualified Applicants')).toBeInTheDocument();
  });
});
