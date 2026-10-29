import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminEditTargets, approveTargets } from '../../../lib/api/ipcrApproval';

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
    data: [
      {
        targetSettingId: 't1',
        employeeId: 'e1',
        employeeName: 'Ana Cruz',
        department: 'Budget Office',
        position: 'Budget Officer',
        submittedAt: null,
        mfos: [
          {
            id: 'm1',
            functionType: 'core',
            title: 'Review Budget Proposals',
            indicators: [
              {
                id: 'si1',
                description: '100% of budget proposals evaluated within 3 days',
              },
            ],
          },
        ],
      },
    ],
  }),
  adminEditTargets: vi.fn().mockResolvedValue({ ok: true, data: null }),
  approveTargets: vi.fn().mockResolvedValue({ ok: true, data: null }),
  returnForRevision: vi.fn().mockResolvedValue({ ok: true, data: null }),
}));

import { OfficeAccountConsole } from './OfficeAccountConsole';

describe('Office Account Console approval drill-down', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows a Back button that returns to the submission list', async () => {
    render(<MemoryRouter><OfficeAccountConsole /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Ana Cruz'));
    expect(await screen.findByRole('heading', { name: 'Ana Cruz' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('heading', { name: 'Ana Cruz' })).not.toBeInTheDocument();
    expect(await screen.findByText('Ana Cruz')).toBeInTheDocument();
  });

  it('allows Department Head to edit targets inline and save overrides', async () => {
    render(<MemoryRouter><OfficeAccountConsole /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Ana Cruz'));
    expect(await screen.findByRole('heading', { name: 'Ana Cruz' })).toBeInTheDocument();

    const editButton = screen.getByRole('button', { name: 'Edit / Override' });
    expect(editButton).toBeInTheDocument();
    fireEvent.click(editButton);

    const mfoInput = screen.getByDisplayValue('Review Budget Proposals');
    expect(mfoInput).toBeInTheDocument();

    fireEvent.change(mfoInput, { target: { value: 'Review Budget Proposals (Updated)' } });
    expect(mfoInput).toHaveValue('Review Budget Proposals (Updated)');

    const saveButton = screen.getByRole('button', { name: 'Save Edits' });
    fireEvent.click(saveButton);

    expect(await screen.findByText(/Saved your edits to Ana Cruz's targets\./i)).toBeInTheDocument();
    expect(adminEditTargets).toHaveBeenCalledWith(
      expect.objectContaining({
        targetSettingId: 't1',
        approverEmployeeId: 'e9',
        submitterEmployeeId: 'e1',
        mfos: expect.arrayContaining([
          expect.objectContaining({
            id: 'm1',
            title: 'Review Budget Proposals (Updated)',
          }),
        ]),
      })
    );
  });

  it('allows Department Head to approve and freeze targets', async () => {
    render(<MemoryRouter><OfficeAccountConsole /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Ana Cruz'));
    expect(await screen.findByRole('heading', { name: 'Ana Cruz' })).toBeInTheDocument();

    const approveButton = screen.getByRole('button', { name: 'Approve & Freeze' });
    expect(approveButton).toBeInTheDocument();
    fireEvent.click(approveButton);

    expect(await screen.findByText(/Approved and frozen: Ana Cruz's targets\./i)).toBeInTheDocument();
    expect(approveTargets).toHaveBeenCalledWith(
      expect.objectContaining({
        targetSettingId: 't1',
        approverEmployeeId: 'e9',
        submitterEmployeeId: 'e1',
      })
    );
  });
});
