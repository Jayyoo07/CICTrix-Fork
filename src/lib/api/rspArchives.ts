import { supabase } from '../supabase';
import { normalizeStatus, type ApplicantWorkflowStatus } from './applicantStatus';

/**
 * Reads behind RSP → Archives (docs/plans/2026-10-25-rsp-archives.md).
 *
 * Each fetcher fails soft: a missing table or column logs a warning and returns
 * an empty list, so one unavailable source never blanks the whole archive.
 */

const client = supabase as any;

/** Employee statuses that mean the person no longer works here. */
export const FORMER_EMPLOYEE_STATUSES = ['Resigned', 'Terminated', 'Separated'] as const;

/** Applicant endings shown in the archive. */
export const CLOSED_APPLICATION_STATUSES: ApplicantWorkflowStatus[] = [
  'Disqualified',
  'Not Selected',
  'Withdrawn - Hired Elsewhere',
];

/** Statuses a restored application may return to. */
export const RESTORE_TARGETS: ApplicantWorkflowStatus[] = [
  'Under Initial Screening',
  'Shortlisted',
  'Interview/Exam Scheduled',
  'For Evaluation',
  'Qualified',
];

export interface FormerEmployee {
  id: string;
  employeeId: string;
  fullName: string;
  position: string;
  department: string;
  status: string;
  /** Best available date the employment ended. */
  date: string;
  hireDate: string;
}

export interface PreviousPosition {
  id: string;
  employeeId: string;
  fullName: string;
  action: 'Promoted' | 'Transferred';
  fromPosition: string;
  fromDepartment: string;
  toValue: string;
  date: string;
  reason: string;
}

export interface ClosedApplication {
  id: string;
  fullName: string;
  referenceNo: string;
  email: string;
  position: string;
  department: string;
  status: ApplicantWorkflowStatus;
  reason: string;
  date: string;
}

const text = (v: unknown): string => (v == null ? '' : String(v).trim());

const fullNameOf = (row: any): string =>
  text(row.full_name) ||
  [row.first_name, row.middle_name, row.last_name].map(text).filter(Boolean).join(' ') ||
  'Unnamed';

/** "Position - Department" as written by employees.ts changePosition. */
const splitPositionValue = (value: string): [string, string] => {
  const i = value.lastIndexOf(' - ');
  return i < 0 ? [value, ''] : [value.slice(0, i).trim(), value.slice(i + 3).trim()];
};

export const fetchFormerEmployees = async (): Promise<FormerEmployee[]> => {
  try {
    const { data, error } = await client
      .from('employees_with_department')
      .select('*')
      .in('status', FORMER_EMPLOYEE_STATUSES as unknown as string[]);
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      id: text(row.id),
      employeeId: text(row.employee_id),
      fullName: fullNameOf(row),
      position: text(row.current_position) || '—',
      department: text(row.department || row.current_department) || '—',
      status: text(row.status),
      date: text(row.separation_date || row.updated_at || row.hire_date),
      hireDate: text(row.hire_date),
    }));
  } catch (err) {
    console.warn('[rspArchives] former employees lookup failed:', err);
    return [];
  }
};

export const fetchPreviousPositions = async (): Promise<PreviousPosition[]> => {
  try {
    const { data, error } = await client
      .from('employee_history')
      .select('*')
      .in('action', ['promoted', 'transferred']);
    if (error) throw error;
    const rows: any[] = data ?? [];
    if (rows.length === 0) return [];

    const ids = [...new Set(rows.map((r) => text(r.employee_id)).filter(Boolean))];
    const { data: people } = await client
      .from('employees_with_department')
      .select('id, employee_id, full_name, first_name, middle_name, last_name')
      .in('id', ids);
    const byId = new Map<string, any>((people ?? []).map((p: any) => [text(p.id), p]));

    return rows.map((row) => {
      const person = byId.get(text(row.employee_id));
      const [fromPosition, fromDepartment] = splitPositionValue(text(row.old_value));
      return {
        id: text(row.id),
        employeeId: text(person?.employee_id),
        fullName: person ? fullNameOf(person) : 'Unknown employee',
        action: text(row.action) === 'promoted' ? 'Promoted' : 'Transferred',
        fromPosition: fromPosition || '—',
        fromDepartment: fromDepartment || '—',
        toValue: text(row.new_value).replace(' - ', ', '),
        date: text(row.effective_date || row.performed_at),
        reason: text(row.reason),
      } as PreviousPosition;
    });
  } catch (err) {
    console.warn('[rspArchives] previous positions lookup failed:', err);
    return [];
  }
};

export const fetchClosedApplications = async (): Promise<ClosedApplication[]> => {
  try {
    const { data, error } = await client
      .from('applicants')
      .select('*')
      .or('status.ilike.%disqualif%,status.ilike.%not qualified%,status.ilike.%not selected%,status.ilike.%rejected%,status.ilike.%withdrawn%,archived_at.not.is.null');
    if (error) throw error;
    return (data ?? [])
      .filter((row: any) => !row.deleted_at)
      .map((row: any) => {
        // An archived row with a live status was archived when its plantilla filled.
        const status = row.archived_at && !CLOSED_APPLICATION_STATUSES.includes(normalizeStatus(row.status) as ApplicantWorkflowStatus)
          ? 'Not Selected'
          : normalizeStatus(row.status);
        return { row, status };
      })
      .filter(({ status }: { status: ApplicantWorkflowStatus | null }) => status && CLOSED_APPLICATION_STATUSES.includes(status))
      .map(({ row, status }: { row: any; status: ApplicantWorkflowStatus }) => ({
        id: text(row.id),
        fullName: fullNameOf(row),
        referenceNo: text(row.reference_no),
        email: text(row.email),
        position: text(row.position) || '—',
        department: text(row.office || row.department) || '—',
        status,
        reason: text(row.disqualification_reason) ||
          (status === 'Not Selected' ? 'The plantilla was filled by another applicant' : status === 'Withdrawn - Hired Elsewhere' ? 'Hired on another application' : ''),
        date: text(row.disqualified_at || row.archived_at || row.updated_at || row.created_at),
      }));
  } catch (err) {
    console.warn('[rspArchives] closed applications lookup failed:', err);
    return [];
  }
};

/**
 * Return a disqualified application to a live status.
 *
 * There is no status-history table, so the restore note is kept in
 * disqualification_reason (hidden from the applicant once the status is live)
 * together with the reason it replaces.
 */
export const restoreApplication = async (input: {
  id: string;
  status: ApplicantWorkflowStatus;
  reason: string;
  previousReason: string;
  restoredBy: string;
}): Promise<{ ok: boolean; error?: string }> => {
  const stamp = new Date().toISOString().slice(0, 10);
  const note = `Restored ${stamp} by ${input.restoredBy || 'RSP'}: ${input.reason}` +
    (input.previousReason ? ` | Earlier: ${input.previousReason}` : '');
  try {
    const { error } = await client
      .from('applicants')
      .update({ status: input.status, disqualified_at: null, disqualification_reason: note })
      .eq('id', input.id);
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.warn('[rspArchives] restore failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};
