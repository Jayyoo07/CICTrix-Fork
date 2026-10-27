import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForHiringPage } from './ForHiringPage';

const { ROWS, MISSING_COLUMNS } = vi.hoisted(() => ({
  ROWS: [{ id: 'a1', first_name: 'Ana', last_name: 'Cruz', email: 'a@x.ph', position: 'Engineer III', office: 'Engineering Office', status: 'Qualified' }],
  // Not columns of public.applicants (supabase/table_inventory.json). Naming
  // any of them makes PostgREST reject the whole select.
  MISSING_COLUMNS: ['full_name', 'department', 'qualification_score', 'total_score'],
}));

vi.mock('../lib/supabase', async () => {
  const { supabaseStub } = await import('../test/supabaseStub');
  const base = supabaseStub((table) => (table === 'applicants' ? ROWS : []));
  return {
    supabase: {
      ...base,
      from: (table: string) => {
        const chain = base.from(table) as { select: (cols: string) => unknown };
        if (table !== 'applicants') return chain;
        return new Proxy(chain, {
          get: (target, prop) => {
            if (prop !== 'select') return Reflect.get(target, prop);
            return (cols = '*') => {
              const missing = cols.split(',').map((c) => c.trim()).find((c) => MISSING_COLUMNS.includes(c));
              return missing
                ? Promise.resolve({ data: null, error: { code: '42703', message: `column applicants.${missing} does not exist` } })
                : target.select(cols);
            };
          },
        });
      },
    },
  };
});
vi.mock('./AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('./Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./ApplicantsTabBar', () => ({ ApplicantsTabBar: () => null }));

beforeEach(() => {
  localStorage.clear();
  // The legacy backend returns nothing, so the page reads applicants from Supabase.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => [] }));
});

describe('ForHiringPage load', () => {
  it('loads applicants from Supabase without requesting columns the table lacks', async () => {
    render(<MemoryRouter><ForHiringPage /></MemoryRouter>);

    expect(await screen.findByText('Engineering Office')).toBeInTheDocument();
    expect(screen.queryByText(/couldn't load the applicants for hiring/i)).not.toBeInTheDocument();
  });
});
