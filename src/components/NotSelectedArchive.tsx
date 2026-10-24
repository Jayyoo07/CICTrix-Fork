import { useMemo, useState } from 'react';
import { Search, UserMinus } from 'lucide-react';
import type { ArchivedApplicant } from '../lib/hiringFlow';
import { formatDisplayDate } from '../lib/scheduleSelection';

/**
 * RSP Archives → Not Selected Applicants: everyone moved here automatically
 * when the plantilla they applied for was filled by someone else
 * (migration 20261021200100). Their tracker shows the regret letter.
 */

const PAGE_SIZE = 10;

export const NotSelectedArchive = ({ rows, loading }: { rows: ArchivedApplicant[]; loading: boolean }) => {
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('all');
  const [page, setPage] = useState(0);

  const departments = useMemo(() => Array.from(new Set(rows.map((r) => r.department))).sort(), [rows]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) =>
      (department === 'all' || r.department === department)
      && (!term || [r.fullName, r.email, r.referenceNo, r.position, r.plantilla].some((v) => v.toLowerCase().includes(term))),
    );
  }, [rows, search, department]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, totalPages - 1);
  const sliced = filtered.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-primary-900)]">Not Selected Applicants</h2>
          <p className="text-sm text-[var(--neutral-600)]">
            Archived automatically when the plantilla they applied for was filled. Their status tracker shows the regret letter.
          </p>
        </div>
        {/* §9.4 toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative">
            <span className="sr-only">Search archived applicants</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--neutral-400)]" aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(0); }}
              placeholder="Search name, reference, position…"
              className="h-9 w-[260px] rounded-lg border border-[var(--neutral-200)] bg-white pl-9 pr-3 text-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-[3px] focus:ring-[var(--color-primary-200)]"
            />
          </label>
          <select
            aria-label="Filter by department"
            value={department}
            onChange={(event) => { setDepartment(event.target.value); setPage(0); }}
            className="h-9 rounded-lg border border-[var(--neutral-200)] bg-white px-3 text-sm"
          >
            <option value="all">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--neutral-200)] bg-white">
        <table className="w-full min-w-full">
          <thead>
            <tr className="bg-[var(--bg-page)] text-left text-[13px] font-semibold text-[var(--color-primary-900)]">
              <th scope="col" className="px-4 py-2.5">Applicant</th>
              <th scope="col" className="px-4 py-2.5">Position</th>
              <th scope="col" className="px-4 py-2.5">Department</th>
              <th scope="col" className="px-4 py-2.5">Archived</th>
              <th scope="col" className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-[var(--neutral-600)]" aria-busy="true">Loading archived applicants…</td></tr>
            ) : sliced.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center">
                  <UserMinus className="mx-auto mb-2 h-7 w-7 text-[var(--neutral-400)]" aria-hidden="true" />
                  <p className="text-base font-semibold text-[var(--color-primary-900)]">No archived applicants</p>
                  <p className="text-sm text-[var(--neutral-600)]">Applicants appear here once a plantilla they applied for is filled.</p>
                </td>
              </tr>
            ) : sliced.map((r) => (
              <tr key={r.id} className="border-t border-[var(--neutral-200)] text-sm hover:bg-[var(--bg-row-hover)]">
                <td className="px-4 py-3">
                  <p className="font-semibold text-[var(--color-primary-900)]">{r.fullName}</p>
                  <p className="text-xs text-[var(--neutral-600)]">{r.referenceNo || r.email}</p>
                </td>
                <td className="px-4 py-3 text-[var(--neutral-800)]">
                  {r.position}{r.plantilla ? <span className="block text-xs text-[var(--neutral-600)]">{r.plantilla}</span> : null}
                </td>
                <td className="px-4 py-3 text-[var(--neutral-800)]">{r.department}</td>
                <td className="whitespace-nowrap px-4 py-3 text-[var(--neutral-800)]">{formatDisplayDate(r.archivedAt)}</td>
                {/* §10: Disqualified / Rejected = Error */}
                <td className="px-4 py-3"><span className="badge badge-error"><span className="badge-dot" aria-hidden="true" />Not Selected</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--neutral-600)]">
          <span>Showing {current * PAGE_SIZE + 1}–{Math.min((current + 1) * PAGE_SIZE, filtered.length)} of {filtered.length} entries</span>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPage(Math.max(0, current - 1))} disabled={current === 0} className="rsp-pager rounded-lg border border-[var(--neutral-200)] px-3 py-1 font-semibold disabled:opacity-40">Previous</button>
            <button type="button" onClick={() => setPage(Math.min(totalPages - 1, current + 1))} disabled={current >= totalPages - 1} className="rsp-pager rounded-lg border border-[var(--neutral-200)] px-3 py-1 font-semibold disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </section>
  );
};
