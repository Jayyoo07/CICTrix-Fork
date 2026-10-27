import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForHiringPage } from './ForHiringPage';

const { ROWS } = vi.hoisted(() => ({
  ROWS: [
    { id: 'a1', first_name: 'Ana', last_name: 'Cruz', email: 'ana@x.ph', position: 'Engineer II', office: 'Engineering Office', status: 'Qualified' },
    { id: 'a2', first_name: 'Ben', last_name: 'Reyes', email: 'ben@x.ph', position: 'Engineer II', office: 'Engineering Office', status: 'Qualified' },
    { id: 'a3', first_name: 'Cy', last_name: 'Lim', email: 'cy@x.ph', position: 'Engineer II', office: 'Engineering Office', status: 'For Contract Signing' },
  ],
}));

vi.mock('../lib/supabase', async () => {
  const { supabaseStub } = await import('../test/supabaseStub');
  return { supabase: supabaseStub((table) => (table === 'applicants' ? ROWS : [])) };
});
vi.mock('./AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('./Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./ApplicantsTabBar', () => ({ ApplicantsTabBar: () => null }));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => [] }));
});

describe('ForHiringPage visibility', () => {
  it('lists only applicants carrying both an interview and an exam score', async () => {
    // Ana sat both assessments. Ben is Qualified but unscored, so he has
    // nothing to rank and must not appear. Cy is unscored too, but already
    // holds the plantilla — hiding him would lose the selection.
    localStorage.setItem('cictrix_category_scores', JSON.stringify({
      a1: { writtenExam: { finalScore: 89 }, oralExam: { finalScore: 19.33 } },
    }));

    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);

    expect(await screen.findByText('Engineering Office')).toBeInTheDocument();
    expect(screen.getByText('2 applicants')).toBeInTheDocument();
    expect(screen.queryByText('3 applicants')).not.toBeInTheDocument();
  });

  it('leaves only the already-selected applicant when nobody has been scored', async () => {
    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);

    // Cy still appears: he is past selection. The two unscored Qualified
    // applicants do not.
    expect(await screen.findByText('Engineering Office')).toBeInTheDocument();
    expect(screen.getByText('1 applicant')).toBeInTheDocument();
  });
});
