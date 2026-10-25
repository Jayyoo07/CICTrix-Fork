import { describe, expect, it } from 'vitest';
import {
  groupPeriodsByYear,
  periodSemester,
  periodSemesterLabel,
  periodYear,
  toCalendarPeriod,
} from './ipcrPeriods';

describe('periodYear', () => {
  it('reads the trailing year off a canonical period', () => {
    expect(periodYear('Jan 1-Jun 30 2024')).toBe(2024);
    expect(periodYear('Jul 1-Dec 31 2025')).toBe(2025);
  });

  it('returns null rather than guessing for an unrecognised label', () => {
    expect(periodYear('Probationary — 1st 3 Months')).toBeNull();
    expect(periodYear('')).toBeNull();
    expect(periodYear(null)).toBeNull();
  });
});

describe('periodSemester', () => {
  it('splits the year on the opening month', () => {
    expect(periodSemester('Jan 1-Jun 30 2024')).toBe(1);
    expect(periodSemester('Jul 1-Dec 31 2024')).toBe(2);
  });

  it('labels an unknown period without pretending it is a semester', () => {
    expect(periodSemester('2nd Half 2025')).toBeNull();
    expect(periodSemesterLabel('2nd Half 2025')).toBe('Other period');
  });

  it('labels the known halves', () => {
    expect(periodSemesterLabel('Jan 1-Jun 30 2024')).toBe('1st Semester');
    expect(periodSemesterLabel('Jul 1-Dec 31 2024')).toBe('2nd Semester');
  });
});

describe('groupPeriodsByYear', () => {
  const sem = (period: string) => ({ period });

  it('puts the newest year first and the later semester first within it', () => {
    const grouped = groupPeriodsByYear(
      [
        sem('Jan 1-Jun 30 2024'),
        sem('Jul 1-Dec 31 2025'),
        sem('Jul 1-Dec 31 2024'),
        sem('Jan 1-Jun 30 2025'),
      ],
      (s) => s.period,
    );

    expect(grouped.map((g) => g.year)).toEqual([2025, 2024]);
    expect(grouped[0].items.map((s) => s.period)).toEqual([
      'Jul 1-Dec 31 2025',
      'Jan 1-Jun 30 2025',
    ]);
    expect(grouped[1].items.map((s) => s.period)).toEqual([
      'Jul 1-Dec 31 2024',
      'Jan 1-Jun 30 2024',
    ]);
  });

  it('keeps an unrecognised period visible, grouped last', () => {
    const grouped = groupPeriodsByYear(
      [sem('Probationary — 1st 3 Months'), sem('Jan 1-Jun 30 2024')],
      (s) => s.period,
    );
    expect(grouped.map((g) => g.year)).toEqual([2024, null]);
    expect(grouped[1].items).toHaveLength(1);
  });

  it('handles an empty list', () => {
    expect(groupPeriodsByYear([], (s: { period: string }) => s.period)).toEqual([]);
  });
});

describe('toCalendarPeriod', () => {
  it('translates 1st Half to January–June with an en-dash', () => {
    expect(toCalendarPeriod('1st Half 2026')).toBe('January\u2013June 2026');
    expect(toCalendarPeriod('1st half 2025')).toBe('January\u2013June 2025');
  });

  it('translates 2nd Half to July–December with an en-dash', () => {
    expect(toCalendarPeriod('2nd Half 2026')).toBe('July\u2013December 2026');
    expect(toCalendarPeriod('2nd half 2025')).toBe('July\u2013December 2025');
  });

  it('returns null for non-half labels', () => {
    expect(toCalendarPeriod('Probationary — 1st 3 Months')).toBeNull();
    expect(toCalendarPeriod('Jul-Dec 2026')).toBeNull();
    expect(toCalendarPeriod('January–June 2026')).toBeNull();
    expect(toCalendarPeriod('')).toBeNull();
    expect(toCalendarPeriod(null)).toBeNull();
  });
});
