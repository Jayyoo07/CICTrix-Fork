// Subtab 2 — "Qualified Applicants" within the RSP qualified page.
// Two sub-views:
//   "Pending Assignment" — qualified applicants that still need a schedule,
//                          picked from one filterable, paged table.
//   "Scheduled"         — applicants with a complete schedule, awaiting evaluation.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Pencil,
  Save,
  Search,
  UserCheck,
  X,
} from 'lucide-react';
import { SortButton, SortHeader, toTime, useTableSort } from './tableSort';
import {
  fetchActiveInterviewers,
  isApplicantFullyAssigned,
  saveApplicantAssignment,
  type ApplicantAssignmentFields,
  type InterviewerOption,
} from '../lib/applicantSchedule';
import type { ApplicantRecord } from './QualifiedApplicantsSection';
import { ScheduleApplicantsModal } from './ScheduleApplicantsModal';
import { SkeletonList, useDelayedLoading } from './table-loading';
import {
  formatDisplayDate,
  groupCheckState,
  isSchedulableApplicant,
  toggleGroup,
  toggleId,
  type CheckState,
} from '../lib/scheduleSelection';

interface PendingAssignmentListProps {
  applicants: ApplicantRecord[];
  completedEvaluationIds: Set<string>;
  /** True while the parent's first fetch is in flight; shows placeholders instead of the empty states. */
  loading?: boolean;
}

const isQualified = (a: ApplicantRecord, completedIds: Set<string>): boolean =>
  isSchedulableApplicant(a.status, completedIds.has(a.id));

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
};

const fmtTime = (t: string) => {
  if (!t) return '—';
  try {
    const [h, m] = t.split(':');
    const hour = parseInt(h, 10);
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const display = hour % 12 === 0 ? 12 : hour % 12;
    return `${display}:${m} ${suffix}`;
  } catch {
    return t;
  }
};

/** One-line schedule, e.g. "Sep 25, 2026 · 3:28 PM"; the time is dropped when absent. */
const fmtSchedule = (date: string, time: string) => {
  const d = fmtDate(date);
  return time ? `${d} · ${fmtTime(time)}` : d;
};

const normalizeType = (t: string | null | undefined) =>
  (t ?? '').toLowerCase().includes('promot') ? 'Promotional' : 'Original';

/**
 * When the applicant qualified. There is no qualified_at column, so the row's
 * last update stands in for it, falling back to the application date.
 */
const qualifiedTime = (a: ApplicantRecord) => {
  const updated = toTime(a.updated_at);
  return Number.isNaN(updated) ? toTime(a.created_at) : updated;
};

type ScheduledSortKey = 'qualified' | 'name' | 'position' | 'department' | 'exam' | 'interview' | 'interviewer';

/** No sort chosen yet → most recently qualified applicant first. */
const DEFAULT_QUALIFIED_SORT = { key: 'qualified', dir: 'desc' } as const;
const SCHEDULED_DESC_FIRST: readonly ScheduledSortKey[] = ['qualified'];

const SCHEDULED_TH = 'px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500';

type PendingSortKey = 'qualified' | 'name' | 'position' | 'department';

const PENDING_SORT_ACCESSORS: Record<PendingSortKey, (a: ApplicantRecord) => string | number> = {
  qualified:  qualifiedTime,
  name:       (a) => a.full_name,
  position:   (a) => a.position,
  department: (a) => a.office,
};
const PENDING_DESC_FIRST: readonly PendingSortKey[] = ['qualified'];

const PENDING_PAGE_SIZE = 10;
/** §9.6: past this many pages, show first, last and current ±1 with ellipses. */
const MAX_PLAIN_PAGES = 7;

/** Zero-based page indexes to show, with null standing for an ellipsis. */
const pageItems = (current: number, total: number): (number | null)[] => {
  if (total <= MAX_PLAIN_PAGES) return Array.from({ length: total }, (_, i) => i);
  const shown = [0, current - 1, current, current + 1, total - 1].filter((p) => p >= 0 && p < total);
  const unique = [...new Set(shown)].sort((a, b) => a - b);
  return unique.flatMap((p, i) => (i > 0 && p - unique[i - 1] > 1 ? [null, p] : [p]));
};

