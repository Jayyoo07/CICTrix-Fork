/**
 * Written Exam total points per position (migration 20261026120000).
 *
 * The Applicant Score screen groups applicants by position title, so totals are
 * keyed by `job_postings.title`. Saving updates every posting with that title,
 * which keeps postings that share a title on one total.
 */

import { supabase as supabaseClient } from '../supabase';

// Same escape hatch used elsewhere for the generated types.
const supabase = supabaseClient as any;

/** Postgres "undefined column": the migration hasn't been applied yet. */
const UNDEFINED_COLUMN = '42703';

export type ExamTotalsResult = {
  ok: boolean;
  totals: Record<string, number>;
  /** True when the database doesn't have the column yet; every total reads as the default. */
  columnMissing?: boolean;
  error?: unknown;
};

export async function fetchWrittenExamTotals(): Promise<ExamTotalsResult> {
  try {
    const { data, error } = await supabase.from('job_postings').select('title, written_exam_total_points');
    if (error) {
      if (error.code === UNDEFINED_COLUMN) return { ok: true, totals: {}, columnMissing: true };
      throw error;
    }
    const totals: Record<string, number> = {};
    (Array.isArray(data) ? data : []).forEach((row: any) => {
      const title = String(row?.title ?? '').trim();
      const value = Number(row?.written_exam_total_points);
      if (!title || !Number.isFinite(value) || value <= 0) return;
      // Postings sharing a title are saved together; take the larger if they ever drift.
      totals[title] = Math.max(totals[title] ?? 0, value);
    });
    return { ok: true, totals };
  } catch (error) {
    console.error('[examTotalPoints] fetch failed:', error);
    return { ok: false, totals: {}, error };
  }
}

export type SaveExamTotalResult = { ok: boolean; columnMissing?: boolean; error?: unknown };

export async function saveWrittenExamTotal(positionTitle: string, total: number): Promise<SaveExamTotalResult> {
  try {
    const { error } = await supabase
      .from('job_postings')
      .update({ written_exam_total_points: total })
      .eq('title', positionTitle);
    if (error) {
      if (error.code === UNDEFINED_COLUMN) return { ok: false, columnMissing: true, error };
      throw error;
    }
    return { ok: true };
  } catch (error) {
    console.error('[examTotalPoints] save failed:', error);
    return { ok: false, error };
  }
}
