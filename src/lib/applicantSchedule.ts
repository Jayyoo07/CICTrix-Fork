// Helpers for the Qualified Applicants "Pending Assignment" subtab:
//  - persisting an applicant's exam/interview schedule + assigned interviewer
//  - fetching the list of active raters to pick from
//
// Schema columns added by migration 007_applicant_schedule_columns.sql:
//   exam_date, exam_time, interview_date, interview_time,
//   assigned_interviewer_email

import { describeActionFailure } from './friendlyErrors';
import { supabase } from './supabase';
import { partitionForStatusAdvance, SCHEDULED_STATUS } from './scheduleSelection';

const SCHEDULE_CACHE_KEY = 'cictrix_applicant_schedules';

type ScheduleCache = Record<string, ApplicantAssignmentFields>;

const loadScheduleCache = (): ScheduleCache => {
  try { return JSON.parse(localStorage.getItem(SCHEDULE_CACHE_KEY) ?? '{}'); } catch { return {}; }
};

const writeScheduleCache = (cache: ScheduleCache) => {
  try { localStorage.setItem(SCHEDULE_CACHE_KEY, JSON.stringify(cache)); } catch { /* best-effort */ }
};

/** Returns the locally cached schedule for a given applicant id, or null. */
export const getLocalSchedule = (applicantId: string): ApplicantAssignmentFields | null =>
  loadScheduleCache()[applicantId] ?? null;

/** Merges all locally cached schedules into an applicant list, filling null
 *  schedule fields that Supabase did not return (e.g. migration not yet run). */
export const mergeLocalSchedules = <T extends { id: string } & Partial<ApplicantAssignmentFields>>(
  applicants: T[],
): T[] => {
  const cache = loadScheduleCache();
  return applicants.map((a) => {
    const cached = cache[a.id];
    if (!cached) return a;
    return {
      ...a,
      exam_date:                  a.exam_date                  ?? cached.exam_date,
      exam_time:                  a.exam_time                  ?? cached.exam_time,
      interview_date:             a.interview_date             ?? cached.interview_date,
      interview_time:             a.interview_time             ?? cached.interview_time,
      assigned_interviewer_email: a.assigned_interviewer_email ?? cached.assigned_interviewer_email,
      oral_exam_date:             (a as any).oral_exam_date    ?? cached.oral_exam_date,
      oral_exam_time:             (a as any).oral_exam_time    ?? cached.oral_exam_time,
      venue:                      (a as any).venue             ?? cached.venue,
      schedule_instructions:      (a as any).schedule_instructions ?? cached.schedule_instructions,
    };
  });
};

export interface ApplicantAssignmentFields {
  exam_date: string | null;
  exam_time: string | null;
  interview_date: string | null;
  interview_time: string | null;
  assigned_interviewer_email: string | null;
  // Spec §7 additions (migration adds the four columns below).
  oral_exam_date?: string | null;
  oral_exam_time?: string | null;
  venue?: string | null;
  schedule_instructions?: string | null;
}

export interface InterviewerOption {
  email: string;
  name: string;
  designation: string;
}

// Batch scheduling sets only the oral interview, so the written exam is not
// required for an applicant to count as scheduled.
const ASSIGNMENT_KEYS: (keyof ApplicantAssignmentFields)[] = [
  'interview_date',
  'interview_time',
  'assigned_interviewer_email',
];

/** True iff the interview date, time and rater are set — drives the progression
 *  rule from subtab 2 (Pending) to subtab 3 (Scheduled / For Interview). */
export const isApplicantFullyAssigned = (a: Partial<ApplicantAssignmentFields>): boolean =>
  ASSIGNMENT_KEYS.every((k) => {
    const v = a[k];
    return typeof v === 'string' && v.trim().length > 0;
  });

export async function saveApplicantAssignment(
  applicantId: string,
  fields: ApplicantAssignmentFields,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!applicantId) {
    return { success: false, error: 'Missing applicant id.' };
  }

  const payload = {
    exam_date: fields.exam_date || null,
    exam_time: fields.exam_time || null,
    interview_date: fields.interview_date || null,
    interview_time: fields.interview_time || null,
    assigned_interviewer_email: fields.assigned_interviewer_email || null,
    oral_exam_date: fields.oral_exam_date || null,
    oral_exam_time: fields.oral_exam_time || null,
    venue: fields.venue || null,
    schedule_instructions: fields.schedule_instructions || null,
  };

  const { error } = await (supabase as any)
    .from('applicants')
    .update(payload)
    .eq('id', applicantId);

  if (error) {
    console.error('[saveApplicantAssignment] update failed:', error);
    return { success: false, error: failureText('save the schedule', error) };
  }

  // Mirror to localStorage so Applicant Score can read schedule data even if
  // the Supabase columns aren't yet in the DB (migration pending).
  const cache = loadScheduleCache();
  cache[applicantId] = {
    exam_date: payload.exam_date,
    exam_time: payload.exam_time,
    interview_date: payload.interview_date,
    interview_time: payload.interview_time,
    assigned_interviewer_email: payload.assigned_interviewer_email,
    oral_exam_date: payload.oral_exam_date,
    oral_exam_time: payload.oral_exam_time,
    venue: payload.venue,
    schedule_instructions: payload.schedule_instructions,
  };
  writeScheduleCache(cache);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cictrix:applicants-updated'));
  }

  return { success: true };
}

