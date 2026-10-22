import { describe, expect, it } from 'vitest';
import {
  daysUntilDeadline, dashboardPostingStatus, isOpenVacancy, manilaToday, positionStatus, searchPositions, vacancyEligibility, vacancyStatus, vacantPlantillaSlots,
} from './vacancySearch';
import type { JobPosting } from '../types/recruitment.types';

const job = (title: string, status: JobPosting['status'], applicationDeadline = '', labels: string[] = []): JobPosting =>
  ({
    id: title, title, status, department: 'City Engineering Office', applicationDeadline,
    plantillaSlots: labels.map((label, i) => ({ id: `${title}-${i}`, jobPostingId: title, slotNumber: i + 1, itemNumber: `PLT-${i}`, label, status: 'open' })),
  } as JobPosting);

const today = new Date('2026-10-19T04:00:00Z'); // Oct 19, 2026, noon in Manila

describe('manilaToday', () => {
  it('uses the Manila date, not UTC', () => {
    expect(manilaToday(new Date('2026-10-22T15:59:00Z'))).toBe('2026-10-22'); // 11:59 PM Manila
    expect(manilaToday(new Date('2026-10-22T16:00:00Z'))).toBe('2026-10-23'); // midnight Manila
  });
});

describe('isOpenVacancy / positionStatus', () => {
  it('is Open only while opened and on or before the deadline in Manila', () => {
    expect(isOpenVacancy(job('A', 'Active', '2026-10-22'), new Date('2026-10-22T15:59:00Z'))).toBe(true);
    expect(isOpenVacancy(job('A', 'Active', '2026-10-22'), new Date('2026-10-22T16:00:00Z'))).toBe(false);
    expect(isOpenVacancy(job('A', 'Active'), today)).toBe(true);
  });

  it('reads everything else as Closed', () => {
    expect(positionStatus(job('A', 'Active', '2026-11-15'), today)).toBe('Open');
    expect(positionStatus(job('A', 'Draft', '2026-11-15'), today)).toBe('Closed');
    expect(positionStatus(job('A', 'Closed', '2026-11-15'), today)).toBe('Closed');
    expect(positionStatus(job('A', 'Active', '2026-10-18'), today)).toBe('Closed');
  });
});

describe('vacancyEligibility', () => {
  it('lets any closed position be opened, including one past its deadline', () => {
    expect(vacancyEligibility(job('A', 'Draft'), today)).toBe('available');
    expect(vacancyEligibility(job('A', 'Closed'), today)).toBe('available');
    expect(vacancyEligibility(job('A', 'Active', '2026-10-18'), today)).toBe('available');
    expect(vacancyEligibility(job('A', 'Active', '2026-11-15'), today)).toBe('open');
  });
});

describe('vacantPlantillaSlots', () => {
  it('leaves filled plantillas out (public vacancy table)', () => {
    const withSlots = { ...job('A', 'Active'), plantillaSlots: (['open', 'filled', 'closed'] as const).map((status, i) => ({ id: `s${i}`, jobPostingId: 'A', slotNumber: i + 1, itemNumber: `PLT-${i}`, status })) } as JobPosting;
    expect(vacantPlantillaSlots(withSlots).map((s) => s.status)).toEqual(['open', 'closed']);
  });
});

describe('searchPositions', () => {
  const jobs = [
    job('Nurse II', 'Draft', '', ['Plantilla 104']),
    job('Engineer III', 'Active', '2026-11-15', ['Plantilla 21']),
    job('Administrative Officer IV', 'Draft', '', ['Plantilla 7']),
    job('Engineer I', 'Closed', '', ['Plantilla 210']),
  ];

  it('returns nothing for a blank term', () => {
    expect(searchPositions(jobs, '  ', 8, today)).toEqual([]);
  });

  it('matches title or plantilla number, case-insensitively', () => {
    expect(searchPositions(jobs, 'E', 8, today).map((r) => r.job.title)).toContain('Engineer III');
    expect(searchPositions(jobs, '104', 8, today).map((r) => r.job.title)).toEqual(['Nurse II']);
    expect(searchPositions(jobs, '21', 8, today).map((r) => r.job.title)).toEqual(['Engineer I', 'Engineer III']);
  });

  it('ranks closed positions and title-prefix matches first', () => {
    expect(searchPositions(jobs, 'eng', 8, today).map((r) => r.job.title)).toEqual(['Engineer I', 'Engineer III']);
    expect(searchPositions(jobs, 'n', 8, today)[0].job.title).toBe('Nurse II');
  });

  it('reports open positions so they can be shown but not picked', () => {
    const results = searchPositions(jobs, 'engineer', 8, today);
    expect(results.find((r) => r.job.title === 'Engineer III')?.eligibility).toBe('open');
    expect(results.find((r) => r.job.title === 'Engineer I')?.eligibility).toBe('available');
  });
});

describe('daysUntilDeadline / vacancyStatus', () => {
  it('counts whole Manila days to a date-only deadline', () => {
    expect(daysUntilDeadline('2026-10-22', today)).toBe(3);
    expect(daysUntilDeadline('2026-10-22T00:00:00.000Z', today)).toBe(3);
    expect(daysUntilDeadline('', today)).toBeNull();
  });

  it('maps open vacancies to the §10 statuses', () => {
    expect(vacancyStatus(job('A', 'Active', '2026-11-15'), today)).toEqual({ label: 'Open', tone: 'success' });
    expect(vacancyStatus(job('A', 'Active', '2026-10-22'), today)).toEqual({ label: 'Closing soon', tone: 'warning' });
    expect(vacancyStatus(job('A', 'Active', '2026-10-19'), today)).toEqual({ label: 'Closing soon', tone: 'warning' });
    expect(vacancyStatus(job('A', 'Active', '2026-10-18'), today)).toEqual({ label: 'Closed', tone: 'neutral' });
    expect(vacancyStatus(job('A', 'Closed', '2026-11-15'), today)).toEqual({ label: 'Closed', tone: 'neutral' });
  });
});

describe('dashboardPostingStatus', () => {
  it('closes an Open posting whose deadline has passed, and leaves the rest alone', () => {
    expect(dashboardPostingStatus('Open', job('A', 'Active', '2026-10-18'), today)).toBe('Closed');
    expect(dashboardPostingStatus('Open', job('A', 'Active', '2026-11-15'), today)).toBe('Open');
    expect(dashboardPostingStatus('Reviewing', job('A', 'Draft'), today)).toBe('Reviewing');
    expect(dashboardPostingStatus('Open', undefined, today)).toBe('Open');
  });
});
