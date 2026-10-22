import { ChevronLeft, ChevronRight, Search, UserCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatOfficeLabel } from '../constants/positions';
import { formatPHDate } from '../lib/recruitmentData';
import { plantillaLabel, plantillaNumberOf } from '../lib/plantillaRules';
import { vacancySalaryLabel } from '../lib/vacancySalary';
import { useSalarySchedule } from '../hooks/useSalarySchedule';
import type { JobPosting, PlantillaSlot } from '../types/recruitment.types';

const ITEMS_PER_PAGE = 10;

/** Plantillas an employee holds, across every job post. */
export const filledPlantillas = (jobs: JobPosting[]) =>
  jobs.flatMap((job) => (job.plantillaSlots ?? [])
    .filter((slot) => slot.status === 'filled')
    .map((slot) => ({ job, slot })));

interface FilledPositionsPanelProps {
  jobs: JobPosting[];
  loading: boolean;
}

/**
 * Job Posts › Filled Positions: read-only record of filled plantillas, which
 * are kept out of Job Vacancies and the public vacancy table
 * (docs/plans/2026-10-22-vacant-jobs-exclude-filled.md).
 */
export const FilledPositionsPanel = ({ jobs, loading }: FilledPositionsPanelProps) => {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const salarySchedule = useSalarySchedule();

  const filled = useMemo(() => {
    const term = search.trim().toLowerCase();
    const number = (slot: PlantillaSlot) => plantillaNumberOf(slot.label) || plantillaLabel(slot);
    return filledPlantillas(jobs)
      .filter(({ job, slot }) => !term
        || String(job.title).toLowerCase().includes(term)
        || String(job.department).toLowerCase().includes(term)
        || number(slot).toLowerCase().includes(term))
      .sort((a, b) => String(b.slot.filledAt ?? '').localeCompare(String(a.slot.filledAt ?? ''))
        || String(a.job.title).localeCompare(String(b.job.title)));
  }, [jobs, search]);

  const totalPages = Math.max(1, Math.ceil(filled.length / ITEMS_PER_PAGE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const rows = filled.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      {/* Table toolbar (§9.4) */}
      <div className="mb-4 flex flex-wrap items-start gap-4">
        <div>
          <h2 className="!mb-0.5 text-xl font-semibold" style={{ color: '#040E6B' }}>Filled Positions</h2>
          <p className="!mb-0 text-sm text-slate-500">Plantillas an employee holds. They are not listed as vacancies.</p>
        </div>
        <div className="abyan-ds ml-auto flex flex-wrap items-center gap-3">
          <div className="relative w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-9 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm"
              placeholder="Search title, department, plantilla…"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-full">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-2.5 text-left text-[13px] font-semibold" style={{ color: '#040E6B' }}>Position title</th>
              <th className="px-4 py-2.5 text-left text-[13px] font-semibold" style={{ color: '#040E6B' }}>Office / Department</th>
              <th className="px-4 py-2.5 text-left text-[13px] font-semibold" style={{ color: '#040E6B' }}>Plantilla</th>
              <th className="px-4 py-2.5 text-left text-[13px] font-semibold" style={{ color: '#040E6B' }}>Monthly salary</th>
              <th className="px-4 py-2.5 text-left text-[13px] font-semibold" style={{ color: '#040E6B' }}>Filled on</th>
              <th className="px-4 py-2.5 text-left text-[13px] font-semibold" style={{ color: '#040E6B' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">Loading filled positions…</td></tr>
            )}
            {!loading && rows.map(({ job, slot }) => (
              <tr key={slot.id} className="border-b border-slate-100 last:border-0 hover:bg-[#F8FAFF]">
                <td className="px-4 py-3">
                  <p className="!mb-0 text-sm font-semibold" style={{ color: '#040E6B' }}>{job.title}</p>
                </td>
                <td className="px-4 py-3 text-sm text-slate-700">{formatOfficeLabel(job.department, job.division)}</td>
                <td className="px-4 py-3 text-sm text-slate-700">{plantillaNumberOf(slot.label) || plantillaLabel(slot)}</td>
                <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{vacancySalaryLabel({ ...job, plantillaSlots: [slot] }, salarySchedule)}</td>
                <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{slot.filledAt ? formatPHDate(slot.filledAt) : '—'}</td>
                <td className="px-4 py-3"><span className="badge badge-neutral">Filled</span></td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                  <UserCheck className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  <p className="!mb-1 font-medium text-slate-700">{search ? 'No filled positions match your search.' : 'No filled positions yet.'}</p>
                  {!search && <p className="!mb-0 text-sm">A plantilla moves here when a hire is placed in it.</p>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between px-1 text-sm text-slate-600">
        <p className="!mb-0 text-xs">{filled.length === 0 ? 'No results' : `Showing ${(page - 1) * ITEMS_PER_PAGE + 1}–${Math.min(page * ITEMS_PER_PAGE, filled.length)} of ${filled.length}`}</p>
        <div className="flex items-center gap-2">
          <button aria-label="Previous page" className="rsp-pager flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 disabled:opacity-40" onClick={() => setPage((c) => Math.max(1, c - 1))} disabled={page === 1}>
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-xs font-medium">Page {page} of {totalPages}</span>
          <button aria-label="Next page" className="rsp-pager flex h-8 w-8 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-500 disabled:opacity-40" onClick={() => setPage((c) => Math.min(totalPages, c + 1))} disabled={page === totalPages}>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </section>
  );
};
