/**
 * Matching a rater/interviewer to an employee account.
 *
 * Rater Management stored whatever name and email an admin typed, with nothing
 * tying the row to an employee. That left no way to say whether the account was
 * real, no way to suggest it while typing, and nobody to notify once the rater
 * was added. Email is the only key the two sides share, so it is the join.
 */
import { createNotifications } from './employeeNotifications';
import { getAllEmployees } from './employees';

export interface RaterCandidate {
  /** Supabase row id — what employee_notifications is keyed on. */
  id: string;
  /** Human-facing employee number, e.g. "2024-0103". */
  employeeNumber: string;
  name: string;
  email: string;
  position: string;
  department: string;
}

const normalizeEmail = (value: unknown): string => String(value ?? '').trim().toLowerCase();

/**
 * Active employees, as suggestions for the Add Rater fields.
 *
 * Returns an empty list on any failure, including RLS refusing the read. The
 * caller must treat empty as "cannot tell" rather than "account not found" —
 * see matchRaterAccount.
 */
export async function listRaterCandidates(): Promise<RaterCandidate[]> {
  try {
    const result = await getAllEmployees({ status: 'Active' });
    if (!result.success) return [];
    return ((result.data ?? []) as any[])
      .map((row) => ({
        id: String(row?.id ?? '').trim(),
        employeeNumber: String(row?.employee_id ?? '').trim(),
        name: String(row?.full_name ?? '').trim(),
        email: String(row?.email ?? '').trim(),
        position: String(row?.current_position ?? row?.position ?? '').trim(),
        department: String(row?.department ?? row?.current_department ?? '').trim(),
      }))
      .filter((candidate) => candidate.id && candidate.email && candidate.name);
  } catch (err) {
    console.warn('[raterAccounts] candidate load failed:', err);
    return [];
  }
}

/**
 * The employee holding this email, or null.
 *
 * Matching ignores case and surrounding space, since an admin typing an address
 * by hand should not fail on either.
 */
export function matchRaterAccount(email: string, candidates: RaterCandidate[]): RaterCandidate | null {
  const needle = normalizeEmail(email);
  if (!needle) return null;
  return candidates.find((candidate) => normalizeEmail(candidate.email) === needle) ?? null;
}

/** The employee whose name this is, when exactly one employee has it. */
export function matchRaterAccountByName(name: string, candidates: RaterCandidate[]): RaterCandidate | null {
  const needle = String(name ?? '').trim().toLowerCase();
  if (!needle) return null;
  const matches = candidates.filter((candidate) => candidate.name.trim().toLowerCase() === needle);
  // Two employees can share a name; picking one of them arbitrarily would fill
  // in the wrong email, so leave it to the admin.
  return matches.length === 1 ? matches[0] : null;
}

/**
 * Tell an employee they are now a rater/interviewer.
 *
 * Best-effort: the rater exists by the time this runs, so a failed notification
 * must not read as a failed add.
 */
export async function notifyRaterAdded(employee: RaterCandidate): Promise<boolean> {
  if (!employee?.id) return false;
  try {
    const written = await createNotifications([
      {
        employeeId: employee.id,
        type: 'rater_assigned',
        title: 'You have been added as an interviewer',
        message:
          'The RSP Office has given you interviewer access. You can now evaluate the applicants assigned to you.',
        link: '/interviewer/dashboard',
      },
    ]);
    return written > 0;
  } catch (err) {
    console.warn('[raterAccounts] notify failed:', err);
    return false;
  }
}
