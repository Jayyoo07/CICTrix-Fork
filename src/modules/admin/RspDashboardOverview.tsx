import { useCallback, useEffect, useMemo, useState } from 'react';
import { Briefcase, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, GitBranch, Search, UserPlus } from 'lucide-react';
import { Modal } from '../../components/modal';
import { useBackClosesView } from '../../hooks/useHistoryBack';
import { fetchNewlyHiredStats, type NewlyHiredStats } from '../../lib/api/newlyHiredStats';
import {
  getSuccessionDashboardOverview,
  type SuccessionOverview,
  type SuccessionOverviewPosition,
} from '../../lib/api/succession';
import '../../styles/rsp-dashboard.css';
import '../../styles/dashboard-scale.css';

// RSP dashboard overview, built to docs/mockups/2026-10-15-rsp-dashboard-kpis.html.
// Pure presentation over data RSPDashboard already loads, apart from two fetches
// of its own: the succession overview and the newly-hired counts.

export type OverviewFunnelStage = 'pending' | 'reviewed' | 'shortlisted' | 'qualified' | 'hired' | 'notQualified' | 'hiredElsewhere';

export interface OverviewJob {
  id: number | string;
  title: string;
  department: string;
  status: 'Open' | 'Reviewing' | 'Closed';
  created_at: string;
  applicationDeadline?: string;
}

export interface OverviewApplicant {
  id: string;
  full_name: string;
  position: string;
  office: string;
  status: string;
  created_at: string;
  exam_date?: string | null;
  exam_time?: string | null;
  oral_exam_date?: string | null;
  oral_exam_time?: string | null;
  interview_date?: string | null;
  interview_time?: string | null;
  venue?: string | null;
}

interface Props {
  jobs: OverviewJob[];
  applicants: OverviewApplicant[];
  evaluatedApplicantIds: Set<string>;
  stageOf: (status: string) => OverviewFunnelStage;
  onOpenJobs: () => void;
  onOpenApplicants: () => void;
  onOpenQualified: () => void;
  onOpenSuccession: () => void;
  /** Opens one key position on the Succession Planning page. `replace` when leaving from the list modal. */
  onOpenSuccessionPosition: (departmentId: string, positionId: string, opts?: { replace?: boolean }) => void;
  onOpenNewHired: () => void;
}

type Period = 'month' | 'quarter' | 'year';
type SessionType = 'exam' | 'interview';

interface Session {
  key: string;
  type: SessionType;
  label: string;
  date: Date;
  time: string | null;
  position: string;
  venue: string | null;
  applicantIds: string[];
  scoresMissing: boolean;
}

const DAY_MS = 86400000;
const CLOSING_SOON_DAYS = 7;
const VACANCY_STALE_DAYS = 90;
const VACANCY_AGING_DAYS = 30;
const UPCOMING_WEEK_DAYS = 7;
const UPCOMING_MONTH_DAYS = 30;
const RECENT_HELD_DAYS = 14;
const MAX_DEPARTMENT_ROWS = 5;
const MAX_SUCCESSION_ROWS = 5;
// The View all modal paginates like the Interviewer list modal (DESIGN_IDENTITY §9.7.1).
const SUCCESSION_MODAL_PAGE_SIZE = 8;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => a.getTime() === b.getTime();
const daysBetween = (from: Date, to: Date) => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);
const norm = (s: string | null | undefined) => String(s ?? '').trim().toLowerCase();

/** "2026-10-15" (or an ISO timestamp) as a local calendar day; null when unparseable. */
const parseDay = (raw: string | null | undefined): Date | null => {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : startOfDay(d);
};

const formatTime = (raw: string | null) => {
  if (!raw) return 'TBA';
  const m = /^(\d{1,2}):(\d{2})/.exec(raw);
  if (!m) return raw;
  const h = Number(m[1]);
  return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
};

const formatDay = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
const formatMonthYear = (raw: string | null) => {
  const d = parseDay(raw);
  return d ? d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';
};

const periodStart = (period: Period, today: Date) => {
  if (period === 'month') return new Date(today.getFullYear(), today.getMonth(), 1);
  if (period === 'quarter') return new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
  return new Date(today.getFullYear(), 0, 1);
};

