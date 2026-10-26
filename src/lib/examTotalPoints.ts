/**
 * Written Exam total points (docs/plans/2026-10-26-exam-total-points.md).
 *
 * RSP sets the maximum raw points of the Written Exam per position. Raw scores
 * are validated against it and converted into a fixed share of the overall
 * score. Pure helpers only; the read/write lives in src/lib/api/examTotalPoints.ts.
 */

/** The value every exam used before it became configurable. */
export const DEFAULT_WRITTEN_EXAM_TOTAL = 100;

/** Points the Written Exam contributes on the Applicant Score screen. */
export const WRITTEN_EXAM_SHARE = 30;

/** Points the Written Exam contributes on the printed point-based assessment form. */
export const WRITTEN_EXAM_FORM_SHARE = 20;

/** Only the RSP portal edits total points; the super admin is a read-only viewer. */
export const canEditExamTotal = (role: string | null | undefined): boolean => role === 'rsp';

const isWholeNumber = (value: string) => /^\d+$/.test(value.trim());

/** Error message for a total-points input, or null when it is valid. Integers only. */
export const validateTotalPoints = (value: string): string | null => {
  if (value.trim() === '') return 'Enter the total points.';
  if (!isWholeNumber(value) || Number(value) <= 0) return 'Total points must be a whole number greater than 0.';
  return null;
};

/** Error message for a raw score input, or null when it is valid or empty. */
export const validateExamScore = (value: string, total: number): string | null => {
  if (value.trim() === '') return null;
  if (!isWholeNumber(value)) return 'Score must be a whole number of 0 or more.';
  if (Number(value) > total) return `Score cannot exceed the total points (${total}).`;
  return null;
};

export type ConvertedExamScore = {
  points: number;
  /** True when the saved raw score is above the current total, e.g. entered in another browser. */
  exceedsTotal: boolean;
};

/**
 * Converts a raw score into its share of the overall score, never more than
 * the share itself. A raw score above the total is capped and flagged.
 */
export const convertExamScore = (
  raw: number | null | undefined,
  total: number,
  share: number = WRITTEN_EXAM_SHARE,
): ConvertedExamScore => {
  const value = typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, raw) : 0;
  const safeTotal = total > 0 ? total : DEFAULT_WRITTEN_EXAM_TOTAL;
  const exceedsTotal = value > safeTotal;
  const points = +(Math.min(value / safeTotal, 1) * share).toFixed(2);
  return { points, exceedsTotal };
};

export type ScoredApplicant = { id: string; name: string; score: number | null };

/** Applicants whose entered score is above a proposed new total. */
export const findScoresAboveTotal = (applicants: ScoredApplicant[], newTotal: number): ScoredApplicant[] =>
  applicants.filter((a) => typeof a.score === 'number' && a.score > newTotal);

/** Message shown when lowering the total is blocked, or null when nothing blocks it. */
export const describeBlockedTotal = (affected: ScoredApplicant[], newTotal: number): string | null => {
  if (affected.length === 0) return null;
  const list = affected.map((a) => `${a.name} (${a.score})`).join(', ');
  return `Total points can't be lowered to ${newTotal}: ${affected.length === 1 ? 'this applicant has' : 'these applicants have'} a higher score: ${list}. Change their scores first.`;
};

/** "85 / 100", or "—" when there is no score. */
export const formatScoreOverTotal = (score: number | null | undefined, total: number): string =>
  typeof score === 'number' && Number.isFinite(score) ? `${score} / ${total}` : '—';

/** Total for a position, falling back to the default when none is stored. */
export const totalForPosition = (totals: Record<string, number>, position: string | null | undefined): number => {
  const value = position ? totals[position] : undefined;
  return typeof value === 'number' && value > 0 ? value : DEFAULT_WRITTEN_EXAM_TOTAL;
};
