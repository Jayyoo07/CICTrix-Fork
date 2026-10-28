import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForHiringPage } from './ForHiringPage';
import type { PlantillaSlot } from '../types/recruitment.types';

const { ROWS, SCORE_ROWS, mockFetchHiringContext, mockGetApplicants } = vi.hoisted(() => ({
  ROWS: [
    {
      id: 'a1',
      first_name: 'Ana',
      last_name: 'Cruz',
      email: 'ana@x.ph',
      position: 'Engineer II',
      office: 'Engineering Office',
      status: 'Qualified',
    },
  ],
  SCORE_ROWS: [
    {
      applicant_id: 'a1',
      written_exam: { initialScore: 89, finalScore: 89, remarks: '' },
      oral_exam: { initialScore: 19.33, finalScore: 19.33, remarks: '' },
      appointment_type: 'original',
      position_type: 'rank-and-file',
      is_finalized: true,
    },
  ],
  mockFetchHiringContext: vi.fn(),
  mockGetApplicants: vi.fn(),
}));

vi.mock('../lib/supabase', async () => {
  const { supabaseStub } = await import('../test/supabaseStub');
  return {
    supabase: supabaseStub((table) => {
      if (table === 'applicants') return ROWS;
      if (table === 'applicant_category_scores') return SCORE_ROWS;
      return [];
    }),
  };
});
vi.mock('./AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('./Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./ApplicantsTabBar', () => ({ ApplicantsTabBar: () => null }));

vi.mock('../lib/recruitmentData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/recruitmentData')>();
  return {
    ...actual,
    ensureRecruitmentSeedData: vi.fn(),
    getApplicants: mockGetApplicants,
  };
});

vi.mock('../lib/hiringFlow', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/hiringFlow')>();
  return {
    ...actual,
    fetchHiringContext: mockFetchHiringContext,
  };
});

const defaultApplicant = {
  id: 'a1',
  jobPostingId: 'jp-1',
  personalInfo: {
    firstName: 'Ana',
    lastName: 'Cruz',
    email: 'ana@x.ph',
  },
  position: 'Engineer II',
  department: 'Engineering Office',
  status: 'Qualified',
};

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(
    'cictrix_category_scores',
    JSON.stringify({
      a1: { writtenExam: { finalScore: 89 }, oralExam: { finalScore: 19.33 } },
    })
  );
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => [] }));
  mockGetApplicants.mockReturnValue([defaultApplicant]);
});

describe('ForHiringPage plantilla context & selection handling', () => {
  it('disables radio button, sets closed title, and prevents selection when applicant slot is closed', async () => {
    const closedSlot: PlantillaSlot = {
      id: 'slot-closed-1',
      jobPostingId: 'jp-1',
      slotNumber: 1,
      itemNumber: 'ABYAN-2026-001',
      status: 'closed',
    };

    mockFetchHiringContext.mockResolvedValue({
      ok: true,
      slotByApplicant: new Map([['a1', closedSlot]]),
      revokedAt: new Map(),
    });

    render(
      <MemoryRouter>
        <ForHiringPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByText('Engineering Office'));
    fireEvent.click(await screen.findByText(/Engineer II/));

    const radio = await screen.findByRole('radio', { name: /select ana cruz/i });
    expect(radio).toBeDisabled();
    expect(radio).toHaveAttribute(
      'title',
      'This plantilla is closed. Reopen the vacancy from Job Vacancies to select this applicant.'
    );

    const selectBtn = screen.getByRole('button', { name: /select for hiring/i });
    expect(selectBtn).toBeDisabled();

    fireEvent.click(selectBtn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('enables radio button and allows applicant selection when plantilla slot is open', async () => {
    const openSlot: PlantillaSlot = {
      id: 'slot-open-1',
      jobPostingId: 'jp-1',
      slotNumber: 1,
      itemNumber: 'ABYAN-2026-001',
      status: 'open',
    };

    mockFetchHiringContext.mockResolvedValue({
      ok: true,
      slotByApplicant: new Map([['a1', openSlot]]),
      revokedAt: new Map(),
    });

    render(
      <MemoryRouter>
        <ForHiringPage />
      </MemoryRouter>
    );

    fireEvent.click(await screen.findByText('Engineering Office'));
    fireEvent.click(await screen.findByText(/Engineer II/));

    const radio = await screen.findByRole('radio', { name: /select ana cruz/i });
    expect(radio).toBeEnabled();

    fireEvent.click(radio);
    expect(radio).toBeChecked();

    const selectBtn = screen.getByRole('button', { name: /select for hiring/i });
    expect(selectBtn).toBeEnabled();
  });

  it('renders ErrorBanner when fetchHiringContext returns ok: false', async () => {
    mockFetchHiringContext.mockResolvedValue({
      ok: false,
      slotByApplicant: new Map(),
      revokedAt: new Map(),
      error: new Error('Failed to load plantilla slots for applicants'),
    });

    render(
      <MemoryRouter>
        <ForHiringPage />
      </MemoryRouter>
    );

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/couldn't load the applicants for hiring/i)).toBeInTheDocument();
  });

  it('loads applicant category scores remotely from Supabase even without localStorage cache', async () => {
    localStorage.clear();

    mockFetchHiringContext.mockResolvedValue({
      ok: true,
      slotByApplicant: new Map(),
      revokedAt: new Map(),
    });

    render(
      <MemoryRouter>
        <ForHiringPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Engineering Office')).toBeInTheDocument();
    expect(screen.getByText('1 applicant')).toBeInTheDocument();
  });
});
