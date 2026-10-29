import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForHiringPage } from './ForHiringPage';

const { ROWS } = vi.hoisted(() => ({
  ROWS: [{ id: 'a1', first_name: 'Ana', last_name: 'Cruz', email: 'a@x.ph', position: 'Engineer III', office: 'Engineering Office', status: 'Qualified', total_score: 90 }],
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
  // For Hiring lists only applicants carrying both scores
  // (docs/plans/2026-10-28-for-hiring-scored-only.md). This test is about
  // the Back buttons, so Ana needs scores to reach the plantilla view.
  localStorage.setItem('cictrix_category_scores', JSON.stringify({
    a1: { writtenExam: { finalScore: 89 }, oralExam: { finalScore: 19.33 } },
  }));
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ROWS }));
});

describe('ForHiringPage Back buttons', () => {
  it('steps back one level at a time: plantilla, then department', async () => {
    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Engineering Office'));
    fireEvent.click(await screen.findByText('Engineer III'));
    expect(await screen.findByRole('heading', { name: 'Engineer III' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Engineering Office' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('heading', { name: 'Engineering Office' })).not.toBeInTheDocument();
    expect(await screen.findByText('Engineering Office')).toBeInTheDocument();
  });
});
