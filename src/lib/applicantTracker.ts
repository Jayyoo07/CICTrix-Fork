/**
 * Public applicant tracker: finds every application a person has filed, and
 * works out which ones are waiting on the applicant.
 *
 * Since migration 20261021200000 a Reference No. identifies a person, not one
 * application, so a lookup returns all of their rows. Old numbers survive as
 * aliases, which resolve_application_reference maps to the primary.
 */
import { normalizeStatus } from './api/applicantStatus';
import { supabase } from './supabase';

/** The columns the tracker is allowed to look an application up by. */
export type TrackerLookupColumn = 'reference_no_normalized' | 'item_number' | 'email';

/** The query that found the person, reused by polling so it hits the same path. */
export interface TrackerLookup {
  col: TrackerLookupColumn;
  val: string;
}

/** Reference numbers get read off a printout and typed back in. */
export const normalizeReference = (value: string) =>
  String(value ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export interface TrackerAttachment {
  id: string;
  applicant_id?: string;
  file_name: string;
  file_path: string;
  document_type: string | null;
  created_at: string;
}

type ViewRow = Record<string, unknown>;

const queryTracker = async (lookup: TrackerLookup) =>
  await (supabase as any)
    .from('applicant_tracker_view')
    .select('*')
    .eq(lookup.col, lookup.val)
    .order('created_at', { ascending: false });

/** Re-reads the whole set for a lookup that already worked. Newest first. */
export const refetchTrackerApplications = async (lookup: TrackerLookup): Promise<ViewRow[] | null> => {
  const { data, error } = await queryTracker(lookup);
  if (error || !Array.isArray(data)) return null;
  return data as ViewRow[];
};

/**
 * Finds every application for a Reference No. (primary or alias) or an email.
 * Returns the rows newest first and the lookup that found them, or no rows.
 */
export const fetchTrackerApplications = async (
  rawQuery: string,
): Promise<{ rows: ViewRow[]; lookup: TrackerLookup | null }> => {
  const trimmed = rawQuery.trim();

  if (trimmed.includes('@')) {
    const lookup: TrackerLookup = { col: 'email', val: trimmed.toLowerCase() };
    const { data, error } = await queryTracker(lookup);
    if (error) throw new Error(error.message);
    const rows = Array.isArray(data) ? (data as ViewRow[]) : [];
    return { rows, lookup: rows.length > 0 ? lookup : null };
  }

  // An alias resolves to the person's primary number, which every one of
  // their rows carries. If the resolver is missing or knows nothing, the
  // number is tried as typed.
  let reference = trimmed;
  try {
    const { data } = await (supabase as any).rpc('resolve_application_reference', { raw: trimmed });
    if (typeof data === 'string' && data) reference = data;
  } catch { /* fall through to the number as typed */ }

  const candidates: TrackerLookup[] = [
    { col: 'reference_no_normalized', val: normalizeReference(reference) },
    // Before migration 20260923 the tracking codes lived in item_number.
    { col: 'item_number', val: trimmed.toUpperCase() },
  ];

  let lastError: string | null = null;
  for (const lookup of candidates) {
    const { data, error } = await queryTracker(lookup);
    if (error) { lastError = error.message; continue; }
    if (Array.isArray(data) && data.length > 0) return { rows: data as ViewRow[], lookup };
  }
  if (lastError) throw new Error(lastError);
  return { rows: [], lookup: null };
};

// Map from RSP document slot label → document_type key used in attachments
export const LABEL_TO_DOC_TYPE: Record<string, string> = {
  'Application Letter': 'application_letter',
  'Personal Data Sheet': 'pds_with_photo',
  'Curriculum Vitae': 'curriculum_vitae',
  'Proof of Eligibility Rating/License': 'eligibility_proof',
  'Certificate of Relevant Training/Seminars': 'training_certificate',
  'Transcript of Records': 'transcript_of_records',
  'Certificate from Previous Employer': 'previous_employer_certificate',
  'Drug Test Result': 'drug_test',
  'Other Supporting Documents': 'other',
};

/** A resubmission notice row packs `::<document label>::<reason>` into file_name. */
export const parseNotice = (notice: TrackerAttachment) => {
  const parts = notice.file_name.split('::');
  return {
    document: parts[1] ?? notice.file_name,
    reason: parts[2] ?? '',
    notes: notice.file_path === '—' ? '' : notice.file_path,
    date: notice.created_at,
    docType: LABEL_TO_DOC_TYPE[parts[1] ?? ''] ?? '',
  };
};

/** The latest RSP resubmission notice per document type. */
export const latestNoticesByDocType = (attachments: TrackerAttachment[]) => {
  const latest = new Map<string, TrackerAttachment>();
  attachments
    .filter((a) => a.document_type === 'resubmission_request')
    .forEach((notice) => {
      const { docType } = parseNotice(notice);
      if (!docType) return;
      const existing = latest.get(docType);
      if (!existing || new Date(notice.created_at).getTime() > new Date(existing.created_at).getTime()) {
        latest.set(docType, notice);
      }
    });
  return latest;
};

/**
 * Document types still waiting on the applicant. A notice is pending only
 * when no real upload of that type was made after it, so this works purely
 * from timestamps and needs no Supabase UPDATE.
 */
export const pendingResubmissionTypes = (
  attachments: TrackerAttachment[],
  latest = latestNoticesByDocType(attachments),
) => {
  const pending = new Set<string>();
  latest.forEach((notice, docType) => {
    const noticeTime = new Date(notice.created_at).getTime();
    const hasNewerUpload = attachments.some(
      (a) =>
        a.document_type === docType &&
        a.document_type !== 'resubmission_request' &&
        a.document_type !== 'resubmission_resolved' &&
        new Date(a.created_at ?? '').getTime() > noticeTime,
    );
    if (!hasNewerUpload) pending.add(docType);
  });
  return pending;
};

/**
 * Spec (Qualification Assessment Restriction): a disqualified or failed
 * application is closed, so resubmission and upload are disabled.
 */
export const isClosedApplicationStatus = (status: string) => {
  const s = String(status ?? '').toLowerCase();
  return s.includes('disqualif') || s.includes('not qualified') || s.includes('failed') || s.includes('rejected');
};

/** Which of these applications have a resubmission notice still waiting on the applicant. */
export const fetchPendingResubmissionIds = async (applicantIds: string[]): Promise<Set<string>> => {
  if (applicantIds.length === 0) return new Set();
  const { data, error } = await (supabase as any)
    .from('applicant_attachments')
    .select('id, applicant_id, file_name, file_path, document_type, created_at')
    .in('applicant_id', applicantIds);
  if (error || !Array.isArray(data)) return new Set();

  return pendingResubmissionIds(data as TrackerAttachment[]);
};

/** Reuse the document snapshot rather than querying again for list-row flags. */
export const pendingResubmissionIds = (attachments: TrackerAttachment[]): Set<string> => {
  const byApplicant = new Map<string, TrackerAttachment[]>();
  attachments.forEach((row) => {
    const id = String(row.applicant_id ?? '');
    byApplicant.set(id, [...(byApplicant.get(id) ?? []), row]);
  });

  const ids = new Set<string>();
  byApplicant.forEach((rows, id) => {
    if (pendingResubmissionTypes(rows).size > 0) ids.add(id);
  });
  return ids;
};

interface DefaultCandidate {
  id: string;
  status: string;
  exam_date: string | null;
  interview_date: string | null;
}

/**
 * The row the tracker opens first: the first application that needs the
 * applicant (a pending resubmission, Pending, an upcoming schedule, or a
 * contract to sign), otherwise the newest. Expects the list newest first, as
 * the lookup returns it.
 */
export const pickDefaultApplicationId = (
  applications: DefaultCandidate[],
  actionIds: Set<string>,
): string | null => {
  const needsApplicant = applications.find((a) => {
    if (isClosedApplicationStatus(a.status)) return false;
    const status = normalizeStatus(a.status);
    // Schedule dates stay on the row after the interview, so they only count
    // while the applicant is still waiting to attend.
    const awaitingSchedule =
      (status === 'Shortlisted' || status === 'Interview/Exam Scheduled') && !!(a.exam_date || a.interview_date);
    return actionIds.has(a.id) || status === 'Pending' || status === 'For Contract Signing' || awaitingSchedule;
  });
  return needsApplicant?.id ?? applications[0]?.id ?? null;
};
