import { useBackClosesView } from '../../../hooks/useHistoryBack';
import { AlertCircle, ArrowUpDown, Building2, ChevronDown, ChevronRight, RefreshCw, Search } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRealtimeRefresh } from '../../../hooks/useRealtimeRefresh';
import { BackButton } from '../../../components/BackButton';
import { EmptyState } from '../../../components/EmptyState';
import { getActiveHeadcountByDepartment, getActiveOfficeKeys, normDeptKey } from '../../../lib/api/competencyGapAnalysis';
import {
  getDepartmentSourceSemester,
  getPublishedRecords,
  type DepartmentSourceSemester,
  type IPCRRatingRecord,
  type CompetencyAssessmentState,
} from '../../../lib/api/sorSemesterSource';
import { CompetencyGapPanel } from './CompetencyGapPanel';
import { SemesterSummarySection } from './SemesterSummarySection';

export type { IPCRRatingRecord, CompetencyAssessmentState, DepartmentSourceSemester };

export const RATED_PERIOD_LABEL = 'All rated periods';

export type Adjectival = 'Outstanding' | 'Very Satisfactory' | 'Satisfactory' | 'Unsatisfactory' | 'Poor' | 'Non-Submission';

// Official IPCR Final Average Rating scale (per government PMT guidelines):
//   4.75 – 5.00  Outstanding
//   4.00 – 4.74  Very Satisfactory
//   3.00 – 3.99  Satisfactory
//   2.00 – 2.99  Unsatisfactory
//   1.00 – 1.99  Poor
// Note: numerical values must NOT be rounded off to the nearest thousandths when computing averages.
export function getAdjectival(score: number | null): { label: Adjectival; pillClass: string } {
  if (score === null) return { label: 'Non-Submission', pillClass: 'bg-blue-300 text-blue-900' };
  if (score >= 4.75) return { label: 'Outstanding', pillClass: 'bg-yellow-400 text-yellow-900' };
  if (score >= 4) return { label: 'Very Satisfactory', pillClass: 'bg-emerald-400 text-emerald-900' };
  if (score >= 3) return { label: 'Satisfactory', pillClass: 'bg-teal-400 text-teal-900' };
  if (score >= 2) return { label: 'Unsatisfactory', pillClass: 'bg-red-300 text-red-900' };
  return { label: 'Poor', pillClass: 'bg-red-500 text-white' };
}

export function computeKPIs(records: IPCRRatingRecord[]): Record<Adjectival | 'Total', number> {
  const kpis = {
    Total: records.length,
    Outstanding: 0,
    'Very Satisfactory': 0,
    Satisfactory: 0,
    Unsatisfactory: 0,
    Poor: 0,
    'Non-Submission': 0,
  };
  records.forEach(r => {
    const adj = getAdjectival(r.numericalRating).label;
    kpis[adj]++;
  });
  return kpis;
}

export function groupByDept(records: IPCRRatingRecord[]) {
  const groups = new Map<string, { records: IPCRRatingRecord[]; avg: number; distribution: Record<Adjectival, number>; _sum: number; _count: number }>();

  records.forEach(r => {
    if (!groups.has(r.department)) {
      groups.set(r.department, {
        records: [],
        avg: 0,
        distribution: {
          Outstanding: 0,
          'Very Satisfactory': 0,
          Satisfactory: 0,
          Unsatisfactory: 0,
          Poor: 0,
          'Non-Submission': 0,
        },
        _sum: 0,
        _count: 0,
      });
    }
    const group = groups.get(r.department)!;
    group.records.push(r);

    const adj = getAdjectival(r.numericalRating).label;
    group.distribution[adj]++;

    // avg ignores null ratings (non-submissions don't count toward the mean).
    if (r.numericalRating !== null) {
      group._sum += r.numericalRating;
      group._count++;
    }
  });

  for (const group of groups.values()) {
    group.avg = group._count > 0 ? group._sum / group._count : 0;
  }

  return groups;
}

export interface DeptCompletionRow {
  department: string;
  /** Active employees in the office (never less than `completed`). */
  total: number;
  /** Employees with a completed (rated) IPCR. */
  completed: number;
  /** completed / total, or null when the office has nobody to count. */
  rate: number | null;
  lowCount: number;
  nonSubmission: number;
  period?: string | null;
  cycleId?: number | null;
  status?: 'published' | 'correction_pending' | 'none';
  isOlderSemester?: boolean;
}

