import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Building2, ChevronDown, ClipboardCheck } from 'lucide-react';
import { getActiveHeadcountByDepartment, getActiveOfficeKeys, getIPCRRecordsFromGapView, normDeptKey } from '../../lib/api/competencyGapAnalysis';
import {
  buildDeptCompletionRows,
  getAdjectival,
  groupByDept,
  RATED_PERIOD_LABEL,
  restrictToActiveOffices,
  type DeptCompletionRow,
  type IPCRRatingRecord,
} from './pm/SummaryOfRatings';
import '../../styles/pm-dashboard.css';

// PM dashboard overview, built to docs/mockups/2026-10-16-pm-dashboard.html.
// Ratings and headcount come from the same sources as Summary of Ratings, so
// both pages show the same numbers. Pending IPCRs (with due dates) are passed in
// from PMDashboard, which already builds that list.

export interface PendingIpcr {
  dept: string;
  type: 'Probationary' | 'Regular';
  dueDate: Date;
}

interface Props {
  pending: PendingIpcr[];
  onOpenSummary: () => void;
}

type Rating = 'Outstanding' | 'Very Satisfactory' | 'Satisfactory' | 'Unsatisfactory' | 'Poor';

const RATINGS: Rating[] = ['Outstanding', 'Very Satisfactory', 'Satisfactory', 'Unsatisfactory', 'Poor'];
const RATING_COLOR: Record<Rating, string> = {
  Outstanding: 'var(--pd-r-o)',
  'Very Satisfactory': 'var(--pd-r-vs)',
  Satisfactory: 'var(--pd-r-s)',
  Unsatisfactory: 'var(--pd-r-u)',
  Poor: 'var(--pd-r-p)',
};
const RATING_PILL: Record<Rating, string> = {
  Outstanding: 'pd-p-info',
  'Very Satisfactory': 'pd-p-info',
  Satisfactory: 'pd-p-n',
  Unsatisfactory: 'pd-p-warn',
  Poor: 'pd-p-risk',
};

const DAY_MS = 86400000;
const DUE_SOON_DAYS = 30;
/** An office needs this many rated employees before its Outstanding share is compared. */
const INFLATION_MIN_RATED = 5;
/** Flag an office whose Outstanding share is at least this multiple of the office-wide share. */
const INFLATION_FACTOR = 2;
const MAX_INTERVENTION_ROWS = 5;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Some ratings and employees carry no office; show that as a state, not a blank. */
const deptLabel = (name: string | null | undefined) => String(name ?? '').trim() || 'No department';
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const dueStatus = (dueDate: Date, today: Date): 'overdue' | 'soon' | null => {
  const days = Math.round((startOfDay(dueDate).getTime() - startOfDay(today).getTime()) / DAY_MS);
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'soon';
  return null;
};

export interface SubmissionDeptRow extends DeptCompletionRow {
  overdue: number;
  dueSoon: number;
}

export interface SubmissionSummary {
  completed: number;
  total: number;
  rate: number | null;
  overdue: number;
  dueSoon: number;
  rows: SubmissionDeptRow[];
}

/** Office-wide and per-office IPCR submission, lowest rate first. */
export function summarizeSubmission(rows: DeptCompletionRow[], pending: PendingIpcr[], today: Date): SubmissionSummary {
  const byDept = new Map<string, { overdue: number; dueSoon: number }>();
  let overdue = 0;
  let dueSoon = 0;
  for (const p of pending) {
    const status = dueStatus(p.dueDate, today);
    if (!status) continue;
    const key = normDeptKey(p.dept);
    const entry = byDept.get(key) ?? { overdue: 0, dueSoon: 0 };
    if (status === 'overdue') {
      entry.overdue++;
      overdue++;
    } else {
      entry.dueSoon++;
      dueSoon++;
    }
    byDept.set(key, entry);
  }

  const counted = rows.filter((r) => r.total > 0);
  const completed = counted.reduce((sum, r) => sum + r.completed, 0);
  const total = counted.reduce((sum, r) => sum + r.total, 0);
  return {
    completed,
    total,
    rate: total > 0 ? pct(completed, total) : null,
    overdue,
    dueSoon,
    rows: counted.map((r) => ({ ...r, ...(byDept.get(normDeptKey(r.department)) ?? { overdue: 0, dueSoon: 0 }) })),
  };
}

export interface ResultsDeptRow {
  department: string;
  rated: number;
  average: number;
  distribution: Record<Rating, number>;
}