const PERIOD_LABEL: Record<Period, string> = { month: 'this month', quarter: 'this quarter', year: 'this year' };

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

// ── Succession rows (dashboard card and View all modal) ─────────────────────
// Successors are the ranked pool the Succession Planning page shows for each
// position (docs/plans/2026-10-25-rsp-dashboard-succession.md).

type SuccessionRow = SuccessionOverviewPosition;

function SuccessionTable({ rows, onOpen }: { rows: SuccessionRow[]; onOpen: (row: SuccessionRow) => void }) {
  return (
    <table className="rd-table">
      <thead>
        <tr>
          <th>Key position</th><th>Incumbent leaves</th><th className="n">Successors</th>
          <th><span className="sr-only">Open</span></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => {
          const canOpen = p.departmentId !== null;
          const open = () => canOpen && onOpen(p);
          return (
            <tr
              key={p.id}
              className={canOpen ? 'rd-row-link' : undefined}
              role={canOpen ? 'link' : undefined}
              tabIndex={canOpen ? 0 : undefined}
              aria-label={canOpen ? `Open ${p.title} on the Succession Planning page` : undefined}
              onClick={open}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  open();
                }
              }}
            >
              <td><span className="rd-pri">{p.title}</span><span className="rd-meta">{p.departmentName}</span></td>
              <td>{formatMonthYear(p.incumbentLeavingDate)}</td>
              <td className="n" title={p.successorCount === null ? 'Successors could not be loaded' : undefined}>
                {p.successorCount ?? '—'}
              </td>
              <td className="rd-chev">{canOpen && <ChevronRight size={16} aria-hidden="true" />}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** Page numbers for §9.6: all of them up to 7, else first, last and current ±1 with gaps. */
const pageList = (current: number, total: number): (number | 'gap')[] => {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const keep = new Set([1, total, current - 1, current, current + 1]);
  const out: (number | 'gap')[] = [];
  for (let n = 1; n <= total; n += 1) {
    if (keep.has(n)) out.push(n);
    else if (out[out.length - 1] !== 'gap') out.push('gap');
  }
  return out;
};

function SuccessionListModal({
  open,
  onClose,
  rows,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  rows: SuccessionRow[];
  onOpen: (row: SuccessionRow) => void;
}) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  useBackClosesView(open, onClose, 'succession-list');

  const filtered = useMemo(() => {
    const q = norm(query);
    return rows.filter((p) => !q || norm(p.title).includes(q) || norm(p.departmentName).includes(q));
  }, [rows, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / SUCCESSION_MODAL_PAGE_SIZE));
  const current = Math.min(page, pages);
  const first = (current - 1) * SUCCESSION_MODAL_PAGE_SIZE;
  const visible = filtered.slice(first, first + SUCCESSION_MODAL_PAGE_SIZE);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Key positions"
      subtitle={`${rows.length} key position${rows.length === 1 ? '' : 's'}, fewest successors first`}
    >
      <div className="rspdash rd-modal">
        <div className="rd-toolbar">
          <label className="rd-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search key positions</span>
            <input
              type="search"
              value={query}
              placeholder="Search position or office"
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        {visible.length === 0 ? (
          <p className="rd-empty">No key positions match your search.</p>
        ) : (
          <SuccessionTable rows={visible} onOpen={onOpen} />
        )}
        <div className="rd-pager">
          <span>
            {filtered.length === 0
              ? 'Showing 0 entries'
              : `Showing ${first + 1}–${first + visible.length} of ${filtered.length} entries`}
          </span>
          {pages > 1 && (
            <nav aria-label="Pagination">
              <button type="button" disabled={current === 1} onClick={() => setPage(current - 1)}>
                <ChevronLeft size={16} aria-hidden="true" /> Previous
              </button>
              {pageList(current, pages).map((n, i) =>
                n === 'gap' ? (
                  <span key={`gap-${i}`} className="rd-gap">…</span>
                ) : (
                  <button
                    key={n}
                    type="button"
                    className={`rd-pg ${n === current ? 'on' : ''}`}
                    aria-current={n === current ? 'page' : undefined}
                    onClick={() => setPage(n)}
                  >
                    {n}
                  </button>
                ),
              )}
              <button type="button" disabled={current === pages} onClick={() => setPage(current + 1)}>
                Next <ChevronRight size={16} aria-hidden="true" />
              </button>
            </nav>
          )}
        </div>
      </div>
    </Modal>
  );
}

