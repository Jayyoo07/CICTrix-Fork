import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReservedApplicant } from '../lib/hiringFlow';
import { GenerateCredentialsPage } from './GenerateCredentialsPage';

vi.mock('./AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('./Sidebar', () => ({ Sidebar: () => null }));

const reserved = (id: string, fullName: string, department: string, position: string, plantilla: string, deadline: string): ReservedApplicant => ({
  id, fullName, email: `${id}@x.ph`, referenceNo: `REF-${id}`, position, department,
  slotId: `slot-${id}`, plantilla, signingDeadline: deadline, interviewScore: null,
});

const rows = [
  reserved('a', 'Juan Dela Cruz', "City Engineer's Office", 'Engineer II', 'Plantilla 1', '2099-10-28'),
  reserved('b', 'Maria Santos', "City Treasurer's Office", 'Clerk III', 'Plantilla 1', '2099-10-25'),
  reserved('c', 'Ana Reyes', 'City Health Office', 'Nurse I', 'Plantilla 3', '2000-01-01'),
];

const generateEmployeeCredentials = vi.fn();
const revokeSlotReservation = vi.fn();
vi.mock('../lib/hiringFlow', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/hiringFlow')>()),
  fetchReservedApplicants: () => Promise.resolve(rows),
  generateEmployeeCredentials: (...a: unknown[]) => generateEmployeeCredentials(...a),
  printCredentialCards: vi.fn(),
}));
vi.mock('../lib/plantillaSlots', () => ({
  revokeSlotReservation: (...a: unknown[]) => revokeSlotReservation(...a),
}));

const renderPage = async () => {
  render(<MemoryRouter><GenerateCredentialsPage /></MemoryRouter>);
  await screen.findByText('Juan Dela Cruz');
};

describe('Generate Employee Credentials', () => {
  beforeEach(() => {
    generateEmployeeCredentials.mockReset();
    revokeSlotReservation.mockReset();
  });

  it('groups applicants by department and plantilla', async () => {
    await renderPage();
    const engineering = screen.getByRole('region', { name: "City Engineer's Office" });
    expect(within(engineering).getByText('Engineer II · Plantilla 1')).toBeInTheDocument();
    expect(within(engineering).getByText('0 of 1 selected')).toBeInTheDocument();
  });

  it('keeps a selection across departments and totals it', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Juan Dela Cruz' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Maria Santos' }));

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByText(/City Engineer's Office \(1\), City Treasurer's Office \(1\)/)).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: "City Treasurer's Office" })).getByText('1 of 1 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate \(2\)/ })).toBeEnabled();
  });

  it('flags a missed signing date', async () => {
    await renderPage();
    const health = screen.getByRole('region', { name: 'City Health Office' });
    expect(within(health).getByText('Deadline passed')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: "City Engineer's Office" })).getByText('Awaiting signing')).toBeInTheDocument();
  });

  it('generates only the ticked applicants and shows their credentials', async () => {
    generateEmployeeCredentials.mockResolvedValue({
      credentials: [{ fullName: 'Juan Dela Cruz', employeeId: 'EMP-1', tempPassword: 'pw-1', email: 'a@x.ph', emailSent: true, position: 'Engineer II', department: "City Engineer's Office", plantilla: 'Plantilla 1' }],
      failures: [],
    });
    await renderPage();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Juan Dela Cruz' }));
    fireEvent.click(screen.getByRole('button', { name: /Generate \(1\)/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Generate' }));

    await screen.findByText('Employee Records Created');
    expect(generateEmployeeCredentials).toHaveBeenCalledWith([expect.objectContaining({ id: 'a' })]);
    expect(screen.getByText('EMP-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Print Credentials/ })).toBeEnabled();
  });

  it('revokes a selection after a confirmation', async () => {
    revokeSlotReservation.mockResolvedValue({ ok: true });
    await renderPage();
    const health = screen.getByRole('region', { name: 'City Health Office' });
    fireEvent.click(within(health).getByRole('button', { name: /Did not report/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Revoke Selection' }));
    await waitFor(() => expect(revokeSlotReservation).toHaveBeenCalledWith('c'));
  });
});
