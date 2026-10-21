import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  AppointDepartmentHeadModal,
  SystemAdministrationPage,
} from './SystemAdministrationPage';
import { createAssignment, type OfficeRoleAssignment } from '../../lib/api/officeRoles';
import type { Department } from '../../lib/api/departments';

vi.mock('../../components/Sidebar', () => ({
  Sidebar: () => <div data-testid="mock-sidebar">Sidebar</div>,
}));

vi.mock('../../components/AdminHeader', () => ({
  AdminHeader: () => <div data-testid="mock-admin-header">AdminHeader</div>,
}));

vi.mock('../../lib/api/officeRoles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api/officeRoles')>();
  return {
    ...actual,
    listAssignments: vi.fn().mockResolvedValue({ ok: true, data: [] }),
    listAuditTrail: vi.fn().mockResolvedValue([]),
    listEmployeeOptions: vi.fn().mockResolvedValue([]),
    createAssignment: vi.fn(),
    revokeOrTransfer: vi.fn(),
  };
});

vi.mock('../../lib/api/officeDirectory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api/officeDirectory')>();
  return {
    ...actual,
    getOfficeDirectoryData: vi.fn().mockResolvedValue({ offices: [], rawHeadcount: [] }),
    filterOfficeDirectory: vi.fn().mockReturnValue([]),
  };
});

vi.mock('../../lib/api/departments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/api/departments')>();
  return {
    ...actual,
    listDepartments: vi.fn().mockResolvedValue([]),
  };
});

describe('SystemAdministrationPage — Subtab Navigation (V1)', () => {
  it('renders default Office Directory tab and switches to Access & Role Management on click', async () => {
    render(
      <MemoryRouter>
        <SystemAdministrationPage />
      </MemoryRouter>
    );

    // Initial subtitle indicates Office Directory
    expect(
      screen.getByText('Master list of offices, department heads, supervisors, and headcount.')
    ).toBeInTheDocument();

    // Verify subtab buttons exist
    const directoryTab = screen.getByRole('button', { name: /Office Directory/i });
    const accessRolesTab = screen.getByRole('button', { name: /Access & Role Management/i });
    expect(directoryTab).toBeInTheDocument();
    expect(accessRolesTab).toBeInTheDocument();

    // Switch to Access & Role Management
    fireEvent.click(accessRolesTab);

    // Subtitle updates dynamically
    expect(
      screen.getByText('Assign or remove department heads, manage office access, and handle succession transfers.')
    ).toBeInTheDocument();

    // Switch back to Office Directory
    fireEvent.click(directoryTab);
    expect(
      screen.getByText('Master list of offices, department heads, supervisors, and headcount.')
    ).toBeInTheDocument();
  });
});

