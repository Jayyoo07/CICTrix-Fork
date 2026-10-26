import { useBackClosesView } from '../../hooks/useHistoryBack';
import { ArrowUpDown, Building2, ChevronDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRealtimeRefresh } from '../../hooks/useRealtimeRefresh';
import { BackButton } from '../../components/BackButton';
import { EmptyState } from '../../components/EmptyState';
import { getActiveHeadcountByDepartment, getActiveOfficeKeys, getIPCRRecordsFromGapView } from '../../lib/api/competencyGapAnalysis';
import {
  RATED_PERIOD_LABEL,
  buildDeptCompletionRows,
  getAdjectival,
  restrictToActiveOffices,
  type IPCRRatingRecord,
} from './pm/SummaryOfRatings';
import { CompetencyGapPanel } from './pm/CompetencyGapPanel';
import { RefreshBar, SkeletonList, tableBodyClass, useTableLoading } from '../../components/table-loading';

// Employees rated below "Satisfactory" (< 3.00 on the IPCR scale) are flagged as
// needing improvement — the same absolute threshold the department landing counts.
const NEEDS_IMPROVEMENT_THRESHOLD = 3;

/** Departments shown per page on the landing table. */
const DEPTS_PER_PAGE = 5;

const fmtDate = (d: Date) =>
  d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export const LndSummaryOfRatings = () => {
  const [records, setRecords] = useState<IPCRRatingRecord[]>([]);
  const [headcount, setHeadcount] = useState<Map<string, { name: string; count: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const recordsLoad = useTableLoading(loading, records.length > 0);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [deptPage, setDeptPage] = useState(1);
  const [deptSortAsc, setDeptSortAsc] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // null → department landing view; a department name → drilled-in employee view
  const [activeDept, setActiveDept] = useState<string | null>(null);
  useBackClosesView(activeDept !== null, () => backToDepartments(), 'lnd-sor-department');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const latestLoadId = useRef(0);

  const fetchRecords = useCallback(async (isSilent = false) => {
    const loadId = ++latestLoadId.current;
    if (!isSilent) setLoading(true);
    try {
      // Headcount is the completion denominator; if it fails, fall back to the
      // rated employees alone rather than blanking the whole page.
      // The active-office list only filters; if it fails, show everything.
      const [data, roster, activeOffices] = await Promise.all([
        getIPCRRecordsFromGapView(RATED_PERIOD_LABEL),
        getActiveHeadcountByDepartment().catch(err => {
          console.error('Error loading office headcount:', err);
          return new Map<string, { name: string; count: number }>();
        }),
        getActiveOfficeKeys().catch(err => {
          console.error('Error loading active offices:', err);
          return null;
        }),
      ]);
      if (loadId !== latestLoadId.current) return;
      const scoped = restrictToActiveOffices(data, roster, activeOffices);
      setRecords(scoped.records);
      setHeadcount(scoped.headcount);
      setLastSynced(new Date());
    } catch (err) {
      console.error('Error loading IPCR records:', err);
    } finally {
      if (loadId === latestLoadId.current && !isSilent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  useRealtimeRefresh({
    channel: 'lnd-summary-of-ratings',
    tables: ['success_indicator_ratings', 'ipcr_competency_matches'],
    onChange: useCallback(() => {
      void fetchRecords(true);
    }, [fetchRecords]),
  });

  // Department landing rows — IPCR completion (rated / Active headcount) and
  // low-performer counts.
  const deptRows = useMemo(
    () => buildDeptCompletionRows(records, headcount, deptSortAsc),
    [records, headcount, deptSortAsc],
  );
  const deptPageCount = Math.max(1, Math.ceil(deptRows.length / DEPTS_PER_PAGE));
  const deptPageSafe = Math.min(deptPage, deptPageCount);
  const deptStart = (deptPageSafe - 1) * DEPTS_PER_PAGE;
  const deptPageRows = deptRows.slice(deptStart, deptStart + DEPTS_PER_PAGE);

  const totalEmployees = deptRows.reduce((sum, d) => sum + d.total, 0);
  const totalCompleted = deptRows.reduce((sum, d) => sum + d.completed, 0);

  // Employees within the drilled-in department, searched + sorted by rating.
  const filteredSorted = useMemo(() => {
    if (!activeDept) return [];
    const term = searchTerm.toLowerCase();
    return records
      .filter(r => r.department === activeDept)
      .filter(r => !term || r.name.toLowerCase().includes(term))
      .sort((a, b) => {
        const aScore = a.numericalRating ?? -1;
        const bScore = b.numericalRating ?? -1;
        return sortAsc ? aScore - bScore : bScore - aScore;
      });
  }, [records, searchTerm, activeDept, sortAsc]);

  const enterDept = (dept: string) => {
    setActiveDept(dept);
    setSearchTerm('');
  };

  const backToDepartments = () => {
    setActiveDept(null);
    setSearchTerm('');
  };

  return (
    <div className="space-y-5 p-8">
      {/* Header */}
      <section>
        <p className="text-sm font-medium text-gray-500">
          <span className="text-blue-600">L&D</span>{' '}
          <span className="mx-1 text-gray-400">/</span>{' '}
          <span>Summary of Ratings</span>
        </p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-4">
          <div>
            {activeDept !== null && <BackButton className="mb-3" onBack={backToDepartments} />}
            <h1 className="text-3xl font-bold text-gray-900">
              {activeDept === null ? 'Summary of Ratings' : activeDept}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {activeDept === null
                ? 'IPCR performance ratings by department — read-only identification surface'
                : `Employee ratings · sorted lowest-first · ${RATED_PERIOD_LABEL}`}
            </p>
          </div>
          {/* No Refresh button: useRealtimeRefresh below subscribes to the
              rating tables, so the page updates itself. "Last synced" stays,
              as the proof that it did. */}
          <div className="flex items-center gap-3">
            {lastSynced && (
              <span className="text-xs text-gray-400">
                Last synced {fmtDate(lastSynced)}
              </span>
            )}
          </div>
        </div>
      </section>

      {activeDept === null ? (
      /* ── Department landing table ─────────────────────────────── */
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <RefreshBar active={recordsLoad.refreshing} />

        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {deptRows.length} department{deptRows.length !== 1 ? 's' : ''} · {totalCompleted} of {totalEmployees} employees with complete IPCR
          </span>
          <button
            type="button"
            onClick={() => { setDeptSortAsc(v => !v); setDeptPage(1); }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 transition"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {deptSortAsc ? 'Lowest completion first' : 'Highest completion first'}
          </button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-12 items-center border-b border-gray-100 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <div className="col-span-6">Department</div>
          <div className="col-span-2 text-center">Employees</div>
          <div className="col-span-3 text-center">IPCR Completion</div>
          <div className="col-span-1" />
        </div>

        {recordsLoad.initialLoading ? (
          <SkeletonList show={recordsLoad.showSkeleton} label="Loading departments…" />
        ) : deptRows.length === 0 ? (
          <div className="py-12">
            <EmptyState
              title="No departments found"
              description="No IPCR records are available to summarize yet."
            />
          </div>
        ) : (
          <div className={`divide-y divide-gray-100 ${tableBodyClass(recordsLoad.refreshing)}`}>
            {deptPageRows.map(d => {
              return (
                <button
                  key={d.department}
                  type="button"
                  onClick={() => enterDept(d.department)}
                  className="grid w-full grid-cols-12 items-center px-5 py-4 text-left transition hover:bg-blue-50/40"
                >
                  <div className="col-span-6 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{d.department}</span>
                  </div>
                  <div className="col-span-2 text-center text-sm text-gray-600">{d.total}</div>
                  <div className="col-span-3 text-center text-sm font-bold text-gray-900">
                    {d.completed} / {d.total}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {deptRows.length > DEPTS_PER_PAGE && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
            <span>
              Showing {deptStart + 1} to {Math.min(deptStart + DEPTS_PER_PAGE, deptRows.length)} of {deptRows.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={deptPageSafe <= 1}
                onClick={() => setDeptPage(p => Math.max(1, p - 1))}
                aria-label="Previous page"
                className="rounded-md border border-gray-300 p-1 text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-1">{deptPageSafe} / {deptPageCount}</span>
              <button
                type="button"
                disabled={deptPageSafe >= deptPageCount}
                onClick={() => setDeptPage(p => Math.min(deptPageCount, p + 1))}
                aria-label="Next page"
                className="rounded-md border border-gray-300 p-1 text-gray-600 transition hover:bg-gray-50 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
      ) : (
      <>
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search employees in this department…"
            className="w-full rounded-lg border border-gray-200 py-1.5 pl-9 pr-4 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <span className="ml-auto text-xs text-gray-400">
          {filteredSorted.length} employee{filteredSorted.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Table */}
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <RefreshBar active={recordsLoad.refreshing} />

        {/* Sort toggle */}
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {filteredSorted.length} employee{filteredSorted.length !== 1 ? 's' : ''}
          </span>
          <button
            type="button"
            onClick={() => setSortAsc(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 transition"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortAsc ? 'Lowest to highest' : 'Highest to lowest'}
          </button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-12 items-center border-b border-gray-100 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <div className="col-span-4">Employee</div>
          <div className="col-span-3">Position</div>
          <div className="col-span-2 text-center">Rating</div>
          <div className="col-span-3">Period</div>
        </div>

        {/* Rows */}
        {recordsLoad.initialLoading ? (
          <SkeletonList show={recordsLoad.showSkeleton} label="Loading employees…" />
        ) : filteredSorted.length === 0 ? (
          <div className="py-12">
            <EmptyState
              title="No employees found"
              description="No IPCR records match the current search."
            />
          </div>
        ) : (
          <div className={`divide-y divide-gray-100 ${tableBodyClass(recordsLoad.refreshing)}`}>
            {filteredSorted.map(row => {
              const isLow =
                row.numericalRating !== null &&
                row.numericalRating < NEEDS_IMPROVEMENT_THRESHOLD;
              const adj = getAdjectival(row.numericalRating);
              const hasGaps = (row.competencies ?? []).some(c => c.isGap);
              const open = !!expandedRows[row.id];
              return (
                <div key={row.id}>
                  <button
                    type="button"
                    onClick={() => setExpandedRows(p => ({ ...p, [row.id]: !p[row.id] }))}
                    className={[
                      'grid w-full grid-cols-12 items-center border-l-4 px-5 py-3.5 text-left transition hover:bg-gray-50/50',
                      isLow ? 'border-l-amber-400' : 'border-l-transparent',
                    ].join(' ')}
                  >
                    <div className="col-span-4">
                      <p className="text-sm font-semibold text-gray-900">{row.name}</p>
                      <p className="mt-0.5 text-xs text-gray-400">{row.department}</p>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {isLow && <span className="inline-block text-[10px] font-semibold text-amber-600">Low performer</span>}
                        {hasGaps && (
                          <span className="inline-flex items-center rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600">
                            Training recommended
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="col-span-3 text-xs text-gray-500 leading-snug pr-2">
                      {row.position}
                    </div>
                    <div className="col-span-2 flex flex-col items-center gap-1">
                      <span className="text-sm font-bold text-gray-900">
                        {row.numericalRating !== null ? row.numericalRating.toFixed(2) : '—'}
                      </span>
                      <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${adj.pillClass}`}>
                        {adj.label}
                      </span>
                    </div>
                    <div className="col-span-3 flex items-center justify-between text-xs text-gray-500">
                      <span>{row.period}</span>
                      <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                  {open && (
                    <div className="border-t border-gray-100 bg-gray-50/60 p-4">
                      <CompetencyGapPanel record={row} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </>
      )}
    </div>
  );
};