export interface ResultsSummary {
  rated: number;
  average: number | null;
  distribution: Record<Rating, number>;
  /** Employees rated Unsatisfactory or Poor, lowest score first. */
  low: IPCRRatingRecord[];
  /** Offices with at least one rating, highest average first. */
  depts: ResultsDeptRow[];
  /** The office whose Outstanding share most exceeds the office-wide share, if any does by INFLATION_FACTOR. */
  inflation: { department: string; share: number; officeShare: number } | null;
}

const emptyDistribution = (): Record<Rating, number> => ({
  Outstanding: 0,
  'Very Satisfactory': 0,
  Satisfactory: 0,
  Unsatisfactory: 0,
  Poor: 0,
});

export function summarizeResults(records: IPCRRatingRecord[]): ResultsSummary {
  const rated = records.filter((r) => r.numericalRating !== null);
  const distribution = emptyDistribution();
  let sum = 0;
  for (const r of rated) {
    distribution[getAdjectival(r.numericalRating).label as Rating]++;
    sum += r.numericalRating as number;
  }

  const low = rated
    .filter((r) => (r.numericalRating as number) < 3)
    .sort((a, b) => (a.numericalRating as number) - (b.numericalRating as number));

  const depts: ResultsDeptRow[] = Array.from(groupByDept(rated).entries())
    .map(([department, g]) => {
      const dist = emptyDistribution();
      for (const rating of RATINGS) dist[rating] = g.distribution[rating];
      return { department, rated: g._count, average: g.avg, distribution: dist };
    })
    .filter((d) => d.rated > 0)
    .sort((a, b) => b.average - a.average || deptLabel(a.department).localeCompare(deptLabel(b.department)));

  let inflation: ResultsSummary['inflation'] = null;
  const officeShare = rated.length > 0 ? distribution.Outstanding / rated.length : 0;
  if (officeShare > 0) {
    for (const d of depts) {
      if (d.rated < INFLATION_MIN_RATED) continue;
      const share = d.distribution.Outstanding / d.rated;
      if (share >= officeShare * INFLATION_FACTOR && (!inflation || share > inflation.share)) {
        inflation = { department: d.department, share, officeShare };
      }
    }
  }

  return {
    rated: rated.length,
    average: rated.length > 0 ? sum / rated.length : null,
    distribution,
    low,
    depts,
    inflation,
  };
}

const initials = (name: string) => {
  // Records are named "Last, First".
  const [last = '', first = ''] = name.split(',').map((s) => s.trim());
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase() || '?';
};

const RatingStack = ({ distribution, total, label, large = false }: { distribution: Record<Rating, number>; total: number; label: string; large?: boolean }) => (
  <div className={`pd-stack${large ? ' pd-stack-lg' : ''}`} role="img" aria-label={label}>
    {RATINGS.map((r) =>
      distribution[r] > 0 ? <i key={r} style={{ width: `${(distribution[r] / total) * 100}%`, background: RATING_COLOR[r] }} /> : null,
    )}
  </div>
);

const describeMix = (distribution: Record<Rating, number>) =>
  RATINGS.filter((r) => distribution[r] > 0).map((r) => `${r} ${distribution[r]}`).join(', ');