export async function fetchActiveInterviewers(): Promise<InterviewerOption[]> {
  return (await fetchActiveInterviewersResult()).data;
}

/** Same list, but tells a failed read apart from "no active interviewers". */
export async function fetchActiveInterviewersResult(): Promise<{ ok: boolean; data: InterviewerOption[]; error?: unknown }> {
  let data: unknown;
  try {
    const response = await (supabase as any)
      .from('raters')
      .select('name, email, is_active')
      .order('name', { ascending: true });
    if (response.error) throw response.error;
    data = response.data;
  } catch (error) {
    console.error('[fetchActiveInterviewers] fetch failed:', error);
    return { ok: false, data: [], error };
  }

  const rows = Array.isArray(data) ? data : [];
  return { ok: true, data: rows
    .filter((r: any) => Boolean(r?.is_active) && typeof r?.email === 'string' && r.email.trim())
    .map((r: any) => ({
      email: String(r.email).trim(),
      name: String(r.name ?? r.email ?? 'Interviewer').trim(),
      designation: String(r.designation ?? '').trim(),
    })) };
}

export interface BatchScheduleInput {
  applicants: { id: string; status: string }[];
  /** YYYY-MM-DD */
  interviewDate: string;
  /** HH:mm */
  interviewTime: string;
  oralExamDate: string;
  oralExamTime: string;
  raterEmail: string;
  /** Room or meeting link. Left unchanged when blank. */
  venue?: string | null;
}

export type BatchScheduleResult =
  | { success: true; scheduled: number; advanced: number }
  | { success: false; error: string };

/**
 * Sets one interview + oral exam schedule and rater on many applicants at once, and
 * moves those still at Shortlisted to Interview/Exam Scheduled. Applicants at
 * any other status keep it. At most two updates, each checked against the rows
 * Supabase returns so a write blocked by RLS is reported instead of ignored.
 */
export async function scheduleApplicantsBatch(input: BatchScheduleInput): Promise<BatchScheduleResult> {
  if (input.applicants.length === 0) return { success: false, error: 'Select at least one applicant.' };
  if (!input.interviewDate || !input.interviewTime || !input.oralExamDate || !input.oralExamTime || !input.raterEmail.trim()) {
    return { success: false, error: 'Interview and oral exam dates and times, and a rater, are required.' };
  }

  const schedule: Record<string, string> = {
    interview_date: input.interviewDate,
    interview_time: input.interviewTime,
    oral_exam_date: input.oralExamDate,
    oral_exam_time: input.oralExamTime,
    assigned_interviewer_email: input.raterEmail.trim(),
  };
  const venue = input.venue?.trim();
  if (venue) schedule.venue = venue;

  const { advance, keep } = partitionForStatusAdvance(input.applicants);
  const batches = [
    { ids: advance, payload: { ...schedule, status: SCHEDULED_STATUS } },
    { ids: keep, payload: schedule },
  ].filter((b) => b.ids.length > 0);

  let scheduled = 0;
  for (const batch of batches) {
    const { data, error } = await (supabase as any)
      .from('applicants')
      .update(batch.payload)
      .in('id', batch.ids)
      .select('id');
    if (error) {
      console.error('[scheduleApplicantsBatch] update failed:', error);
      return { success: false, error: failureText('save the schedule', error) };
    }
    const updated = Array.isArray(data) ? data.length : 0;
    if (updated !== batch.ids.length) {
      console.error('[scheduleApplicantsBatch] rows updated mismatch', { expected: batch.ids.length, updated });
      return {
        success: false,
        error: `Only ${scheduled + updated} of ${input.applicants.length} applicants were scheduled. Check your access and try again.`,
      };
    }
    scheduled += updated;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cictrix:applicants-updated'));
  }
  return { success: true, scheduled, advanced: advance.length };
}

/** What a failed schedule write shows: what failed, that nothing saved, and the next step. Never the raw database text. */
function failureText(action: string, error: unknown): string {
  const failure = describeActionFailure(action, error);
  return `${failure.title} ${failure.message} ${failure.nextStep}`;
}
