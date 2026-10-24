// Pure helpers for batch interview scheduling on the Qualified Applicants →
// Pending Assignment view: grouping applicants into a department → position
// tree, deriving position checkbox state from the selected-id set, and
// deciding whose status a schedule may advance.

import { canTransition, isTerminal, normalizeStatus, type ApplicantWorkflowStatus } from './api/applicantStatus';

/** Status an applicant moves to once an interview is scheduled. */
export const SCHEDULED_STATUS = 'Interview/Exam Scheduled' as const;

/** Statuses listed on Qualified Applicants: waiting for, or past, an interview schedule. */
const SCHEDULABLE_STATUSES: readonly ApplicantWorkflowStatus[] = [
  'Shortlisted',
  SCHEDULED_STATUS,
  'For Evaluation',
  'Qualified',
];

/**
 * Whether an applicant belongs on Qualified Applicants. Matches exact
 * workflow statuses, never substrings ("Disqualified" contains "qualified").
 * A closed application never shows, even with a completed evaluation;
 * an unrecognised status never shows.
 */
export function isSchedulableApplicant(status: string | null | undefined, hasCompletedEvaluation: boolean): boolean {
  const current = normalizeStatus(status);
  if (!current || isTerminal(current)) return false;
  return SCHEDULABLE_STATUSES.includes(current) || hasCompletedEvaluation;
}

/** Start times for the two fixed interview sessions (24-hour, HH:mm). */
export const SESSION_TIMES = {
  morning: '08:00',
  afternoon: '13:00',
} as const;

export type InterviewSession = keyof typeof SESSION_TIMES | 'custom';

const UNKNOWN_DEPARTMENT = 'Unassigned department';
const UNKNOWN_POSITION = 'Untitled position';

interface Groupable {
  id: string;
  office: string;
  position: string;
}

export interface PositionGroup<T> {
  /** Unique across departments: the same title can exist in two offices. */
  key: string;
  position: string;
  applicants: T[];
}

export interface DepartmentGroup<T> {
  department: string;
  positions: PositionGroup<T>[];
}

const byLabel = (a: string, b: string) => a.localeCompare(b, undefined, { sensitivity: 'base' });

/** Groups applicants by department, then position, both sorted by name. */
export function groupByDepartmentAndPosition<T extends Groupable>(applicants: T[]): DepartmentGroup<T>[] {
  const departments = new Map<string, Map<string, T[]>>();
  applicants.forEach((a) => {
    const department = a.office.trim() || UNKNOWN_DEPARTMENT;
    const position = a.position.trim() || UNKNOWN_POSITION;
    const positions = departments.get(department) ?? new Map<string, T[]>();
    positions.set(position, [...(positions.get(position) ?? []), a]);
    departments.set(department, positions);
  });

  return Array.from(departments.entries())
    .sort(([a], [b]) => byLabel(a, b))
    .map(([department, positions]) => ({
      department,
      positions: Array.from(positions.entries())
        .sort(([a], [b]) => byLabel(a, b))
        .map(([position, items]) => ({ key: `${department}::${position}`, position, applicants: items })),
    }));
}

export type CheckState = 'checked' | 'indeterminate' | 'unchecked';

/** A group's checkbox state, derived only from which of its ids are selected. */
export function groupCheckState(ids: string[], selected: ReadonlySet<string>): CheckState {
  const count = ids.filter((id) => selected.has(id)).length;
  if (count === 0) return 'unchecked';
  return count === ids.length ? 'checked' : 'indeterminate';
}

/** Selects every id in the group, or clears them all when the group is fully checked. */
export function toggleGroup(ids: string[], selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected);
  if (groupCheckState(ids, selected) === 'checked') ids.forEach((id) => next.delete(id));
  else ids.forEach((id) => next.add(id));
  return next;
}

export function toggleId(id: string, selected: ReadonlySet<string>): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/**
 * Splits applicants into those whose status may move to SCHEDULED_STATUS and
 * the rest, who get the schedule but keep their status (e.g. a rescheduled
 * applicant, or one already past the interview).
 */
export function partitionForStatusAdvance(applicants: { id: string; status: string }[]): {
  advance: string[];
  keep: string[];
} {
  const advance: string[] = [];
  const keep: string[] = [];
  applicants.forEach((a) => {
    const current = normalizeStatus(a.status);
    if (current && canTransition(current, SCHEDULED_STATUS)) advance.push(a.id);
    else keep.push(a.id);
  });
  return { advance, keep };
}

/** Today's date in the user's time zone, as YYYY-MM-DD (the date input's format). */
export function localIsoDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** True when a YYYY-MM-DD date is before `today`. ISO dates compare as strings. */
export const isPastDate = (date: string, today: string): boolean => date < today;

/** §9.5 date format: "Oct 28, 2026". Takes YYYY-MM-DD or an ISO timestamp. */
export const formatDisplayDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};
