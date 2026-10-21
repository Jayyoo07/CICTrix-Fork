// Department → position → applicant checkbox tree for batch interview
// scheduling. Departments are plain headers; positions select all of their
// applicants; applicants toggle one at a time. Selection lives in the parent.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ChevronDown, ChevronRight } from 'lucide-react';
import type { ApplicantRecord } from './QualifiedApplicantsSection';
import { normalizeStatus, type ApplicantWorkflowStatus } from '../lib/api/applicantStatus';
import {
  groupByDepartmentAndPosition,
  groupCheckState,
  toggleGroup,
  toggleId,
  type CheckState,
} from '../lib/scheduleSelection';

// DESIGN_IDENTITY §10, application status.
const STATUS_BADGE: Record<ApplicantWorkflowStatus, string> = {
  Submitted: 'badge-info',
  'Under Initial Screening': 'badge-warning',
  Pending: 'badge-warning',
  Shortlisted: 'badge-info',
  'Interview/Exam Scheduled': 'badge-warning',
  'For Evaluation': 'badge-warning',
  Qualified: 'badge-success',
  // Reserved, waiting for the applicant to sign.
  'For Contract Signing': 'badge-warning',
  Selected: 'badge-success',
  Disqualified: 'badge-error',
  'Not Selected': 'badge-error',
  // Closed, but not a failure: they were hired on another plantilla.
  'Withdrawn - Hired Elsewhere': 'badge-neutral',
};

const CHECKBOX_CLASS = 'h-[18px] w-[18px] shrink-0 cursor-pointer accent-[var(--color-primary)]';

const isPromotional = (t: string | null | undefined) => (t ?? '').toLowerCase().includes('promot');

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

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

interface SchedulingTreeProps {
  applicants: ApplicantRecord[];
  selected: ReadonlySet<string>;
  onSelectionChange: (next: Set<string>) => void;
  /** Show every department and position open, e.g. while a search is active. */
  expandAll?: boolean;
}

export const SchedulingTree = ({ applicants, selected, onSelectionChange, expandAll = false }: SchedulingTreeProps) => {
  const groups = useMemo(() => groupByDepartmentAndPosition(applicants), [applicants]);
  // Everything starts closed: departments first, then a department's
  // positions, then a position's applicants.
  const [openDepartments, setOpenDepartments] = useState<Set<string>>(new Set());
  const [expandedPositions, setExpandedPositions] = useState<Set<string>>(new Set());

  return (
    <div className="space-y-4">
      {groups.map((dept) => {
        const deptOpen = expandAll || openDepartments.has(dept.department);
        const deptCount = dept.positions.reduce((n, p) => n + p.applicants.length, 0);
        return (
          <section
            key={dept.department}
            className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--neutral-200)] bg-[var(--bg-surface)]"
          >
            <button
              type="button"
              aria-expanded={deptOpen}
              onClick={() => setOpenDepartments((prev) => toggleId(dept.department, prev))}
              className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-[var(--bg-row-hover)]"
            >
              {deptOpen
                ? <ChevronDown size={20} strokeWidth={1.75} className="shrink-0 text-[var(--neutral-600)]" />
                : <ChevronRight size={20} strokeWidth={1.75} className="shrink-0 text-[var(--neutral-600)]" />}
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-chip)] bg-[var(--color-primary-50)] text-[var(--color-primary)]">
                <Building2 size={20} strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[18px] font-semibold leading-6 text-[var(--color-primary-900)]">
                {dept.department}
              </span>
              <span className="hidden shrink-0 sm:inline-flex"><span className="badge badge-neutral">{plural(deptCount, 'applicant')}</span></span>
            </button>

            {deptOpen && (
              <ul className="border-t border-[var(--neutral-200)]">
                {dept.positions.map((pos) => {
                  const ids = pos.applicants.map((a) => a.id);
                  const posOpen = expandAll || expandedPositions.has(pos.key);
                  const state = groupCheckState(ids, selected);
                  const selectedCount = ids.filter((id) => selected.has(id)).length;
                  return (
                    <li key={pos.key} className="border-b border-[var(--neutral-200)] last:border-b-0">
                      <div className="flex items-center gap-3 py-3 pl-5 pr-5">
                        <TriStateCheckbox
                          state={state}
                          label={`Select all ${plural(ids.length, 'applicant')} for ${pos.position}`}
                          onChange={() => onSelectionChange(toggleGroup(ids, selected))}
                        />
                        <button
                          type="button"
                          aria-expanded={posOpen}
                          onClick={() => setExpandedPositions((prev) => toggleId(pos.key, prev))}
                          className="flex min-w-0 flex-1 items-center gap-2 rounded-[var(--radius-md)] py-1 text-left"
                        >
                          {posOpen
                            ? <ChevronDown size={16} strokeWidth={1.75} className="shrink-0 text-[var(--neutral-600)]" />
                            : <ChevronRight size={16} strokeWidth={1.75} className="shrink-0 text-[var(--neutral-600)]" />}
                          <span className="min-w-0 truncate text-[16px] font-semibold leading-5 text-[var(--color-primary-900)]" title={pos.position}>
                            {pos.position}
                          </span>
                          <span className="badge badge-tint shrink-0">{plural(ids.length, 'applicant')}</span>
                        </button>
                        {selectedCount > 0 && (
                          <span className="hidden shrink-0 text-[12px] font-medium leading-4 text-[var(--neutral-600)] sm:inline">
                            {selectedCount} of {ids.length} selected
                          </span>
                        )}
                      </div>

                      {posOpen && (
                        <ul className="border-t border-[var(--neutral-200)]">
                          {pos.applicants.map((a) => {
                            const checked = selected.has(a.id);
                            const status = normalizeStatus(a.status);
                            return (
                              <li key={a.id} className="border-b border-[var(--neutral-200)] last:border-b-0">
                                <label
                                  className={`flex cursor-pointer items-center gap-3 py-3 pl-12 pr-5 transition-colors ${
                                    checked ? 'bg-[var(--color-primary-50)]' : 'hover:bg-[var(--bg-row-hover)]'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={checked}
                                    onChange={() => onSelectionChange(toggleId(a.id, selected))}
                                    className={CHECKBOX_CLASS}
                                  />
                                  <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[14px] font-semibold leading-[18px] text-[var(--color-primary-900)]" title={a.full_name}>
                                      {a.full_name || '—'}
                                    </span>
                                    <span className="block truncate text-[12px] font-medium leading-4 text-[var(--neutral-600)]">
                                      {a.reference_no || 'No reference no.'}{a.email ? ` · ${a.email}` : ''}
                                    </span>
                                  </span>
                                  {/* The .badge display rule outranks `hidden`, so hide a wrapper. */}
                                  <span className="hidden shrink-0 sm:inline-flex">
                                    <span className={`badge ${isPromotional(a.application_type) ? 'badge-tint' : 'badge-neutral'}`}>
                                      {isPromotional(a.application_type) ? 'Promotional' : 'Original'}
                                    </span>
                                  </span>
                                  <span className={`badge shrink-0 ${status ? STATUS_BADGE[status] : 'badge-neutral'}`}>
                                    {status ?? (a.status || 'No status')}
                                  </span>
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
};
