import { describe, expect, it, vi } from 'vitest';

// The evaluator is pure, but succession.ts imports the shared client at module
// load. Nothing here exercises it, so a bare object is enough.
vi.mock('../supabase', () => ({ supabase: {} }));

import {
  evaluateAutoSuccessors,
  type AutoSuccessorContext,
} from './succession';

type Rank = { salaryGrade: number | null; levelOrder: number | null };

const rank = (salaryGrade: number | null, levelOrder: number | null = null): Rank => ({
  salaryGrade,
  levelOrder,
});

const employee = (
  id: string,
  position: string,
  education: string,
  overrides: Record<string, unknown> = {},
) => ({
  id,
  first_name: 'Ana',
  middle_name: null,
  last_name: 'Cruz',
  position,
  department: 'Engineering',
  employment_status: 'Regular',
  status: 'Active',
  highest_educational_attainment: education,
  eligibility: 'CS Professional',
  date_hired: '2018-01-01',
  position_id: null,
  ...overrides,
});

const position = (overrides: Record<string, unknown> = {}) => ({
  id: 'pos-1',
  title: 'Engineer III',
  required_education: 'Bachelor of Science in Civil Engineering',
  required_eligibility: null,
  min_ipcr_rating: null,
  min_years_experience: 0,
  required_training_hours: 0,
  required_training_categories: [],
  succession_weights: null,
  ...overrides,
});

const context = (overrides: Partial<AutoSuccessorContext> = {}): AutoSuccessorContext => ({
  rankById: new Map(),
  rankByName: new Map([
    ['engineer iii', rank(18, 3)],
    ['engineer i', rank(11, 1)],
  ]),
  employees: [],
  employeeById: new Map(),
  eligibilityByEmployee: new Map(),
  educationByEmployee: new Map(),
  eligibilityTypes: [{ name: 'CS Professional', points: 15, isActive: true }],
  pointsForFullMarks: 15,
  scores: new Map(),
  trainingByEmployee: new Map(),
  taggedByEmployee: new Map(),
  competencyRequirementsByPosition: new Map(),
  manualCandidatesByPosition: new Map(),
  ...overrides,
});