export function RspDashboardOverview({
  jobs,
  applicants,
  evaluatedApplicantIds,
  stageOf,
  onOpenJobs,
  onOpenApplicants,
  onOpenQualified,
  onOpenSuccession,
  onOpenSuccessionPosition,
  onOpenNewHired,
}: Props) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [period, setPeriod] = useState<Period>('quarter');
  const [department, setDepartment] = useState('all');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [sessionRange, setSessionRange] = useState<'week' | 'month'>('week');
  const [succession, setSuccession] = useState<SuccessionOverview | null>(null);
  const [successionError, setSuccessionError] = useState<string | null>(null);
  const [successionListOpen, setSuccessionListOpen] = useState(false);
  const [newlyHired, setNewlyHired] = useState<NewlyHiredStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchNewlyHiredStats().then((stats) => {
      if (!cancelled) setNewlyHired(stats);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getSuccessionDashboardOverview().then((res) => {
      if (cancelled) return;
      if ('data' in res) setSuccession(res.data);
      else setSuccessionError('error' in res ? res.error : 'Unknown error');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const departments = useMemo(() => {
    const names = new Set<string>();
    jobs.forEach((j) => j.department?.trim() && names.add(j.department.trim()));
    applicants.forEach((a) => a.office?.trim() && a.office.trim() !== 'Unassigned' && names.add(a.office.trim()));
    succession?.positions.forEach((p) => p.departmentName !== 'Unassigned' && names.add(p.departmentName));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [jobs, applicants, succession]);

  const inDept = useCallback(
    (name: string | null | undefined) => department === 'all' || norm(name) === norm(department),
    [department],
  );
  const start = useMemo(() => periodStart(period, today), [period, today]);

  // ── Job postings ──────────────────────────────────────────────────────────
  const postings = useMemo(() => {
    const scoped = jobs.filter((j) => inDept(j.department));
    const open = scoped.filter((j) => j.status === 'Open');
    const ageOf = (j: OverviewJob) => {
      const posted = parseDay(j.created_at);
      return posted ? daysBetween(posted, today) : 0;
    };
    const closingSoon = open.filter((j) => {
      const deadline = parseDay(j.applicationDeadline);
      if (!deadline) return false;
      const days = daysBetween(today, deadline);
      return days >= 0 && days <= CLOSING_SOON_DAYS;
    }).length;
    const stale = open.filter((j) => ageOf(j) >= VACANCY_STALE_DAYS).length;
    const underReview = scoped.filter((j) => j.status === 'Reviewing').length;

    const byDept = new Map<string, { fresh: number; aging: number; stale: number }>();
    open.forEach((j) => {
      const key = j.department?.trim() || 'Unassigned';
      const row = byDept.get(key) ?? { fresh: 0, aging: 0, stale: 0 };
      const age = ageOf(j);
      if (age >= VACANCY_STALE_DAYS) row.stale += 1;
      else if (age >= VACANCY_AGING_DAYS) row.aging += 1;
      else row.fresh += 1;
      byDept.set(key, row);
    });
    const rows = [...byDept.entries()]
      .map(([name, r]) => ({ name, ...r, total: r.fresh + r.aging + r.stale }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    return { open: open.length, closingSoon, stale, underReview, rows };
  }, [jobs, inDept, today]);

  // ── Applicants ────────────────────────────────────────────────────────────
  const applicantStats = useMemo(() => {
    const scoped = applicants.filter((a) => {
      if (!inDept(a.office)) return false;
      const created = parseDay(a.created_at);
      return !created || created >= start;
    });
    const stages = scoped.map((a) => ({ a, stage: stageOf(a.status) }));
    const pending = stages.filter((s) => s.stage === 'pending');
    const oldestWait = pending.reduce((max, { a }) => {
      const created = parseDay(a.created_at);
      return created ? Math.max(max, daysBetween(created, today)) : max;
    }, 0);
    const reachedShortlisted = stages.filter((s) => ['shortlisted', 'qualified', 'hired'].includes(s.stage)).length;
    const reachedQualified = stages.filter((s) => ['qualified', 'hired'].includes(s.stage)).length;
    const hired = stages.filter((s) => s.stage === 'hired').length;
    const closedOut = stages.filter((s) => s.stage === 'notQualified').length;
    // Withdrawn by a hire on another plantilla: not a rejection, so kept apart.
    const hiredElsewhere = stages.filter((s) => s.stage === 'hiredElsewhere').length;
    const screened = scoped.length - pending.length;
    return {
      total: scoped.length,
      pending: pending.length,
      oldestWait,
      screened,
      qualifiedRate: screened > 0 ? pct(reachedQualified, screened) : null,
      // Each row opens the list behind it (docs/plans/2026-10-23-applicant-kpi-links-and-applicants-tabs.md).
      funnel: [
        { label: 'Received', value: scoped.length, tone: 'accent', open: onOpenApplicants },
        { label: 'Shortlisted', value: reachedShortlisted, tone: 'accent', open: onOpenApplicants },
        { label: 'Qualified', value: reachedQualified, tone: 'accent', open: onOpenQualified },
        { label: 'Hired', value: hired, tone: 'ok', open: onOpenNewHired },
      ],
      closedOut,
      hiredElsewhere,
    };
  }, [applicants, inDept, start, stageOf, today, onOpenApplicants, onOpenQualified, onOpenNewHired]);

  const perVacancy = postings.open > 0 ? (applicantStats.total / postings.open).toFixed(1) : '—';

  // ── Exams & interviews ────────────────────────────────────────────────────
  const sessions = useMemo(() => {
    const byKey = new Map<string, Session>();
    const add = (a: OverviewApplicant, type: SessionType, label: string, rawDate?: string | null, rawTime?: string | null) => {
      const date = parseDay(rawDate);
      if (!date) return;
      const time = rawTime ?? null;
      const position = a.position || 'Unspecified position';
      const key = `${type}|${label}|${date.getTime()}|${time ?? ''}|${norm(position)}`;
      const existing = byKey.get(key);
      const missing = type === 'interview' && date < today && !evaluatedApplicantIds.has(a.id);
      if (existing) {
        existing.applicantIds.push(a.id);
        existing.scoresMissing ||= missing;
        existing.venue ??= a.venue ?? null;
      } else {
        byKey.set(key, { key, type, label, date, time, position, venue: a.venue ?? null, applicantIds: [a.id], scoresMissing: missing });
      }
    };
    applicants
      .filter((a) => inDept(a.office))
      .forEach((a) => {
        add(a, 'exam', 'Written exam', a.exam_date, a.exam_time);
        add(a, 'exam', 'Oral exam', a.oral_exam_date, a.oral_exam_time);
        add(a, 'interview', 'Interview', a.interview_date, a.interview_time);
      });
    return [...byKey.values()].sort(
      (x, y) => x.date.getTime() - y.date.getTime() || String(x.time ?? '').localeCompare(String(y.time ?? '')),
    );
  }, [applicants, inDept, evaluatedApplicantIds, today]);

  const assessmentStats = useMemo(() => {
    const weekEnd = new Date(today.getTime() + UPCOMING_WEEK_DAYS * DAY_MS);
    const thisWeek = sessions.filter((s) => s.date >= today && s.date < weekEnd);
    const resultsMissing = new Set<string>();
    applicants.forEach((a) => {
      const d = parseDay(a.interview_date);
      if (d && d < today && inDept(a.office) && !evaluatedApplicantIds.has(a.id)) resultsMissing.add(a.id);
    });
    return {
      weekTotal: thisWeek.length,
      weekExams: thisWeek.filter((s) => s.type === 'exam').length,
      weekInterviews: thisWeek.filter((s) => s.type === 'interview').length,
      resultsMissing: resultsMissing.size,
      completed: sessions.filter((s) => s.date >= start && s.date < today).length,
    };
  }, [sessions, applicants, inDept, evaluatedApplicantIds, today, start]);

  const listedSessions = useMemo(() => {
    if (selectedDay) return sessions.filter((s) => sameDay(s.date, selectedDay));
    const horizon = new Date(today.getTime() + (sessionRange === 'week' ? UPCOMING_WEEK_DAYS : UPCOMING_MONTH_DAYS) * DAY_MS);
    const heldFrom = new Date(today.getTime() - RECENT_HELD_DAYS * DAY_MS);
    return sessions.filter((s) => (s.date >= today && s.date < horizon) || (s.scoresMissing && s.date >= heldFrom));
  }, [sessions, selectedDay, sessionRange, today]);

  const sessionGroups = useMemo(() => {
    const groups = new Map<number, Session[]>();
    // Upcoming first, then held sessions that still need scores.
    const ordered = [
      ...listedSessions.filter((s) => s.date >= today),
      ...listedSessions.filter((s) => s.date < today).reverse(),
    ];
    ordered.forEach((s) => {
      const list = groups.get(s.date.getTime()) ?? [];
      list.push(s);
      groups.set(s.date.getTime(), list);
    });
    return [...groups.entries()];
  }, [listedSessions, today]);

  const calendarCells = useMemo(() => {
    const first = calendarMonth;
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const weekStart = new Date(today.getTime() - today.getDay() * DAY_MS);
    const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);
    const cells: ({ date: Date; types: SessionType[]; inWeek: boolean } | null)[] = Array(first.getDay()).fill(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(first.getFullYear(), first.getMonth(), day);
      const types = sessions.filter((s) => sameDay(s.date, date)).map((s) => s.type);
      cells.push({ date, types, inWeek: date >= weekStart && date < weekEnd });
    }
    return cells;
  }, [calendarMonth, sessions, today]);

  // ── Succession ────────────────────────────────────────────────────────────
  // Fewest successors first (a failed count sorts last), then the incumbent
  // leaving soonest, so the positions most exposed lead the table.
  const successionRows = useMemo(() => {
    if (!succession) return null;
    return succession.positions
      .filter((p) => inDept(p.departmentName))
      .sort((a, b) => {
        const ac = a.successorCount ?? Infinity;
        const bc = b.successorCount ?? Infinity;
        if (ac !== bc) return ac - bc;
        const ad = parseDay(a.incumbentLeavingDate)?.getTime() ?? Infinity;
        const bd = parseDay(b.incumbentLeavingDate)?.getTime() ?? Infinity;
        return ad - bd || a.title.localeCompare(b.title);
      });
  }, [succession, inDept]);

  const monthLabel = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const shiftMonth = (delta: number) =>
    setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));

  return (
    <div className="rspdash">
      <section className="rd-hero">
        <div>
          {/* Not an <h1>: admin.css forces .admin-content h1 to brand blue with !important. */}
          <div className="rd-hero-title" role="heading" aria-level={1}>RSP Dashboard</div>
          <p className="rd-hero-sub">Recruitment, selection and placement for the current hiring cycle</p>
        </div>
        <div className="rd-filters">
          <div className="rd-seg" role="group" aria-label="Period">
            {(['month', 'quarter', 'year'] as Period[]).map((p) => (
              <button key={p} type="button" className={period === p ? 'on' : ''} aria-pressed={period === p} onClick={() => setPeriod(p)}>
                {p[0].toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <label className="rd-select">
            <span className="sr-only">Department</span>
            <select
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              // rsp-design.css colors every .rsp-ds select dark with very high specificity.
              style={{ color: '#fff' }}
            >
              <option value="all">All departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
          <span className="rd-asof">As of {today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
      </section>

      <div className="rd-main">
        {/* 1. Recruitment */}
        <section className="rd-sec">
          <div className="rd-sec-h">
            <span className="rd-ico"><Briefcase size={16} aria-hidden="true" /></span>
            <h2>Recruitment</h2>
            <span className="rd-desc">Job postings and applicants</span>
            <button type="button" className="rd-link" onClick={onOpenJobs}>Manage job postings ›</button>
          </div>
          <div className="rd-two">
            <div className="rd-card">
              <div className="rd-h"><h3>Job postings</h3><button type="button" className="rd-link" onClick={onOpenJobs}>All positions ›</button></div>
              <div className="rd-stats rd-s4">
                <div className="rd-stat"><span className="l">Open</span><span className="v">{postings.open}</span></div>
                <div className={`rd-stat ${postings.closingSoon ? 'warn' : ''}`}><span className="l">Closing ≤ 7d</span><span className="v">{postings.closingSoon}</span></div>
                <div className={`rd-stat ${postings.stale ? 'risk' : ''}`}><span className="l">Vacant 90d+</span><span className="v">{postings.stale}</span></div>
                <div className="rd-stat"><span className="l">Under review</span><span className="v">{postings.underReview}</span></div>
              </div>
              <div className="rd-h rd-h-sm">
                <span className="rd-subtitle">Vacancies by department</span>
                <div className="rd-legend">
                  <span style={{ ['--c' as string]: 'var(--rd-tint)' }}>&lt;30d</span>
                  <span style={{ ['--c' as string]: 'var(--rd-warn)' }}>30–90d</span>
                  <span style={{ ['--c' as string]: 'var(--rd-risk)' }}>90d+</span>
                </div>
              </div>
              {postings.rows.length === 0 ? (
                <p className="rd-empty">No open vacancies.</p>
              ) : (
                <table className="rd-table">
                  <tbody>
                    {postings.rows.slice(0, MAX_DEPARTMENT_ROWS).map((r) => (
                      <tr key={r.name}>
                        <td>{r.name}</td>
                        <td className="rd-bar-cell">
                          <div className="rd-bar" aria-label={`${r.fresh} under 30 days, ${r.aging} 30 to 90 days, ${r.stale} over 90 days`}>
                            <i style={{ width: `${pct(r.fresh, r.total)}%`, background: 'var(--rd-tint)' }} />
                            <i style={{ width: `${pct(r.aging, r.total)}%`, background: 'var(--rd-warn)' }} />
                            <i style={{ width: `${pct(r.stale, r.total)}%`, background: 'var(--rd-risk)' }} />
                          </div>
                        </td>
                        <td className="n">{r.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="rd-card">
              <div className="rd-h"><h3>Applicants</h3><button type="button" className="rd-link" onClick={onOpenApplicants}>All applicants ›</button></div>
              <div className="rd-stats rd-s4">
                <button type="button" className="rd-stat rd-stat-link" onClick={onOpenApplicants}>
                  <span className="l">This {period}</span><span className="v">{applicantStats.total}</span>
                </button>
                <button type="button" className={`rd-stat rd-stat-link ${applicantStats.pending ? 'warn' : ''}`} onClick={onOpenApplicants}>
                  <span className="l">Unscreened</span>
                  <span className="v">{applicantStats.pending}{applicantStats.pending > 0 && <small> oldest {applicantStats.oldestWait}d</small>}</span>
                </button>
                <button type="button" className="rd-stat rd-stat-link" onClick={onOpenJobs}>
                  <span className="l">Per vacancy</span><span className="v">{perVacancy}</span>
                </button>
                <button type="button" className="rd-stat rd-stat-link" onClick={onOpenQualified}>
                  <span className="l">Qualified</span><span className="v">{applicantStats.qualifiedRate ?? '—'}{applicantStats.qualifiedRate !== null && <small>%</small>}</span>
                </button>
              </div>
              <span className="rd-subtitle rd-block">Application funnel · {PERIOD_LABEL[period]}</span>
              {applicantStats.funnel.map((f) => (
                <button key={f.label} type="button" className="rd-fun rd-fun-link" onClick={f.open}>
                  <span>{f.label}</span>
                  <span className="rd-bar"><i style={{ width: `${pct(f.value, applicantStats.total)}%`, background: f.tone === 'ok' ? 'var(--rd-ok)' : 'var(--rd-accent)' }} /></span>
                  <b>{f.value}</b>
                </button>
              ))}
              {applicantStats.screened > 0 && (
                <p className="rd-conv">
                  {applicantStats.closedOut} of {applicantStats.screened} screened applicants ({pct(applicantStats.closedOut, applicantStats.screened)}%) were closed out as not qualified or withdrawn.
                  {applicantStats.hiredElsewhere > 0 &&
                    ` ${applicantStats.hiredElsewhere} more ${applicantStats.hiredElsewhere === 1 ? 'was' : 'were'} withdrawn after being hired for another plantilla.`}
                </p>
              )}
            </div>
          </div>
        </section>

        {/* 2. Exams & interviews */}
        <section className="rd-sec">
          <div className="rd-sec-h">
            <span className="rd-ico"><CalendarDays size={16} aria-hidden="true" /></span>
            <h2>Exams &amp; interviews</h2>
            <span className="rd-desc">Schedules and assessment results</span>
            <button type="button" className="rd-link" onClick={onOpenQualified}>Schedule applicants ›</button>
          </div>
          <div className="rd-stats rd-s4 rd-stats-card">
            <div className="rd-stat"><span className="l">Sessions this week</span><span className="v">{assessmentStats.weekTotal} <small>{assessmentStats.weekExams} exams · {assessmentStats.weekInterviews} interviews</small></span></div>
            <div className={`rd-stat ${assessmentStats.resultsMissing ? 'warn' : ''}`}><span className="l">Interview scores not encoded</span><span className="v">{assessmentStats.resultsMissing}</span></div>
            <div className="rd-stat"><span className="l">Held {PERIOD_LABEL[period]}</span><span className="v">{assessmentStats.completed}</span></div>
            <div className="rd-stat"><span className="l">Upcoming (30 days)</span><span className="v">{sessions.filter((s) => s.date >= today && daysBetween(today, s.date) < UPCOMING_MONTH_DAYS).length}</span></div>
          </div>
          <div className="rd-cal-wrap">
            <div className="rd-card rd-cal-card">
              <div className="rd-cal-h">
                <b>{monthLabel}</b>
                <button
                  type="button"
                  className="rd-pill rd-p-acc rd-today"
                  onClick={() => {
                    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1));
                    setSelectedDay(null);
                  }}
                >
                  Today
                </button>
                <div className="rd-nav">
                  <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft size={14} /></button>
                  <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}><ChevronRight size={14} /></button>
                </div>
              </div>
              <div className="rd-cal">
                {WEEKDAYS.map((d) => <span key={d} className="rd-dow">{d}</span>)}
                {calendarCells.map((cell, i) =>
                  cell === null ? (
                    <span key={`blank-${i}`} className="rd-day out" aria-hidden="true" />
                  ) : (
                    <button
                      key={cell.date.getTime()}
                      type="button"
                      className={[
                        'rd-day',
                        cell.inWeek ? 'wk' : '',
                        sameDay(cell.date, today) ? 'today' : '',
                        selectedDay && sameDay(cell.date, selectedDay) ? 'sel' : '',
                      ].join(' ')}
                      aria-pressed={!!selectedDay && sameDay(cell.date, selectedDay)}
                      aria-label={`${formatDay(cell.date)}, ${cell.types.length} session${cell.types.length === 1 ? '' : 's'}`}
                      onClick={() => setSelectedDay((cur) => (cur && sameDay(cur, cell.date) ? null : cell.date))}
                    >
                      <span>{cell.date.getDate()}</span>
                      <span className="rd-dots">
                        {cell.types.slice(0, 4).map((t, k) => <i key={k} className={t === 'exam' ? 'e' : 'iv'} />)}
                      </span>
                    </button>
                  ),
                )}
              </div>
              <div className="rd-legend rd-legend-cal">
                <span style={{ ['--c' as string]: 'var(--rd-accent)' }}>Exam</span>
                <span style={{ ['--c' as string]: 'var(--rd-series2)' }}>Interview</span>
              </div>
            </div>

            <div className="rd-card">
              <div className="rd-evh">
                <h3>{selectedDay ? `Sessions on ${formatDay(selectedDay)}` : 'Upcoming sessions'}</h3>
                {selectedDay ? (
                  <button type="button" className="rd-link" onClick={() => setSelectedDay(null)}>Show upcoming ›</button>
                ) : (
                  <div className="rd-seg-light" role="group" aria-label="Range">
                    <button type="button" className={sessionRange === 'week' ? 'on' : ''} onClick={() => setSessionRange('week')}>This week</button>
                    <button type="button" className={sessionRange === 'month' ? 'on' : ''} onClick={() => setSessionRange('month')}>Next 30 days</button>
                  </div>
                )}
              </div>
              {sessionGroups.length === 0 && (
                <p className="rd-empty">
                  {selectedDay ? 'No sessions on this day.' : 'No exams or interviews scheduled. Schedule applicants from Qualified Applicants.'}
                </p>
              )}
              {sessionGroups.map(([time, list]) => {
                const date = new Date(time);
                const held = date < today;
                return (
                  <div key={time}>
                    <div className="rd-dlabel">
                      <span>{sameDay(date, today) ? `Today · ${formatDay(date)}` : formatDay(date)}{held ? ' · held' : ''}</span>
                      <span>{held ? 'scores due' : `${list.length} session${list.length === 1 ? '' : 's'}`}</span>
                    </div>
                    {list.map((s) => (
                      <div key={s.key} className={`rd-ev ${held ? 'done' : ''}`} style={{ ['--c' as string]: s.type === 'exam' ? 'var(--rd-accent)' : 'var(--rd-series2)' }}>
                        <span className="tm">{formatTime(s.time)}</span>
                        <div>
                          <div className="ttl">{s.label} · {s.position}</div>
                          <div className="meta">{s.applicantIds.length} applicant{s.applicantIds.length === 1 ? '' : 's'}{s.venue ? ` · ${s.venue}` : ''}{s.scoresMissing ? ' · scores not encoded' : ''}</div>
                        </div>
                        {s.scoresMissing ? (
                          <span className="rd-pill rd-p-warn">Scores missing</span>
                        ) : (
                          <span className={`rd-pill ${s.type === 'exam' ? 'rd-p-acc' : 'rd-p-n'}`}>{s.type === 'exam' ? 'Exam' : 'Interview'}</span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 3. Newly hired — moved off the Newly Hired page, which now opens
            straight into its department tables. */}
        <section className="rd-sec">
          <div className="rd-sec-h">
            <span className="rd-ico"><UserPlus size={16} aria-hidden="true" /></span>
            <h2>Newly hired</h2>
            <span className="rd-desc">Employee accounts for hired applicants</span>
            <button type="button" className="rd-link" onClick={onOpenNewHired}>Generate accounts ›</button>
          </div>
          <div className="rd-stats rd-s3 rd-stats-card">
            <div className="rd-stat">
              <span className="l">Total newly hired</span>
              <span className="v">{newlyHired ? newlyHired.total : '—'}</span>
            </div>
            <div className="rd-stat">
              <span className="l">With credentials</span>
              <span className="v">{newlyHired ? newlyHired.withCredentials : '—'}</span>
            </div>
            <div className={`rd-stat ${newlyHired?.pendingCredentials ? 'warn' : ''}`}>
              <span className="l">Pending credentials</span>
              <span className="v">{newlyHired ? newlyHired.pendingCredentials : '—'}</span>
            </div>
          </div>
        </section>

        {/* 4. Succession */}
        <section className="rd-sec">
          <div className="rd-sec-h">
            <span className="rd-ico"><GitBranch size={16} aria-hidden="true" /></span>
            <h2>Succession planning</h2>
            <span className="rd-desc">Ranked successors for each key position</span>
            <button type="button" className="rd-link" onClick={onOpenSuccession}>Succession planning ›</button>
          </div>
          <div className="rd-card">
            <div className="rd-h"><h3>Key positions</h3><span className="rd-asof-dark">fewest successors first</span></div>
            {successionError && <p className="rd-empty">Succession data could not be loaded: {successionError}</p>}
            {!successionError && !successionRows && <p className="rd-empty">Ranking successors for each key position…</p>}
            {successionRows && successionRows.length === 0 && (
              <p className="rd-empty">No key positions have been identified yet.</p>
            )}
            {successionRows && successionRows.length > 0 && (
              <>
                <SuccessionTable
                  rows={successionRows.slice(0, MAX_SUCCESSION_ROWS)}
                  onOpen={(p) => p.departmentId && onOpenSuccessionPosition(p.departmentId, p.id)}
                />
                {successionRows.length > MAX_SUCCESSION_ROWS && (
                  <button
                    type="button"
                    className="rd-link rd-viewall"
                    aria-haspopup="dialog"
                    onClick={() => setSuccessionListOpen(true)}
                  >
                    View all ({successionRows.length}) →
                  </button>
                )}
              </>
            )}
          </div>
          {successionRows && (
            <SuccessionListModal
              open={successionListOpen}
              onClose={() => setSuccessionListOpen(false)}
              rows={successionRows}
              // The modal's own Back entry is replaced, so Back from the
              // Succession page lands on the dashboard, not a closed modal.
              onOpen={(p) => p.departmentId && onOpenSuccessionPosition(p.departmentId, p.id, { replace: true })}
            />
          )}
        </section>
      </div>
    </div>
  );
}
