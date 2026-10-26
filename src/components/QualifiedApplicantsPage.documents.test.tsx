import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fixtures = vi.hoisted(() => ({
  applicants: [{ id: 'a', first_name: 'Maria', last_name: 'Reyes', email: 'maria@example.test', position: 'Clerk I', office: 'City Hall', status: 'New Application', created_at: '2026-10-26T00:00:00Z' }],
  attachments: [
    { id: 'tor-latest', applicant_id: 'a', file_name: 'Reyes-TOR-v2.pdf', file_path: 'a/tor-v2.pdf', file_type: 'application/pdf', document_type: 'transcript_of_records', created_at: '2026-10-26T00:00:00Z' },
    { id: 'tor-old', applicant_id: 'a', file_name: 'Reyes-TOR-v1.pdf', file_path: 'a/tor-v1.pdf', file_type: 'application/pdf', document_type: 'transcript_of_records', created_at: '2026-10-25T00:00:00Z' },
    { id: 'letter', applicant_id: 'a', file_name: 'Missing-Letter.pdf', file_path: '#', document_type: 'application_letter', created_at: '2026-10-26T00:00:00Z' },
  ],
}));
vi.mock('./Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./RecruitmentNavigationGuide', () => ({ RecruitmentNavigationGuide: () => null }));
vi.mock('../lib/mockDatabase', () => ({ mockDatabase: {} }));
vi.mock('../lib/singleFlight', () => ({ runSingleFlight: (_key: string, run: () => unknown) => run() }));
vi.mock('../lib/recruitmentData', () => ({
  ensureRecruitmentSeedData: () => {}, getAuthoritativeJobPostings: () => [], getApplicants: () => [],
  saveApplicants: () => {}, formatPHDate: (value: string) => value.slice(0, 10),
}));
vi.mock('../lib/supabase', () => ({
  ATTACHMENTS_BUCKET: 'attachments',
  supabase: { from: (table: string) => {
    const data = table === 'applicants' ? fixtures.applicants : table === 'applicant_attachments' ? fixtures.attachments : [];
    const result = { data, error: null };
    return { select: () => ({ order: async () => result, then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) }) };
  } },
}));
vi.mock('../lib/documentViewing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/documentViewing')>();
  return { ...actual, listApplicantDocumentAttachments: vi.fn(), prepareDocumentPreview: vi.fn(), downloadPreparedDocument: vi.fn() };
});

import { QualifiedApplicantsPage } from './QualifiedApplicantsPage';
import { downloadPreparedDocument, listApplicantDocumentAttachments, prepareDocumentPreview } from '../lib/documentViewing';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(listApplicantDocumentAttachments).mockResolvedValue(fixtures.attachments);
  vi.mocked(prepareDocumentPreview).mockImplementation(async (source) => ({ url: 'blob:selected-fixture', blob: new Blob(['fixture']), kind: 'pdf', fileName: source.fileName, dispose: vi.fn() }));
  vi.spyOn(window, 'open').mockReturnValue(null);
});

const openDocuments = async () => {
  render(<MemoryRouter initialEntries={['/admin/rsp/jobs']}><QualifiedApplicantsPage /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Maria Reyes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Documents' }));
  await waitFor(() => expect(screen.getByRole('button', { name: 'View Documents' })).toBeEnabled());
};

describe('RSP applicant document entry points', () => {
  it('views the exact latest attachment and returns to the document review without downloading', async () => {
    localStorage.setItem('cictrix_attachment_previews', JSON.stringify([{ applicantId: 'a', documentType: 'application_letter', fileName: 'Wrong.pdf' }]));
    await openDocuments();
    const card = screen.getByText('transcript of records').closest('article')!;
    fireEvent.click(within(card).getByRole('button', { name: 'View' }));
    expect(await screen.findByTitle('Reyes-TOR-v2.pdf')).toBeInTheDocument();
    expect(prepareDocumentPreview).toHaveBeenCalledWith(expect.objectContaining({ id: 'a/tor-v2.pdf', url: 'a/tor-v2.pdf', fileName: 'Reyes-TOR-v2.pdf', bucket: 'attachments' }), expect.any(AbortSignal));
    expect(downloadPreparedDocument).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'View Documents' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
  });

  it('replaces Download All with a file list, keeps missing documents explicit, and never opens multiple tabs', async () => {
    await openDocuments();
    expect(screen.queryByRole('button', { name: 'Download All' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'View Documents' }));
    const collection = screen.getByRole('dialog', { name: 'Submitted Documents' });
    expect(within(collection).getByText('Reyes-TOR-v2.pdf')).toBeInTheDocument();
    expect(within(collection).queryByText('Reyes-TOR-v1.pdf')).toBeNull();
    expect(within(collection).getByRole('button', { name: 'View Missing-Letter.pdf' })).toBeDisabled();
    expect(prepareDocumentPreview).not.toHaveBeenCalled();
    expect(downloadPreparedDocument).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
});