describe('evaluateAutoSuccessors', () => {
  it('ranks a candidate who clears every gate', () => {
    const emp = employee('emp-1', 'Engineer I', 'Bachelor of Science in Civil Engineering');
    const ctx = context({
      employees: [emp],
      employeeById: new Map([['emp-1', emp]]),
      eligibilityByEmployee: new Map([
        ['emp-1', [{ type: 'CS Professional', validUntil: null }]],
      ]),
      scores: new Map([
        ['emp-1', { overallScore: 4.5, adjectival: 'Outstanding', period: '2026', cycleId: 1 }],
      ]),
      trainingByEmployee: new Map([
        ['emp-1', [{
          id: 't1',
          employee_id: 'emp-1',
          training_title: 'Leadership',
          training_type: 'Leadership',
          number_of_hours: 40,
          from_date: '2025-01-01',
        }]],
      ]),
      taggedByEmployee: new Map([['emp-1', new Map([['c1', 'Leadership']])]]),
      competencyRequirementsByPosition: new Map([['pos-1', [{ id: 'c1', name: 'Leadership' }]]]),
    });

    const result = evaluateAutoSuccessors(position(), ctx);

    expect(result.qualified).toHaveLength(1);
    expect(result.qualified[0].employeeId).toBe('emp-1');
    expect(result.qualified[0].isManuallyAdded).toBe(false);
    expect(result.qualified[0].readiness.total).toBeGreaterThan(0);
    expect(result.notQualified).toEqual([]);
  });

  it('qualifies on the bachelor\u2019s field after an unrelated master\u2019s is added', () => {
    const emp = employee('emp-grad', 'Engineer I', 'Master in Public Administration');
    const ctx = context({
      employees: [emp],
      employeeById: new Map([['emp-grad', emp]]),
      eligibilityByEmployee: new Map([
        ['emp-grad', [{ type: 'CS Professional', validUntil: null }]],
      ]),
      educationByEmployee: new Map([
        ['emp-grad', [
          { level: 'College', course: 'Bachelor of Science in Civil Engineering', year_graduated: 2015 },
          { level: 'Graduate Studies', course: 'Master in Public Administration', year_graduated: 2026 },
        ]],
      ]),
    });

    const result = evaluateAutoSuccessors(position(), ctx);

    expect(result.notQualified).toEqual([]);
    expect(result.qualified).toHaveLength(1);
    expect(result.qualified[0].readiness.educationLabel).toBe('Master in Public Administration');
    // One level above the required bachelor's, relevant by title keyword: 60% of 15.
    expect(result.qualified[0].readiness.education).toBeCloseTo(9, 5);
  });

  it('reads a graduate degree from the PDS even when the legacy column is blank', () => {
    const emp = employee('emp-pds', 'Engineer I', '');
    const ctx = context({
      employees: [emp],
      employeeById: new Map([['emp-pds', emp]]),
      educationByEmployee: new Map([
        ['emp-pds', [
          { level: 'College', course: 'Bachelor of Science in Civil Engineering', year_graduated: 2020 },
        ]],
      ]),
    });

    const result = evaluateAutoSuccessors(position(), ctx);

    expect(result.notQualified).toEqual([]);
    expect(result.qualified).toHaveLength(1);
    expect(result.qualified[0].readiness.educationLabel).toBe('Bachelor of Science in Civil Engineering');
    expect(result.qualified[0].readiness.education).toBe(0);
  });

  it('uses the legacy column when a PDS row names no course', () => {
    const emp = employee('emp-partial', 'Engineer I', 'Bachelor of Science in Civil Engineering');
    const ctx = context({
      employees: [emp],
      employeeById: new Map([['emp-partial', emp]]),
      educationByEmployee: new Map([
        ['emp-partial', [{ level: 'College', course: null, year_graduated: 2015 }]],
      ]),
    });

    const result = evaluateAutoSuccessors(position(), ctx);

    expect(result.notQualified).toEqual([]);
    expect(result.qualified).toHaveLength(1);
  });

  it('keeps the legacy attainment when the highest PDS row names no degree', () => {
    // The PDS editor makes School required and Degree optional, so a graduate
    // row with a blank degree is easy to create. It must not replace a named
    // master's on file with a level label that scores zero.
    const emp = employee('emp-blank-degree', 'Engineer I', 'Master in Public Administration');
    const ctx = context({
      employees: [emp],
      employeeById: new Map([['emp-blank-degree', emp]]),
      educationByEmployee: new Map([
        ['emp-blank-degree', [
          { level: 'College', course: 'Bachelor of Science in Civil Engineering', year_graduated: 2015 },
          { level: 'Graduate Studies', course: null, year_graduated: null },
        ]],
      ]),
    });

    const result = evaluateAutoSuccessors(position(), ctx);

    expect(result.notQualified).toEqual([]);
    expect(result.qualified).toHaveLength(1);
    expect(result.qualified[0].readiness.educationLabel).toBe('Master in Public Administration');
    expect(result.qualified[0].readiness.education).toBeCloseTo(9, 5);
  });

  it('does not let a stale-low legacy column outrank a named PDS degree', () => {
    // The legacy column is stale in both directions. A graduate row with a
    // blank Degree field must not hand the label back to a column that only
    // ever recorded high school, when the PDS names a bachelor's.
    const emp = employee('emp-stale-low', 'Engineer I', 'High School Graduate');
    const ctx = context({
      employees: [emp],
      employeeById: new Map([['emp-stale-low', emp]]),
      educationByEmployee: new Map([
        ['emp-stale-low', [
          { level: 'College', course: 'Bachelor of Science in Civil Engineering', year_graduated: 2015 },
          { level: 'Graduate Studies', course: null, year_graduated: null },
        ]],
      ]),
    });

    const result = evaluateAutoSuccessors(position(), ctx);

    expect(result.qualified).toHaveLength(1);
    expect(result.qualified[0].readiness.educationLabel).toBe('Bachelor of Science in Civil Engineering');
  });

  it('falls back to the highest PDS row that names a course', () => {
    const emp = employee('emp-blank-degree-2', 'Engineer I', '');
    const ctx = context({
      employees: [emp],
      employeeById: new Map([['emp-blank-degree-2', emp]]),
      educationByEmployee: new Map([
        ['emp-blank-degree-2', [
          { level: 'College', course: 'Bachelor of Science in Civil Engineering', year_graduated: 2015 },
          { level: 'Graduate Studies', course: '  ', year_graduated: null },
        ]],
      ]),
    });

    const result = evaluateAutoSuccessors(position(), ctx);

    expect(result.qualified).toHaveLength(1);
    expect(result.qualified[0].readiness.educationLabel).toBe('Bachelor of Science in Civil Engineering');
    expect(result.qualified[0].readiness.education).toBe(0);
  });

  it('prefers the PDS rows over a mismatched legacy column', () => {
    const emp = employee('emp-mismatch', 'Engineer I', 'Bachelor of Science in Civil Engineering');
    const ctx = context({
      employees: [emp],
      employeeById: new Map([['emp-mismatch', emp]]),
      educationByEmployee: new Map([
        ['emp-mismatch', [
          { level: 'Graduate Studies', course: 'Master in Public Administration', year_graduated: 2026 },
        ]],
      ]),
    });

    const result = evaluateAutoSuccessors(position(), ctx);

    expect(result.qualified).toHaveLength(0);
    expect(result.notQualified).toHaveLength(1);
    expect(result.notQualified[0].gates.education).toBe(false);
    expect(result.notQualified[0].failedGates.join(' ')).toContain('Master in Public Administration');
  });

  it('reports a gate failure instead of ranking the candidate', () => {
    const emp = employee('emp-2', 'Engineer I', 'Bachelor of Science in Accountancy');
    const ctx = context({
      employees: [emp],
      employeeById: new Map([['emp-2', emp]]),
    });

    const result = evaluateAutoSuccessors(position(), ctx);

    expect(result.qualified).toHaveLength(0);
    expect(result.notQualified).toHaveLength(1);
    expect(result.notQualified[0].employeeId).toBe('emp-2');
    expect(result.notQualified[0].gates.education).toBe(false);
    expect(result.notQualified[0].failedGates.join(' ')).toContain('Course mismatch');
  });

  it('excludes a candidate already above the target rank', () => {
    const emp = employee('emp-3', 'Engineer III', 'Bachelor of Science in Civil Engineering');
    const ctx = context({
      employees: [emp],
      employeeById: new Map([['emp-3', emp]]),
    });

    const result = evaluateAutoSuccessors(position({ title: 'Engineer I' }), ctx);

    expect(result.qualified).toHaveLength(0);
    expect(result.downwardMovesExcluded).toBe(1);
  });

  it('keeps a manual candidate who is outside the active pool', () => {
    const manual = employee('emp-manual', 'Engineer I', 'Bachelor of Science in Accountancy');
    const ctx = context({
      employees: [],
      employeeById: new Map([['emp-manual', manual]]),
      manualCandidatesByPosition: new Map([
        ['pos-1', [{ id: 'mc-1', employee_id: 'emp-manual', note: 'Chosen by HR' }]],
      ]),
    });

    const result = evaluateAutoSuccessors(position(), ctx);

    expect(result.qualified).toHaveLength(1);
    expect(result.qualified[0]).toMatchObject({
      employeeId: 'emp-manual',
      isManuallyAdded: true,
      gatesBypassed: true,
      candidateId: 'mc-1',
      manualNote: 'Chosen by HR',
    });
  });

  it('scores a manual candidate from their PDS rows, not the legacy column', () => {
    const manual = employee('emp-manual', 'Engineer I', 'College Graduate', { department: 'Finance' });
    const ctx = context({
      employees: [],
      employeeById: new Map([['emp-manual', manual]]),
      educationByEmployee: new Map([
        ['emp-manual', [
          { level: 'College', course: 'Bachelor of Science in Civil Engineering', year_graduated: 2015 },
          { level: 'Graduate Studies', course: 'Master in Public Administration', year_graduated: 2026 },
        ]],
      ]),
      manualCandidatesByPosition: new Map([
        ['pos-1', [{ id: 'mc-1', employee_id: 'emp-manual', note: 'Chosen by HR' }]],
      ]),
    });

    const result = evaluateAutoSuccessors(position(), ctx);

    expect(result.qualified).toHaveLength(1);
    expect(result.qualified[0].readiness.educationLabel).toBe('Master in Public Administration');
    expect(result.qualified[0].readiness.education).toBeCloseTo(9, 5);
  });

  it('leaves out the incumbent and employees from another office', () => {
    const sameOffice = employee('emp-in', 'Engineer I', 'Bachelor of Science in Civil Engineering');
    const incumbent = employee('emp-inc', 'Engineer I', 'Bachelor of Science in Civil Engineering');
    const otherOffice = employee('emp-out', 'Engineer I', 'Bachelor of Science in Civil Engineering', {
      department: 'Finance',
    });
    const ctx = context({
      employees: [sameOffice, incumbent, otherOffice],
      employeeById: new Map([
        ['emp-in', sameOffice],
        ['emp-inc', incumbent],
        ['emp-out', otherOffice],
      ]),
    });

    const result = evaluateAutoSuccessors(
      position({ incumbent_employee_id: 'emp-inc' }),
      ctx,
      'Engineering',
    );

    const ids = [...result.qualified, ...result.notQualified].map((c) => c.employeeId);
    expect(ids).toEqual(['emp-in']);
  });
});
