import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { NewlyHiredPage } from './NewlyHiredPage';

vi.mock('../lib/supabase', async () => {
  const { supabaseStub } = await import('../test/supabaseStub');
  return {
    supabase: supabaseStub((table) => (table === 'applicants'
      ? [{ id: 'a1', first_name: 'Ana', last_name: 'Cruz', email: 'a@x.ph', position: 'Engineer III', office: 'Engineering Office', status: 'Hired' }]
      : [])),
  };
});
vi.mock('./AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('./Sidebar', () => ({ Sidebar: () => null }));

describe('NewlyHiredPage Back button', () => {
  it('returns from a department to the department list', async () => {
    render(<MemoryRouter><NewlyHiredPage /></MemoryRouter>);

    fireEvent.click((await screen.findAllByText(/Engineering Office/))[0]);
    expect(await screen.findByRole('heading', { name: /Engineering Office/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Newly Hired Employees' })).toBeInTheDocument();
  });
});
