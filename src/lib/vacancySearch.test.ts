import { describe, expect, it } from 'vitest';
import { daysUntilDeadline, isOpenedVacancy, searchPositions, vacancyEligibility, vacancyStatus, vacantPlantillaSlots } from './vacancySearch';
import type { JobPosting } from '../types/recruitment.types';

const job = (title: string, status: JobPosting['status'], department = 'City Engineering Office', applicationDeadline = ''): JobPosting =>
  ({ id: title, title, status, department, applicationDeadline } as JobPosting);

const today = new Date(2026, 9, 19); // Oct 19, 2026, local midnight

describe('vacancyEligibility', () => {
  it('lets only positions that are not open and not filled be opened', () => {
    expect(vacancyEligibility(job('A', 'Draft'))).toBe('available');
    expect(vacancyEligibility(job('A', 'Closed'))).toBe('available');
    expect(vacancyEligibility(job('A', 'Active'))).toBe('open');
    expect(vacancyEligibility(job('A', 'Filled'))).toBe('filled');
  });
});

describe('isOpenedVacancy', () => {
  it('lists open and closed vacancies, not unopened drafts or filled posts', () => {
    expect(isOpenedVacancy(job('A', 'Active'))).toBe(true);
    expect(isOpenedVacancy(job('A', 'Closed'))).toBe(true);
    expect(isOpenedVacancy(job('A', 'Draft'))).toBe(false);
    expect(isOpenedVacancy(job('A', 'Filled'))).toBe(false);
  });

  it('drops a posting once every plantilla is filled', () => {
    const withSlots = (statuses: Array<'open' | 'filled' | 'closed'>) => ({
      ...job('A', 'Active'),
      plantillaSlots: statuses.map((status, i) => ({ id: `s${i}`, jobPostingId: 'A', slotNumber: i + 1, itemNumber: `PLT-${i}`, status })),
    }) as JobPosting;
    expect(isOpenedVacancy(withSlots(['open', 'filled']))).toBe(true);
    expect(isOpenedVacancy(withSlots(['closed']))).toBe(true);
    expect(isOpenedVacancy(withSlots(['filled', 'filled']))).toBe(false);
    expect(vacantPlantillaSlots(withSlots(['open', 'filled', 'closed'])).map((s) => s.status)).toEqual(['open', 'closed']);
  });
});

describe('searchPositions', () => {
  const jobs = [
    job('Nurse II', 'Draft', 'City Health Office'),
    job('Engineer III', 'Active'),
    job('Administrative Officer IV', 'Draft', 'Human Resource Management Office'),
    job('Engineer I', 'Draft'),
  ];

  it('returns nothing for a blank term', () => {
    expect(searchPositions(jobs, '  ')).toEqual([]);
  });

  it('matches from a single letter, case-insensitively, on title or department', () => {
    expect(searchPositions(jobs, 'E').map((r) => r.job.title)).toContain('Engineer III');
    expect(searchPositions(jobs, 'health').map((r) => r.job.title)).toEqual(['Nurse II']);
  });

  it('ranks titles that start with the term first', () => {
    expect(searchPositions(jobs, 'eng').map((r) => r.job.title)).toEqual(['Engineer I', 'Engineer III']);
    expect(searchPositions(jobs, 'n')[0].job.title).toBe('Nurse II');
  });

  it('reports eligibility so open and filled positions can be shown but not picked', () => {
    const results = searchPositions(jobs, 'engineer');
    expect(results.find((r) => r.job.title === 'Engineer III')?.eligibility).toBe('open');
    expect(results.find((r) => r.job.title === 'Engineer I')?.eligibility).toBe('available');
  });
});

describe('daysUntilDeadline / vacancyStatus', () => {
  it('counts whole days to a date-only deadline', () => {
    expect(daysUntilDeadline('2026-10-22', today)).toBe(3);
    expect(daysUntilDeadline('2026-10-22T00:00:00.000Z', today)).toBe(3);
    expect(daysUntilDeadline('', today)).toBeNull();
  });

  it('maps to the §10 vacancy statuses', () => {
    expect(vacancyStatus(job('A', 'Active', '', '2026-11-15'), today)).toEqual({ label: 'Open', tone: 'success' });
    expect(vacancyStatus(job('A', 'Active', '', '2026-10-22'), today)).toEqual({ label: 'Closing soon', tone: 'warning' });
    expect(vacancyStatus(job('A', 'Active', '', '2026-10-19'), today)).toEqual({ label: 'Closing soon', tone: 'warning' });
    expect(vacancyStatus(job('A', 'Active', '', '2026-10-18'), today)).toEqual({ label: 'Deadline passed', tone: 'neutral' });
    expect(vacancyStatus(job('A', 'Closed', '', '2026-11-15'), today)).toEqual({ label: 'Closed', tone: 'neutral' });
  });
});
