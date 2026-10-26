import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../components/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('../../components/AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('../../lib/supabase', async () => {
  const { supabaseStub } = await import('../../test/supabaseStub');
  return { supabase: supabaseStub() };
});
vi.mock('../../lib/api/officeDirectory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api/officeDirectory')>()),
  getOfficeDirectory: vi.fn().mockResolvedValue({
    ok: true,
    data: [{ officeId: 'o1', officeName: 'Budget Office', code: 'BUD', isActive: true, deptHead: null, supervisors: [], employeeCount: 0, divisions: [] }],
  }),
}));

import { SystemAdministrationPage } from './SystemAdministrationPage';

describe('System Administration office drill-down', () => {
  it('shows a Back button that returns to the office list', async () => {
    render(<MemoryRouter><SystemAdministrationPage /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Budget Office'));
    expect(await screen.findByText('Divisions & Assigned Supervisors')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByText('Divisions & Assigned Supervisors')).not.toBeInTheDocument();
    expect(await screen.findByText('Budget Office')).toBeInTheDocument();
  });
});
