import type { JobPosting } from '../types/recruitment.types';

/**
 * Job Positions vs Job Vacancies (docs/plans/2026-10-19-job-post-split.md).
 * A position is a job_postings row; it is a vacancy once opened (Active),
 * and stays listed as one after it is closed.
 */

/** Whether a position can be opened as a vacancy right now. */
export type VacancyEligibility = 'available' | 'open' | 'filled';

export const vacancyEligibility = (job: JobPosting): VacancyEligibility =>
  job.status === 'Active' ? 'open' : job.status === 'Filled' ? 'filled' : 'available';

/**
 * A plantilla whose slot is filled is held by an employee, so it is not a
 * vacancy (docs/plans/2026-10-22-vacant-jobs-exclude-filled.md). The slot
 * status is the one source of truth; it turns filled when a hire is placed.
 */
export const vacantPlantillaSlots = (job: JobPosting) =>
  (job.plantillaSlots ?? []).filter((slot) => slot.status !== 'filled');

/** A posting with no slot rows (legacy) has nothing recorded as filled. */
export const hasVacantPlantilla = (job: JobPosting) =>
  !job.plantillaSlots?.length || vacantPlantillaSlots(job).length > 0;

/** Rows the Job Vacancies tab lists. Draft = defined but never opened. */
export const isOpenedVacancy = (job: JobPosting) =>
  (job.status === 'Active' || job.status === 'Closed') && hasVacantPlantilla(job);

export interface PositionMatch {
  job: JobPosting;
  eligibility: VacancyEligibility;
}

/** Search-as-you-type over title and department; titles starting with the term rank first. */
export const searchPositions = (jobs: JobPosting[], term: string, limit = 8): PositionMatch[] => {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];
  const rank = (job: JobPosting) => (String(job.title ?? '').toLowerCase().startsWith(needle) ? 0 : 1);
  return jobs
    .filter((job) =>
      String(job.title ?? '').toLowerCase().includes(needle) ||
      String(job.department ?? '').toLowerCase().includes(needle))
    .sort((a, b) => rank(a) - rank(b) || String(a.title).localeCompare(String(b.title)))
    .slice(0, limit)
    .map((job) => ({ job, eligibility: vacancyEligibility(job) }));
};

const MS_PER_DAY = 86_400_000;
/** DESIGN_IDENTITY §10: "Closing soon" is a deadline 3 days away or less. */
const CLOSING_SOON_DAYS = 3;

/** Whole days from `today` to a date-only (or ISO) deadline; null when there is none. */
export const daysUntilDeadline = (deadline: string | undefined | null, today = new Date()): number | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(deadline ?? ''));
  if (!match) return null;
  const due = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const now = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due - now) / MS_PER_DAY);
};

export type VacancyTone = 'success' | 'warning' | 'neutral';

export const vacancyStatus = (job: JobPosting, today = new Date()): { label: string; tone: VacancyTone } => {
  if (job.status !== 'Active') return { label: 'Closed', tone: 'neutral' };
  const days = daysUntilDeadline(job.applicationDeadline, today);
  if (days === null) return { label: 'Open', tone: 'success' };
  if (days < 0) return { label: 'Deadline passed', tone: 'neutral' };
  if (days <= CLOSING_SOON_DAYS) return { label: 'Closing soon', tone: 'warning' };
  return { label: 'Open', tone: 'success' };
};
