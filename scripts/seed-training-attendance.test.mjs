import { describe, it, expect } from 'vitest';
import {
  computeEnrolledAt,
  effectiveStatus,
  getOfficeAffinity,
  isGeneralOrEthics,
  ACTIVE_OFFICES,
  generateTrainingAttendance,
} from './seed-training-attendance.mjs';

describe('seed-training-attendance', () => {
  it('computes enrolled_at timestamp strictly before scheduled_date', () => {
    const scheduled = '2026-07-15T09:00:00.000Z';
    const empId = '00000000-0000-0000-0000-000000000001';
    const sessionId = '11111111-1111-1111-1111-111111111111';

    const enrolled = computeEnrolledAt(scheduled, empId, sessionId);
    expect(new Date(enrolled).getTime()).toBeLessThan(new Date(scheduled).getTime());
    // Between 3 and 11 days before
    const diffDays = (new Date(scheduled).getTime() - new Date(enrolled).getTime()) / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(3);
    expect(diffDays).toBeLessThanOrEqual(11);
  });

  it('determines effectiveStatus accurately', () => {
    const now = new Date('2026-10-28T00:00:00Z');

    // Past session
    expect(
      effectiveStatus({ scheduled_date: '2026-07-01T08:00:00Z', end_date: '2026-07-02T17:00:00Z', status: 'Scheduled' }, now)
    ).toBe('Completed');

    // Future session
    expect(
      effectiveStatus({ scheduled_date: '2026-11-15T08:00:00Z', end_date: null, status: 'Scheduled' }, now)
    ).toBe('Scheduled');

    // Cancelled session
    expect(
      effectiveStatus({ scheduled_date: '2026-07-01T08:00:00Z', end_date: null, status: 'Cancelled' }, now)
    ).toBe('Cancelled');
  });

  it('scores office affinities logically', () => {
    const healthSession = { title: 'Maternal Care & Clinical Health', objectives: ['Improve clinical care'] };
    const engSession = { title: 'Infrastructure Project Management', objectives: ['Civil works management'] };
    const accSession = { title: 'LGU Fiscal Management & Budgeting', objectives: ['COA audit rules'] };

    expect(getOfficeAffinity(healthSession, 'Office of The City Health Officer')).toBe(100);
    expect(getOfficeAffinity(engSession, 'Office of The City Engineer')).toBeGreaterThanOrEqual(85);
    expect(getOfficeAffinity(accSession, 'Office of The City Accountant')).toBe(100);
  });

  it('identifies ethics and general governance sessions', () => {
    expect(isGeneralOrEthics({ title: 'Ethics in Public Service', objectives: [] })).toBe(true);
    expect(isGeneralOrEthics({ title: 'Local Governance & LGU Operations', objectives: [] })).toBe(true);
    expect(isGeneralOrEthics({ title: 'Civil Engineering Road Design', objectives: [] })).toBe(false);
  });

  it('runs generateTrainingAttendance dry run and matches target compliance percentages', async () => {
    const result = await generateTrainingAttendance({ dryRun: true, writeSql: false, applyDb: false });

    expect(result.totalEmployees).toBe(167);
    expect(result.completedSessions).toBe(32);
    expect(result.generatedEnrollments).toBe(252);

    // Target ~65% Met, ~20% Partial, ~15% None
    expect(result.metPct).toBeGreaterThanOrEqual(64);
    expect(result.metPct).toBeLessThanOrEqual(66);

    expect(result.partialPct).toBeGreaterThanOrEqual(19);
    expect(result.partialPct).toBeLessThanOrEqual(21);

    expect(result.nonePct).toBeGreaterThanOrEqual(14);
    expect(result.nonePct).toBeLessThanOrEqual(16);

    expect(result.met + result.partial + result.none).toBe(167);
  });
});
