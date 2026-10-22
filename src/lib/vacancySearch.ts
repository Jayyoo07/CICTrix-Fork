import { plantillaNumberOf } from './plantillaRules';
import type { JobPosting } from '../types/recruitment.types';

/**
 * Job Positions vs Job Vacancies (docs/plans/2026-10-22-vacancy-open-close.md).
 * A position is a job_postings row. It is Open while it has an active vacancy
 * (status Active) whose deadline has not passed in Manila; otherwise Closed.
 * The database applies the same rule (vacancy_is_open).
 */

const MANILA_TIME_ZONE = 'Asia/Manila';

/** Today's date in Manila as YYYY-MM-DD; deadlines are Manila calendar dates. */
export const manilaToday = (now = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

const deadlineDate = (deadline: string | undefined | null): string | null =>
  /^(\d{4}-\d{2}-\d{2})/.exec(String(deadline ?? ''))?.[1] ?? null;

/** Accepting applications: opened, and the deadline (11:59 PM Manila) not yet passed. */
export const isOpenVacancy = (job: JobPosting, now = new Date()): boolean => {
  if (job.status !== 'Active') return false;
  const due = deadlineDate(job.applicationDeadline);
  return due === null || due >= manilaToday(now);
};

export type PositionStatus = 'Open' | 'Closed';

export const positionStatus = (job: JobPosting, now = new Date()): PositionStatus =>
  (isOpenVacancy(job, now) ? 'Open' : 'Closed');

/**
 * A plantilla whose slot is filled is held by an employee. The public vacancy
 * table leaves it out (docs/plans/2026-10-22-vacant-jobs-exclude-filled.md);
 * Job Posts no longer tracks it.
 */
export const vacantPlantillaSlots = (job: JobPosting) =>
  (job.plantillaSlots ?? []).filter((slot) => slot.status !== 'filled');

/** Whether a position can be opened as a vacancy right now. */
export type VacancyEligibility = 'available' | 'open';

export const vacancyEligibility = (job: JobPosting, now = new Date()): VacancyEligibility =>
  (isOpenVacancy(job, now) ? 'open' : 'available');

export interface PositionMatch {
  job: JobPosting;
  eligibility: VacancyEligibility;
}

/** Plantilla numbers of a position ("21"), or its labels when they aren't numbered. */
export const plantillaNumbers = (job: JobPosting): string[] =>
  (job.plantillaSlots ?? []).map((slot) => plantillaNumberOf(slot.label) || String(slot.label ?? '').trim()).filter(Boolean);

/** Title or plantilla number contains the term. */
export const matchesTitleOrPlantilla = (job: JobPosting, term: string): boolean => {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return String(job.title ?? '').toLowerCase().includes(needle)
    || plantillaNumbers(job).some((number) => number.toLowerCase().includes(needle));
};

/** Search-as-you-type over title and plantilla number; closed positions and title-prefix matches rank first. */
export const searchPositions = (jobs: JobPosting[], term: string, limit = 8, now = new Date()): PositionMatch[] => {
  const needle = term.trim().toLowerCase();
  if (!needle) return [];
  const rank = (match: PositionMatch) =>
    (match.eligibility === 'open' ? 2 : 0) + (String(match.job.title ?? '').toLowerCase().startsWith(needle) ? 0 : 1);
  return jobs
    .filter((job) => matchesTitleOrPlantilla(job, needle))
    .map((job) => ({ job, eligibility: vacancyEligibility(job, now) }))
    .sort((a, b) => rank(a) - rank(b) || String(a.job.title).localeCompare(String(b.job.title)))
    .slice(0, limit);
};

const MS_PER_DAY = 86_400_000;
/** DESIGN_IDENTITY §10: "Closing soon" is a deadline 3 days away or less. */
const CLOSING_SOON_DAYS = 3;

/** Whole days from today in Manila to a date-only (or ISO) deadline; null when there is none. */
export const daysUntilDeadline = (deadline: string | undefined | null, now = new Date()): number | null => {
  const due = deadlineDate(deadline);
  if (!due) return null;
  return Math.round((Date.parse(due) - Date.parse(manilaToday(now))) / MS_PER_DAY);
};

export type VacancyTone = 'success' | 'warning' | 'neutral';

export const vacancyStatus = (job: JobPosting, now = new Date()): { label: string; tone: VacancyTone } => {
  if (!isOpenVacancy(job, now)) return { label: 'Closed', tone: 'neutral' };
  const days = daysUntilDeadline(job.applicationDeadline, now);
  if (days !== null && days <= CLOSING_SOON_DAYS) return { label: 'Closing soon', tone: 'warning' };
  return { label: 'Open', tone: 'success' };
};

/**
 * The RSP dashboard's posting status: a posting it would call Open stays Open
 * only while it is still accepting applications, so Per vacancy and the open
 * and closing-soon counts agree with the Job Vacancies tab.
 */
export const dashboardPostingStatus = <S extends string>(status: S, posting: JobPosting | undefined, now = new Date()): S | 'Closed' =>
  (status === 'Open' && posting && !isOpenVacancy(posting, now) ? 'Closed' : status);