// Keep only offices that are active in `departments`, and give every active
// office a headcount entry so one with nobody yet still lists (0 / 0).
// `activeOffices` null means the lookup failed: show the data unfiltered.
export function restrictToActiveOffices(
  records: IPCRRatingRecord[],
  headcount: Map<string, { name: string; count: number }>,
  activeOffices: Map<string, string> | null,
): { records: IPCRRatingRecord[]; headcount: Map<string, { name: string; count: number }> } {
  if (!activeOffices) return { records, headcount };
  const scoped = new Map<string, { name: string; count: number }>();
  for (const [key, name] of activeOffices.entries()) {
    scoped.set(key, headcount.get(key) ?? { name, count: 0 });
  }
  return {
    records: records.filter(r => activeOffices.has(normDeptKey(r.department))),
    headcount: scoped,
  };
}

// Department landing rows: IPCR completion = employees with a rated IPCR over
// the office's Active headcount. Offices with nobody rated yet still appear
// (0 / N) — they are the ones that most need chasing.
export function buildDeptCompletionRows(
  records: IPCRRatingRecord[],
  headcount: Map<string, { name: string; count: number }>,
  ascending: boolean,
  deptSemesters?: Map<string, DepartmentSourceSemester>,
): DeptCompletionRow[] {
  const groups = groupByDept(records);
  const rows = new Map<string, DeptCompletionRow>();

  // Determine highest cycle_id across all published departments to mark older semesters
  let maxCycleId = 0;
  if (deptSemesters) {
    for (const sem of deptSemesters.values()) {
      if (sem.cycleId && sem.cycleId > maxCycleId) {
        maxCycleId = sem.cycleId;
      }
    }
  }

  for (const [department, g] of groups.entries()) {
    rows.set(normDeptKey(department), {
      department,
      total: 0,
      completed: g._count,
      rate: null,
      lowCount: g.distribution.Unsatisfactory + g.distribution.Poor,
      nonSubmission: g.distribution['Non-Submission'],
    });
  }
  for (const [key, { name, count }] of headcount.entries()) {
    const row = rows.get(key) ?? { department: name, total: 0, completed: 0, rate: null, lowCount: 0, nonSubmission: 0 };
    row.total = count;
    rows.set(key, row);
  }

  return Array.from(rows.values())
    .map(row => {
      const sem = deptSemesters?.get(normDeptKey(row.department));
      const period = sem?.periodTitle ?? null;
      const status = sem?.status ?? (sem?.cycleId ? 'published' : 'none');
      const cycleId = sem?.cycleId ?? null;
      const isOlderSemester = Boolean(maxCycleId > 0 && cycleId && cycleId < maxCycleId);

      // When a department has a published or correction_pending semester, its total and completed
      // are scoped to that semester's frozen roster (sem.requiredCount & sem.approvedCount)
      // so subsequent hires/transfers never dilute an old semester's completion requirement.
      const hasPublishedCycle = Boolean(sem && sem.cycleId && sem.status !== 'none');
      const total = hasPublishedCycle
        ? Math.max(sem!.requiredCount, row.completed)
        : Math.max(row.total, row.completed);
      const completed = hasPublishedCycle
        ? Math.max(sem!.approvedCount, row.completed)
        : row.completed;

      return {
        ...row,
        total,
        completed,
        rate: total > 0 ? completed / total : null,
        period,
        status,
        cycleId,
        isOlderSemester,
      };
    })
    .sort((a, b) => {
      const diff = (a.rate ?? -1) - (b.rate ?? -1);
      if (diff !== 0) return ascending ? diff : -diff;
      return a.department.localeCompare(b.department);
    });
}

/** "8 / 10" with a progress bar and percent — the department landing cell. */
export const DeptCompletionCell = ({ row }: { row: DeptCompletionRow }) => {
  const pct = row.rate !== null ? Math.round(row.rate * 100) : null;
  const barClass =
    pct === null ? 'bg-gray-300' : pct >= 100 ? 'bg-emerald-500' : pct >= 50 ? 'bg-blue-500' : 'bg-amber-500';
  return (
    <div className="flex w-full max-w-[9rem] flex-col items-center gap-1">
      <span className="text-sm font-bold text-gray-900">
        {row.completed} / {row.total}
      </span>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
      <span className="text-[10px] font-semibold uppercase text-gray-500">
        {pct !== null ? `${pct}% complete` : 'No employees'}
      </span>
    </div>
  );
};