describe('AppointDepartmentHeadModal Redesign (D1 - D7)', () => {
  const mockDepartments = [
    {
      id: 'dept-1',
      name: 'Information Technology',
      code: 'IT',
      head_employee_id: null,
      parent_department_id: null,
      is_active: true,
      created_at: '',
    },
    {
      id: 'dept-2',
      name: 'Office of The City Engineer',
      code: 'CEO',
      head_employee_id: 'emp-4',
      parent_department_id: null,
      is_active: true,
      created_at: '',
    },
  ] as Department[];

  const mockEmployees = [
    {
      id: 'emp-1',
      full_name: 'Maria Santos',
      department: 'Information Technology',
      position: 'IT Specialist II',
      status: 'Active',
    },
    {
      id: 'emp-2',
      full_name: 'Mario Santiago',
      department: 'Information Technology',
      position: 'Computer Programmer II',
      status: 'Active',
    },
    {
      id: 'emp-3',
      full_name: 'Ricardo Villanueva',
      department: 'City Planning and Development Office',
      position: 'IT Specialist III',
      status: 'Active',
    },
    {
      id: 'emp-4',
      full_name: 'Juan Dela Cruz',
      department: 'Office of The City Engineer',
      position: 'Civil Engineer I',
      status: 'Active',
    },
  ];

  const mockAssignments = [
    {
      id: 'assign-1',
      office_id: 'dept-2',
      office_name: 'Office of The City Engineer',
      employee_id: 'emp-4',
      employee_name: 'Juan Dela Cruz',
      role: 'DeptHead' as const,
      status: 'Active' as const,
      created_at: '2026-01-01T00:00:00Z',
    },
  ] as unknown as OfficeRoleAssignment[];

  const defaultProps = {
    departments: mockDepartments,
    employees: mockEmployees,
    assignments: mockAssignments,
    onOpenTransfer: vi.fn(),
    onClose: vi.fn(),
    onDone: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // T1: Modal renders with executive title and Office field first
  it('T1: renders with "Appoint Department Head" executive title, subtitle, and Office field first', () => {
    render(<AppointDepartmentHeadModal {...defaultProps} />);

    expect(screen.getByRole('heading', { name: /Appoint Department Head/i })).toBeInTheDocument();
    expect(
      screen.getByText('Assign executive leadership and activate department dashboard privileges.')
    ).toBeInTheDocument();

    const officeSelect = screen.getByLabelText(/Office/i);
    const employeeInput = screen.getByRole('combobox', { name: /Search employee/i });

    expect(officeSelect).toBeInTheDocument();
    expect(employeeInput).toBeInTheDocument();

    // Office element appears prior to the employee combobox in DOM order
    expect(officeSelect.compareDocumentPosition(employeeInput) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // T2: Selecting an occupied office displays incumbent warning and transfer flow trigger
  it('T2: displays incumbent warning with "Go to Transfer Flow" button and disables appoint when occupied office is selected', () => {
    render(<AppointDepartmentHeadModal {...defaultProps} />);

    const officeSelect = screen.getByLabelText(/Office/i);
    fireEvent.change(officeSelect, { target: { value: 'dept-2' } });

    expect(screen.getByText(/Occupied/i)).toBeInTheDocument();
    expect(
      screen.getByText(/This office currently has an active Department Head \(Juan Dela Cruz\)/i)
    ).toBeInTheDocument();

    const transferBtn = screen.getByRole('button', { name: /Go to Transfer Flow/i });
    expect(transferBtn).toBeInTheDocument();

    fireEvent.click(transferBtn);
    expect(defaultProps.onOpenTransfer).toHaveBeenCalledWith(mockAssignments[0]);

    const appointBtn = screen.getByRole('button', { name: /Appoint Department Head/i });
    expect(appointBtn).toBeDisabled();
  });

  // T3: Employee combobox filters staff and prioritizes office members
  it('T3: employee combobox filters staff, groups office members under "Staff in [Office]", and shows selected chip', () => {
    render(<AppointDepartmentHeadModal {...defaultProps} />);

    const officeSelect = screen.getByLabelText(/Office/i);
    fireEvent.change(officeSelect, { target: { value: 'dept-1' } });

    expect(screen.getByText(/Vacant/i)).toBeInTheDocument();

    const searchInput = screen.getByRole('combobox', { name: /Search employee/i });
    fireEvent.focus(searchInput);
    fireEvent.change(searchInput, { target: { value: 'Maria' } });

    // Header grouping for chosen office
    expect(screen.getByText(/Staff in Information Technology/i)).toBeInTheDocument();
    const mariaOption = screen.getByText('Maria Santos');
    expect(mariaOption).toBeInTheDocument();

    // Click Maria Santos to select
    fireEvent.click(mariaOption);

    // Selected chip appears with details and Change button
    expect(screen.getByTestId('selected-employee-chip')).toBeInTheDocument();
    expect(screen.getByText('Maria Santos')).toBeInTheDocument();
    expect(screen.getByText(/IT Specialist II · Information Technology/i)).toBeInTheDocument();

    const changeBtn = screen.getByRole('button', { name: /Change/i });
    expect(changeBtn).toBeInTheDocument();

    // Clicking change resets selection to search input
    fireEvent.click(changeBtn);
    expect(screen.getByRole('combobox', { name: /Search employee/i })).toBeInTheDocument();
  });

  // T4: Dynamic official title from OFFICE_HEAD_POSITIONS appears in preview card
  it('T4: dynamically displays official office head title in promotion preview card and shows SSO reassurance', () => {
    render(<AppointDepartmentHeadModal {...defaultProps} />);

    const officeSelect = screen.getByLabelText(/Office/i);
    fireEvent.change(officeSelect, { target: { value: 'dept-1' } });

    // Preview card appears with mapped title
    expect(screen.getByText(/PROMOTION & DATABASE SYNC PREVIEW/i)).toBeInTheDocument();
    expect(screen.getByText('Head of Information Technology')).toBeInTheDocument();
    expect(screen.getByText('Promotion recorded in position_history')).toBeInTheDocument();

    // Select employee to trigger SSO banner
    const searchInput = screen.getByRole('combobox', { name: /Search employee/i });
    fireEvent.change(searchInput, { target: { value: 'Maria' } });
    fireEvent.click(screen.getByText('Maria Santos'));

    // SSO reassurance copy
    expect(
      screen.getByText(/Maria Santos uses their regular login credentials. Their profile switcher will automatically unlock the Department Head portal upon appointment./i)
    ).toBeInTheDocument();
  });

  // T5: Clicking appoint triggers Confirmation Dialog (Option B) with appointee and title details
  it('T5: opens stacked Confirmation Dialog (Option B) on appoint click and returns to editing on Back', () => {
    render(<AppointDepartmentHeadModal {...defaultProps} />);

    const officeSelect = screen.getByLabelText(/Office/i);
    fireEvent.change(officeSelect, { target: { value: 'dept-1' } });

    const searchInput = screen.getByRole('combobox', { name: /Search employee/i });
    fireEvent.change(searchInput, { target: { value: 'Maria' } });
    fireEvent.click(screen.getByText('Maria Santos'));

    const appointBtn = screen.getByRole('button', { name: /Appoint Department Head/i });
    fireEvent.click(appointBtn);

    // Confirmation dialog open
    const confirmDialog = screen.getByRole('dialog', { name: /Confirm Department Head Appointment/i });
    expect(confirmDialog).toBeInTheDocument();
    expect(screen.getByTestId('confirm-prompt')).toHaveTextContent(
      'Appoint Maria Santos as the Department Head of Information Technology?'
    );
    expect(screen.getByText(/Official title updated to/i)).toBeInTheDocument();
    expect(within(confirmDialog).getByText('Head of Information Technology')).toBeInTheDocument();

    // Click Back to return
    const backBtn = screen.getByRole('button', { name: /Back/i });
    fireEvent.click(backBtn);
    expect(screen.queryByRole('heading', { name: /Confirm Department Head Appointment/i })).not.toBeInTheDocument();
  });

  // T6: Confirming appointment calls createAssignment and renders single identity success view without password boxes
  it('T6: confirms appointment, calls createAssignment API, and renders clean single identity success screen without password fields', async () => {
    const mockCreatedAssignment = {
      id: 'assign-new',
      office_id: 'dept-1',
      office_name: 'Information Technology',
      employee_id: 'emp-1',
      employee_name: 'Maria Santos',
      role: 'DeptHead' as const,
      status: 'Active' as const,
      account_username: 'depthead.it',
      account_password: 'mock-temp-password',
      created_at: '2026-10-21T00:00:00Z',
    };

    vi.mocked(createAssignment).mockResolvedValueOnce({
      ok: true,
      assignment: mockCreatedAssignment as unknown as OfficeRoleAssignment,
    });

    render(<AppointDepartmentHeadModal {...defaultProps} />);

    const officeSelect = screen.getByLabelText(/Office/i);
    fireEvent.change(officeSelect, { target: { value: 'dept-1' } });

    const searchInput = screen.getByRole('combobox', { name: /Search employee/i });
    fireEvent.change(searchInput, { target: { value: 'Maria' } });
    fireEvent.click(screen.getByText('Maria Santos'));

    const appointBtn = screen.getByRole('button', { name: /Appoint Department Head/i });
    fireEvent.click(appointBtn);

    const confirmBtn = screen.getByRole('button', { name: /Confirm Appointment/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(createAssignment).toHaveBeenCalledWith({
        employeeId: 'emp-1',
        employeeName: 'Maria Santos',
        officeId: 'dept-1',
        officeName: 'Information Technology',
        role: 'DeptHead',
        performedBy: expect.any(String),
      });
    });

    // Success view check
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Department Head Appointed/i })).toBeInTheDocument();
    });

    expect(screen.getByTestId('success-description')).toHaveTextContent(
      /Successfully appointed Maria Santos as Department Head of Information Technology. They can access their office dashboard immediately using their current account switcher./i
    );

    // Ensure NO temporary password or username text appears
    expect(screen.queryByText(/Temp password/i)).not.toBeInTheDocument();
    expect(screen.queryByText('mock-temp-password')).not.toBeInTheDocument();

    // Single Done pill button
    const doneBtn = screen.getByRole('button', { name: /Done/i });
    expect(doneBtn).toBeInTheDocument();

    fireEvent.click(doneBtn);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });
});