const CHECKBOX_CLASS = 'h-[18px] w-[18px] shrink-0 cursor-pointer accent-[var(--color-primary)]';

const TriStateCheckbox = ({ state, label, onChange }: { state: CheckState; label: string; onChange: () => void }) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'indeterminate';
  }, [state]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={state === 'checked'}
      onChange={onChange}
      className={CHECKBOX_CLASS}
    />
  );
};

/** "2026-10-07 09:30" sorts chronologically as text; blank when there is no date. */
const scheduleKey = (date: string | null | undefined, time: string | null | undefined) =>
  date ? `${date} ${time ?? ''}` : '';

export const PendingAssignmentList = ({ applicants, completedEvaluationIds, loading = false }: PendingAssignmentListProps) => {
  const showLoader = useDelayedLoading(loading);
  const awaitingData = loading || showLoader;

  // Rater Management used to be a third subtab here. It now lives only on the
  // sidebar's Rater Management page, which carries the same controls plus the
  // position assignments this panel never showed.
  const [subTab, setSubTab] = useState<'pending' | 'scheduled'>('pending');
  const [interviewers, setInterviewers] = useState<InterviewerOption[]>([]);
  const [overrides, setOverrides] = useState<Record<string, ApplicantAssignmentFields>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [toast, setToast] = useState('');

  // Edit-schedule modal state.
  const [editingApplicant, setEditingApplicant] = useState<ApplicantRecord | null>(null);
  const [editExamDate, setEditExamDate] = useState('');
  const [editExamTime, setEditExamTime] = useState('');
  const [editInterviewDate, setEditInterviewDate] = useState('');
  const [editInterviewTime, setEditInterviewTime] = useState('');
  const [editInterviewerEmail, setEditInterviewerEmail] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  useEffect(() => {
    void fetchActiveInterviewers().then(setInterviewers);

    const onRatersUpdated = () => {
      void fetchActiveInterviewers().then(setInterviewers);
    };
    window.addEventListener('cictrix:raters-updated', onRatersUpdated);
    return () => {
      window.removeEventListener('cictrix:raters-updated', onRatersUpdated);
    };
  }, []);

  const mergeAssignment = useCallback(
    (a: ApplicantRecord): ApplicantRecord => ({ ...a, ...(overrides[a.id] ?? {}) }),
    [overrides],
  );

  const pendingApplicants = useMemo(() => {
    return applicants
      .filter((a) => isQualified(a, completedEvaluationIds))
      .filter((a) => !isApplicantFullyAssigned(mergeAssignment(a)));
  }, [applicants, completedEvaluationIds, mergeAssignment]);

  const scheduledApplicants = useMemo(() => {
    return applicants
      .filter((a) => isQualified(a, completedEvaluationIds))
      .filter((a) => isApplicantFullyAssigned(mergeAssignment(a)));
  }, [applicants, completedEvaluationIds, mergeAssignment]);

  // Filters shared by the Pending and Scheduled tables.
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');

  const qualifiedApplicants = useMemo(
    () => applicants.filter((a) => isQualified(a, completedEvaluationIds)),
    [applicants, completedEvaluationIds],
  );
  const departments = useMemo(
    () => [...new Set(qualifiedApplicants.map((a) => a.office).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [qualifiedApplicants],
  );
  // Positions narrow to the chosen department so the two dropdowns never contradict.
  const positions = useMemo(
    () => [...new Set(
      qualifiedApplicants
        .filter((a) => departmentFilter === 'all' || a.office === departmentFilter)
        .map((a) => a.position)
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b)),
    [qualifiedApplicants, departmentFilter],
  );

  const matchesSearch = useCallback((a: ApplicantRecord) => {
    const term = search.trim().toLowerCase();
    if (!term) return true;
    return (
      a.full_name.toLowerCase().includes(term) ||
      a.email.toLowerCase().includes(term) ||
      a.position.toLowerCase().includes(term) ||
      a.office.toLowerCase().includes(term)
    );
  }, [search]);

  const matchesFilters = useCallback((a: ApplicantRecord) => {
    if (departmentFilter !== 'all' && a.office !== departmentFilter) return false;
    if (positionFilter !== 'all' && a.position !== positionFilter) return false;
    if (typeFilter !== 'all' && normalizeType(a.application_type) !== typeFilter) return false;
    return matchesSearch(a);
  }, [matchesSearch, departmentFilter, positionFilter, typeFilter]);

  const filtersActive = search.trim() !== '' || departmentFilter !== 'all' || positionFilter !== 'all' || typeFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setDepartmentFilter('all');
    setPositionFilter('all');
    setTypeFilter('all');
  };

  const filteredPending = useMemo(() => pendingApplicants.filter(matchesFilters), [pendingApplicants, matchesFilters]);
  const filteredScheduled = useMemo(() => scheduledApplicants.filter(matchesFilters), [scheduledApplicants, matchesFilters]);

  // Schedule values come from the merged record so a just-published schedule sorts correctly.
  const scheduledSortAccessors = useMemo<Record<ScheduledSortKey, (a: ApplicantRecord) => string | number>>(() => ({
    qualified:   qualifiedTime,
    name:        (a) => a.full_name,
    position:    (a) => a.position,
    department:  (a) => a.office,
    exam:        (a) => { const m = mergeAssignment(a); return scheduleKey(m.exam_date, m.exam_time); },
    interview:   (a) => { const m = mergeAssignment(a); return scheduleKey(m.interview_date, m.interview_time); },
    interviewer: (a) => {
      const email = mergeAssignment(a).assigned_interviewer_email ?? '';
      return interviewers.find((i) => i.email === email)?.name ?? email;
    },
  }), [mergeAssignment, interviewers]);

  const { sorted: sortedScheduled, sort: scheduledSort, toggle: toggleScheduledSort } =
    useTableSort<ApplicantRecord, ScheduledSortKey>(filteredScheduled, scheduledSortAccessors, DEFAULT_QUALIFIED_SORT, SCHEDULED_DESC_FIRST);

  const { sorted: sortedPending, sort: pendingSort, toggle: togglePendingSort } =
    useTableSort<ApplicantRecord, PendingSortKey>(filteredPending, PENDING_SORT_ACCESSORS, DEFAULT_QUALIFIED_SORT, PENDING_DESC_FIRST);

  const [pendingPage, setPendingPage] = useState(0);
  // A new filter or sort starts from the first page.
  useEffect(() => { setPendingPage(0); }, [search, departmentFilter, positionFilter, typeFilter, pendingSort]);
  const pendingPageCount = Math.max(1, Math.ceil(sortedPending.length / PENDING_PAGE_SIZE));
  const currentPendingPage = Math.min(pendingPage, pendingPageCount - 1);
  const pagedPending = sortedPending.slice(currentPendingPage * PENDING_PAGE_SIZE, (currentPendingPage + 1) * PENDING_PAGE_SIZE);
  // The header checkbox covers every row the filters match, on all pages.
  const filteredPendingIds = useMemo(() => filteredPending.map((a) => a.id), [filteredPending]);

  // Picks survive filters and paging so RSP can gather applicants across
  // departments; only ids that left the pending list (already assigned) drop.
  useEffect(() => {
    setSelectedIds((prev) => {
      const stillPending = new Set(pendingApplicants.map((a) => a.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (stillPending.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [pendingApplicants]);

  const openEditModal = (a: ApplicantRecord) => {
    const merged = mergeAssignment(a);
    setEditingApplicant(a);
    setEditExamDate(merged.exam_date ?? '');
    setEditExamTime(merged.exam_time ?? '');
    setEditInterviewDate(merged.interview_date ?? '');
    setEditInterviewTime(merged.interview_time ?? '');
    setEditInterviewerEmail(merged.assigned_interviewer_email ?? '');
    setEditError('');
  };

  const handleEditSave = async () => {
    if (!editingApplicant || editSaving) return;
    setEditError('');
    setEditSaving(true);
    const result = await saveApplicantAssignment(editingApplicant.id, {
      exam_date: editExamDate,
      exam_time: editExamTime,
      interview_date: editInterviewDate,
      interview_time: editInterviewTime,
      assigned_interviewer_email: editInterviewerEmail,
    });
    setEditSaving(false);
    if ('error' in result) {
      setEditError(result.error);
      return;
    }
    setOverrides((prev) => ({
      ...prev,
      [editingApplicant.id]: {
        exam_date: editExamDate,
        exam_time: editExamTime,
        interview_date: editInterviewDate,
        interview_time: editInterviewTime,
        assigned_interviewer_email: editInterviewerEmail,
      },
    }));
    setEditingApplicant(null);
  };

  const getInterviewerName = (email: string | null | undefined) => {
    if (!email) return '—';
    return interviewers.find((i) => i.email === email)?.name ?? email;
  };

  // Same filter card as Applications, shared by the Pending and Scheduled tables.
  const renderFilterBar = (shown: number, total: number, defaultOrder: boolean) => (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search name, email, position, or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm focus:border-[#363EE8] focus:outline-none"
          />
        </div>
        <select
          value={departmentFilter}
          onChange={(e) => { setDepartmentFilter(e.target.value); setPositionFilter('all'); }}
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-[#363EE8] focus:outline-none"
        >
          <option value="all">All Departments</option>
          {departments.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={positionFilter}
          onChange={(e) => setPositionFilter(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-[#363EE8] focus:outline-none"
        >
          <option value="all">All Positions</option>
          {positions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:border-[#363EE8] focus:outline-none"
        >
          <option value="all">All Types</option>
          <option value="Original">Original</option>
          <option value="Promotional">Promotional</option>
        </select>
      </div>
      <div className="mt-2.5 flex items-center justify-between border-t border-slate-100 pt-2.5 text-xs text-slate-500">
        <span>
          {filtersActive ? `${shown} of ${total}` : total} applicant{(filtersActive ? shown : total) === 1 ? '' : 's'}
          {defaultOrder && ' · most recently qualified first'}
        </span>
        {filtersActive && (
          <button type="button" className="text-[#363EE8] hover:underline" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>
    </div>
  );

  const noMatchRow = (colSpan: number) => (
    <tr>
      <td colSpan={colSpan} className="px-5 py-12 text-center text-slate-500">
        <Search className="mx-auto mb-2 h-8 w-8 text-slate-300" />
        <p className="font-medium">No applicants match the selected filters.</p>
      </td>
    </tr>
  );

  return (
    <div className="space-y-4">

      {/* Tabs on white pages (DESIGN_IDENTITY §9.2), the same row Job Posts
          uses, so a subtab looks the same wherever it appears. */}
      <div role="tablist" className="-mb-px flex gap-2 border-b border-slate-200">
        {([
          { id: 'pending', label: 'Pending Assignment', icon: Clock, count: pendingApplicants.length },
          { id: 'scheduled', label: 'Scheduled', icon: CalendarCheck, count: scheduledApplicants.length },
        ] as const).map((tab) => {
          const selected = subTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setSubTab(tab.id)}
              className={`inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${selected ? 'border-[#363EE8] text-[#363EE8]' : 'border-transparent text-slate-500 hover:text-[#040E6B]'}`}
            >
              <Icon size={16} />
              {tab.label}
              {tab.count > 0 && (
                <span className={`rounded-full px-2 py-px text-xs ${selected ? 'bg-[#EEF0FF] text-[#191FA8]' : 'bg-slate-100 text-slate-500'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── PENDING ASSIGNMENT VIEW ── */}
      {subTab === 'pending' && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-bold text-[var(--color-primary)]">Qualified Applicants — Pending Assignment</h3>
            <p className="mt-1 text-sm text-[var(--neutral-600)]">
              Filter by department or position, check the applicants to schedule (the header checkbox selects every
              match), then schedule their interview. Scheduled applicants move to the{' '}
              <span className="font-semibold">Scheduled</span> tab.
            </p>
          </section>

          {toast && (
            <p role="status" className="!m-0 rounded-[var(--radius-lg)] border-l-4 border-[var(--success-500)] bg-[var(--success-100)] p-4 text-[14px] font-medium leading-[18px] text-[var(--neutral-800)]">
              {toast}
            </p>
          )}

          {awaitingData ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-busy="true">
              <SkeletonList show={showLoader} label="Loading qualified applicants…" />
            </div>
          ) : pendingApplicants.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
              <CheckCircle2 size={40} strokeWidth={1.75} className="mb-3 text-[var(--success-500)]" />
              <p className="font-semibold text-[var(--neutral-800)]">All qualified applicants have been assigned a schedule.</p>
              <button type="button" onClick={() => setSubTab('scheduled')} className="btn btn-md btn-primary mt-3">
                <CalendarCheck size={16} strokeWidth={1.75} aria-hidden="true" /> View Scheduled Applicants
              </button>
            </div>
          ) : (
            <>
              {renderFilterBar(filteredPending.length, pendingApplicants.length, pendingSort.key === 'qualified')}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--neutral-200)] bg-[var(--bg-surface)] px-5 py-3">
                <span className="text-[14px] font-medium leading-[18px] text-[var(--neutral-800)]" aria-live="polite">
                  {selectedIds.size} applicant{selectedIds.size === 1 ? '' : 's'} selected
                </span>
                <div className="flex items-center gap-3">
                  {selectedIds.size > 0 && (
                    <button type="button" onClick={() => setSelectedIds(new Set())} className="text-xs font-medium text-[var(--color-primary)] hover:underline">
                      Clear all
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-md btn-primary"
                    disabled={selectedIds.size === 0}
                    onClick={() => { setToast(''); setScheduleOpen(true); }}
                  >
                    <CalendarPlus size={18} strokeWidth={1.75} aria-hidden="true" />
                    Schedule Applicants
                  </button>
                </div>
              </div>
              {/* §8.3: on small screens the table scrolls inside its card. */}
              <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--neutral-200)] bg-[var(--bg-surface)]">
                <table className="w-full min-w-[760px] table-fixed">
                  <colgroup>
                    <col className="w-12" />
                    <col className="w-[32%]" />
                    <col className="w-[22%]" />
                    <col className="w-[22%]" />
                    <col className="w-[11%]" />
                    <col className="w-[13%]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-[var(--neutral-200)] bg-[var(--bg-page)]">
                      <th className="px-4 py-2.5 text-left">
                        <TriStateCheckbox
                          state={groupCheckState(filteredPendingIds, selectedIds)}
                          label={`Select all ${filteredPendingIds.length} matching applicants`}
                          onChange={() => setSelectedIds(toggleGroup(filteredPendingIds, selectedIds))}
                        />
                      </th>
                      <SortHeader label="Applicant" sortKey="name" sort={pendingSort} onSort={togglePendingSort} className={SCHEDULED_TH} />
                      <SortHeader label="Position" sortKey="position" sort={pendingSort} onSort={togglePendingSort} className={SCHEDULED_TH} />
                      <SortHeader label="Department" sortKey="department" sort={pendingSort} onSort={togglePendingSort} className={SCHEDULED_TH} />
                      <th className={SCHEDULED_TH}>Type</th>
                      <SortHeader label="Shortlisted" sortKey="qualified" sort={pendingSort} onSort={togglePendingSort} className={SCHEDULED_TH} />
                    </tr>
                  </thead>
                  <tbody>
                    {pagedPending.length === 0 && noMatchRow(6)}
                    {pagedPending.map((a) => {
                      const checked = selectedIds.has(a.id);
                      const type = normalizeType(a.application_type);
                      return (
                        <tr
                          key={a.id}
                          className={`border-b border-[var(--neutral-200)] transition-colors last:border-0 ${
                            checked ? 'bg-[var(--color-primary-50)]' : 'hover:bg-[var(--bg-row-hover)]'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              aria-label={`Select ${a.full_name || 'applicant'}`}
                              checked={checked}
                              onChange={() => setSelectedIds(toggleId(a.id, selectedIds))}
                              className={CHECKBOX_CLASS}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <p className="truncate text-[14px] font-semibold leading-5 text-[var(--color-primary-900)]" title={a.full_name || undefined}>
                              {a.full_name || '—'}
                            </p>
                            <p className="truncate text-[12px] font-medium leading-4 text-[var(--neutral-600)]" title={a.email || undefined}>
                              {a.reference_no || 'No reference no.'}{a.email ? ` · ${a.email}` : ''}
                            </p>
                          </td>
                          <td className="truncate px-4 py-3 text-[14px] font-medium text-[var(--neutral-800)]" title={a.position || undefined}>
                            {a.position || '—'}
                          </td>
                          <td className="truncate px-4 py-3 text-[14px] font-medium text-[var(--neutral-800)]" title={a.office || undefined}>
                            {a.office || '—'}
                          </td>
                          {/* §10: Type is a category, so a neutral or tint chip. */}
                          <td className="px-4 py-3">
                            <span className={`badge ${type === 'Promotional' ? 'badge-tint' : 'badge-neutral'}`}>{type}</span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-[14px] font-medium text-[var(--neutral-800)]">
                            {formatDisplayDate(a.updated_at || a.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {sortedPending.length > 0 && (
                <nav aria-label="Pending applicants pages" className="flex flex-wrap items-center justify-between gap-3 text-[12px] font-medium text-[var(--neutral-600)]">
                  <span>
                    Showing {currentPendingPage * PENDING_PAGE_SIZE + 1}–{Math.min((currentPendingPage + 1) * PENDING_PAGE_SIZE, sortedPending.length)} of {sortedPending.length} entries
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPendingPage(currentPendingPage - 1)}
                      disabled={currentPendingPage === 0}
                      className="rsp-pager inline-flex items-center gap-1 border px-4 text-[14px]"
                    >
                      <ChevronLeft size={16} strokeWidth={1.75} aria-hidden="true" /> Previous
                    </button>
                    {pageItems(currentPendingPage, pendingPageCount).map((p, i) =>
                      p === null ? (
                        <span key={`gap-${i}`} className="grid min-w-9 place-items-center text-[14px]">…</span>
                      ) : (
                        <button
                          key={p}
                          type="button"
                          aria-current={p === currentPendingPage ? 'page' : undefined}
                          onClick={() => setPendingPage(p)}
                          className={`rsp-pager border text-[14px] ${
                            p === currentPendingPage ? '!border-[var(--color-primary)] !bg-[var(--color-primary)] !text-white' : ''
                          }`}
                        >
                          {p + 1}
                        </button>
                      ),
                    )}
                    <button
                      type="button"
                      onClick={() => setPendingPage(currentPendingPage + 1)}
                      disabled={currentPendingPage >= pendingPageCount - 1}
                      className="rsp-pager inline-flex items-center gap-1 border px-4 text-[14px]"
                    >
                      Next <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
                    </button>
                  </div>
                </nav>
              )}
            </>
          )}
        </>
      )}

      {scheduleOpen && (
        <ScheduleApplicantsModal
          applicants={pendingApplicants.filter((a) => selectedIds.has(a.id))}
          raters={interviewers}
          onCancel={() => setScheduleOpen(false)}
          onScheduled={(message) => {
            setScheduleOpen(false);
            setSelectedIds(new Set());
            setToast(message);
          }}
        />
      )}

      {/* ── SCHEDULED VIEW ── */}
      {subTab === 'scheduled' && (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-base font-bold" style={{ color: '#363EE8' }}>Scheduled Applicants</h3>
            <p className="mt-1 text-sm text-slate-500">
              These applicants have a published exam &amp; interview schedule. Once the interview is complete,
              their scores will be recorded in the <span className="font-semibold">Applicant Score</span> tab.
            </p>
          </section>

          {awaitingData ? (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-busy="true">
              <SkeletonList show={showLoader} label="Loading scheduled applicants…" />
            </div>
          ) : scheduledApplicants.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
              <CalendarCheck size={40} className="mb-3 text-slate-300" />
              <p className="font-semibold text-slate-600">No scheduled applicants yet.</p>
              <p className="mt-1 text-sm text-slate-400">Publish a schedule in the Pending Assignment tab first.</p>
              <button
                type="button"
                onClick={() => setSubTab('pending')}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Go to Pending Assignment
              </button>
            </div>
          ) : (
            <>
            {renderFilterBar(filteredScheduled.length, scheduledApplicants.length, scheduledSort.key === 'qualified')}
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              {/* Fixed layout with set widths so dates never wrap and the table
                  fits at 1366px without a sideways scroll. */}
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-[21%]" />
                  <col className="w-[19%]" />
                  <col className="w-[18%]" />
                  <col className="w-[18%]" />
                  <col className="w-[11%]" />
                  <col className="w-[13%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <SortHeader label="Applicant" sortKey="name" sort={scheduledSort} onSort={toggleScheduledSort} className={SCHEDULED_TH} />
                    <th
                      aria-sort={scheduledSort.key === 'position' || scheduledSort.key === 'department'
                        ? (scheduledSort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className={SCHEDULED_TH}
                    >
                      <span className="inline-flex items-center gap-1">
                        <SortButton label="Position" sortKey="position" sort={scheduledSort} onSort={toggleScheduledSort} />
                        <span>/</span>
                        <SortButton label="Office" sortKey="department" sort={scheduledSort} onSort={toggleScheduledSort} />
                      </span>
                    </th>
                    <SortHeader label="Exam Schedule" sortKey="exam" sort={scheduledSort} onSort={toggleScheduledSort} className={SCHEDULED_TH} />
                    <SortHeader label="Interview Schedule" sortKey="interview" sort={scheduledSort} onSort={toggleScheduledSort} className={SCHEDULED_TH} />
                    <SortHeader label="Interviewer" sortKey="interviewer" sort={scheduledSort} onSort={toggleScheduledSort} className={SCHEDULED_TH} />
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedScheduled.length === 0 && noMatchRow(6)}
                  {sortedScheduled.map((a) => {
                    const merged = mergeAssignment(a);
                    const interviewer = getInterviewerName(merged.assigned_interviewer_email);
                    const examAt = fmtSchedule(merged.exam_date ?? '', merged.exam_time ?? '');
                    const interviewAt = fmtSchedule(merged.interview_date ?? '', merged.interview_time ?? '');
                    const type = normalizeType(a.application_type);
                    return (
                      <tr key={a.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-2.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <p className="truncate text-sm font-semibold" style={{ color: '#040E6B' }} title={a.full_name || undefined}>{a.full_name || '—'}</p>
                            <span
                              className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                                type === 'Promotional' ? 'bg-purple-100 text-purple-700' : 'bg-sky-100 text-sky-700'
                              }`}
                            >
                              {type}
                            </span>
                          </div>
                          <p className="truncate text-xs text-slate-400" title={a.email || undefined}>{a.email}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="truncate text-sm font-medium text-slate-800" title={a.position || undefined}>{a.position || '—'}</p>
                          <p className="truncate text-xs text-slate-400" title={a.office || undefined}>{a.office || '—'}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="flex items-center gap-1.5 whitespace-nowrap text-[13px] text-slate-800">
                            <Calendar size={13} className="shrink-0 text-slate-400" /> {examAt}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <p className="flex items-center gap-1.5 whitespace-nowrap text-[13px] text-slate-800">
                            <Calendar size={13} className="shrink-0 text-slate-400" /> {interviewAt}
                          </p>
                        </td>
                        <td className="px-4 py-2.5">
                          <p
                            className="flex min-w-0 items-center gap-1.5 text-sm text-slate-800"
                            title={merged.assigned_interviewer_email || undefined}
                          >
                            <UserCheck size={13} className="shrink-0 text-slate-400" />
                            <span className="truncate">{interviewer}</span>
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => openEditModal(a)}
                            className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                          >
                            <Pencil size={12} className="shrink-0" /> Edit Schedule
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </>
      )}

      {/* ── EDIT SCHEDULE MODAL ── */}
      {editingApplicant && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(4,14,107,0.45)', padding: '1rem' }}
          onClick={() => setEditingApplicant(null)}
        >
          <div
            style={{ background: '#ffffff', borderRadius: 20, boxShadow: '0 24px 80px rgba(54,62,232,0.22)', width: '100%', maxWidth: 520, overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div style={{ background: 'linear-gradient(135deg, #5B65F0 0%, #363EE8 100%)', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#ffffff' }}>Edit Schedule</h3>
                <p style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: 'rgba(255,255,255,0.85)' }}>
                  {editingApplicant.full_name} — {editingApplicant.position}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingApplicant(null)}
                style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: 8, cursor: 'pointer', color: '#ffffff', padding: '0.35rem', display: 'flex' }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal body */}
            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.85rem' }}>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>
                    <Calendar size={11} /> Exam Date
                  </label>
                  <input
                    type="date"
                    value={editExamDate}
                    onChange={(e) => setEditExamDate(e.target.value)}
                    style={{ width: '100%', border: '1.5px solid #C8D1FF', borderRadius: 8, padding: '0.5rem 0.65rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>
                    <Clock size={11} /> Exam Time
                  </label>
                  <input
                    type="time"
                    value={editExamTime}
                    onChange={(e) => setEditExamTime(e.target.value)}
                    style={{ width: '100%', border: '1.5px solid #C8D1FF', borderRadius: 8, padding: '0.5rem 0.65rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>
                    <Calendar size={11} /> Interview Date
                  </label>
                  <input
                    type="date"
                    value={editInterviewDate}
                    onChange={(e) => setEditInterviewDate(e.target.value)}
                    style={{ width: '100%', border: '1.5px solid #C8D1FF', borderRadius: 8, padding: '0.5rem 0.65rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>
                    <Clock size={11} /> Interview Time
                  </label>
                  <input
                    type="time"
                    value={editInterviewTime}
                    onChange={(e) => setEditInterviewTime(e.target.value)}
                    style={{ width: '100%', border: '1.5px solid #C8D1FF', borderRadius: 8, padding: '0.5rem 0.65rem', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', marginBottom: 6 }}>
                  <UserCheck size={11} /> Assigned Interviewer
                </label>
                <select
                  value={editInterviewerEmail}
                  onChange={(e) => setEditInterviewerEmail(e.target.value)}
                  style={{ width: '100%', border: '1.5px solid #C8D1FF', borderRadius: 8, padding: '0.5rem 0.65rem', fontSize: '0.875rem', outline: 'none', background: '#ffffff', boxSizing: 'border-box' }}
                >
                  <option value="">Select an interviewer…</option>
                  {interviewers.map((i) => (
                    <option key={i.email} value={i.email}>
                      {i.name}{i.designation ? ` — ${i.designation}` : ''} ({i.email})
                    </option>
                  ))}
                </select>
              </div>
              {editError && <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: '#EF4444' }}>{editError}</p>}
            </div>

            {/* Modal footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1.5px solid #EEF0FD', display: 'flex', justifyContent: 'flex-end', gap: '0.65rem' }}>
              <button
                type="button"
                onClick={() => setEditingApplicant(null)}
                style={{ padding: '0.55rem 1.25rem', background: '#ffffff', border: '1.5px solid #C8D1FF', borderRadius: 8, fontWeight: 600, fontSize: '0.875rem', color: '#040E6B', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleEditSave()}
                disabled={editSaving}
                aria-busy={editSaving || undefined}
                style={{ padding: '0.55rem 1.5rem', background: 'linear-gradient(135deg, #363EE8 0%, #040E6B 100%)', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.875rem', color: '#ffffff', cursor: editSaving ? 'progress' : 'pointer', opacity: editSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: '0.4rem', boxShadow: editSaving ? 'none' : '0 4px 14px rgba(54,62,232,0.35)' }}
              >
                {/* Label stays while saving (§9.1); the icon slot carries the
                    spinner, so the button neither reflows nor stops saying
                    what it does. */}
                {editSaving ? (
                  <span
                    aria-hidden
                    className="h-3.5 w-3.5 flex-none animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none motion-reduce:opacity-60"
                  />
                ) : (
                  <Save size={14} />
                )}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
