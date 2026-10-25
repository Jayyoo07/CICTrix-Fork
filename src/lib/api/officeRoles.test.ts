import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OFFICE_HEAD_POSITIONS,
  ROLE_LABELS,
  createAssignment,
  revokeOrTransfer,
  getActiveOfficeRoles,
  getActiveOfficeRole,
  isDeptHeadOfOffice,
  type OfficeRoleAssignment,
} from './officeRoles';

// Mock DB state tracked across queries
const db = {
  existingActiveHead: null as { employee_name: string } | null,
  assignments: [] as any[],
  deptUpdates: [] as Array<{ id: string; values: any }>,
  empHistory: [] as any[],
  empUpdates: [] as Array<{ id: string; values: any }>,
  evalUpdates: [] as Array<{ ids: string[]; values: any }>,
  auditLogs: [] as any[],
  insertedIdCounter: 1,
};

vi.mock('../supabase', () => {
  const fakeSupabase = {
    from: vi.fn((table: string) => {
      const currentTable = table;
      let lastAction: string | null = null;
      let lastPayload: any = null;
      const eqFilters: Record<string, any> = {};
      const inFilters: Record<string, any[]> = {};

      const builder: any = {
        select: vi.fn((_cols?: string) => {
          lastAction = 'select';
          return builder;
        }),
        insert: vi.fn((payload: any) => {
          lastAction = 'insert';
          lastPayload = payload;
          if (currentTable === 'access_change_audit') {
            db.auditLogs.push(...(Array.isArray(payload) ? payload : [payload]));
          }
          return builder;
        }),
        update: vi.fn((payload: any) => {
          lastAction = 'update';
          lastPayload = payload;
          return builder;
        }),
        eq: vi.fn((col: string, val: any) => {
          eqFilters[col] = val;
          return builder;
        }),
        in: vi.fn((col: string, vals: any[]) => {
          inFilters[col] = vals;
          return builder;
        }),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        single: vi.fn(async () => {
          if (currentTable === 'office_role_assignments') {
            const raw = Array.isArray(lastPayload) ? lastPayload[0] : lastPayload;
            const newRecord = {
              id: `assign-${db.insertedIdCounter++}`,
              ...raw,
            };
            db.assignments.push(newRecord);
            return { data: newRecord, error: null };
          }
          return { data: null, error: null };
        }),
        maybeSingle: vi.fn(async () => {
          if (currentTable === 'office_role_assignments') {
            // Check if looking up active head
            if (eqFilters['role'] === 'DeptHead' && eqFilters['status'] === 'Active') {
              if (db.existingActiveHead) {
                return { data: db.existingActiveHead, error: null };
              }
            }
            return { data: null, error: null };
          }
          if (currentTable === 'employees') {
            return {
              data: { position_history: db.empHistory },
              error: null,
            };
          }
          if (currentTable === 'departments') {
            return { data: { name: 'Office of The City Engineer' }, error: null };
          }
          return { data: null, error: null };
        }),
        then: (resolve: any, reject?: any) => {
          if (lastAction === 'update') {
            if (currentTable === 'departments') {
              db.deptUpdates.push({ id: eqFilters['id'], values: lastPayload });
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            }
            if (currentTable === 'employees') {
              db.empUpdates.push({ id: eqFilters['id'], values: lastPayload });
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            }
            if (currentTable === 'performance_evaluations') {
              const matchedIds = inFilters['id'] || [];
              db.evalUpdates.push({ ids: matchedIds, values: lastPayload });
              return Promise.resolve({ data: null, error: null, count: matchedIds.length }).then(resolve, reject);
            }
            if (currentTable === 'performance_reviews') {
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            }
            if (currentTable === 'office_role_assignments') {
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            }
          }
          if (lastAction === 'select') {
            if (currentTable === 'office_role_assignments') {
              let rows = [...db.assignments];
              if (eqFilters['employee_id']) {
                rows = rows.filter((r) => r.employee_id === eqFilters['employee_id']);
              }
              if (eqFilters['status']) {
                rows = rows.filter((r) => r.status === eqFilters['status']);
              }
              return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
            }
          }
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        },
      };

      return builder;
    }),
  };

  return { supabase: fakeSupabase };
});

