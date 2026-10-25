/**
 * Pure archive model: record shape, groups, filtering, sorting and CSV.
 * No React and no Supabase, so Vitest covers it directly.
 */

export type ArchiveGroup = 'employees' | 'applicants' | 'jobs' | 'evaluations';

export type ArchiveAction =
  | { kind: 'restore'; previousReason: string }
  | { kind: 'purge'; applicants: number; documents: number }
  | { kind: 'assessment'; position: string };

export interface ArchiveFact {
  label: string;
  value: string;
}

export interface ArchivePerson {
  name: string;
  detail: string;
}

export interface ArchiveRecord {
  /** Unique across groups, e.g. "app:42". */
  key: string;
  group: ArchiveGroup;
  /** Status shown in the table (§10 badge) or category tag. */
  type: string;
  name: string;
  /** Employee ID, REF number or plantilla. */
  ref: string;
  position: string;
  department: string;
  /** ISO date the record ended or was archived. */
  date: string;
  reason?: string;
  facts?: ArchiveFact[];
  /** People listed in the drawer: preserved applicants, ranked applicants. */
  people?: ArchivePerson[];
  peopleTitle?: string;
  action?: ArchiveAction;
}

export interface GroupDef {
  id: ArchiveGroup;
  label: string;
  /** Column header for the first column. */
  who: string;
  /** Column header for the second column. */
  where: string;
  /** Type options; `section` groups them in the Type select. */
  types: { value: string; section?: string }[];
}

export const GROUPS: GroupDef[] = [
  {
    id: 'employees', label: 'Employees', who: 'Employee', where: 'Last position',
    types: [
      { value: 'Resigned', section: 'Former employees' },
      { value: 'Terminated', section: 'Former employees' },
      { value: 'Separated', section: 'Former employees' },
      { value: 'Promoted', section: 'Previous positions' },
      { value: 'Transferred', section: 'Previous positions' },
    ],
  },
  {
    id: 'applicants', label: 'Applicants', who: 'Applicant', where: 'Position',
    types: [{ value: 'Disqualified' }, { value: 'Not Selected' }, { value: 'Withdrawn - Hired Elsewhere' }],
  },
  {
    id: 'jobs', label: 'Job posts', who: 'Position', where: 'Department',
    types: [{ value: 'Deleted' }],
  },
  {
    id: 'evaluations', label: 'Evaluation records', who: 'Position', where: 'Department',
    types: [{ value: 'Ranking' }, { value: 'Assessment forms' }],
  },
];

/** Category tags (§10: non-status, brand tint) rather than status badges. */
export const CATEGORY_TYPES = new Set(['Promoted', 'Transferred', 'Ranking', 'Assessment forms']);

/** §10 badge variant for a status type. */
export const badgeVariant = (type: string): 'error' | 'neutral' | 'tint' => {
  if (CATEGORY_TYPES.has(type)) return 'tint';
  return type === 'Disqualified' ? 'error' : 'neutral';
};

/** Display form: en dash for the hyphenated DB value. */
export const typeLabel = (type: string): string => type.replace(' - ', ' – ');

export interface ArchiveFilters {
  query: string;
  type: string;
  department: string;
  from: string;
  to: string;
  sort: 'new' | 'old' | 'az';
}

export const EMPTY_FILTERS: ArchiveFilters = { query: '', type: '', department: '', from: '', to: '', sort: 'new' };

/**
 * The search box promises "Name, employee ID or REF number", so it matches
 * those plus the position. Department is left to the Filters popover: matching
 * it here made "engineer" return every record in the City Engineer's office.
 */
export const matchesQuery = (r: ArchiveRecord, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [r.name, r.ref, r.position].some((v) => v.toLowerCase().includes(q));
};

/** yyyy-mm-dd of an ISO value, for comparing with <input type="date">. */
export const dayOf = (iso: string): string => (iso || '').slice(0, 10);

export const filterRecords = (records: ArchiveRecord[], group: ArchiveGroup, f: ArchiveFilters): ArchiveRecord[] => {
  const rows = records.filter((r) =>
    r.group === group
    && matchesQuery(r, f.query)
    && (!f.type || r.type === f.type)
    && (!f.department || r.department === f.department)
    && (!f.from || dayOf(r.date) >= f.from)
    && (!f.to || dayOf(r.date) <= f.to));
  return rows.sort((a, b) =>
    f.sort === 'az' ? a.name.localeCompare(b.name)
      : f.sort === 'old' ? a.date.localeCompare(b.date)
        : b.date.localeCompare(a.date));
};

export const countFor = (records: ArchiveRecord[], group: ArchiveGroup, query: string, type?: string): number =>
  records.filter((r) => r.group === group && matchesQuery(r, query) && (!type || r.type === type)).length;

/** §9.5 date format: MMM DD, YYYY. */
export const formatDate = (iso: string): string => {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
};

/** §9.6 page buttons (0-based); null is an ellipsis. First, last and current ±1 past 7 pages. */
export const pageList = (current: number, pages: number): (number | null)[] => {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i);
  const keep = [...new Set([0, current - 1, current, current + 1, pages - 1])].filter((p) => p >= 0 && p < pages).sort((a, b) => a - b);
  return keep.flatMap((p, i) => (i > 0 && p - keep[i - 1] > 1 ? [null, p] : [p]));
};

const csvCell =(v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export const toCsv = (group: GroupDef, rows: ArchiveRecord[]): string => {
  const head = [group.who, 'Reference', group.where, 'Department', 'Status', 'Reason', 'Date'];
  const body = rows.map((r) => [r.name, r.ref, r.position, r.department, typeLabel(r.type), r.reason ?? '', formatDate(r.date)]);
  return [head, ...body].map((line) => line.map(csvCell).join(',')).join('\n');
};
