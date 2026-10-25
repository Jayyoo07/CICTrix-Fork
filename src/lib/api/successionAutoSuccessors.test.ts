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
});
