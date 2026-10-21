import { useBackClosesView } from '../../hooks/useHistoryBack';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { getAdminEmail } from '../../lib/adminSession';
import { AlertCircle, Archive, Building2, CalendarClock, Check, CheckCircle2, ChevronDown, ClipboardList, Copy, History, Lock, Search, ShieldCheck, UserMinus, UserPlus, Users, X } from 'lucide-react';
import { getAllEmployees, type Employee } from '../../lib/api/employees';
import { AdminHeader } from '../../components/AdminHeader';
import { Dialog } from '../../components/Dialog';
import { Sidebar } from '../../components/Sidebar';
import { listDepartments, type Department } from '../../lib/api/departments';
import {
  type PhaseKey,
  type PhaseMode,
  type PhaseSchedule,
  PHASE_LABELS,
  deleteSchedule,
  effectiveState,
  listSchedules,
  resolveSchedule,
  upsertSchedule,
} from '../../lib/api/phaseSchedules';
import {
  type LockedTargetSet,
  fetchTargetRowsForEmployee,
  listLockedTargets,
  lockTargetSet,
} from '../../lib/api/lockedTargets';
import {
  type OfficeCompliance,
  getActiveCyclePeriod,
  getComplianceByOffice,
} from '../../lib/api/compliance';
import {
  type CloseoutReadiness,
  type CompilationKind,
  buildReadiness,
  closeoutOffice,
  listCloseouts,
  listCompilations,
  recordCompilation,
} from '../../lib/api/closeout';
import {
  type OfficeDirectoryRow,
  type OfficePerson,
  filterOfficeDirectory,
  getOfficeDirectory,
} from '../../lib/api/officeDirectory';
import {
  type EmployeeOption,
  type OfficeRole,
  type OfficeRoleAssignment,
  type PendingSubmission,
  OFFICE_HEAD_POSITIONS,
  ROLE_LABELS,
  createAssignment,
  getPendingSubmissions,
  listAssignments,
  listAuditTrail,
  listEmployeeOptions,
  revokeOrTransfer,
} from '../../lib/api/officeRoles';
import '../../styles/admin.css';
import { SkeletonList, useTableLoading } from '../../components/table-loading';

// Session lives in the shared per-tab module so every screen reads one identity.
const getCurrentAdminEmail = (): string => getAdminEmail();

// ── Tab / subtab definition (Module 1: System Administration) ────────────────
interface SubtabDef {
  key: string;
  label: string;
  blurb: string;
  ready?: boolean;
}
interface TabDef {
  key: string;
  label: string;
  subtabs: SubtabDef[];
}

const TABS: TabDef[] = [
  {
    key: '1.1',
    label: '1.1 Personnel & Office Registry',
    subtabs: [
      {
        key: 'office-directory',
        label: 'Office Directory',
        blurb: 'Master list of every office with its Department Head, Supervisor(s), and headcount.',
        ready: true,
      },
      {
        key: 'access-role',
        label: 'Access & Role Management',
        blurb:
          'Assign or remove Supervisor / Dept Head roles tied to an office, auto-link Office Account credentials, and reroute pending submissions via the Succession Transfer Tool.',
        ready: true,
      },
    ],
  },
  {
    key: '1.2',
    label: '1.2 Cycle & Timeline Settings',
    subtabs: [
      {
        key: 'phase-scheduler',
        label: 'Phase Scheduler',
        blurb:
          'Open/close the Target-Setting and Rating phases (system-wide or per office) with start and deadline dates.',
        ready: true,
      },
      {
        key: 'locked-targets',
        label: 'Locked Targets Vault',
        blurb:
          'Frozen, read-only store of office-verified targets for the 6-month period; feeds the Accomplishment Rating step.',
        ready: true,
      },
    ],
  },
  {
    key: '1.3',
    label: '1.3 Submission Compliance & Closeout',
    subtabs: [
      {
        key: 'compliance-tracker',
        label: 'Compliance Tracker',
        blurb:
          'Per-office progress: % of employees submitted vs. % of office verified, drillable and sortable.',
        ready: true,
      },
      {
        key: 'final-closeout',
        label: 'Final Review & Closeout',
        blurb:
          'Validate that all IPCRs, the DPCR, and the OPCR are present before PM locks, timestamps, and archives the office cycle.',
        ready: true,
      },
    ],
  },
];

export const SystemAdministrationPage = () => {
  const [activeTab, setActiveTab] = useState<'directory' | 'access-roles'>('directory');

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <AdminHeader userName="Super Admin" divisionLabel="System Administrator" />
      <div className="admin-layout">
        <Sidebar activeModule="Super" userRole="super-admin" />
        <main className="admin-content">
          <div className="admin-header">
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <ShieldCheck size={26} />
              System Administration
            </h1>
            <p className="admin-subtitle">
              {activeTab === 'directory'
                ? 'Master list of offices, department heads, supervisors, and headcount.'
                : 'Assign or remove department heads, manage office access, and handle succession transfers.'}
            </p>
          </div>

          <div className="mb-6">
            <div className="inline-flex bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200/60">
              <button
                type="button"
                onClick={() => setActiveTab('directory')}
                className={
                  activeTab === 'directory'
                    ? 'px-4 py-2 text-sm font-bold text-[#040E6B] bg-white rounded-lg shadow-sm border border-slate-200/50 transition-all'
                    : 'px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:text-slate-900 transition-colors'
                }
              >
                Office Directory
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('access-roles')}
                className={
                  activeTab === 'access-roles'
                    ? 'px-4 py-2 text-sm font-bold text-[#040E6B] bg-white rounded-lg shadow-sm border border-slate-200/50 transition-all'
                    : 'px-4 py-2 text-sm font-semibold text-slate-600 rounded-lg hover:text-slate-900 transition-colors'
                }
              >
                Access & Role Management
              </button>
            </div>
          </div>

          {activeTab === 'directory' ? <OfficeDirectory /> : <AccessRoleManagement />}
        </main>
      </div>
    </div>
  );
};

