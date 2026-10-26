import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QualifiedApplicantsSection, type ApplicantRecord } from './QualifiedApplicantsSection';

vi.mock('../lib/api/examTotalPoints', () => ({
  fetchWrittenExamTotals: vi.fn().mockResolvedValue({ ok: true, totals: {} }),
  saveWrittenExamTotal: vi.fn(),
}));
vi.mock('../lib/adminSession', () => ({ getAdminRole: () => 'rsp' }));
vi.mock('../lib/documentViewing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/documentViewing')>();
  return { ...actual, listApplicantDocumentAttachments: vi.fn(), prepareDocumentPreview: vi.fn(), downloadPreparedDocument: vi.fn() };
});

import { downloadPreparedDocument, listApplicantDocumentAttachments, prepareDocumentPreview } from '../lib/documentViewing';

const applicant: ApplicantRecord = {
  id: 'a1', full_name: 'Ana Cruz', email: 'a1@example.com', contact_number: '', position: 'Engineer I',
  office: "City Engineer's Office", status: 'Shortlisted', created_at: '2026-10-01', total_score: null, exam_date: '2026-10-20',
};
const cv = { id: 'cv', file_name: 'Cruz-CV.pdf', file_path: 'a1/cv.pdf', file_type: 'application/pdf', document_type: 'curriculum_vitae', created_at: '2026-10-02T00:00:00Z', file_size: 2048 };
const serviceRecord = { id: 'sr', file_name: 'Cruz-Service-Record.pdf', file_path: 'a1/sr.pdf', file_type: 'application/pdf', document_type: 'service_record', created_at: '2026-10-03T00:00:00Z', file_size: 1536 };
const tor = { id: 'dip', file_name: 'Cruz-TOR.pdf', file_path: 'a1/dip.pdf', file_type: 'application/pdf', document_type: 'transcript_of_records', created_at: '2026-10-04T00:00:00Z', file_size: 3 * 1048576 };

const openScores = async () => {
  render(<MemoryRouter><QualifiedApplicantsSection applicants={[applicant]} completedEvaluationIds={new Set()} /></MemoryRouter>);
  fireEvent.click((await screen.findByRole('cell', { name: /Engineer I/ })).closest('tr') as HTMLElement);
  fireEvent.click(await screen.findByRole('button', { name: /Open scores for Ana Cruz/ }));
  return screen.findByRole('dialog');
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(listApplicantDocumentAttachments).mockResolvedValue([serviceRecord, cv, tor]);
  vi.mocked(prepareDocumentPreview).mockImplementation(async (source) => ({ url: 'blob:fixture', blob: new Blob(['x']), kind: 'pdf', fileName: source.fileName, dispose: vi.fn() }));
  vi.spyOn(window, 'open').mockReturnValue(null);
});

describe('scoring modal documents', () => {
  it('opens the CV straight in the in-site viewer from the Experience card', async () => {
    await openScores();
    const button = await screen.findByRole('button', { name: 'View Experience documents' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByTitle('Cruz-CV.pdf')).toBeInTheDocument();
    expect(prepareDocumentPreview).toHaveBeenCalledWith(expect.objectContaining({ url: 'a1/cv.pdf', fileName: 'Cruz-CV.pdf' }), expect.any(AbortSignal));
    expect(window.open).not.toHaveBeenCalled();
    expect(downloadPreparedDocument).not.toHaveBeenCalled();
  });

  it('lists other categories with each file\'s size and upload date, without fetching any file', async () => {
    await openScores();
    const button = await screen.findByRole('button', { name: 'View Education documents' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    const list = screen.getByRole('dialog', { name: 'Education Files' });
    expect(within(list).getByText('Cruz-TOR.pdf')).toBeInTheDocument();
    expect(within(list).getByText('3.0 MB · Oct 4, 2026')).toBeInTheDocument();
    expect(prepareDocumentPreview).not.toHaveBeenCalled();
  });
});
