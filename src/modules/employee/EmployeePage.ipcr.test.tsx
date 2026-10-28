import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Employee } from '../../types/employee.types';
import { EmployeePage } from './EmployeePage';

const mocks = vi.hoisted(() => ({ raw: vi.fn(), targets: vi.fn() }));
vi.mock('../../lib/supabase', async () => {
  const { supabaseStub } = await import('../../test/supabaseStub');
  return { supabase: supabaseStub() };
});
vi.mock('../../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }));
vi.mock('../../components/portal-header', () => ({ PortalHeader: () => null }));
vi.mock('../../lib/api/employeePortal', () => ({ fetchPortalEmployeeById: async () => ({ ok: false }), patchPortalEmployee: vi.fn() }));
vi.mock('../../lib/api/performanceEvaluations', () => ({
  getEmployeeRawDetails: mocks.raw,
  getActivePerformanceCycle: async () => ({ success: true, data: { id: 2 } }),
  getCompetenciesList: async () => ({ success: true, data: [] }),
  getLatestEmployeeIPCR: async () => ({ success: true, data: { rows: [], ratingPeriod: 'July–December 2026' } }),
  getEmployeeEvaluations: async () => ({ success: true, data: [] }),
}));
vi.mock('../../lib/api/ipcrTargets', async (original) => ({
  ...(await original<typeof import('../../lib/api/ipcrTargets')>()),
  getActiveCycle: async () => ({ ok: true, data: { id: 2 } }), loadTargetSetting: mocks.targets,
}));
vi.mock('../../lib/api/ipcrWorkspace', async (original) => ({
  ...(await original<typeof import('../../lib/api/ipcrWorkspace')>()), getWorkspace: async () => null,
}));
vi.mock('../../lib/api/employeePhaseGate', () => ({
  EMPTY_PHASE_GATE: {}, fetchPhaseGate: async () => ({}), isPhaseOpen: () => true,
}));
vi.mock('../../lib/api/phaseSchedules', async (original) => ({
  ...(await original<typeof import('../../lib/api/phaseSchedules')>()), loadEffectiveSchedules: async () => ({}),
}));
vi.mock('../../lib/api/employeeNotifications', () => ({ listEmployeeNotifications: async () => [], markEmployeeNotificationsRead: vi.fn() }));
vi.mock('./EmployeePhase2', () => ({ EmployeePhase2: ({ targetSettingId }: { targetSettingId: string }) => <div>Rating sheet: {targetSettingId}</div> }));

const employee = {
  supabaseId: 'emp-1', employeeId: 'EMP-1', fullName: 'Ana Cruz', email: 'ana@example.test', mobileNumber: '09123456789',
  homeAddress: 'Iloilo City', emergencyContactName: 'Maria Cruz', sssNumber: '123', employmentStatus: 'Regular',
} as Employee;

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  mocks.raw.mockImplementation(async () => {
    if (mocks.raw.mock.calls.length > 3) throw new Error('Repeated workspace hydration');
    return { success: true, data: { employee_number: 'EMP-1' } };
  });
  mocks.targets.mockResolvedValue({ ok: true, data: {
    setting: { id: 'approved-1', cycle_id: 2, status: 'approved' },
    targets: { core: [{ title: 'Payroll', indicators: [{ description: 'Process payroll' }] }], strategic: [], support: [] },
  } });
});
afterEach(cleanup);

describe('workspace hydration', () => {
  it('finishes hydration once and displays Phase 2 without restarting on loaded state changes', async () => {
    render(<MemoryRouter initialEntries={['/employee/ipcr-workspace']}><EmployeePage currentUser={employee} onLogout={() => {}} /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Phase 2: Accomplishments/ }));
    expect(await screen.findByText('Rating sheet: approved-1')).toBeInTheDocument();
    await waitFor(() => expect(mocks.targets).toHaveBeenCalledTimes(1));
    expect(mocks.raw).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Phase 1: Target Setting' }));
    expect(screen.getByDisplayValue('Payroll')).toBeDisabled();
    expect(screen.getByDisplayValue('Process payroll')).toBeDisabled();
    expect(mocks.targets).toHaveBeenCalledTimes(1);
  });
});
