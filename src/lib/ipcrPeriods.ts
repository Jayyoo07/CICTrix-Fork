/**
 * The canonical IPCR rating periods.
 *
 * Why this exists: `ipcr_performance` has repeatedly accumulated rows that are
 * not real, scored semesters — unrated probationary placeholders
 * ("Probationary — 1st 3 Months"), alternate labels ("2nd Half 2025"), and a
 * batch of future-dated rows running to 2055 from a buggy generator. Those rows
 * average into the same aggregates as genuine ratings, so the Summary of
 * Ratings silently drifts downward every time one lands.
 *
 * 274 such rows were removed on 2026-07-19 (backed up under `backups/`), which
 * moved the overall mean from 3.877 to 4.206. Deleting alone isn't durable
 * though — the next failed batch or stray insert reintroduces the problem. So
 * every read that aggregates ratings scopes to this list rather than trusting
 * the table to contain only good rows.
 *
 * Add a new entry here when a semester is closed and rated. An unrated,
 * in-progress period must NOT be listed: that is precisely what pulls averages
 * down.
 */

export const CANONICAL_RATING_PERIODS = [
  'Jan 1-Jun 30 2024',
  'Jul 1-Dec 31 2024',
  'Jan 1-Jun 30 2025',
  'Jul 1-Dec 31 2025',
] as const;

export type CanonicalRatingPeriod = (typeof CANONICAL_RATING_PERIODS)[number];

/** True when `period` is a closed, rated semester that may count toward averages. */
export function isCanonicalRatingPeriod(period: unknown): boolean {
  return CANONICAL_RATING_PERIODS.includes(String(period ?? '').trim() as CanonicalRatingPeriod);
}

/** Drop any row whose rating_period isn't a closed, rated semester. */
export function onlyCanonicalPeriods<T extends { rating_period?: unknown }>(rows: T[]): T[] {
  return (rows ?? []).filter((r) => isCanonicalRatingPeriod(r.rating_period));
}

/** Mutable copy for PostgREST `.in()`, which rejects a readonly tuple. */
export const canonicalPeriodList = (): string[] => [...CANONICAL_RATING_PERIODS];

/**
 * The year a rating period falls in, e.g. 2024 for 'Jul 1-Dec 31 2024'.
 *
 * Returns null for anything that does not end in a four-digit year, so an
 * unrecognised label groups on its own instead of being filed under a year it
 * does not belong to.
 */
export function periodYear(period: unknown): number | null {
  const match = String(period ?? '').trim().match(/(\d{4})$/);
  return match ? Number(match[1]) : null;
}

/**
 * Which half of the year a period covers: 1 for Jan-Jun, 2 for Jul-Dec.
 * Read from the opening month, which is the only part that distinguishes them.
 */
export function periodSemester(period: unknown): 1 | 2 | null {
  const text = String(period ?? '').trim().toLowerCase();
  if (text.startsWith('jan')) return 1;
  if (text.startsWith('jul')) return 2;
  return null;
}

export function periodSemesterLabel(period: unknown): string {
  const semester = periodSemester(period);
  if (semester === 1) return '1st Semester';
  if (semester === 2) return '2nd Semester';
  return 'Other period';
}

/**
 * Group periods into years, newest year first and the later semester first
 * within each year, which is the order the archive reads in.
 *
 * Periods with no recognisable year are collected under a null year and placed
 * last, so a stray label is visible rather than silently dropped.
 */
export function groupPeriodsByYear<T>(
  items: T[],
  periodOf: (item: T) => string,
): Array<{ year: number | null; items: T[] }> {
  const byYear = new Map<number | null, T[]>();
  for (const item of items ?? []) {
    const year = periodYear(periodOf(item));
    const bucket = byYear.get(year);
    if (bucket) bucket.push(item);
    else byYear.set(year, [item]);
  }

  return [...byYear.entries()]
    .map(([year, group]) => ({
      year,
      items: [...group].sort(
        (a, b) => (periodSemester(periodOf(b)) ?? 0) - (periodSemester(periodOf(a)) ?? 0),
      ),
    }))
    .sort((a, b) => {
      if (a.year === b.year) return 0;
      if (a.year === null) return 1;
      if (b.year === null) return -1;
      return b.year - a.year;
    });
}
