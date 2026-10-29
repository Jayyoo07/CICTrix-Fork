import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApplicantRankingPage } from './ApplicantRankingPage';

const { ROWS } = vi.hoisted(() => ({
  ROWS: [{ id: 'a1', first_name: 'Ana', last_name: 'Cruz', email: 'a@x.ph', position: 'Engineer III', office: 'Engineering Office', status: 'Qualified', total_score: 90 }],
}));

vi.mock('../lib/supabase', async () => {
  const { supabaseStub } = await import('../test/supabaseStub');
  return { supabase: supabaseStub((table) => (table === 'applicants' ? ROWS : [])) };
});
vi.mock('../lib/recruitmentData', () => ({ getApplicants: () => [], saveApplicants: () => {} }));
vi.mock('./AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('./Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./ApplicantsTabBar', () => ({ ApplicantsTabBar: () => null }));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ROWS }));
});

describe('ApplicantRankingPage Back buttons', () => {
  it('steps back one level at a time: position, then department', async () => {
    render(<MemoryRouter><ApplicantRankingPage /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Engineering Office'));
    fireEvent.click(await screen.findByText('Engineer III'));
    expect(screen.getByRole('heading', { name: 'Engineer III' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Engineering Office' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Applicant Ranking' })).toBeInTheDocument();
  });
});