const NEEDS_IMPROVEMENT_THRESHOLD = 3;

const fmtDate = (d: Date) =>
  d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export const SummaryOfRatings = () => {
  const [records, setRecords] = useState<IPCRRatingRecord[]>([]);
  const [headcount, setHeadcount] = useState<Map<string, { name: string; count: number }>>(new Map());
  const [deptSemesters, setDeptSemesters] = useState<Map<string, DepartmentSourceSemester>>(new Map());
  const [loading, setLoading] = useState(true);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [deptSortAsc, setDeptSortAsc] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  // null → department landing view; a department name → drilled-in employee view
  const [activeDept, setActiveDept] = useState<string | null>(null);
  useBackClosesView(activeDept !== null, () => backToDepartments(), 'pm-sor-department');
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const latestLoadId = useRef(0);

  const fetchRecords = useCallback(async (isSilent = false) => {
    const loadId = ++latestLoadId.current;
    if (!isSilent) setLoading(true);
    try {
      // 1. Fetch headcount and active offices list
      const [roster, activeOffices] = await Promise.all([
        getActiveHeadcountByDepartment().catch(err => {
          console.error('Error loading office headcount:', err);
          return new Map<string, { name: string; count: number }>();
        }),
        getActiveOfficeKeys().catch(err => {
          console.error('Error loading active offices:', err);
          return null;
        }),
      ]);

      // Collect active department names to inspect
      const deptNames: string[] = activeOffices
        ? Array.from(activeOffices.values())
        : Array.from(roster.values()).map(v => v.name);

      // 2. Fetch each department's published semester source via getDepartmentSourceSemester
      const semesterResults = await Promise.all(
        deptNames.map(async dept => {
          try {
            const sem = await getDepartmentSourceSemester(dept);
            if (!sem) {
              return {
                department: dept,
                cycleId: null,
                periodTitle: null,
                status: 'none' as const,
                requiredCount: 0,
                approvedCount: 0,
                assessmentCompleteCount: 0,
              };
            }
            return {
              department: dept,
              cycleId: sem.cycleId,
              periodTitle: sem.cycleTitle ?? sem.periodTitle ?? null,
              status: sem.status,
              requiredCount: sem.requiredCount,
              approvedCount: sem.approvedCount,
              assessmentCompleteCount: sem.assessmentCompleteCount,
            };
          } catch (err) {
            console.error(`Error fetching semester for ${dept}:`, err);
            return {
              department: dept,
              cycleId: null,
              periodTitle: null,
              status: 'none' as const,
              requiredCount: 0,
              approvedCount: 0,
              assessmentCompleteCount: 0,
            };
          }
        }),
      );

      const semesterMap = new Map<string, DepartmentSourceSemester>();
      semesterResults.forEach(res => {
        semesterMap.set(normDeptKey(res.department), res);
      });

      // 3. For departments with a published cycle, fetch published records
      const publishedRecordsNested = await Promise.all(
        semesterResults
          .filter(res => res.cycleId != null && res.status !== 'none')
          .map(res =>
            getPublishedRecords(res.department, res.cycleId!).catch(err => {
              console.error(`Error loading published records for ${res.department}:`, err);
              return [];
            }),
          ),
      );
      const allRecords = publishedRecordsNested.flat();

      if (loadId !== latestLoadId.current) return;
      const scoped = restrictToActiveOffices(allRecords, roster, activeOffices);
      setRecords(scoped.records);
      setHeadcount(scoped.headcount);
      setDeptSemesters(semesterMap);
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
    channel: 'pm-summary-of-ratings-mirrored',
    tables: [
      'success_indicator_ratings',
      'ipcr_competency_matches',
      'ipcr_department_publication',
      'competency_assessment_runs',
      'performance_evaluations',
    ],
    onChange: useCallback(() => {
      void fetchRecords(true);
    }, [fetchRecords]),
  });

  // Department landing rows — IPCR completion (rated / Active headcount) and
  // low-performer counts.
  const deptRows = useMemo(
    () => buildDeptCompletionRows(records, headcount, deptSortAsc, deptSemesters),
    [records, headcount, deptSortAsc, deptSemesters],
  );
  const totalEmployees = deptRows.reduce((sum, d) => sum + d.total, 0);
  const totalCompleted = deptRows.reduce((sum, d) => sum + d.completed, 0);

  // Active department semester publication info
  const activeDeptSemester = useMemo(() => {
    if (!activeDept) return null;
    return deptSemesters.get(normDeptKey(activeDept)) ?? null;
  }, [activeDept, deptSemesters]);

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
          <span className="text-blue-600">PM</span>{' '}
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
                : activeDeptSemester?.periodTitle
                  ? `Employee ratings · sorted lowest-first · Period: ${activeDeptSemester.periodTitle}`
                  : 'Employee ratings · sorted lowest-first · No completed semester'}
            </p>
            {activeDept !== null && activeDeptSemester?.status === 'correction_pending' && (
              <div
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800"
                role="alert"
                data-testid="correction-pending-alert"
              >
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                <span>Correction pending: one or more records reopened</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            {lastSynced && (
              <span className="text-xs text-gray-400">
                Last synced {fmtDate(lastSynced)}
              </span>
            )}
            <button
              type="button"
              onClick={() => void fetchRecords()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      {activeDept === null ? (
      /* ── Department landing table ─────────────────────────────── */
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
            <span className="text-sm text-gray-500">Loading…</span>
          </div>
        )}

        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-5 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            {deptRows.length} department{deptRows.length !== 1 ? 's' : ''} · {totalCompleted} of {totalEmployees} employees with complete IPCR
          </span>
          <button
            type="button"
            onClick={() => setDeptSortAsc(v => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:border-blue-400 hover:text-blue-600 transition"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {deptSortAsc ? 'Lowest completion first' : 'Highest completion first'}
          </button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-12 items-center border-b border-gray-100 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <div className="col-span-5">Department</div>
          <div className="col-span-2 text-center">Employees</div>
          <div className="col-span-2 text-center">IPCR Completion</div>
          <div className="col-span-2 text-center">Needs Attention</div>
          <div className="col-span-1" />
        </div>

        {deptRows.length === 0 && !loading ? (
          <div className="py-12">
            <EmptyState
              title="No departments found"
              description="No IPCR records are available to summarize yet."
            />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {deptRows.map(d => {
              return (
                <button
                  key={d.department}
                  type="button"
                  onClick={() => enterDept(d.department)}
                  className="grid w-full grid-cols-12 items-center px-5 py-4 text-left transition hover:bg-blue-50/40"
                >
                  <div className="col-span-5 flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                      <Building2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 truncate">{d.department}</span>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className={`text-xs ${d.period ? 'text-gray-500' : 'text-amber-600 font-medium'}`}>
                          {d.period || 'No completed semester'}
                        </span>
                        {d.status === 'correction_pending' && (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                            Correction pending
                          </span>
                        )}
                        {d.isOlderSemester && (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                            Previous cycle
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="col-span-2 text-center text-sm text-gray-600">{d.total}</div>
                  <div className="col-span-2 flex justify-center">
                    <DeptCompletionCell row={d} />
                  </div>
                  <div className="col-span-2 text-center">
                    {d.lowCount > 0 ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                        {d.lowCount} low
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                    {d.nonSubmission > 0 && (
                      <span className="ml-1 inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                        {d.nonSubmission} no sub
                      </span>
                    )}
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </div>
                </button>
              );
            })}
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
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-[1px]">
            <span className="text-sm text-gray-500">Loading…</span>
          </div>
        )}

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
        {filteredSorted.length === 0 && !loading ? (
          <div className="py-12">
            <EmptyState
              title={activeDeptSemester?.cycleId ? 'No employees found' : 'No completed semester'}
              description={
                activeDeptSemester?.cycleId
                  ? 'No IPCR records match the current search.'
                  : 'This department does not have a fully approved completed semester published yet.'
              }
            />
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
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

      {/* New "Semester Summary of Ratings" — own section beneath the existing
          one (Requirement 2). Renders itself only when Phase 2 is open and the
          new semester has finalized IPCRs; otherwise it returns null. */}
      <SemesterSummarySection />
    </div>
  );
};
