import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../components/AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('../../components/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./RspDashboardOverview', () => ({ RspDashboardOverview: () => null }));
vi.mock('../../components/QualifiedApplicantsSection', () => ({ QualifiedApplicantsSection: () => null }));
vi.mock('./rsp-archives', () => ({ RspArchives: () => null }));
vi.mock('../../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }));
// Stable arrays, as the real hook returns: a fresh array per render would loop
// the position-form effect while an employee is open.
const NO_DEPARTMENTS: string[] = [];
vi.mock('../../hooks/useDepartmentOptions', () => ({ useDepartmentNames: () => NO_DEPARTMENTS, useDepartmentOptions: () => NO_DEPARTMENTS }));
vi.mock('../../lib/supabase', async () => {
  const { supabaseStub } = await import('../../test/supabaseStub');
  return {
    supabase: supabaseStub((table) => (table === 'employees_with_department'
      ? [{ id: 'e1', employee_id: 'EMP-001', full_name: 'Ana Cruz', first_name: 'Ana', last_name: 'Cruz', current_position: 'Budget Officer', department: 'Budget Office', status: 'Active' }]
      : [])),
  };
});
vi.mock('../../lib/api/officeDirectory', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/api/officeDirectory')>()),
  getOfficeDirectory: vi.fn().mockResolvedValue({
    ok: true,
    data: [{ officeId: 'o1', officeName: 'Budget Office', code: 'BUD', isActive: true, deptHead: null, supervisors: [], employeeCount: 1, divisions: [] }],
  }),
}));

import { RSPDashboard } from './RSPDashboard';

describe('RSP Office Directory Back buttons', () => {
  it('steps back one level at a time: employee, then office', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/rsp/accounts']}>
        <Routes><Route path="/admin/rsp/accounts" element={<RSPDashboard />} /></Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByText('Budget Office'));
    expect(await screen.findByRole('heading', { name: 'Budget Office' })).toBeInTheDocument();
    fireEvent.click(await screen.findByText('Ana Cruz'));
    expect(await screen.findByRole('heading', { name: /Ana Cruz/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Budget Office' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('heading', { name: 'Budget Office' })).not.toBeInTheDocument();
    expect(await screen.findByText('Budget Office')).toBeInTheDocument();
  });
});
