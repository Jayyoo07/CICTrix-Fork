import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorBanner } from './ErrorBanner';
import { useBackClosesView } from '../hooks/useHistoryBack';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Briefcase
} from 'lucide-react';
import {
  getOfficeDirectory,
  type OfficeDirectoryRow
} from '../lib/api/officeDirectory';
import { TableRefreshBar, TableSkeletonRows, tableBodyClass, useTableLoading } from './table-loading';
import { supabase } from '../lib/supabase';

interface OfficeDirectorySectionProps {
  showBulkRequest?: boolean;
}

const OFFICE_DIRECTORY_PER_PAGE = 6;

export const OfficeDirectorySection: React.FC<OfficeDirectorySectionProps> = () => {
  const [officeDirectoryRows, setOfficeDirectoryRows] = useState<OfficeDirectoryRow[]>([]);
  // Starts true: the directory loads on mount, so the first paint is the skeleton, not "No offices found."
  const [officeDirectoryLoading, setOfficeDirectoryLoading] = useState(true);
  const [officeDirectoryError, setOfficeDirectoryError] = useState('');
  const [officeDirectoryPage, setOfficeDirectoryPage] = useState(0);
  const [selectedOfficeRow, setSelectedOfficeRow] = useState<OfficeDirectoryRow | null>(null);
  const [officeEmployees, setOfficeEmployees] = useState<any[]>([]);
  const [officeEmployeesLoading, setOfficeEmployeesLoading] = useState(false);
  const directoryLoad = useTableLoading(officeDirectoryLoading, officeDirectoryRows.length > 0);
  const employeesLoad = useTableLoading(officeEmployeesLoading, officeEmployees.length > 0);
  useBackClosesView(selectedOfficeRow !== null, () => setSelectedOfficeRow(null), 'office-directory');

  // Declared outside the effect so the error banner's Retry can re-run it.
  const loadDirectory = useCallback(() => {
    setOfficeDirectoryLoading(true);
    setOfficeDirectoryError('');
    return getOfficeDirectory().then((result) => {
      if (result.ok) {
        setOfficeDirectoryRows(result.data);
      } else {
        setOfficeDirectoryError((result as { ok: false; error: string }).error || 'Failed to load offices');
      }
      setOfficeDirectoryLoading(false);
    });
  }, []);

  // Load the directory rows on mount
  useEffect(() => {
    let cancelled = false;

    void loadDirectory();

    const reload = () => {
      if (!cancelled) void loadDirectory();
    };

    window.addEventListener('cictrix:applicants-updated', reload);
    window.addEventListener('cictrix:newly-hired-updated', reload);
    window.addEventListener('cictrix:employee-accounts-updated', reload);
    window.addEventListener('cictrix:job-postings-updated', reload);
    window.addEventListener('EMPLOYEE_DOCUMENTS_UPDATED', reload);

    return () => {
      cancelled = true;
      window.removeEventListener('cictrix:applicants-updated', reload);
      window.removeEventListener('cictrix:newly-hired-updated', reload);
      window.removeEventListener('cictrix:employee-accounts-updated', reload);
      window.removeEventListener('cictrix:job-postings-updated', reload);
      window.removeEventListener('EMPLOYEE_DOCUMENTS_UPDATED', reload);
    };
  }, [loadDirectory]);

  const handleOfficeClick = (row: OfficeDirectoryRow) => {
    setSelectedOfficeRow(row);
    setOfficeEmployees([]);
    setOfficeEmployeesLoading(true);

    // Mirrors the headcount rules in getOfficeDirectory (officeDirectory.ts):
    // same normalization, same status filter, same email dedup — so the list
    // length always equals the count shown on the directory table.
    const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

    Promise.all([
      // All employees (unfiltered): office membership is decided client-side
      // with the same normalized department/current_department key the
      // headcount uses, and the full set doubles as the email dedup index.
      (supabase as any)
        .from('employees_with_department')
        .select('id, first_name, middle_name, last_name, current_position, department, current_department, status, email, mobile_number'),
      (supabase as any)
        .from('applicants')
        .select('id, first_name, middle_name, last_name, email, contact_number, position, office, status')
        .eq('status', 'Hired'),
    ]).then(([empRes, appRes]: [{ data: any[] | null }, { data: any[] | null }]) => {
      const allEmployees = Array.isArray(empRes?.data) ? empRes.data : [];
      const hiredApplicants = Array.isArray(appRes?.data) ? appRes.data : [];
      const officeKey = norm(row.officeName);

      const employeeEmails = new Set<string>();
      for (const emp of allEmployees) {
        const email = norm(emp?.email);
        if (email) employeeEmails.add(email);
      }

      // Active employees only, matching the headcount rule in officeDirectory.ts
      // (hired applicants are no longer folded into the office roster).
      void hiredApplicants;
      void employeeEmails;
      const officeEmps = allEmployees.filter(
        (emp) =>
          (norm(emp?.department) || norm(emp?.current_department)) === officeKey &&
          norm(emp?.status) === 'active'
      );

      const compareText = (a: string, b: string) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' });

      const byPositionThenName = (a: any, b: any) => {
        const posA = String(a?.current_position ?? '').trim();
        const posB = String(b?.current_position ?? '').trim();
        if (posA !== posB) {
          if (!posA) return 1;
          if (!posB) return -1;
          const cmp = compareText(posA, posB);
          if (cmp !== 0) return cmp;
        }
        const lastCmp = compareText(String(a?.last_name ?? ''), String(b?.last_name ?? ''));
        if (lastCmp !== 0) return lastCmp;
        return compareText(String(a?.first_name ?? ''), String(b?.first_name ?? ''));
      };

      setOfficeEmployees([...officeEmps].sort(byPositionThenName));
      setOfficeEmployeesLoading(false);
    });
  };

  const filteredOfficeDirectoryRows = useMemo(
    // Show active offices only — the directory reflects the current org.
    () => officeDirectoryRows.filter((r) => r.isActive),
    [officeDirectoryRows]
  );

  const officeDirectoryPageCount = Math.max(1, Math.ceil(filteredOfficeDirectoryRows.length / OFFICE_DIRECTORY_PER_PAGE));
  const safeOfficeDirectoryPage = Math.min(officeDirectoryPage, officeDirectoryPageCount - 1);
  const paginatedOfficeDirectoryRows = useMemo(
    () =>
      filteredOfficeDirectoryRows.slice(
        safeOfficeDirectoryPage * OFFICE_DIRECTORY_PER_PAGE,
        (safeOfficeDirectoryPage + 1) * OFFICE_DIRECTORY_PER_PAGE
      ),
    [filteredOfficeDirectoryRows, safeOfficeDirectoryPage]
  );

  useEffect(() => {
    if (officeDirectoryPage > officeDirectoryPageCount - 1) {
      setOfficeDirectoryPage(Math.max(0, officeDirectoryPageCount - 1));
    }
  }, [officeDirectoryPage, officeDirectoryPageCount]);

  return (
    <div className="space-y-4">
      {selectedOfficeRow ? (
        /* Office employee list for selected office */
        <>
          <div>
            <h2 className="!mb-0.5 text-xl font-bold text-slate-900">{selectedOfficeRow.officeName}</h2>
            <p className="!mb-0 text-sm text-slate-500">{officeEmployees.length} employee{officeEmployees.length === 1 ? '' : 's'}</p>
          </div>

          <section className="abyan-table-wrap">
            <table className="abyan-table w-full">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">First Name</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Middle Name</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Last Name</th>
                  <th className="px-5 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Position</th>
                </tr>
              </thead>
              <tbody className={`divide-y divide-slate-100 ${tableBodyClass(false)}`}>
                {employeesLoad.initialLoading ? (
                  <TableSkeletonRows show={employeesLoad.showSkeleton} columns={4} label="Loading employees…" />
                ) : officeEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-400">No employees found for this office.</td>
                  </tr>
                ) : (
                  officeEmployees.map((employee: any) => (
                    <tr key={employee.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5">
                        <p className="!mb-0 font-semibold" style={{ color: '#040E6B' }}>{employee.first_name || '--'}</p>
                        <p className="!mb-0 mt-0.5 text-xs text-slate-400">{employee.email || '--'}</p>
                      </td>
                      <td className="px-5 py-3.5 font-semibold" style={{ color: '#040E6B' }}>{employee.middle_name || '--'}</td>
                      <td className="px-5 py-3.5 font-semibold" style={{ color: '#040E6B' }}>{employee.last_name || '--'}</td>
                      <td className="px-5 py-3.5 text-slate-600">{employee.current_position || '--'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        /* Office Directory table */
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Office Directory</h2>
              <p className="text-sm text-slate-500 mt-0.5">Click an office row to view all assigned employees and their accounts</p>
            </div>
          </div>

          <ErrorBanner error={officeDirectoryError} context="server" onRetry={loadDirectory} />

          <div className="flex items-center justify-center text-lg font-semibold text-slate-700">
            {filteredOfficeDirectoryRows.length === 0
              ? 'Office 0 to 0 of 0'
              : `Office ${safeOfficeDirectoryPage * OFFICE_DIRECTORY_PER_PAGE + 1} to ${Math.min((safeOfficeDirectoryPage + 1) * OFFICE_DIRECTORY_PER_PAGE, filteredOfficeDirectoryRows.length)} of ${filteredOfficeDirectoryRows.length}`}
          </div>

          <section>
            <div className="abyan-table-wrap">
              <table className="abyan-table w-full min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Office / Department</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Department Head</th>
                    <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Employees</th>
                  </tr>
                  <TableRefreshBar active={directoryLoad.refreshing} colSpan={3} />
                </thead>
                <tbody className={tableBodyClass(directoryLoad.refreshing)}>
                  {directoryLoad.initialLoading ? (
                    <TableSkeletonRows show={directoryLoad.showSkeleton} columns={['text', 'text', 'text']} label="Loading offices…" />
                  ) : (
                    <>
                      {paginatedOfficeDirectoryRows.map((row) => (
                        <tr
                          key={row.officeId}
                          className="border-b border-slate-100 hover:bg-slate-50 transition-colors last:border-0 cursor-pointer"
                          onClick={() => handleOfficeClick(row)}
                        >
                          <td className="px-5 py-4">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-sm text-slate-900"><MapPin size={13} className="text-slate-400" /> {row.officeName}</span>
                            {row.code && <p className="!mb-0 mt-0.5 pl-[19px] text-xs text-slate-400">{row.code}</p>}
                          </td>
                          <td className="px-5 py-4 text-sm">
                            {row.deptHead ? (
                              <div>
                                <p className="!mb-0 font-medium text-slate-700">{row.deptHead.name}</p>
                                <p className="!mb-0 text-xs text-slate-400">{row.deptHead.contact}</p>
                              </div>
                            ) : (
                              <span className="text-amber-600 text-xs font-semibold">Unassigned</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-center">
                            <span className="font-bold text-slate-900 text-sm">{row.employeeCount}</span>
                          </td>
                        </tr>
                      ))}
                      {filteredOfficeDirectoryRows.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-5 py-12 text-center text-slate-500">
                            <Briefcase className="mx-auto mb-2 h-9 w-9 text-slate-300" />
                            <p className="font-medium">No offices found.</p>
                          </td>
                        </tr>
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            <p className="!mb-0">
              Showing {filteredOfficeDirectoryRows.length === 0 ? 0 : safeOfficeDirectoryPage * OFFICE_DIRECTORY_PER_PAGE + 1}-{Math.min((safeOfficeDirectoryPage + 1) * OFFICE_DIRECTORY_PER_PAGE, filteredOfficeDirectoryRows.length)} of {filteredOfficeDirectoryRows.length} offices
            </p>
            <div className="flex items-center gap-2">
              <button
                className="rounded border border-slate-300 p-1 disabled:opacity-40"
                onClick={() => setOfficeDirectoryPage((current) => Math.max(0, current - 1))}
                disabled={safeOfficeDirectoryPage === 0 || filteredOfficeDirectoryRows.length === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-semibold text-slate-800">Page {safeOfficeDirectoryPage + 1} / {officeDirectoryPageCount}</span>
              <button
                className="rounded border border-slate-300 p-1 disabled:opacity-40"
                onClick={() => setOfficeDirectoryPage((current) => Math.min(officeDirectoryPageCount - 1, current + 1))}
                disabled={safeOfficeDirectoryPage >= officeDirectoryPageCount - 1 || filteredOfficeDirectoryRows.length === 0}
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </footer>
        </div>
      )}
    </div>
  );
};
