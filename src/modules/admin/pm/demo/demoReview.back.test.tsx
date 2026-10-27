import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { DemoAccount, Schedule } from './types';

const fixtures = vi.hoisted(() => ({
  account: { id: 'e1', email: 'a@x.ph', full_name: 'Ana Cruz', employee_code: 'EMP-001', role: 'Employee', office: 'Budget Office', position_title: 'Budget Officer', date_hired: null, status: 'Active' } as DemoAccount,
  schedule: (status: string) => [{ id: 's1', employee_id: 'e1', cycle_type: 'Regular', phase: 1, phase_start_date: null, phase_due_date: null, status }] as Schedule[],
  status: 'Phase1 Submitted',
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  listAccounts: vi.fn(async () => ({ ok: true, data: [fixtures.account] })),
}));
vi.mock('./workflow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./workflow')>()),
  listEmployees: vi.fn(async () => ({ ok: true, data: [fixtures.account] })),
  listSchedules: vi.fn(async () => ({ ok: true, data: fixtures.schedule(fixtures.status) })),
  getCycleState: vi.fn(async () => ({ ok: true, data: null })),
  listVault: vi.fn(async () => ({ ok: true, data: [] })),
  listTargets: vi.fn(async () => ({ ok: true, data: [] })),
  listAccomplishments: vi.fn(async () => ({ ok: true, data: [] })),
}));

import { PMIncoming } from './PMWorkflow';
import { SupervisorReview } from './SupervisorReview';

describe('PM demo review screens', () => {
  it('PM incoming review has a Back button to the submission list', async () => {
    fixtures.status = 'Phase1 Verified';
    render(<MemoryRouter><PMIncoming pmId="pm1" tick={0} onChange={() => {}} /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: 'Review' }));
    expect(await screen.findByRole('heading', { name: /Review — Ana Cruz/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('Incoming Submissions')).toBeInTheDocument();
  });

  it('supervisor review has a Back button to the pending list', async () => {
    fixtures.status = 'Phase1 Submitted';
    render(<MemoryRouter><SupervisorReview account={{ ...fixtures.account, id: 'sup', full_name: 'Sup Visor' }} /></MemoryRouter>);

    fireEvent.click(await screen.findByRole('button', { name: /Review/ }));
    expect(await screen.findByRole('button', { name: 'Back' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('button', { name: /Review/ })).toBeInTheDocument();
  });
});
