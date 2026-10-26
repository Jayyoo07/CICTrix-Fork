import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { OfficeDirectorySection } from './OfficeDirectorySection';
import type { OfficeDirectoryRow } from '../lib/api/officeDirectory';

const OFFICE: OfficeDirectoryRow = vi.hoisted(() => ({
  officeId: 'o1',
  officeName: 'Budget Office',
  code: 'BUD',
  isActive: true,
  deptHead: null,
  supervisors: [],
  employeeCount: 0,
  divisions: [],
}));

vi.mock('../lib/api/officeDirectory', () => ({
  getOfficeDirectory: vi.fn().mockResolvedValue({ ok: true, data: [OFFICE] }),
}));

vi.mock('../lib/supabase', () => {
  const query = { select: () => query, eq: () => query, then: (resolve: (v: unknown) => void) => resolve({ data: [] }) };
  return { supabase: { from: () => query } };
});

describe('OfficeDirectorySection drill-down', () => {
  it('shows a Back button inside an office that returns to the office list', async () => {
    render(
      <MemoryRouter>
        <OfficeDirectorySection />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText('Budget Office'));
    expect(screen.getByRole('heading', { name: 'Budget Office' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Budget Office' })).not.toBeInTheDocument());
    expect(screen.getByText('Office / Department')).toBeInTheDocument();
  });
});
