import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/supabase', async () => {
  const { supabaseStub } = await import('../../../test/supabaseStub');
  return { supabase: supabaseStub() };
});
vi.mock('../../../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }));
vi.mock('../../../components/portal-header', () => ({ PortalHeader: () => null }));
vi.mock('./Phase2RatingPanel', () => ({ Phase2RatingPanel: () => null }));
vi.mock('../../../lib/employeeSession', () => ({ readEmployeeSession: () => ({ employeeId: 'e9', fullName: 'Dept Head' }) }));
vi.mock('../../../lib/api/officeRoles', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/officeRoles')>()),
  resolveEmployeeId: vi.fn().mockResolvedValue('e9'),
  getActiveOfficeRole: vi.fn().mockResolvedValue({ officeId: 'o1', officeName: 'Budget Office', role: 'Department Head' }),
}));
vi.mock('../../../lib/api/ipcrApproval', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/ipcrApproval')>()),
  listPendingApprovals: vi.fn().mockResolvedValue({
    ok: true,
    data: [{ targetSettingId: 't1', employeeId: 'e1', employeeName: 'Ana Cruz', department: 'Budget Office', position: 'Budget Officer', submittedAt: null, mfos: [] }],
  }),
}));

import { OfficeAccountConsole } from './OfficeAccountConsole';

describe('Office Account Console approval drill-down', () => {
  it('shows a Back button that returns to the submission list', async () => {
    render(<MemoryRouter><OfficeAccountConsole /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Ana Cruz'));
    expect(await screen.findByRole('heading', { name: 'Ana Cruz' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('heading', { name: 'Ana Cruz' })).not.toBeInTheDocument();
    expect(await screen.findByText('Ana Cruz')).toBeInTheDocument();
  });
});