// ── Subtab: Office Directory ─────────────────────────────────────────────────
const OfficeDirectory = () => {
  const [rows, setRows] = useState<OfficeDirectoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const officesLoad = useTableLoading(loading, rows.length > 0);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [drillOfficeRow, setDrillOfficeRow] = useState<OfficeDirectoryRow | null>(null);
  useBackClosesView(drillOfficeRow !== null, () => setDrillOfficeRow(null), 'sysadmin-office');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      const result = await getOfficeDirectory();
      if (cancelled) return;
      if (result.ok) {
        setRows(result.data);
      } else if ('error' in result) {
        setError(result.error);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleOfficeClick = (row: OfficeDirectoryRow) => {
    setDrillOfficeRow(row);
  };

  const getOfficeDirInitials = (name: string): string => {
    const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '??';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const filtered = useMemo(() => filterOfficeDirectory(rows, search), [rows, search]);

  if (drillOfficeRow !== null) {
    return (
      <div>

        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden', padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, fontSize: '20px', color: '#1f2937', marginBottom: '4px' }}>
            <Building2 size={24} className="text-[#363EE8]" />
            {drillOfficeRow.officeName}
          </div>
          <p style={{ fontSize: '14px', color: '#6b7280', marginTop: 0, marginBottom: '24px' }}>
            {drillOfficeRow.employeeCount} employee{drillOfficeRow.employeeCount !== 1 ? 's' : ''}
          </p>

          {/* Department Head Card */}
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '8px', background: '#dbeafe', color: '#1e40af', display: 'flex', alignItems: 'center', fontWeight: 700, fontSize: '18px', justifyContent: 'center' }}>
              {drillOfficeRow.deptHead ? getOfficeDirInitials(drillOfficeRow.deptHead.name) : 'DH'}
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '11px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Department Head</p>
              {drillOfficeRow.deptHead ? (
                <>
                  <p style={{ margin: '4px 0 0 0', fontSize: '16px', fontWeight: 700, color: '#1f2937' }}>{drillOfficeRow.deptHead.name}</p>
                  <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#6b7280' }}>
                    {drillOfficeRow.deptHead.position} · {drillOfficeRow.deptHead.contact}
                  </p>
                </>
              ) : (
                <p style={{ margin: '4px 0 0 0', fontSize: '14px', fontWeight: 600, color: '#b45309' }}>Unassigned</p>
              )}
            </div>
            {drillOfficeRow.deptHead && (
              <div style={{ marginLeft: 'auto' }}>
                <AccountStatusBadge status={drillOfficeRow.deptHead.accountStatus} />
              </div>
            )}
          </div>

          <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#1f2937', marginBottom: '16px', marginTop: 0 }}>Divisions & Assigned Supervisors</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {drillOfficeRow.divisions.map((div, idx) => (
              <div key={idx} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)' }}>
                <div>
                  <div style={{ borderBottom: '1px solid #f3f4f6', paddingBottom: '12px', marginBottom: '16px' }}>
                    <h4 style={{ margin: 0, fontWeight: 700, color: '#1f2937', fontSize: '14px' }}>{div.name}</h4>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <p style={{ margin: 0, fontSize: '10px', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supervisors</p>
                    {div.supervisors.length === 0 ? (
                      <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '8px', padding: '12px', color: '#b45309', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <AlertCircle size={16} style={{ color: '#d97706', flexShrink: 0 }} />
                        <span>No supervisors assigned to this division.</span>
                      </div>
                    ) : (
                      div.supervisors.map((sup, sIdx) => {
                        const initials = getOfficeDirInitials(sup.name);
                        return (
                          <div key={sIdx} style={{ display: 'flex', alignItems: 'start', gap: '12px', padding: '10px', borderRadius: '8px', border: '1px solid #f3f4f6', background: '#fafafa' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '4px', background: '#3b82f6', color: '#fff', fontWeight: 700, fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {initials}
                            </div>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <p style={{ margin: 0, fontWeight: 600, color: '#1f2937', fontSize: '13px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sup.name}</p>
                              <p style={{ margin: '2px 0 0 0', color: '#6b7280', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sup.position || 'Supervisor'}</p>
                              <p style={{ margin: '2px 0 0 0', color: '#9ca3af', fontFamily: 'monospace', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sup.contact}</p>
                              <div style={{ marginTop: '8px' }}>
                                <AccountStatusBadge status={sup.accountStatus} />
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Search / filter bar */}
      <div style={{ position: 'relative', maxWidth: '440px', marginBottom: '16px' }}>
        <Search
          size={16}
          style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by office, Dept Head, or Supervisor name…"
          style={{
            width: '100%',
            padding: '9px 12px 9px 36px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontSize: '14px',
            outline: 'none',
          }}
        />
      </div>

      {error && (
        <div
          style={{
            margin: '16px 0',
            padding: '12px 16px',
            background: 'rgba(220, 38, 38, 0.1)',
            border: '1px solid rgba(220, 38, 38, 0.3)',
            borderRadius: '8px',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', overflow: 'hidden' }}>
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #e5e7eb',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontWeight: 600,
            color: '#1f2937',
          }}
        >
          <Building2 size={18} />
          Office Directory
          <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>
            {officesLoad.initialLoading ? '' : `${filtered.length} office${filtered.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {officesLoad.initialLoading ? (
          <SkeletonList show={officesLoad.showSkeleton} label="Loading offices…" />
        ) : filtered.length === 0 && !error ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
            {rows.length === 0
              ? 'No offices found. Ensure the departments table is seeded (migration 006).'
              : 'No offices match your search.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                  <th style={th}>Office</th>
                  <th style={th}>Department Head</th>
                  <th style={{ ...th, textAlign: 'right' }}>Employees</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.officeId}
                    onClick={() => handleOfficeClick(row)}
                    style={{ borderTop: '1px solid #f0f0f0', cursor: 'pointer' }}
                    className="hover:bg-blue-50/40"
                  >
                    <td style={td}>
                      <div style={{ fontWeight: 600, color: '#363EE8' }}>{row.officeName || '—'}</div>
                      <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                        {row.code}
                        {!row.isActive && ' · Inactive'}
                      </div>
                    </td>
                    <td style={td}>
                      {row.deptHead ? (
                        <PersonCell person={row.deptHead} />
                      ) : (
                        <span style={{ color: '#b45309', fontSize: '13px' }}>Unassigned</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontWeight: 600,
                          color: '#1f2937',
                        }}
                      >
                        <Users size={14} style={{ color: '#9ca3af' }} />
                        {row.employeeCount}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ marginTop: '12px', fontSize: '12px', color: '#9ca3af' }}>
        Click an office row to view all divisions and assigned supervisors.
      </p>
    </div>
  );
};

const PersonCell = ({ person }: { person: OfficePerson }) => (
  <div>
    <div style={{ fontWeight: 600, color: '#1f2937' }}>{person.name}</div>
    {person.position && (
      <div style={{ fontSize: '12px', color: '#6b7280' }}>{person.position}</div>
    )}
    <div style={{ fontSize: '12px', color: '#9ca3af' }}>{person.contact}</div>
    <AccountStatusBadge status={person.accountStatus} />
  </div>
);

const AccountStatusBadge = ({ status }: { status: string }) => {
  const active = status.toLowerCase() === 'active';
  return (
    <span
      style={{
        display: 'inline-block',
        marginTop: '4px',
        padding: '1px 8px',
        borderRadius: '999px',
        fontSize: '11px',
        fontWeight: 600,
        background: active ? 'rgba(16, 185, 129, 0.12)' : 'rgba(107, 114, 128, 0.15)',
        color: active ? '#047857' : '#4b5563',
      }}
    >
      {status}
    </span>
  );
};

// ── Subtab: Access & Role Management ─────────────────────────────────────────
const AccessRoleManagement = () => {
  const [assignments, setAssignments] = useState<OfficeRoleAssignment[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof listAuditTrail>>>([]);
  const [loading, setLoading] = useState(true);
  const assignmentsLoad = useTableLoading(loading, assignments.length > 0);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<OfficeRoleAssignment | null>(null);

  const reload = async () => {
    setLoading(true);
    setError('');
    const [aRes, deps, emps, aud] = await Promise.all([
      listAssignments(false),
      listDepartments(true),
      listEmployeeOptions(),
      listAuditTrail(40),
    ]);
    if (aRes.ok) setAssignments(aRes.data);
    else if ('error' in aRes) setError(aRes.error);
    setDepartments(deps.success ? deps.data : []);
    setEmployees(emps);
    setAudit(aud);
    setLoading(false);
  };

  useEffect(() => {
    void reload();
  }, []);

  const flash = (msg: string) => {
    setBanner(msg);
    setTimeout(() => setBanner(''), 6000);
  };

  return (
    <div>
      {banner && (
        <div style={bannerOk}>
          <Check size={18} />
          {banner}
        </div>
      )}
      {error && (
        <div style={bannerErr}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <p style={{ color: '#6b7280', fontSize: '14px', margin: 0, flex: 1 }}>
          Assign or remove office roles. Removing preserves history and can transfer the role plus reroute
          pending submissions to a successor.
        </p>
        <button type="button" onClick={() => setShowAdd(true)} style={{ ...primaryBtn, borderRadius: '999px' }}>
          <UserPlus size={15} />
          Appoint Department Head
        </button>
      </div>

      {/* Active assignments */}
      <div style={card}>
        <div style={cardHeader}>
          <Users size={18} />
          Active Role Assignments
          <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>
            {assignmentsLoad.initialLoading ? '' : `${assignments.length}`}
          </span>
        </div>
        {assignmentsLoad.initialLoading ? (
          <SkeletonList show={assignmentsLoad.showSkeleton} label="Loading assignments…" />
        ) : assignments.length === 0 ? (
          <div style={emptyBox}>
            No active assignments yet. Use “Add Personnel” to assign a Supervisor or Department Head. (If this
            looks wrong, ensure migration <code>011_create_office_role_assignments.sql</code> has been run.)
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                  <th style={th}>Employee</th>
                  <th style={th}>Office</th>
                  <th style={th}>Role</th>
                  <th style={th}>Office Account</th>
                  <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={td}>
                      <span style={{ fontWeight: 600, color: '#1f2937' }}>{a.employee_name || '—'}</span>
                    </td>
                    <td style={td}>{a.office_name || '—'}</td>
                    <td style={td}>
                      <span style={rolePill(a.role)}>{ROLE_LABELS[a.role]}</span>
                    </td>
                    <td style={td}>
                      <code style={{ color: '#374151' }}>{a.account_username || '—'}</code>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button type="button" onClick={() => setRemoveTarget(a)} style={dangerOutlineBtn}>
                        <UserMinus size={15} />
                        Remove / Transfer
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Audit trail */}
      <div style={{ ...card, marginTop: '20px' }}>
        <div style={cardHeader}>
          <History size={18} />
          Access Change Audit Trail
          <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>
            {audit.length ? `${audit.length} recent` : ''}
          </span>
        </div>
        {audit.length === 0 ? (
          <div style={emptyBox}>No access changes recorded yet.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: '8px 0' }}>
            {audit.map((entry) => (
              <li
                key={entry.id}
                style={{ display: 'flex', gap: '12px', padding: '10px 20px', borderTop: '1px solid #f5f5f5' }}
              >
                <span style={auditPill(entry.action)}>{entry.action}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', color: '#374151' }}>{entry.details || '—'}</div>
                  <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
                    {entry.performed_by || 'unknown'} · {new Date(entry.created_at).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showAdd && (
        <AddPersonnelModal
          departments={departments}
          employees={employees}
          assignments={assignments}
          onOpenTransfer={(assignment) => {
            setShowAdd(false);
            setRemoveTarget(assignment);
          }}
          onClose={() => setShowAdd(false)}
          onDone={(msg) => {
            flash(msg);
            void reload();
          }}
        />
      )}
      {removeTarget && (
        <RemoveTransferModal
          assignment={removeTarget}
          employees={employees}
          onClose={() => setRemoveTarget(null)}
          onDone={(msg) => {
            flash(msg);
            setRemoveTarget(null);
            void reload();
          }}
        />
      )}
    </div>
  );
};

// ── Appoint Department Head Modal & Helpers ─────────────────────────────────
const getPersonInitials = (name: string): string => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const getAvatarColor = (name: string): string => {
  const colors = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#0891b2', '#4f46e5'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

export interface SearchableEmployeeComboboxProps {
  employees: EmployeeOption[];
  selectedEmployee: EmployeeOption | null;
  selectedOfficeName?: string;
  onSelect: (emp: EmployeeOption | null) => void;
  disabled?: boolean;
}

export const SearchableEmployeeCombobox: React.FC<SearchableEmployeeComboboxProps> = ({
  employees,
  selectedEmployee,
  selectedOfficeName,
  onSelect,
  disabled,
}) => {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const cleanQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!cleanQuery) return employees;
    return employees.filter((e) => {
      const name = e.full_name?.toLowerCase() || '';
      const pos = e.position?.toLowerCase() || '';
      const dept = e.department?.toLowerCase() || '';
      return name.includes(cleanQuery) || pos.includes(cleanQuery) || dept.includes(cleanQuery);
    });
  }, [employees, cleanQuery]);

  const { officeStaff, otherStaff } = useMemo(() => {
    if (!selectedOfficeName) {
      return { officeStaff: [], otherStaff: filtered };
    }
    const normOffice = selectedOfficeName.trim().toLowerCase();
    const officeList: EmployeeOption[] = [];
    const otherList: EmployeeOption[] = [];
    for (const emp of filtered) {
      if (emp.department && emp.department.trim().toLowerCase() === normOffice) {
        officeList.push(emp);
      } else {
        otherList.push(emp);
      }
    }
    return { officeStaff: officeList, otherStaff: otherList };
  }, [filtered, selectedOfficeName]);

  const flattened = useMemo(() => {
    if (selectedOfficeName && officeStaff.length > 0) {
      return [...officeStaff, ...otherStaff];
    }
    return filtered;
  }, [selectedOfficeName, officeStaff, otherStaff, filtered]);

  useEffect(() => {
    const handleClickOutside = (ev: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(ev.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
        setIsOpen(true);
        return;
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < flattened.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : Math.max(0, flattened.length - 1)));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (flattened[highlightedIndex]) {
        onSelect(flattened[highlightedIndex]);
        setIsOpen(false);
        setQuery('');
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
    }
  };

  if (selectedEmployee) {
    return (
      <div
        data-testid="selected-employee-chip"
        style={{
          border: '1px solid #cbd5e1',
          borderRadius: '8px',
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          background: '#ffffff',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: getAvatarColor(selectedEmployee.full_name),
            color: '#ffffff',
            fontWeight: 700,
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {getPersonInitials(selectedEmployee.full_name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#040E6B' }}>
            {selectedEmployee.full_name}
          </div>
          <div style={{ fontSize: '11px', color: '#515F69', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {[selectedEmployee.position, selectedEmployee.department].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onSelect(null);
            setQuery('');
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: '4px 8px',
            fontSize: '12px',
            color: '#363ee8',
            fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            borderRadius: '4px',
          }}
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          border: isOpen ? '1.5px solid #363EE8' : '1px solid #cbd5e1',
          boxShadow: isOpen ? '0 0 0 3px rgba(54, 62, 232, 0.12)' : 'none',
          borderRadius: '8px',
          background: '#ffffff',
          padding: '0 10px',
          height: '40px',
        }}
      >
        <Search size={16} style={{ color: '#64748b', marginRight: '8px', flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-controls="employee-combobox-list"
          aria-label="Search employee"
          placeholder="Search employee by name, position, or department…"
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightedIndex(0);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          style={{
            flex: 1,
            border: 'none',
            outline: 'none',
            fontSize: '13px',
            color: '#1e293b',
            background: 'transparent',
          }}
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              setHighlightedIndex(0);
              inputRef.current?.focus();
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px',
              color: '#64748b',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <X size={15} />
          </button>
        )}
      </div>

      {isOpen && (
        <div
          id="employee-combobox-list"
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            maxHeight: '240px',
            overflowY: 'auto',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            boxShadow: '0 8px 20px rgba(0, 0, 0, 0.12)',
            zIndex: 50,
          }}
        >
          {flattened.length === 0 ? (
            <div style={{ padding: '12px 14px', fontSize: '13px', color: '#64748b', textAlign: 'center' }}>
              No employees found matching &quot;{query}&quot;
            </div>
          ) : (
            <>
              {selectedOfficeName && officeStaff.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: '6px 12px',
                      background: '#f1f5f9',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                    }}
                  >
                    Staff in {selectedOfficeName} ({officeStaff.length})
                  </div>
                  {officeStaff.map((emp) => {
                    const idx = flattened.indexOf(emp);
                    const isHighlighted = idx === highlightedIndex;
                    return (
                      <div
                        key={emp.id}
                        role="option"
                        aria-selected={isHighlighted}
                        onClick={() => {
                          onSelect(emp);
                          setIsOpen(false);
                          setQuery('');
                        }}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        style={{
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          background: isHighlighted ? '#eef2ff' : '#ffffff',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        <div
                          style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '50%',
                            background: getAvatarColor(emp.full_name),
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {getPersonInitials(emp.full_name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#040E6B' }}>
                            {emp.full_name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#515F69', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[emp.position, emp.department].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedOfficeName && officeStaff.length > 0 && otherStaff.length > 0 && (
                <div>
                  <div
                    style={{
                      padding: '6px 12px',
                      background: '#f1f5f9',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#475569',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      borderTop: '1px solid #e2e8f0',
                    }}
                  >
                    Other Staff ({otherStaff.length})
                  </div>
                  {otherStaff.map((emp) => {
                    const idx = flattened.indexOf(emp);
                    const isHighlighted = idx === highlightedIndex;
                    return (
                      <div
                        key={emp.id}
                        role="option"
                        aria-selected={isHighlighted}
                        onClick={() => {
                          onSelect(emp);
                          setIsOpen(false);
                          setQuery('');
                        }}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        style={{
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          background: isHighlighted ? '#eef2ff' : '#ffffff',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        <div
                          style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '50%',
                            background: getAvatarColor(emp.full_name),
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {getPersonInitials(emp.full_name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#040E6B' }}>
                            {emp.full_name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#515F69', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[emp.position, emp.department].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {(!selectedOfficeName || officeStaff.length === 0) && (
                <div>
                  {flattened.map((emp, idx) => {
                    const isHighlighted = idx === highlightedIndex;
                    return (
                      <div
                        key={emp.id}
                        role="option"
                        aria-selected={isHighlighted}
                        onClick={() => {
                          onSelect(emp);
                          setIsOpen(false);
                          setQuery('');
                        }}
                        onMouseEnter={() => setHighlightedIndex(idx)}
                        style={{
                          padding: '8px 12px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          cursor: 'pointer',
                          background: isHighlighted ? '#eef2ff' : '#ffffff',
                          borderBottom: '1px solid #f1f5f9',
                        }}
                      >
                        <div
                          style={{
                            width: '30px',
                            height: '30px',
                            borderRadius: '50%',
                            background: getAvatarColor(emp.full_name),
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '11px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          {getPersonInitials(emp.full_name)}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#040E6B' }}>
                            {emp.full_name}
                          </div>
                          <div style={{ fontSize: '11px', color: '#515F69', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {[emp.position, emp.department].filter(Boolean).join(' · ')}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div
            style={{
              padding: '6px 12px',
              background: '#fafafa',
              borderTop: '1px solid #e2e8f0',
              fontSize: '11px',
              color: '#64748b',
            }}
          >
            Use Arrow Up/Down to navigate, Enter to select, Esc to close
          </div>
        </div>
      )}
    </div>
  );
};

// ── Option B Stacked Confirmation Dialog ────────────────────────────────────
export interface AppointmentConfirmDialogProps {
  open: boolean;
  employeeName: string;
  officeName: string;
  mappedTitle: string;
  saving: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

export const AppointmentConfirmDialog: React.FC<AppointmentConfirmDialogProps> = ({
  open,
  employeeName,
  officeName,
  mappedTitle,
  saving,
  onBack,
  onConfirm,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm Department Head Appointment"
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(4, 14, 107, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 60,
        padding: '16px',
      }}
      onClick={onBack}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '480px',
          width: '100%',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: '#e0e7ff',
              color: '#363ee8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Check size={20} strokeWidth={2.5} style={{ color: '#363ee8' }} />
          </div>
          <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#040E6B' }}>
            Confirm Department Head Appointment
          </h3>
        </div>

        <p data-testid="confirm-prompt" style={{ fontSize: '13px', color: '#334155', lineHeight: 1.5, marginBottom: '16px' }}>
          Appoint <strong>{employeeName}</strong> as the Department Head of <strong>{officeName}</strong>?
        </p>

        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '12px 14px',
            fontSize: '12px',
            color: '#475569',
            marginBottom: '18px',
            lineHeight: 1.6,
          }}
        >
          <div style={{ marginBottom: '4px' }}>
            • Official title updated to <strong>{mappedTitle}</strong>
          </div>
          <div style={{ marginBottom: '4px' }}>
            • Promotion recorded in <code style={{ fontSize: '11px', background: '#e2e8f0', padding: '1px 4px', borderRadius: '3px' }}>position_history</code>
          </div>
          <div>
            • Immediate portal access granted via current account switcher
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            style={{
              padding: '8px 20px',
              border: '1.5px solid #cbd5e1',
              background: '#ffffff',
              borderRadius: '999px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#475569',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            Back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            style={{
              padding: '8px 22px',
              background: 'linear-gradient(180deg, #363EE8, #191FA8)',
              border: 'none',
              borderRadius: '999px',
              fontSize: '13px',
              fontWeight: 700,
              color: '#ffffff',
              cursor: saving ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 4px rgba(4, 14, 107, 0.15)',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Confirming…' : 'Confirm Appointment'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Appoint Department Head Modal ────────────────────────────────────────────
export interface AppointDepartmentHeadModalProps {
  departments: Department[];
  employees: EmployeeOption[];
  assignments: OfficeRoleAssignment[];
  onOpenTransfer: (assignment: OfficeRoleAssignment) => void;
  onClose: () => void;
  onDone: (msg: string) => void;
}

export const AppointDepartmentHeadModal = ({
  departments,
  employees,
  assignments,
  onOpenTransfer,
  onClose,
  onDone,
}: AppointDepartmentHeadModalProps) => {
  const [officeId, setOfficeId] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeOption | null>(null);
  const [role] = useState<OfficeRole>('DeptHead');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [appointedDetails, setAppointedDetails] = useState<{ employeeName: string; officeName: string } | null>(null);

  const selectedOffice = departments.find((d) => d.id === officeId);
  const incumbent = officeId
    ? assignments.find((a) => a.office_id === officeId && a.status === 'Active' && a.role === 'DeptHead')
    : undefined;

  const mappedTitle = selectedOffice
    ? (OFFICE_HEAD_POSITIONS[selectedOffice.name] || 'Department Head')
    : 'Department Head';

  const handleOpenConfirm = () => {
    setErr('');
    if (!officeId) return setErr('Select an office.');
    if (!selectedEmployee) return setErr('Select an employee.');
    if (incumbent) {
      return setErr(
        `This office currently has an active Department Head (${incumbent.employee_name}). To replace this head, use Remove / Transfer to ensure pending IPCR reviews are rerouted.`
      );
    }
    setShowConfirm(true);
  };

  const handleExecuteAppointment = async () => {
    if (!selectedEmployee || !selectedOffice) return;
    setErr('');
    setSaving(true);
    const result = await createAssignment({
      employeeId: selectedEmployee.id,
      employeeName: selectedEmployee.full_name,
      officeId: selectedOffice.id,
      officeName: selectedOffice.name,
      role,
      performedBy: getCurrentAdminEmail(),
    });
    setSaving(false);

    if (!result.ok) {
      setShowConfirm(false);
      return setErr('error' in result ? result.error : 'Failed to create assignment.');
    }

    const successMsg = `Successfully appointed ${selectedEmployee.full_name} as Department Head of ${selectedOffice.name}. They can access their office dashboard immediately using their current account switcher.`;
    setAppointedDetails({
      employeeName: selectedEmployee.full_name,
      officeName: selectedOffice.name,
    });
    setShowConfirm(false);
    setIsSuccess(true);
    onDone(successMsg);
  };

  return (
    <>
      <Dialog
        open
        onClose={onClose}
        title={isSuccess ? undefined : 'Appoint Department Head'}
        subtitle={
          isSuccess
            ? undefined
            : 'Assign executive leadership and activate department dashboard privileges.'
        }
        headerIcon={
          isSuccess ? (
            <CheckCircle2 size={20} style={{ color: '#047857', flexShrink: 0 }} />
          ) : (
            <Building2 size={20} style={{ color: '#040E6B', flexShrink: 0 }} />
          )
        }
      >
        {!isSuccess ? (
          <div style={{ color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* 1. Office Selection First */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label htmlFor="modal-office-select" style={{ fontSize: '13px', fontWeight: 600, color: '#28343D', margin: 0 }}>
                  Office <span style={{ color: '#e05252' }}>*</span>
                </label>
                {selectedOffice && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', fontWeight: 600, color: selectedOffice.is_active ? '#166534' : '#6b7280' }}>
                      {selectedOffice.is_active ? 'Active Department' : 'Inactive Department'}
                    </span>
                    {incumbent ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: '#fee2e2',
                          color: '#991b1b',
                        }}
                      >
                        Occupied
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '2px 8px',
                          borderRadius: '999px',
                          fontSize: '11px',
                          fontWeight: 600,
                          background: '#dcfce7',
                          color: '#166534',
                        }}
                      >
                        Vacant
                      </span>
                    )}
                  </div>
                )}
              </div>
              <select
                id="modal-office-select"
                aria-label="Office"
                value={officeId}
                onChange={(e) => {
                  setOfficeId(e.target.value);
                  setErr('');
                }}
                style={{
                  ...input,
                  borderColor: officeId ? '#363ee8' : '#cbd5e1',
                }}
              >
                <option value="">Select an office…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {!d.is_active ? ' (inactive)' : ''}
                  </option>
                ))}
              </select>

              {incumbent && (
                <div
                  style={{
                    marginTop: '10px',
                    padding: '12px 14px',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '8px',
                    color: '#78350f',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', lineHeight: 1.4 }}>
                    <AlertCircle size={18} style={{ color: '#d97706', flexShrink: 0, marginTop: '1px' }} />
                    <span>
                      This office currently has an active Department Head ({incumbent.employee_name}). To replace this head, use Remove / Transfer to ensure pending IPCR reviews are rerouted.
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={() => onOpenTransfer(incumbent)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '6px 14px',
                        background: '#fef3c7',
                        color: '#92400e',
                        border: '1px solid #fcd34d',
                        borderRadius: '999px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Go to Transfer Flow
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Employee to Appoint (Combobox) */}
            <div>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#28343D', marginBottom: '6px' }}>
                Employee to Appoint <span style={{ color: '#e05252' }}>*</span>
              </label>
              <SearchableEmployeeCombobox
                employees={employees}
                selectedEmployee={selectedEmployee}
                selectedOfficeName={selectedOffice?.name}
                onSelect={(emp) => {
                  setSelectedEmployee(emp);
                  setErr('');
                }}
              />
            </div>

            {/* 3. Promotion & Database Sync Preview Card */}
            {selectedOffice && (
              <div
                style={{
                  background: '#f0f7ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: '10px',
                  padding: '12px 14px',
                }}
              >
                <div
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#1e40af',
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    marginBottom: '6px',
                  }}
                >
                  PROMOTION &amp; DATABASE SYNC PREVIEW
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'auto 1fr',
                    gap: '4px 12px',
                    fontSize: '12px',
                    alignItems: 'baseline',
                  }}
                >
                  <span style={{ color: '#64748b' }}>Official Title:</span>
                  <strong style={{ color: '#040E6B' }}>{mappedTitle}</strong>
                  <span style={{ color: '#64748b' }}>Sync Action:</span>
                  <span style={{ color: '#047857', fontWeight: 600 }}>
                    Promotion recorded in position_history
                  </span>
                </div>
              </div>
            )}

            {/* 4. Single Identity SSO Reassurance Banner */}
            {selectedEmployee && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '12px',
                  color: '#475569',
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'flex-start',
                }}
              >
                <ShieldCheck size={16} style={{ color: '#363ee8', flexShrink: 0, marginTop: '2px' }} />
                <span>
                  {selectedEmployee.full_name} uses their regular login credentials. Their profile switcher will automatically unlock the Department Head portal upon appointment.
                </span>
              </div>
            )}

            {err && <div style={{ ...bannerErr, margin: '4px 0 0 0' }}>{err}</div>}

            {/* Modal Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                style={{
                  padding: '8px 20px',
                  border: '1.5px solid #363EE8',
                  background: '#ffffff',
                  borderRadius: '999px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: '#363EE8',
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleOpenConfirm}
                disabled={saving || !!incumbent}
                style={{
                  padding: '8px 22px',
                  background: 'linear-gradient(180deg, #363EE8, #191FA8)',
                  border: 'none',
                  borderRadius: '999px',
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#ffffff',
                  cursor: saving || incumbent ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 4px rgba(4, 14, 107, 0.15)',
                  opacity: saving || incumbent ? 0.5 : 1,
                }}
              >
                Appoint Department Head
              </button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '16px 8px 8px 8px' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '50%',
                background: '#dcfce7',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <CheckCircle2 size={32} style={{ color: '#047857' }} />
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#040E6B', margin: '0 0 10px 0' }}>
              Department Head Appointed
            </h3>
            <p data-testid="success-description" style={{ fontSize: '14px', color: '#475569', lineHeight: 1.5, margin: '0 auto 24px auto', maxWidth: '380px' }}>
              Successfully appointed <strong>{appointedDetails?.employeeName}</strong> as Department Head of <strong>{appointedDetails?.officeName}</strong>. They can access their office dashboard immediately using their current account switcher.
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: '9px 36px',
                  background: 'linear-gradient(180deg, #363EE8, #191FA8)',
                  border: 'none',
                  borderRadius: '999px',
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#ffffff',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(4, 14, 107, 0.15)',
                }}
              >
                Done
              </button>
            </div>
          </div>
        )}
      </Dialog>

      <AppointmentConfirmDialog
        open={showConfirm}
        employeeName={selectedEmployee?.full_name || ''}
        officeName={selectedOffice?.name || ''}
        mappedTitle={mappedTitle}
        saving={saving}
        onBack={() => setShowConfirm(false)}
        onConfirm={handleExecuteAppointment}
      />
    </>
  );
};

export const AddPersonnelModal = AppointDepartmentHeadModal;

// ── Remove / Transfer modal (with Succession Transfer Tool) ──────────────────
const RemoveTransferModal = ({
  assignment,
  employees,
  onClose,
  onDone,
}: {
  assignment: OfficeRoleAssignment;
  employees: EmployeeOption[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) => {
  const [reason, setReason] = useState('');
  const [reassign, setReassign] = useState(false);
  const [successorId, setSuccessorId] = useState('');
  const [pending, setPending] = useState<PendingSubmission[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingPending, setLoadingPending] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!assignment.employee_id) return;
    let cancelled = false;
    setLoadingPending(true);
    getPendingSubmissions(assignment.employee_id)
      .then((p) => {
        if (cancelled) return;
        setPending(p);
        setSelected(new Set(p.map((x) => x.id)));
      })
      .finally(() => {
        if (!cancelled) setLoadingPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignment.employee_id]);

  const successorOptions = employees.filter((e) => e.id !== assignment.employee_id);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    setErr('');
    const successor =
      reassign && successorId
        ? { employeeId: successorId, employeeName: employees.find((e) => e.id === successorId)?.full_name ?? '' }
        : null;

    if (reassign && !successorId) return setErr('Choose a successor, or uncheck “reassign”.');
    if (selected.size > 0 && !successor)
      return setErr('Rerouting pending submissions requires a successor. Enable reassignment or clear the selection.');

    setProcessing(true);
    const result = await revokeOrTransfer({
      assignment,
      reason,
      performedBy: getCurrentAdminEmail(),
      successor,
      rerouteSubmissionIds: successor ? Array.from(selected) : [],
    });
    setProcessing(false);

    if (!result.ok) return setErr('error' in result ? result.error : 'Failed to process the change.');

    const parts = [`✓ Access revoked for ${assignment.employee_name ?? 'the role-holder'}.`];
    if (successor) parts.push(`Role transferred to ${successor.employeeName}.`);
    if (result.rerouted > 0) parts.push(`${result.rerouted} pending submission(s) rerouted.`);
    onDone(parts.join(' '));
  };

  return (
    <Dialog open onClose={onClose} title="Remove / Transfer Role">
      <div style={{ color: 'var(--text-primary)' }}>
        <p style={{ marginBottom: '14px', lineHeight: 1.5 }}>
          Remove <strong>{assignment.employee_name}</strong> as {ROLE_LABELS[assignment.role]} of{' '}
          <strong>{assignment.office_name}</strong>? Their historical records are kept — only active access is
          revoked.
        </p>

        <Field label="Reason (resigned, reassigned, promoted…)">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            style={{ ...input, resize: 'vertical' }}
            placeholder="Optional but recommended for the audit trail"
          />
        </Field>

        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0 12px', cursor: 'pointer' }}>
          <input type="checkbox" checked={reassign} onChange={(e) => setReassign(e.target.checked)} />
          <span style={{ fontWeight: 600 }}>Reassign this role to a successor</span>
        </label>

        {reassign && (
          <Field label="Successor">
            <select value={successorId} onChange={(e) => setSuccessorId(e.target.value)} style={input}>
              <option value="">Select the incoming replacement…</option>
              {successorOptions.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.full_name}
                  {e.department ? ` — ${e.department}` : ''}
                </option>
              ))}
            </select>
          </Field>
        )}

        {/* Succession Transfer Tool */}
        <div style={{ ...card, marginTop: '8px' }}>
          <div style={{ ...cardHeader, padding: '12px 16px' }}>
            <ClipboardList size={16} />
            Succession Transfer Tool
            <span style={{ marginLeft: 'auto', fontSize: '12px', fontWeight: 500, color: '#6b7280' }}>
              {loadingPending ? '' : `${pending.length} pending`}
            </span>
          </div>
          <div style={{ padding: '12px 16px' }}>
            {loadingPending ? (
              <div style={{ color: '#6b7280', fontSize: '13px' }}>Checking pending submissions…</div>
            ) : pending.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: '13px' }}>
                No pending or in-progress submissions await this role-holder. Nothing to reroute.
              </div>
            ) : (
              <>
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: 0, marginBottom: '10px' }}>
                  Select the items to reroute to the successor so nothing gets stuck mid-cycle.
                </p>
                {pending.map((p) => (
                  <label
                    key={p.id}
                    style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0', cursor: 'pointer' }}
                  >
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    <span style={{ fontSize: '13px' }}>
                      <strong>{p.kind}</strong> — {p.employeeName} · {p.period}{' '}
                      <span style={{ color: '#9ca3af' }}>({p.status})</span>
                    </span>
                  </label>
                ))}
              </>
            )}
          </div>
        </div>

        {err && <div style={{ ...bannerErr, margin: '12px 0 0' }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '20px' }}>
          <button type="button" onClick={onClose} disabled={processing} style={secondaryBtn}>
            Cancel
          </button>
          <button type="button" onClick={handleSubmit} disabled={processing} style={dangerBtn}>
            {processing ? 'Processing…' : 'Confirm'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div style={{ marginBottom: '14px' }}>
    <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
      {label}
    </label>
    {children}
  </div>
);

// ── Subtab: Phase Scheduler ──────────────────────────────────────────────────
const EffBadge = ({ state }: { state: 'Open' | 'Closed' }) => (
  <span
    style={{
      display: 'inline-block',
      padding: '2px 12px',
      borderRadius: '999px',
      fontSize: '12px',
      fontWeight: 700,
      background: state === 'Open' ? 'rgba(16, 185, 129, 0.14)' : 'rgba(107, 114, 128, 0.15)',
      color: state === 'Open' ? '#047857' : '#4b5563',
    }}
  >
    {state}
  </span>
);

const ScheduleCard = ({
  title,
  row,
  scope,
  phase,
  officeId,
  officeName,
  onSaved,
}: {
  title: string;
  row: PhaseSchedule | null;
  scope: 'system' | 'office';
  phase: PhaseKey;
  officeId?: string | null;
  officeName?: string | null;
  onSaved: (msg: string) => void;
}) => {
  const [mode, setMode] = useState<PhaseMode>(row?.mode ?? 'Auto');
  const [start, setStart] = useState(row?.start_date ?? '');
  const [deadline, setDeadline] = useState(row?.deadline_date ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setMode(row?.mode ?? 'Auto');
    setStart(row?.start_date ?? '');
    setDeadline(row?.deadline_date ?? '');
  }, [row?.id, row?.mode, row?.start_date, row?.deadline_date]);

  const eff = effectiveState({ mode, start_date: start || null, deadline_date: deadline || null });

  const save = async () => {
    setErr('');
    if (mode === 'Auto' && start && deadline && start > deadline) {
      return setErr('Start date must be on or before the deadline.');
    }
    setSaving(true);
    const res = await upsertSchedule({
      scope,
      officeId,
      officeName,
      phase,
      mode,
      startDate: start || null,
      deadlineDate: deadline || null,
      updatedBy: getCurrentAdminEmail(),
    });
    setSaving(false);
    if (!res.ok) return setErr('error' in res ? res.error : 'Failed to save.');
    onSaved(`✓ ${PHASE_LABELS[phase]} saved${scope === 'office' && officeName ? ` for ${officeName}` : ''}.`);
  };

  return (
    <div style={{ ...card, padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <CalendarClock size={18} style={{ color: '#363EE8' }} />
        <span style={{ fontWeight: 600, color: '#1f2937' }}>{title}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#9ca3af' }}>Currently</span>
          <EffBadge state={eff} />
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
        <div>
          <label style={miniLabel}>Mode</label>
          <select value={mode} onChange={(e) => setMode(e.target.value as PhaseMode)} style={input}>
            <option value="Auto">Auto (follow dates)</option>
            <option value="Open">Force Open</option>
            <option value="Closed">Force Closed</option>
          </select>
        </div>
        <div>
          <label style={miniLabel}>Start date</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            disabled={mode !== 'Auto'}
            style={{ ...input, opacity: mode !== 'Auto' ? 0.5 : 1 }}
          />
        </div>
        <div>
          <label style={miniLabel}>Deadline date</label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            disabled={mode !== 'Auto'}
            style={{ ...input, opacity: mode !== 'Auto' ? 0.5 : 1 }}
          />
        </div>
      </div>

      <p style={{ fontSize: '12px', color: '#6b7280', margin: '10px 0 0' }}>
        {mode === 'Auto'
          ? 'Auto-opens on the start date and auto-closes after the deadline.'
          : `Manually forced ${mode}. Dates are ignored until switched back to Auto.`}
      </p>

      {err && <div style={{ ...bannerErr, margin: '12px 0 0' }}>{err}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
        <button type="button" onClick={save} disabled={saving} style={primaryBtn}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
};

const PhaseScheduler = () => {
  const [schedules, setSchedules] = useState<PhaseSchedule[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const schedulesLoad = useTableLoading(loading, schedules.length > 0);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');

  // Add-override form state.
  const [ovOfficeId, setOvOfficeId] = useState('');
  const [ovPhase, setOvPhase] = useState<PhaseKey>('target_setting');

  const reload = async () => {
    setLoading(true);
    setError('');
    const [sRes, deps] = await Promise.all([listSchedules(), listDepartments(true)]);
    if (sRes.ok) setSchedules(sRes.data);
    else if ('error' in sRes) setError(sRes.error);
    setDepartments(deps.success ? deps.data : []);
    setLoading(false);
  };
  useEffect(() => {
    void reload();
  }, []);

  const flash = (m: string) => {
    setBanner(m);
    setTimeout(() => setBanner(''), 5000);
  };

  const systemRow = (phase: PhaseKey) => schedules.find((s) => s.scope === 'system' && s.phase === phase) ?? null;
  const officeOverrides = schedules.filter((s) => s.scope === 'office');
  const selectedOffice = departments.find((d) => d.id === ovOfficeId) ?? null;
  const existingOverrideRow =
    ovOfficeId ? schedules.find((s) => s.scope === 'office' && s.office_id === ovOfficeId && s.phase === ovPhase) ?? null : null;

  const removeOverride = async (id: string) => {
    const res = await deleteSchedule(id);
    if (res.ok) {
      flash('✓ Office override removed.');
      void reload();
    } else if ('error' in res) {
      setError(res.error);
    }
  };

  return (
    <div>
      {banner && (
        <div style={bannerOk}>
          <Check size={18} />
          {banner}
        </div>
      )}
      {error && (
        <div style={bannerErr}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      {schedulesLoad.initialLoading ? (
        <SkeletonList show={schedulesLoad.showSkeleton} label="Loading phase schedules…" />
      ) : (
        <>
          <h3 style={sectionTitle}>System-wide</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <ScheduleCard
              title={PHASE_LABELS.target_setting}
              row={systemRow('target_setting')}
              scope="system"
              phase="target_setting"
              onSaved={(m) => {
                flash(m);
                void reload();
              }}
            />
            <ScheduleCard
              title={PHASE_LABELS.rating}
              row={systemRow('rating')}
              scope="system"
              phase="rating"
              onSaved={(m) => {
                flash(m);
                void reload();
              }}
            />
          </div>

          <h3 style={{ ...sectionTitle, marginTop: '28px' }}>Per-office overrides</h3>
          <p style={{ fontSize: '13px', color: '#6b7280', marginTop: '-6px' }}>
            Offices without an override follow the system-wide schedule above.
          </p>

          {/* Existing overrides */}
          <div style={{ ...card, marginBottom: '16px' }}>
            {officeOverrides.length === 0 ? (
              <div style={emptyBox}>No office overrides. Add one below to stagger a specific office.</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                    <th style={th}>Office</th>
                    <th style={th}>Phase</th>
                    <th style={th}>Mode</th>
                    <th style={th}>Window</th>
                    <th style={th}>Effective</th>
                    <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {officeOverrides.map((o) => (
                    <tr key={o.id} style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={td}>{o.office_name || '—'}</td>
                      <td style={td}>{PHASE_LABELS[o.phase]}</td>
                      <td style={td}>{o.mode}</td>
                      <td style={td}>
                        {o.start_date && o.deadline_date ? `${o.start_date} → ${o.deadline_date}` : '—'}
                      </td>
                      <td style={td}>
                        <EffBadge state={effectiveState(o)} />
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button type="button" onClick={() => removeOverride(o.id)} style={dangerOutlineBtn}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Add / edit an override */}
          <div style={{ ...card, padding: '18px 20px' }}>
            <div style={{ fontWeight: 600, color: '#1f2937', marginBottom: '12px' }}>Add / edit an override</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={miniLabel}>Office</label>
                <select value={ovOfficeId} onChange={(e) => setOvOfficeId(e.target.value)} style={input}>
                  <option value="">Select an office…</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={miniLabel}>Phase</label>
                <select value={ovPhase} onChange={(e) => setOvPhase(e.target.value as PhaseKey)} style={input}>
                  <option value="target_setting">{PHASE_LABELS.target_setting}</option>
                  <option value="rating">{PHASE_LABELS.rating}</option>
                </select>
              </div>
            </div>
            {selectedOffice ? (
              <ScheduleCard
                key={`${ovOfficeId}-${ovPhase}`}
                title={`${selectedOffice.name} — ${PHASE_LABELS[ovPhase]}`}
                row={existingOverrideRow}
                scope="office"
                phase={ovPhase}
                officeId={selectedOffice.id}
                officeName={selectedOffice.name}
                onSaved={(m) => {
                  flash(m);
                  void reload();
                }}
              />
            ) : (
              <p style={{ fontSize: '13px', color: '#9ca3af', margin: 0 }}>Select an office to configure its override.</p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ── Subtab: Locked Targets Vault ─────────────────────────────────────────────
const LockedTargetsVault = () => {
  const [sets, setSets] = useState<LockedTargetSet[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const vaultLoad = useTableLoading(loading, sets.length > 0);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showLock, setShowLock] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError('');
    const [res, emps, deps] = await Promise.all([listLockedTargets(), listEmployeeOptions(), listDepartments(true)]);
    if (res.ok) setSets(res.data);
    else if ('error' in res) setError(res.error);
    setEmployees(emps);
    setDepartments(deps.success ? deps.data : []);
    setLoading(false);
  };
  useEffect(() => {
    void reload();
  }, []);

  const flash = (m: string) => {
    setBanner(m);
    setTimeout(() => setBanner(''), 6000);
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sets;
    return sets.filter(
      (s) =>
        (s.employee_name ?? '').toLowerCase().includes(q) ||
        (s.office_name ?? '').toLowerCase().includes(q) ||
        (s.period ?? '').toLowerCase().includes(q),
    );
  }, [sets, search]);

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      {banner && (
        <div style={bannerOk}>
          <Check size={18} />
          {banner}
        </div>
      )}
      {error && (
        <div style={bannerErr}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: '440px' }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by employee, office, or period…"
            style={{ ...input, paddingLeft: '36px' }}
          />
        </div>
        <button type="button" onClick={() => setShowLock(true)} style={primaryBtn}>
          <Lock size={15} />
          Lock Target Set
        </button>
      </div>

      <div style={card}>
        <div style={cardHeader}>
          <Lock size={18} />
          Locked Targets Vault
          <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>
            {vaultLoad.initialLoading ? '' : `${filtered.length} frozen set${filtered.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {vaultLoad.initialLoading ? (
          <SkeletonList show={vaultLoad.showSkeleton} label="Loading the vault…" />
        ) : filtered.length === 0 ? (
          <div style={emptyBox}>
            {sets.length === 0
              ? 'The vault is empty. Targets appear here once verified and locked. (Ensure migration 012 has been run.)'
              : 'No locked sets match your search.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                  <th style={th}>Employee</th>
                  <th style={th}>Office</th>
                  <th style={th}>Period</th>
                  <th style={th}>Targets</th>
                  <th style={th}>Verified by</th>
                  <th style={th}>Locked</th>
                  <th style={th}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <Fragment key={s.id}>
                    <tr style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={td}>
                        <span style={{ fontWeight: 600, color: '#1f2937' }}>{s.employee_name || '—'}</span>
                      </td>
                      <td style={td}>{s.office_name || '—'}</td>
                      <td style={td}>{s.period || '—'}</td>
                      <td style={td}>{s.targets.length}</td>
                      <td style={td}>{s.verified_by || '—'}</td>
                      <td style={td}>{new Date(s.locked_at).toLocaleDateString()}</td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => toggleExpand(s.id)}
                          style={{ ...secondaryBtn, padding: '5px 10px' }}
                        >
                          <ChevronDown
                            size={15}
                            style={{ transform: expanded.has(s.id) ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
                          />
                        </button>
                      </td>
                    </tr>
                    {expanded.has(s.id) && (
                      <tr>
                        <td colSpan={7} style={{ padding: '0 16px 14px', background: '#fafafa' }}>
                          <div style={{ padding: '12px 14px', border: '1px solid #eee', borderRadius: '8px', background: '#fff' }}>
                            <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px' }}>
                              Frozen targets (read-only) · locked by {s.locked_by || 'unknown'} on{' '}
                              {new Date(s.locked_at).toLocaleString()}
                            </div>
                            {s.targets.length === 0 ? (
                              <div style={{ fontSize: '13px', color: '#6b7280' }}>No target rows captured in this set.</div>
                            ) : (
                              <ol style={{ margin: 0, paddingLeft: '18px' }}>
                                {s.targets.map((t, i) => (
                                  <li key={i} style={{ fontSize: '13px', color: '#374151', marginBottom: '4px' }}>
                                    {t.function_type ? <strong>[{t.function_type}] </strong> : null}
                                    {t.target_text || JSON.stringify(t)}
                                  </li>
                                ))}
                              </ol>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ marginTop: '12px', fontSize: '12px', color: '#9ca3af' }}>
        Frozen for the cycle — sets cannot be edited or deleted here. They feed Accomplishment Rating when the Rating
        Phase opens.
      </p>

      {showLock && (
        <LockTargetModal
          employees={employees}
          departments={departments}
          onClose={() => setShowLock(false)}
          onDone={(msg) => {
            flash(msg);
            setShowLock(false);
            void reload();
          }}
        />
      )}
    </div>
  );
};

const LockTargetModal = ({
  employees,
  departments,
  onClose,
  onDone,
}: {
  employees: EmployeeOption[];
  departments: Department[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) => {
  const [employeeId, setEmployeeId] = useState('');
  const [officeId, setOfficeId] = useState('');
  const [period, setPeriod] = useState('');
  const [verifiedBy, setVerifiedBy] = useState('');
  const [fetched, setFetched] = useState<{ count: number; rows: any[] } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const fetchTargets = async () => {
    setErr('');
    if (!employeeId) return setErr('Select an employee first.');
    if (!period.trim()) return setErr('Enter the rating period first.');
    setFetching(true);
    const rows = await fetchTargetRowsForEmployee(employeeId, period.trim());
    setFetching(false);
    setFetched({ count: rows.length, rows });
  };

  const confirmLock = async () => {
    setErr('');
    if (!employeeId) return setErr('Select an employee.');
    if (!period.trim()) return setErr('Enter the rating period.');
    const emp = employees.find((e) => e.id === employeeId);
    const off = departments.find((d) => d.id === officeId) ?? null;
    setSaving(true);
    const res = await lockTargetSet({
      employeeId,
      employeeName: emp?.full_name ?? '',
      officeId: off?.id ?? null,
      officeName: off?.name ?? emp?.department ?? null,
      period: period.trim(),
      targets: fetched?.rows ?? [],
      verifiedBy: verifiedBy.trim() || getCurrentAdminEmail(),
      lockedBy: getCurrentAdminEmail(),
    });
    setSaving(false);
    if (!res.ok) return setErr('error' in res ? res.error : 'Failed to lock the target set.');
    onDone(`✓ Targets locked for ${emp?.full_name ?? 'employee'} (${period.trim()}).`);
  };

  return (
    <Dialog open onClose={onClose} title="Lock Target Set">
      <div style={{ color: 'var(--text-primary)' }}>
        <p style={{ fontSize: '13px', color: '#6b7280', marginTop: 0 }}>
          Normally triggered by the Office Account confirming targets. Freezing is permanent for the cycle — the set
          cannot be edited afterwards.
        </p>
        <Field label="Employee">
          <select
            value={employeeId}
            onChange={(e) => {
              setEmployeeId(e.target.value);
              setFetched(null);
              // Prefill office from the employee's department when possible.
              const emp = employees.find((x) => x.id === e.target.value);
              const match = departments.find((d) => d.name === emp?.department);
              if (match) setOfficeId(match.id);
            }}
            style={input}
          >
            <option value="">Select an employee…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.full_name}
                {e.department ? ` — ${e.department}` : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Office">
          <select value={officeId} onChange={(e) => setOfficeId(e.target.value)} style={input}>
            <option value="">(optional) Select an office…</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rating period">
          <input
            type="text"
            value={period}
            onChange={(e) => {
              setPeriod(e.target.value);
              setFetched(null);
            }}
            placeholder="e.g. January–June 2026"
            style={input}
          />
        </Field>
        <Field label="Verified by">
          <input
            type="text"
            value={verifiedBy}
            onChange={(e) => setVerifiedBy(e.target.value)}
            placeholder={`Defaults to ${getCurrentAdminEmail()}`}
            style={input}
          />
        </Field>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '4px 0 14px' }}>
          <button type="button" onClick={fetchTargets} disabled={fetching} style={secondaryBtn}>
            {fetching ? 'Checking…' : 'Fetch targets'}
          </button>
          {fetched && (
            <span style={{ fontSize: '13px', color: fetched.count > 0 ? '#047857' : '#b45309' }}>
              {fetched.count > 0
                ? `${fetched.count} target row(s) found and ready to freeze.`
                : 'No target rows found — you can still lock an empty set.'}
            </span>
          )}
        </div>

        {err && <div style={{ ...bannerErr, margin: '0 0 12px' }}>{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" onClick={onClose} disabled={saving} style={secondaryBtn}>
            Cancel
          </button>
          <button type="button" onClick={confirmLock} disabled={saving} style={primaryBtn}>
            {saving ? 'Locking…' : 'Lock & Freeze'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

// ── Subtab: Compliance Tracker ───────────────────────────────────────────────
const ProgressBar = ({ pct, tone }: { pct: number; tone: 'blue' | 'green' }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
    <div style={{ flex: 1, height: '8px', background: '#eef0f4', borderRadius: '999px', overflow: 'hidden', minWidth: '80px' }}>
      <div
        style={{
          width: `${Math.min(100, Math.max(0, pct))}%`,
          height: '100%',
          background: tone === 'green' ? '#10b981' : '#363EE8',
          borderRadius: '999px',
          transition: 'width .2s',
        }}
      />
    </div>
    <span style={{ fontSize: '12px', fontWeight: 700, color: '#374151', width: '38px', textAlign: 'right' }}>{pct}%</span>
  </div>
);

const ComplianceTracker = () => {
  const [period, setPeriod] = useState('');
  const [data, setData] = useState<OfficeCompliance[]>([]);
  const [loading, setLoading] = useState(true);
  const complianceLoad = useTableLoading(loading, data.length > 0);
  const [error, setError] = useState('');
  const [officeFilter, setOfficeFilter] = useState('');
  const [sortBy, setSortBy] = useState<'behind' | 'name' | 'verified'>('behind');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      const { cycleId, period: p } = await getActiveCyclePeriod();
      const res = await getComplianceByOffice(cycleId);
      if (cancelled) return;
      setPeriod(p);
      if (res.ok) setData(res.data);
      else if ('error' in res) setError(res.error);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const view = useMemo(() => {
    let rows = officeFilter ? data.filter((d) => d.officeId === officeFilter) : data.slice();
    rows.sort((a, b) => {
      if (sortBy === 'name') return a.officeName.localeCompare(b.officeName);
      if (sortBy === 'verified') return a.pctVerified - b.pctVerified;
      // 'behind': least submitted first, then least verified.
      return a.pctSubmitted - b.pctSubmitted || a.pctVerified - b.pctVerified;
    });
    return rows;
  }, [data, officeFilter, sortBy]);

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div>
      {error && (
        <div style={bannerErr}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
        <span style={{ fontSize: '13px', color: '#6b7280' }}>
          Period: <strong style={{ color: '#374151' }}>{period || '—'}</strong>
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
          <select value={officeFilter} onChange={(e) => setOfficeFilter(e.target.value)} style={{ ...input, width: 'auto' }}>
            <option value="">All offices</option>
            {data.map((d) => (
              <option key={d.officeId} value={d.officeId}>
                {d.officeName}
              </option>
            ))}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={{ ...input, width: 'auto' }}>
            <option value="behind">Sort: furthest behind</option>
            <option value="verified">Sort: least verified</option>
            <option value="name">Sort: office name</option>
          </select>
        </div>
      </div>

      <div style={card}>
        <div style={cardHeader}>
          <ClipboardList size={18} />
          Compliance by Office
          <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>
            {complianceLoad.initialLoading ? '' : `${view.length} office${view.length === 1 ? '' : 's'}`}
          </span>
        </div>
        {complianceLoad.initialLoading ? (
          <SkeletonList show={complianceLoad.showSkeleton} label="Loading compliance…" />
        ) : view.length === 0 ? (
          <div style={emptyBox}>No office data. Ensure employees and evaluations exist for the current cycle.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                  <th style={th}>Office</th>
                  <th style={{ ...th, width: '26%' }}>% Employees Submitted</th>
                  <th style={{ ...th, width: '26%' }}>% Office Verified</th>
                  <th style={{ ...th, textAlign: 'right' }}>Drill</th>
                </tr>
              </thead>
              <tbody>
                {view.map((o) => (
                  <Fragment key={o.officeId}>
                    <tr style={{ borderTop: '1px solid #f0f0f0' }}>
                      <td style={td}>
                        <div style={{ fontWeight: 600, color: '#1f2937' }}>{o.officeName}</div>
                        <div style={{ fontSize: '12px', color: '#9ca3af' }}>{o.totalEmployees} employees</div>
                      </td>
                      <td style={td}>
                        <ProgressBar pct={o.pctSubmitted} tone="blue" />
                        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '3px' }}>
                          {o.submitted}/{o.totalEmployees} submitted
                        </div>
                      </td>
                      <td style={td}>
                        <ProgressBar pct={o.pctVerified} tone="green" />
                        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '3px' }}>
                          {o.verified}/{o.submitted} verified
                        </div>
                      </td>
                      <td style={{ ...td, textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => toggle(o.officeId)}
                          style={{ ...secondaryBtn, padding: '5px 10px' }}
                          disabled={o.totalEmployees === 0}
                        >
                          <ChevronDown
                            size={15}
                            style={{ transform: expanded.has(o.officeId) ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}
                          />
                        </button>
                      </td>
                    </tr>
                    {expanded.has(o.officeId) && (
                      <tr>
                        <td colSpan={4} style={{ padding: '0 16px 14px', background: '#fafafa' }}>
                          <div style={{ padding: '10px 14px', border: '1px solid #eee', borderRadius: '8px', background: '#fff' }}>
                            {o.employees.length === 0 ? (
                              <div style={{ fontSize: '13px', color: '#6b7280' }}>No employees in this office.</div>
                            ) : (
                              o.employees.map((e, i) => (
                                <div
                                  key={i}
                                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 0', fontSize: '13px' }}
                                >
                                  <span style={{ flex: 1, color: '#374151' }}>{e.name}</span>
                                  <span style={{ color: '#9ca3af' }}>{e.status}</span>
                                  <span style={statusDot(e.verified ? 'green' : e.submitted ? 'blue' : 'gray')} />
                                </div>
                              ))
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p style={{ marginTop: '12px', fontSize: '12px', color: '#9ca3af' }}>
        “Verified” counts submissions the Office Account has confirmed — an office can be fully submitted yet still have a
        verification backlog.
      </p>
    </div>
  );
};

// ── Subtab: Final Review & Closeout ──────────────────────────────────────────
const CheckX = ({ ok, label }: { ok: boolean; label: string }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: ok ? '#047857' : '#b91c1c' }}>
    {ok ? <CheckCircle2 size={15} /> : <X size={15} />}
    {label}
  </span>
);

const FinalReviewCloseout = () => {
  const [period, setPeriod] = useState('');
  const [rows, setRows] = useState<CloseoutReadiness[]>([]);
  const [loading, setLoading] = useState(true);
  const closeoutLoad = useTableLoading(loading, rows.length > 0);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState('');
  const [recordTarget, setRecordTarget] = useState<{ row: CloseoutReadiness; kind: CompilationKind } | null>(null);
  const [closeoutTarget, setCloseoutTarget] = useState<CloseoutReadiness | null>(null);
  const [processing, setProcessing] = useState(false);

  const reload = async () => {
    setLoading(true);
    setError('');
    const { cycleId, period: p } = await getActiveCyclePeriod();
    setPeriod(p);
    const [compRes, compilations, closeouts] = await Promise.all([
      getComplianceByOffice(cycleId),
      listCompilations(p),
      listCloseouts(p),
    ]);
    if (compRes.ok) setRows(buildReadiness(compRes.data, compilations, closeouts, p));
    else if ('error' in compRes) setError(compRes.error);
    setLoading(false);
  };
  useEffect(() => {
    void reload();
  }, []);

  const flash = (m: string) => {
    setBanner(m);
    setTimeout(() => setBanner(''), 6000);
  };

  const doCloseout = async () => {
    if (!closeoutTarget) return;
    setProcessing(true);
    const res = await closeoutOffice({ readiness: closeoutTarget, closedBy: getCurrentAdminEmail() });
    setProcessing(false);
    if (!res.ok) {
      setError('error' in res ? res.error : 'Failed to close out.');
      setCloseoutTarget(null);
      return;
    }
    flash(`✓ ${closeoutTarget.officeName} closed out and archived.`);
    setCloseoutTarget(null);
    void reload();
  };

  return (
    <div>
      {banner && (
        <div style={bannerOk}>
          <Check size={18} />
          {banner}
        </div>
      )}
      {error && (
        <div style={bannerErr}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }}>
        Period: <strong style={{ color: '#374151' }}>{period || '—'}</strong>. An office can be closed out only when all
        three components are present: verified IPCRs, a Supervisor DPCR, and a Dept Head OPCR.
      </p>

      <div style={card}>
        <div style={cardHeader}>
          <Archive size={18} />
          Final Review &amp; Closeout
          <span style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 500, color: '#6b7280' }}>
            {closeoutLoad.initialLoading ? '' : `${rows.length} office${rows.length === 1 ? '' : 's'}`}
          </span>
        </div>
        {closeoutLoad.initialLoading ? (
          <SkeletonList show={closeoutLoad.showSkeleton} label="Loading closeout status…" />
        ) : rows.length === 0 ? (
          <div style={emptyBox}>No offices with employees to review for this cycle.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left', color: '#6b7280' }}>
                  <th style={th}>Office</th>
                  <th style={th}>IPCRs</th>
                  <th style={th}>DPCR</th>
                  <th style={th}>OPCR</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.officeId} style={{ borderTop: '1px solid #f0f0f0' }}>
                    <td style={td}>
                      <span style={{ fontWeight: 600, color: '#1f2937' }}>{r.officeName}</span>
                    </td>
                    <td style={td}>
                      <CheckX ok={r.ipcrOk} label={`${r.ipcrVerified}/${r.ipcrTotal}`} />
                    </td>
                    <td style={td}>
                      <CheckX ok={r.dpcrOk} label={r.dpcrCount ? `${r.dpcrCount}` : 'Missing'} />
                    </td>
                    <td style={td}>
                      <CheckX ok={r.opcrOk} label={r.opcrCount ? `${r.opcrCount}` : 'Missing'} />
                    </td>
                    <td style={td}>
                      {r.closed ? (
                        <span style={{ fontSize: '13px', color: '#047857', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                          <Archive size={14} />
                          Closed {new Date(r.closed.closed_at).toLocaleDateString()}
                        </span>
                      ) : r.missing.length ? (
                        <span style={{ fontSize: '12px', color: '#b45309' }}>
                          Outstanding: {r.missing.map((m) => m.piece).join(', ')}
                        </span>
                      ) : (
                        <span style={{ fontSize: '13px', color: '#047857', fontWeight: 600 }}>Ready</span>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {r.closed ? (
                        <span style={{ fontSize: '12px', color: '#9ca3af' }}>Archived</span>
                      ) : (
                        <span style={{ display: 'inline-flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => setRecordTarget({ row: r, kind: 'DPCR' })}
                            style={{ ...secondaryBtn, padding: '6px 10px' }}
                          >
                            + DPCR
                          </button>
                          <button
                            type="button"
                            onClick={() => setRecordTarget({ row: r, kind: 'OPCR' })}
                            style={{ ...secondaryBtn, padding: '6px 10px' }}
                          >
                            + OPCR
                          </button>
                          <button
                            type="button"
                            onClick={() => setCloseoutTarget(r)}
                            disabled={!r.canCloseout}
                            style={{ ...primaryBtn, padding: '6px 12px', opacity: r.canCloseout ? 1 : 0.45, cursor: r.canCloseout ? 'pointer' : 'not-allowed' }}
                            title={r.canCloseout ? 'Close out and archive' : 'Complete all components first'}
                          >
                            Closeout
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {recordTarget && (
        <RecordCompilationModal
          row={recordTarget.row}
          kind={recordTarget.kind}
          onClose={() => setRecordTarget(null)}
          onDone={(msg) => {
            flash(msg);
            setRecordTarget(null);
            void reload();
          }}
        />
      )}

      <Dialog open={Boolean(closeoutTarget)} onClose={() => setCloseoutTarget(null)} title="Confirm Closeout">
        {closeoutTarget && (
          <div style={{ color: 'var(--text-primary)' }}>
            <p style={{ lineHeight: 1.5, marginTop: 0 }}>
              Close out <strong>{closeoutTarget.officeName}</strong> for {closeoutTarget.period}? All three components
              are present. This locks the bundle, timestamps it, and archives it for Records Search — it cannot be
              reopened here.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' }}>
              <button type="button" onClick={() => setCloseoutTarget(null)} disabled={processing} style={secondaryBtn}>
                Cancel
              </button>
              <button type="button" onClick={doCloseout} disabled={processing} style={primaryBtn}>
                {processing ? 'Closing…' : 'Closeout & Archive'}
              </button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
};

const RecordCompilationModal = ({
  row,
  kind,
  onClose,
  onDone,
}: {
  row: CloseoutReadiness;
  kind: CompilationKind;
  onClose: () => void;
  onDone: (msg: string) => void;
}) => {
  const [groupName, setGroupName] = useState('');
  const [compiledBy, setCompiledBy] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    setErr('');
    setSaving(true);
    const res = await recordCompilation({
      officeId: row.officeId,
      officeName: row.officeName,
      period: row.period,
      kind,
      groupName: kind === 'DPCR' ? groupName.trim() || null : null,
      compiledBy: compiledBy.trim() || getCurrentAdminEmail(),
    });
    setSaving(false);
    if (!res.ok) return setErr('error' in res ? res.error : 'Failed to record.');
    onDone(`✓ ${kind} recorded for ${row.officeName}.`);
  };

  return (
    <Dialog open onClose={onClose} title={`Record ${kind === 'DPCR' ? 'Supervisor DPCR' : 'Dept Head OPCR'}`}>
      <div style={{ color: 'var(--text-primary)' }}>
        <p style={{ fontSize: '13px', color: '#6b7280', marginTop: 0 }}>
          Stands in for the {kind === 'DPCR' ? 'Supervisor' : 'Department Head'} compilation flow. Recording this marks
          the {kind} component present for <strong>{row.officeName}</strong>.
        </p>
        {kind === 'DPCR' && (
          <Field label="Supervisory group (optional)">
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Records Section"
              style={input}
            />
          </Field>
        )}
        <Field label="Compiled by">
          <input
            type="text"
            value={compiledBy}
            onChange={(e) => setCompiledBy(e.target.value)}
            placeholder={`Defaults to ${getCurrentAdminEmail()}`}
            style={input}
          />
        </Field>
        {err && <div style={{ ...bannerErr, margin: '0 0 12px' }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button type="button" onClick={onClose} disabled={saving} style={secondaryBtn}>
            Cancel
          </button>
          <button type="button" onClick={submit} disabled={saving} style={primaryBtn}>
            {saving ? 'Recording…' : `Record ${kind}`}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

// ── Placeholder for not-yet-built subtabs ────────────────────────────────────
const PlaceholderSubtab = ({ title, blurb }: { title: string; blurb: string }) => (
  <div
    style={{
      background: '#fff',
      border: '1px dashed #d1d5db',
      borderRadius: '12px',
      padding: '40px',
      textAlign: 'center',
    }}
  >
    <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#1f2937', marginBottom: '8px' }}>{title}</h3>
    <p style={{ color: '#6b7280', maxWidth: '640px', margin: '0 auto', lineHeight: 1.5 }}>{blurb}</p>
  </div>
);

const th: React.CSSProperties = {
  padding: '12px 16px',
  fontWeight: 600,
  fontSize: '12px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  whiteSpace: 'nowrap',
};

const td: React.CSSProperties = {
  padding: '14px 16px',
  color: '#374151',
  verticalAlign: 'top',
};

const card: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e5e7eb',
  borderRadius: '12px',
  overflow: 'hidden',
};

const cardHeader: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid #e5e7eb',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  fontWeight: 600,
  color: '#1f2937',
};

const emptyBox: React.CSSProperties = {
  padding: '32px',
  textAlign: 'center',
  color: '#6b7280',
  fontSize: '14px',
  lineHeight: 1.5,
};

const sectionTitle: React.CSSProperties = {
  fontSize: '16px',
  fontWeight: 700,
  color: '#1f2937',
  margin: '0 0 14px',
};

const miniLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '12px',
  fontWeight: 600,
  color: '#6b7280',
  marginBottom: '5px',
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
  background: '#fff',
  color: '#111827',
};

const credBox: React.CSSProperties = {
  background: '#f3f4f6',
  border: '1px solid #e5e7eb',
  borderRadius: '8px',
  padding: '12px 14px',
};

const primaryBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '9px 16px',
  background: '#363EE8',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const secondaryBtn: React.CSSProperties = {
  padding: '9px 16px',
  background: '#fff',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

const dangerBtn: React.CSSProperties = {
  padding: '9px 16px',
  background: '#dc2626',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
};

const dangerOutlineBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '7px 14px',
  background: '#fff',
  color: '#b91c1c',
  border: '1px solid #fca5a5',
  borderRadius: '8px',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const bannerOk: React.CSSProperties = {
  margin: '0 0 16px',
  padding: '12px 16px',
  background: 'rgba(40, 167, 69, 0.1)',
  border: '1px solid rgba(40, 167, 69, 0.3)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '14px',
};

const bannerErr: React.CSSProperties = {
  margin: '0 0 16px',
  padding: '12px 16px',
  background: 'rgba(220, 38, 38, 0.1)',
  border: '1px solid rgba(220, 38, 38, 0.3)',
  borderRadius: '8px',
  color: 'var(--text-primary)',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  fontSize: '14px',
};

const statusDot = (tone: 'green' | 'blue' | 'gray'): React.CSSProperties => ({
  display: 'inline-block',
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  background: tone === 'green' ? '#10b981' : tone === 'blue' ? '#363EE8' : '#d1d5db',
  flexShrink: 0,
});

const rolePill = (role: OfficeRole): React.CSSProperties => ({
  display: 'inline-block',
  padding: '2px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 600,
  background: role === 'DeptHead' ? 'rgba(124, 58, 237, 0.12)' : 'rgba(54, 62, 232, 0.1)',
  color: role === 'DeptHead' ? '#6d28d9' : '#363EE8',
});

const auditPill = (action: string): React.CSSProperties => {
  const map: Record<string, string> = {
    assign: '#047857',
    transfer: '#2563eb',
    revoke: '#b91c1c',
    reroute: '#b45309',
  };
  const color = map[action] ?? '#4b5563';
  return {
    display: 'inline-block',
    padding: '1px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.03em',
    background: `${color}1a`,
    color,
    height: 'fit-content',
    whiteSpace: 'nowrap',
  };
};
