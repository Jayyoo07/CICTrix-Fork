import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JobPosting } from '../types/recruitment.types';

// A posting with three admin-named plantillas: one open, one filled, one the
// applicant already applied to. Old ABYAN-style internal keys are present on
// purpose — they must never reach the screen.
const job = {
  id: 'job-legal-1',
  jobCode: 'ABYAN-2026-297',
  title: 'Admin Aid I',
  department: 'Legal',
  status: 'Active',
  salaryGrade: 10,
  applicationDeadline: '2099-12-31T00:00:00.000Z',
  postedDate: '2026-09-25T00:00:00.000Z',
  requiredDocuments: ['Resume/CV', 'Application Letter'],
  responsibilities: [],
  summary: 'Posting-wide summary',
  qualifications: { education: '', experience: { years: 0, field: '' }, skills: [], certifications: [] },
  // Slots 20 and 100 were merged from separate postings and keep their own text.
  plantillaSlots: [
    {
      id: 'slot-a', jobPostingId: 'job-legal-1', slotNumber: 1, label: 'Plantilla 20', itemNumber: 'ABYAN-2026-297', status: 'filled',
      division: 'Records Division', summary: 'Keeps the legal records.', responsibilities: ['Files case folders'],
    },
    {
      id: 'slot-b', jobPostingId: 'job-legal-1', slotNumber: 2, label: 'Plantilla 100', itemNumber: 'ABYAN-2026-298', status: 'open', salaryGrade: 10,
      summary: 'Drafts routine contracts.', responsibilities: ['Prepares contract drafts'],
    },
    { id: 'slot-c', jobPostingId: 'job-legal-1', slotNumber: 3, label: 'Plantilla 3', itemNumber: 'PLT-0A1B2C3D4E', status: 'open' },
  ],
} as unknown as JobPosting;

vi.mock('../lib/recruitmentData', () => ({
  getJobPostings: () => [job],
  loadJobPostings: () => Promise.resolve([job]),
}));

vi.mock('../lib/supabase', () => ({ supabase: {}, ATTACHMENTS_BUCKET: 'x', isMockModeEnabled: () => false }));

vi.mock('../lib/plantillaSlots', () => ({
  fetchSlotApplicantCounts: () => Promise.resolve(new Map([['slot-b', 15]])),
}));

/** Stand-in for Step 2: shows which plantillas Step 1 handed over. */
const ApplyProbe = () => {
  const { state } = useLocation() as { state: { landingJob: { selectedChoices: { key: string }[] } } };
  return <p data-testid="apply-keys">{state.landingJob.selectedChoices.map((c) => c.key).join(',')}</p>;
};

const renderPage = async () => {
  const { JobDetailsPage } = await import('./JobDetailsPage');
  render(
    <MemoryRouter initialEntries={['/job-details/job-legal-1']}>
      <Routes>
        <Route path="/job-details/:jobId" element={<JobDetailsPage />} />
        <Route path="/apply" element={<ApplyProbe />} />
      </Routes>
    </MemoryRouter>,
  );
  return screen.findByRole('heading', { name: 'Apply for this position' });
};

describe('Job Details — applicant Step 1', () => {
  beforeEach(() => {
    // jsdom has no matchMedia; the page uses it for its desktop/mobile layout.
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true, media: query, onchange: null,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
      addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
    localStorage.clear();
    sessionStorage.clear();
    // This browser already applied to Plantilla 3.
    localStorage.setItem('cictrix_applied_plantilla', JSON.stringify({ 'slot-c': { referenceNo: 'ABYAN-748-102', at: '' } }));
  });

  it('has no plantilla picker', async () => {
    await renderPage();

    expect(screen.queryByText(/Choose your plantilla items/)).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('never shows a plantilla item number or any ABYAN-style code', async () => {
    await renderPage();

    expect(screen.queryByText(/Plantilla Item No/i)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/ABYAN-\d/);
    expect(document.body.textContent).not.toMatch(/PLT-/);
  });

  it("continues with the posting's open plantilla, skipping filled and applied ones", async () => {
    const heading = await renderPage();
    const card = heading.closest('section') as HTMLElement;

    fireEvent.click(within(card).getByRole('button', { name: /Continue to Application/ }));
    expect(await screen.findByTestId('apply-keys')).toHaveTextContent(/^slot-b$/);
  });

  it('shows the submission instructions under the required documents', async () => {
    await renderPage();

    const docs = screen.getByRole('heading', { name: 'Required documents' }).closest('section') as HTMLElement;
    expect(within(docs).getByText(/complete, accurate, clear, and readable/)).toBeInTheDocument();
    expect(within(docs).queryByText(/Address your application letter/)).not.toBeInTheDocument();
  });

  it('shows each merged plantilla with its own summary and duties', async () => {
    await renderPage();

    expect(screen.getAllByText('Plantilla 20 · Records Division').length).toBe(2);
    expect(screen.getByText('Keeps the legal records.')).toBeInTheDocument();
    expect(screen.getByText('Drafts routine contracts.')).toBeInTheDocument();
    expect(screen.getByText('Files case folders')).toBeInTheDocument();
    expect(screen.getByText('Prepares contract drafts')).toBeInTheDocument();
    // Per-plantilla text replaces the posting-wide summary, not added to it.
    expect(screen.queryByText('Posting-wide summary')).not.toBeInTheDocument();
  });

  it('no longer lists Curriculum Vitae as a required document', async () => {
    await renderPage();

    const docs = screen.getByRole('heading', { name: 'Required documents' }).closest('section') as HTMLElement;
    expect(within(docs).queryByText(/Resume\/CV|Curriculum Vitae/i)).not.toBeInTheDocument();
    expect(within(docs).getByText('Application Letter')).toBeInTheDocument();
  });
});