describe('Office Roles & Department Head Assignment API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.existingActiveHead = null;
    db.assignments = [];
    db.deptUpdates = [];
    db.empHistory = [];
    db.empUpdates = [];
    db.evalUpdates = [];
    db.auditLogs = [];
    db.insertedIdCounter = 1;
  });

  describe('OFFICE_HEAD_POSITIONS Dictionary Mapping', () => {
    it('maps official head position titles correctly for known departments', () => {
      expect(OFFICE_HEAD_POSITIONS['Information Technology']).toBe('Head of Information Technology');
      expect(OFFICE_HEAD_POSITIONS['Office of The City Accountant']).toBe('City Accountant');
      expect(OFFICE_HEAD_POSITIONS['Office of The City Health Officer']).toBe('City Health Officer');
      expect(OFFICE_HEAD_POSITIONS['Legal']).toBe('City Legal Officer');
      expect(OFFICE_HEAD_POSITIONS['Office of The City Engineer']).toBe('City Engineer');
      expect(OFFICE_HEAD_POSITIONS['City General Services Office']).toBe('City General Services Officer');
      expect(OFFICE_HEAD_POSITIONS['City Budget Office']).toBe('City Budget Officer');
      expect(OFFICE_HEAD_POSITIONS['City Planning and Development Office']).toBe(
        'City Planning and Development Coordinator'
      );
      expect(OFFICE_HEAD_POSITIONS['City Social Welfare and Development Office']).toBe(
        'City Social Welfare and Development Officer'
      );
      expect(OFFICE_HEAD_POSITIONS['City Treasury Office']).toBe('City Treasurer');
      expect(OFFICE_HEAD_POSITIONS['City Veterinarian Office']).toBe('City Veterinarian');
      expect(OFFICE_HEAD_POSITIONS['City Agriculture Office']).toBe('City Agriculturist');
      expect(OFFICE_HEAD_POSITIONS['City Assessor Office']).toBe('City Assessor');
      expect(OFFICE_HEAD_POSITIONS['Internal Audit Services']).toBe('Internal Auditor V');
      expect(OFFICE_HEAD_POSITIONS['Human Resource Management Office']).toBe(
        'City Government Department Head II (HRMO)'
      );
    });

    it('falls back cleanly to "Department Head" for unknown or unlisted offices', () => {
      const unknownOffice = 'Unknown Satellite Division';
      const resolved = OFFICE_HEAD_POSITIONS[unknownOffice] || 'Department Head';
      expect(resolved).toBe('Department Head');
    });

    it('ROLE_LABELS maps DeptHead to Department Head', () => {
      expect(ROLE_LABELS['DeptHead']).toBe('Department Head');
    });
  });

  describe('createAssignment()', () => {
    it('prevents duplicate department heads when an active head already exists for the office', async () => {
      // Simulate existing active head
      db.existingActiveHead = { employee_name: 'Engr. Roberto Cruz' };

      const result = await createAssignment({
        employeeId: 'emp-202',
        employeeName: 'Maria Santos',
        officeId: 'dept-oce',
        officeName: 'Office of The City Engineer',
        role: 'DeptHead',
        performedBy: 'admin@iloilo.gov.ph',
      });

      expect(result.ok).toBe(false);
      if ('error' in result) {
        expect(result.error).toContain('active Department Head (Engr. Roberto Cruz)');
        expect(result.error).toContain('Please transfer or revoke their assignment before appointing a new head');
      }

      // Verify no assignment was inserted
      expect(db.assignments).toHaveLength(0);
      // Verify no departments or employee updates took place
      expect(db.deptUpdates).toHaveLength(0);
      expect(db.empUpdates).toHaveLength(0);
      expect(db.auditLogs).toHaveLength(0);
    });

    it('successfully assigns a valid department head and synchronizes department and employee records', async () => {
      // Prior employee position history
      db.empHistory = [
        {
          position: 'Engineer III',
          department: 'Office of The City Engineer',
          effectiveDate: '2023-01-15',
          changeType: 'promotion',
        },
      ];

      const result = await createAssignment({
        employeeId: 'emp-101',
        employeeName: 'Engr. Roberto Cruz',
        officeId: 'dept-oce',
        officeName: 'Office of The City Engineer',
        role: 'DeptHead',
        performedBy: 'superadmin@iloilo.gov.ph',
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.assignment.employee_id).toBe('emp-101');
        expect(result.assignment.office_id).toBe('dept-oce');
        expect(result.assignment.role).toBe('DeptHead');
        expect(result.assignment.status).toBe('Active');
      }

      // Verify departments.head_employee_id updated
      expect(db.deptUpdates).toHaveLength(1);
      expect(db.deptUpdates[0]).toEqual({
        id: 'dept-oce',
        values: { head_employee_id: 'emp-101' },
      });

      // Verify employees central record updated with official mapped position
      expect(db.empUpdates).toHaveLength(1);
      const empUpdate = db.empUpdates[0];
      expect(empUpdate.id).toBe('emp-101');
      expect(empUpdate.values.department).toBe('Office of The City Engineer');
      expect(empUpdate.values.current_department).toBe('Office of The City Engineer');
      expect(empUpdate.values.position).toBe('City Engineer');
      expect(empUpdate.values.current_position).toBe('City Engineer');

      // Verify position history has prior entries + new promotion entry
      const history = empUpdate.values.position_history;
      expect(history).toHaveLength(2);
      expect(history[0].position).toBe('Engineer III');
      expect(history[1]).toMatchObject({
        position: 'City Engineer',
        department: 'Office of The City Engineer',
        changeType: 'promotion',
        notes: 'Appointed Department Head of Office of The City Engineer by Super Admin',
      });

      // Verify audit log
      expect(db.auditLogs).toHaveLength(1);
      expect(db.auditLogs[0]).toMatchObject({
        action: 'assign',
        role: 'DeptHead',
        office_name: 'Office of The City Engineer',
        employee_name: 'Engr. Roberto Cruz',
        performed_by: 'superadmin@iloilo.gov.ph',
      });
    });
  });

  describe('revokeOrTransfer()', () => {
    const existingAssignment: OfficeRoleAssignment = {
      id: 'assign-old-99',
      employee_id: 'emp-retiring',
      employee_name: 'Elena Santos',
      office_id: 'dept-cbo',
      office_name: 'City Budget Office',
      role: 'DeptHead',
      account_username: 'elena.santos',
      account_password: 'Password123!',
      must_change_password: false,
      status: 'Active',
      assigned_by: 'admin',
      assigned_at: '2025-01-01T00:00:00.000Z',
      revoked_by: null,
      revoked_at: null,
      revoke_reason: null,
      successor_employee_id: null,
      successor_name: null,
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-01T00:00:00.000Z',
    };

    it('handles vacancy revocation without successor by setting departments.head_employee_id = null', async () => {
      const result = await revokeOrTransfer({
        assignment: existingAssignment,
        reason: 'Compulsory retirement at age 65',
        performedBy: 'hradmin@iloilo.gov.ph',
        successor: null,
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.successorAssignment).toBeNull();
        expect(result.rerouted).toBe(0);
      }

      // departments.head_employee_id should be cleared to null
      expect(db.deptUpdates).toHaveLength(1);
      expect(db.deptUpdates[0]).toEqual({
        id: 'dept-cbo',
        values: { head_employee_id: null },
      });

      // Audit log should capture revocation
      expect(db.auditLogs).toHaveLength(1);
      expect(db.auditLogs[0]).toMatchObject({
        action: 'revoke',
        role: 'DeptHead',
        office_name: 'City Budget Office',
        employee_name: 'Elena Santos',
        details: 'Access revoked. Reason: Compulsory retirement at age 65',
        performed_by: 'hradmin@iloilo.gov.ph',
      });
    });

    it('handles succession transfer with successor: sets new head, updates successor employee, and reroutes pending reviews', async () => {
      db.empHistory = [
        {
          position: 'Budget Officer IV',
          department: 'City Budget Office',
          effectiveDate: '2024-03-01',
          changeType: 'promotion',
        },
      ];

      const result = await revokeOrTransfer({
        assignment: existingAssignment,
        reason: 'Leadership succession transfer',
        performedBy: 'superadmin@iloilo.gov.ph',
        successor: {
          employeeId: 'emp-successor-303',
          employeeName: 'Danilo Reyes',
        },
        rerouteSubmissionIds: ['eval-ipcr-001', 'eval-ipcr-002'],
      });

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.successorAssignment).not.toBeNull();
        expect(result.successorAssignment?.employee_id).toBe('emp-successor-303');
        expect(result.rerouted).toBe(2);
      }

      // Departments head_employee_id updated to successor
      expect(db.deptUpdates).toHaveLength(1);
      expect(db.deptUpdates[0]).toEqual({
        id: 'dept-cbo',
        values: { head_employee_id: 'emp-successor-303' },
      });

      // Successor's employee record updated with City Budget Officer
      expect(db.empUpdates).toHaveLength(1);
      const succUpdate = db.empUpdates[0];
      expect(succUpdate.id).toBe('emp-successor-303');
      expect(succUpdate.values.position).toBe('City Budget Officer');
      expect(succUpdate.values.current_position).toBe('City Budget Officer');
      expect(succUpdate.values.department).toBe('City Budget Office');

      // History should have promotion entry
      const succHistory = succUpdate.values.position_history;
      expect(succHistory).toHaveLength(2);
      expect(succHistory[1]).toMatchObject({
        position: 'City Budget Officer',
        department: 'City Budget Office',
        changeType: 'promotion',
      });

      // Pending evaluations should be rerouted
      expect(db.evalUpdates).toHaveLength(1);
      expect(db.evalUpdates[0]).toEqual({
        ids: ['eval-ipcr-001', 'eval-ipcr-002'],
        values: { supervisor_id: 'emp-successor-303' },
      });

      // Audit logs for revoke, transfer, and reroute
      const actions = db.auditLogs.map((l) => l.action);
      expect(actions).toContain('revoke');
      expect(actions).toContain('transfer');
      expect(actions).toContain('reroute');
    });
  });

  describe('getActiveOfficeRoles & isDeptHeadOfOffice()', () => {
    it('returns empty list if employeeId is empty', async () => {
      expect(await getActiveOfficeRoles('')).toEqual([]);
      expect(await getActiveOfficeRole('')).toBeNull();
      expect(await isDeptHeadOfOffice('', 'dept-1')).toBe(false);
    });

    it('returns active roles and evaluates isDeptHeadOfOffice correctly', async () => {
      db.assignments = [
        {
          id: 'asg-1',
          employee_id: 'emp-55',
          office_id: 'dept-it',
          office_name: 'Information Technology',
          role: 'DeptHead',
          status: 'Active',
        },
      ];

      const roles = await getActiveOfficeRoles('emp-55');
      expect(roles).toHaveLength(1);
      expect(roles[0]).toEqual({
        assignmentId: 'asg-1',
        role: 'DeptHead',
        officeId: 'dept-it',
        officeName: 'Information Technology',
      });

      expect(await isDeptHeadOfOffice('emp-55', 'dept-it')).toBe(true);
      expect(await isDeptHeadOfOffice('emp-55', 'dept-oce')).toBe(false);

      const primary = await getActiveOfficeRole('emp-55');
      expect(primary?.role).toBe('DeptHead');
    });
  });
});
