import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/supabase', async () => {
  const { supabaseStub } = await import('../../../test/supabaseStub');
  return { supabase: supabaseStub() };
});
vi.mock('../../../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }));
const NO_DEPARTMENTS: string[] = [];
vi.mock('../../../hooks/useDepartmentOptions', () => ({ useDepartmentNames: () => NO_DEPARTMENTS }));
vi.mock('../../../lib/api/employees', () => ({
  getAllEmployees: vi.fn().mockResolvedValue({
    success: true,
    data: [{ id: 'e1', employee_id: 'EMP-001', first_name: 'Ana', last_name: 'Cruz', full_name: 'Ana Cruz', email: 'a@x.ph', current_position: 'Budget Officer', department: 'Budget Office', current_department: 'Budget Office', hire_date: '2020-01-01', status: 'Active' }],
  }),
}));

import { PMIPCRManagement } from './PMIPCRManagement';

describe('PM IPCR Management drill-downs', () => {
  it('steps back one level at a time: employee, then office', async () => {
    render(<MemoryRouter><PMIPCRManagement /></MemoryRouter>);

    fireEvent.click(screen.getByRole('button', { name: /Regular Employees/ }));
    fireEvent.click(await screen.findByText('Budget Office'));
    const officeEmployee = await screen.findByText(/Ana/);
    fireEvent.click(officeEmployee);
    expect(await screen.findByRole('button', { name: 'Back' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/search/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText(/\(1 employee\)/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByText(/\(1 employee\)/)).not.toBeInTheDocument();
    expect(await screen.findByText('Budget Office')).toBeInTheDocument();
  });
});