export const PmDashboardOverview = ({ pending, onOpenSummary }: Props) => {
  const [records, setRecords] = useState<IPCRRatingRecord[]>([]);
  const [headcount, setHeadcount] = useState<Map<string, { name: string; count: number }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [department, setDepartment] = useState('all');
  const today = useMemo(() => new Date(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, roster, activeOffices] = await Promise.all([
          getIPCRRecordsFromGapView(RATED_PERIOD_LABEL),
          getActiveHeadcountByDepartment(),
          // The active-office list only filters; if it fails, show everything.
          getActiveOfficeKeys().catch((err) => {
            console.error('Error loading active offices:', err);
            return null;
          }),
        ]);
        if (cancelled) return;
        const scoped = restrictToActiveOffices(data, roster, activeOffices);
        setRecords(scoped.records);
        setHeadcount(scoped.headcount);
      } catch (err) {
        console.error('Error loading PM dashboard ratings:', err);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const allRows = useMemo(() => buildDeptCompletionRows(records, headcount, true), [records, headcount]);
  const departments = useMemo(
    () => allRows.filter((r) => r.total > 0 && String(r.department ?? '').trim()).map((r) => r.department).sort((a, b) => a.localeCompare(b)),
    [allRows],
  );

  const inDept = (name: string | null | undefined) => department === 'all' || normDeptKey(name) === normDeptKey(department);

  const scopedPending = useMemo(() => pending.filter((p) => inDept(p.dept)), [pending, department]);
  const submission = useMemo(
    () => summarizeSubmission(allRows.filter((r) => inDept(r.department)), scopedPending, today),
    [allRows, scopedPending, department, today],
  );
  const results = useMemo(() => summarizeResults(records.filter((r) => inDept(r.department))), [records, department]);

  const dueBadge = (overdue: number, soon: number) =>
    overdue > 0 ? (
      <span className="pd-pill pd-p-risk">{overdue} overdue</span>
    ) : soon > 0 ? (
      <span className="pd-pill pd-p-warn">{soon} due in {DUE_SOON_DAYS} days</span>
    ) : null;

  const lowCount = results.distribution.Unsatisfactory + results.distribution.Poor;
  const vsOrHigher = results.distribution.Outstanding + results.distribution['Very Satisfactory'];
  const dash = loading ? '…' : '—';

  return (
    <div className="pmdash">
      <section className="pd-hero">
        <div>
          <p className="pd-crumbs">Performance Management › <b>Dashboard</b></p>
          {/* Not an <h1>: admin.css forces .admin-content h1 to brand blue with !important. */}
          <div className="pd-hero-title" role="heading" aria-level={1}>PM Dashboard</div>
          <p className="pd-hero-sub">Performance evaluation overview · {RATED_PERIOD_LABEL}</p>
        </div>
        <div className="pd-filters">
          <label className="pd-select">
            <span className="sr-only">Department</span>
            <select value={department} onChange={(e) => setDepartment(e.target.value)} style={{ color: '#fff' }}>
              <option value="all">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
          <span className="pd-asof">As of {today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </section>

      <div className="pd-main">
        {loadError && <p className="pd-error" role="alert">We couldn't load IPCR ratings. Refresh the page to try again.</p>}

        <section className="pd-kpis" aria-label="Key metrics">
          <div className="pd-kpi">
            <div className="pd-kpi-h"><span className="pd-ico"><ClipboardCheck size={20} aria-hidden="true" /></span>IPCR submission rate</div>
            <div className="pd-kpi-v">
              {submission.rate !== null ? `${submission.rate}%` : dash}
              {submission.total > 0 && <small>{submission.completed} of {submission.total}</small>}
            </div>
            <div className="pd-track" role="img" aria-label={`${submission.rate ?? 0} percent submitted`}><i style={{ width: `${submission.rate ?? 0}%` }} /></div>
            <div className="pd-kpi-foot">
              {submission.overdue > 0 && <span className="pd-pill pd-p-risk">{submission.overdue} overdue</span>}
              <span className="pd-kpi-sub">{submission.dueSoon} due in {DUE_SOON_DAYS} days</span>
            </div>
          </div>
        </section>

        <section className="pd-card">
          <div className="pd-card-h">
            <span className="pd-ico"><Building2 size={18} aria-hidden="true" /></span>
            <div>
              <h2>IPCR submission by department</h2>
              <p className="pd-desc">Rated IPCRs over active employees · lowest rate first</p>
            </div>
            <button type="button" className="pd-link" onClick={onOpenSummary}>Summary of Ratings ›</button>
          </div>
          {loading ? (
            <p className="pd-empty">Loading submissions…</p>
          ) : submission.rows.length === 0 ? (
            <p className="pd-empty">No offices with active employees yet.</p>
          ) : (
            <div className="pd-tbl">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Department</th>
                    <th scope="col" className="pd-bar-col">Submission rate</th>
                    <th scope="col" className="n">Submitted</th>
                    <th scope="col" className="n">Not submitted</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {submission.rows.map((r) => {
                    const rate = pct(r.completed, r.total);
                    return (
                      <tr key={r.department}>
                        <td className="pd-pri">{deptLabel(r.department)}</td>
                        <td>
                          <div className="pd-rate">
                            <div className="pd-track"><i style={{ width: `${rate}%` }} /></div>
                            <b>{rate}%</b>
                          </div>
                        </td>
                        <td className="n">{r.completed} / {r.total}</td>
                        <td className="n">{r.total - r.completed}</td>
                        <td>{dueBadge(r.overdue, r.dueSoon) ?? <span className="pd-muted">—</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="pd-card">
          <div className="pd-card-h">
            <span className="pd-ico"><BarChart3 size={18} aria-hidden="true" /></span>
            <div>
              <h2>IPCR results</h2>
              <p className="pd-desc">{results.rated} evaluated · {RATED_PERIOD_LABEL}</p>
            </div>
            <button type="button" className="pd-link" onClick={onOpenSummary}>Full report ›</button>
          </div>

          {loading ? (
            <p className="pd-empty">Loading ratings…</p>
          ) : results.rated === 0 ? (
            <p className="pd-empty">No IPCR ratings yet. Results appear here once offices finish rating.</p>
          ) : (
            <>
              <div className="pd-metrics">
                <div className="pd-m">
                  <span className="l">Office average</span>
                  <span className="v">{results.average!.toFixed(2)}<small>{getAdjectival(results.average).label}</small></span>
                </div>
                <div className="pd-m">
                  <span className="l">Outstanding</span>
                  <span className="v">{results.distribution.Outstanding}<small>{pct(results.distribution.Outstanding, results.rated)}%</small></span>
                </div>
                <div className="pd-m">
                  <span className="l">Very Satisfactory or higher</span>
                  <span className="v">{pct(vsOrHigher, results.rated)}<small>%</small></span>
                  <span className="f">{vsOrHigher} of {results.rated}</span>
                </div>
                <div className="pd-m">
                  <span className="l">Rated U or P</span>
                  <span className="v">{lowCount}<small>{pct(lowCount, results.rated)}%</small></span>
                  {lowCount > 0 && <span className="f risk">Needs intervention</span>}
                </div>
              </div>

              <div className="pd-split">
                <div className="pd-col">
                  <span className="pd-overline">Rating distribution · whole office</span>
                  <RatingStack distribution={results.distribution} total={results.rated} label={describeMix(results.distribution)} large />
                  <div className="pd-legend">
                    {RATINGS.map((r) => (
                      <span key={r} style={{ ['--c' as string]: RATING_COLOR[r] }}>{r} <b>{results.distribution[r]}</b></span>
                    ))}
                  </div>

                  <span className="pd-overline pd-overline-gap">By department · highest average first</span>
                  <div className="pd-tbl">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col">Department</th>
                          <th scope="col" className="pd-bar-col">Rating mix</th>
                          <th scope="col" className="n">Average</th>
                          <th scope="col">Rating</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.depts.map((d) => {
                          const label = getAdjectival(d.average).label as Rating;
                          return (
                            <tr key={d.department}>
                              <td className="pd-pri">{deptLabel(d.department)}<span className="pd-meta">{d.rated} rated</span></td>
                              <td><RatingStack distribution={d.distribution} total={d.rated} label={describeMix(d.distribution)} /></td>
                              <td className="n pd-pri">{d.average.toFixed(2)}</td>
                              <td><span className={`pd-pill ${RATING_PILL[label]}`}>{label}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {results.inflation && (
                    <p className="pd-callout">
                      {deptLabel(results.inflation.department)} rated {Math.round(results.inflation.share * 100)}% of its rated staff Outstanding,
                      against {Math.round(results.inflation.officeShare * 100)}% office-wide. Check whether its success indicators were set at the right level.
                    </p>
                  )}
                </div>

                <div className="pd-col">
                  <div className="pd-overline pd-overline-row">
                    <span>Needs intervention</span>
                    {lowCount > 0 && <span className="pd-pill pd-p-risk">{lowCount} {lowCount === 1 ? 'employee' : 'employees'}</span>}
                  </div>
                  {results.low.length === 0 ? (
                    <p className="pd-empty">No employees rated Unsatisfactory or Poor.</p>
                  ) : (
                    <>
                      <ul className="pd-people">
                        {results.low.slice(0, MAX_INTERVENTION_ROWS).map((r) => {
                          const label = getAdjectival(r.numericalRating).label as Rating;
                          return (
                            <li key={r.id}>
                              <span className="pd-avatar" aria-hidden="true">{initials(r.name)}</span>
                              <div className="pd-person">
                                <span className="pd-pri" title={r.name}>{r.name}</span>
                                <span className="pd-meta" title={`${r.position} · ${deptLabel(r.department)}`}>{r.position} · {deptLabel(r.department)}</span>
                              </div>
                              <span className={`pd-pill ${RATING_PILL[label]}`}>{label} · {(r.numericalRating as number).toFixed(2)}</span>
                            </li>
                          );
                        })}
                      </ul>
                      <button type="button" className="pd-link pd-viewall" onClick={onOpenSummary}>View all ({results.low.length}) ›</button>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
};
