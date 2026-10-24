import { supabase } from '../supabase';

/**
 * The three newly-hired counts the RSP dashboard shows.
 *
 * They used to be computed inside NewlyHiredPage, which loads every applicant
 * and builds full NewlyHired records to render its department tables. The
 * dashboard only needs the counts, so this reads the two tables and nothing
 * more.
 */
export interface NewlyHiredStats {
  total: number;
  withCredentials: number;
  pendingCredentials: number;
}

/**
 * Whether an applicant's stored status means they were hired.
 *
 * 'accept' covers the legacy 'Accepted'. Exported so the page and the dashboard
 * cannot drift on what counts as a hire.
 */
export const isHiredApplicantStatus = (status: unknown): boolean => {
  const normalized = String(status ?? '').trim().toLowerCase();
  return normalized === 'hired' || normalized === 'accept';
};

/** Pure half of the fetch, so the counting rules can be tested directly. */
export function computeNewlyHiredStats(
  applicantRows: unknown[],
  newlyHiredRows: unknown[],
): NewlyHiredStats {
  // A single applicant can hold two newly_hired rows: confirm-hire once wrote
  // id=`hire-{appId}-{ts}` alongside today's `hire-{appId}`. Keep whichever row
  // carries the employee number, or credentials look un-generated.
  const credentialByApplicantId = new Map<string, boolean>();
  for (const row of (newlyHiredRows ?? []) as any[]) {
    const applicantId = String(row?.applicant_id ?? '').trim();
    if (!applicantId) continue;
    const hasCredential = Boolean(row?.employee_id);
    if (credentialByApplicantId.get(applicantId) && !hasCredential) continue;
    credentialByApplicantId.set(applicantId, hasCredential);
  }

  // Hired if the applicant says so OR a newly_hired row exists: older hires
  // predate the status flip and still carry a stale applicants.status.
  let total = 0;
  let withCredentials = 0;
  for (const row of (applicantRows ?? []) as any[]) {
    const applicantId = String(row?.id ?? '').trim();
    const inNewlyHired = Boolean(applicantId && credentialByApplicantId.has(applicantId));
    if (!isHiredApplicantStatus(row?.status) && !inNewlyHired) continue;
    total += 1;
    if (applicantId && credentialByApplicantId.get(applicantId)) withCredentials += 1;
  }

  return { total, withCredentials, pendingCredentials: total - withCredentials };
}

export async function fetchNewlyHiredStats(): Promise<NewlyHiredStats> {
  const empty: NewlyHiredStats = { total: 0, withCredentials: 0, pendingCredentials: 0 };

  try {
    const [applicantsResult, newlyHiredResult] = await Promise.all([
      (supabase as any).from('applicants').select('id,status'),
      (supabase as any).from('newly_hired').select('applicant_id,employee_id'),
    ]);

    if (applicantsResult?.error) {
      console.warn('[newlyHiredStats] applicants read failed:', applicantsResult.error);
    }

    return computeNewlyHiredStats(applicantsResult?.data ?? [], newlyHiredResult?.data ?? []);
  } catch (err) {
    console.warn('[newlyHiredStats] failed:', err);
    return empty;
  }
}
