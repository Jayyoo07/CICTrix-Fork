/**
 * Opening and closing vacancies (docs/plans/2026-10-22-vacancy-open-close.md).
 *
 * Each opening is a job_vacancies row; the database functions open_vacancy and
 * close_vacancy are the only way to change it. They check the RSP role, keep
 * one active vacancy per position, and record who did what. Deadlines that
 * pass close themselves (pg_cron, migration 20261022131331).
 */

import { supabase as supabaseClient } from './supabase';

const supabase = supabaseClient as any;

export type VacancyResult<T = void> = { ok: boolean; error?: string; data?: T };

/** Reasons offered when closing early. Must match close_vacancy() in the migration. */
export const CLOSE_REASONS = [
  'Position no longer needed',
  'Budget or plantilla change',
  'Filled through other means',
  'Sufficient applicants',
  'Other',
] as const;

export type CloseReason = (typeof CLOSE_REASONS)[number];

export interface OpenVacancyInput {
  /** YYYY-MM-DD; applications close at 11:59 PM Manila on this date. */
  deadline: string;
  /** YYYY-MM-DD; defaults to today in Manila. */
  openedOn?: string;
  remarks?: string;
}

export interface ActiveVacancy {
  jobPostingId: string;
  openedOn: string;
  deadline: string | null;
}

const errorText = (error: any, fallback: string) =>
  String(error?.message ?? '').trim() || fallback;

export const openVacancy = async (jobPostingId: string, input: OpenVacancyInput): Promise<VacancyResult> => {
  const { error } = await supabase.rpc('open_vacancy', {
    p_posting_id: jobPostingId,
    p_deadline: input.deadline,
    p_opened_on: input.openedOn || null,
    p_remarks: input.remarks?.trim() || null,
  });
  return error ? { ok: false, error: errorText(error, 'We couldn\'t open this vacancy. Try again.') } : { ok: true };
};

export const closeVacancy = async (jobPostingId: string, reason: CloseReason, remarks?: string): Promise<VacancyResult> => {
  const { error } = await supabase.rpc('close_vacancy', {
    p_posting_id: jobPostingId,
    p_reason: reason,
    p_remarks: remarks?.trim() || null,
  });
  return error ? { ok: false, error: errorText(error, 'We couldn\'t close this vacancy. Try again.') } : { ok: true };
};

/** The active vacancy of every open position, keyed by posting id. */
export const listActiveVacancies = async (): Promise<Map<string, ActiveVacancy>> => {
  const byPosting = new Map<string, ActiveVacancy>();
  const { data, error } = await supabase
    .from('job_vacancies')
    .select('job_posting_id, opened_on, deadline')
    .is('closed_at', null);
  if (error) {
    console.warn('[vacancies] active vacancies fetch failed:', error);
    return byPosting;
  }
  (data ?? []).forEach((row: any) => byPosting.set(String(row.job_posting_id), {
    jobPostingId: String(row.job_posting_id),
    openedOn: String(row.opened_on ?? ''),
    deadline: row.deadline ?? null,
  }));
  return byPosting;
};
