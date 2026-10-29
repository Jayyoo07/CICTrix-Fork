import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock DB state for Supabase tables
const mockDb = {
  employees: [] as any[],
  cycles: [] as any[],
  matches: [] as any[],
  ratings: [] as any[],
  employeeCompetencies: [] as any[],
  standards: [] as any[],
  requirements: [] as any[],
};

vi.mock('../supabase', () => {
  const fakeSupabase = {
    from: vi.fn((table: string) => {
      const eqFilters: [string, any][] = [];
      const inFilters: [string, any[]][] = [];
      const isFilters: [string, any][] = [];

      const queryBuilder: any = {
        select: vi.fn((_cols = '*') => queryBuilder),
        eq: vi.fn((col: string, val: any) => {
          eqFilters.push([col, val]);
          return queryBuilder;
        }),
        in: vi.fn((col: string, vals: any[]) => {
          inFilters.push([col, vals]);
          return queryBuilder;
        }),
        is: vi.fn((col: string, val: any) => {
          isFilters.push([col, val]);
          return queryBuilder;
        }),
        order: vi.fn(() => queryBuilder),
        maybeSingle: vi.fn(async () => {
          const rows = getFilteredRows();
          return { data: rows.length > 0 ? rows[0] : null, error: null };
        }),
        then: (resolve: (val: any) => void) => {
          const rows = getFilteredRows();
          resolve({ data: rows, error: null });
        },
      };

      function getFilteredRows() {
        let tableData: any[] = [];
        switch (table) {
          case 'employees_with_department':
            tableData = mockDb.employees;
            break;
          case 'performance_cycles':
            tableData = mockDb.cycles;
            break;
          case 'ipcr_competency_matches':
            tableData = mockDb.matches;
            break;
          case 'success_indicator_ratings':
            tableData = mockDb.ratings;
            break;
          case 'employee_competencies':
            tableData = mockDb.employeeCompetencies;
            break;
          case 'competency_standards':
            tableData = mockDb.standards;
            break;
          case 'position_competency_requirements':
            tableData = mockDb.requirements;
            break;
          default:
            tableData = [];
        }

        return tableData.filter((row) => {
          for (const [col, val] of eqFilters) {
            if (row[col] === undefined) return false;
            if (typeof row[col] === 'string' && typeof val === 'string') {
              if (row[col].toLowerCase() !== val.toLowerCase()) return false;
            } else if (Number(row[col]) !== Number(val) && row[col] !== val) {
              return false;
            }
          }
          for (const [col, vals] of inFilters) {
            const rowValStr = String(row[col]);
            if (!vals.map(String).includes(rowValStr)) return false;
          }
          for (const [col, val] of isFilters) {
            if (val === null && row[col] != null) return false;
            if (val !== null && row[col] !== val) return false;
          }
          return true;
        });
      }

      return queryBuilder;
    }),
  };

  return { supabase: fakeSupabase };
});

import { getCompetencyTargetTrace, normComp } from './competencyTargetTrace';

describe('competencyTargetTrace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.employees = [];
    mockDb.cycles = [];
    mockDb.matches = [];
    mockDb.ratings = [];
    mockDb.employeeCompetencies = [];
    mockDb.standards = [];
    mockDb.requirements = [];
  });

  describe('normComp', () => {
    it('normalizes alphanumeric characters and strips whitespace', () => {
      expect(normComp('Public Relations')).toBe('publicrelations');
      expect(normComp('  Public   Relations  ')).toBe('publicrelations');
    });

    it('matches slash variations with different spacing', () => {
      const withSpaces = normComp('Fiscal Management / Budgeting for LGU');
      const withoutSpaces = normComp('Fiscal Management/Budgeting for LGU');
      const multipleSpaces = normComp('Fiscal Management   /   Budgeting for LGU');

      expect(withSpaces).toBe('fiscalmanagementbudgetingforlgu');
      expect(withoutSpaces).toBe('fiscalmanagementbudgetingforlgu');
      expect(withSpaces).toBe(withoutSpaces);
      expect(withSpaces).toBe(multipleSpaces);
    });

    it('handles hyphens and other punctuation', () => {
      expect(normComp('Self-Management')).toBe('selfmanagement');
      expect(normComp('Self Management')).toBe('selfmanagement');
      expect(normComp('Policy & Strategy (LGU)')).toBe('policystrategylgu');
      expect(normComp('Policy and Strategy (LGU)')).toBe('policyandstrategylgu');
    });

    it('handles null, undefined, and non-string inputs safely', () => {
      expect(normComp(null)).toBe('');
      expect(normComp(undefined)).toBe('');
      expect(normComp('')).toBe('');
      expect(normComp(12345)).toBe('12345');
    });
  });

  describe('getCompetencyTargetTrace', () => {
    const employeeUuid = '11111111-1111-1111-1111-111111111111';
    const employeeNumber = 'EMP-2026-001';

    beforeEach(() => {
      mockDb.employees = [
        {
          id: employeeUuid,
          employee_id: employeeNumber,
          current_position: 'Accountant III',
        },
      ];
      mockDb.standards = [
        { id: 1, competency_name: 'Fiscal Management / Budgeting for LGU', training_stream: 'CORE' },
        { id: 2, competency_name: 'Public Communication Skills', training_stream: 'LEADERSHIP' },
      ];
      mockDb.requirements = [
        { position_title: 'Accountant III', competency_id: 1, proficiency_level: 'Advanced' },
        { position_title: 'Accountant III', competency_id: 2, proficiency_level: 'Intermediate' },
      ];
    });

    it('resolves employee by employee_id or UUID', async () => {
      // By employee_id
      const resById = await getCompetencyTargetTrace({
        employeeNumber,
        competencyName: 'Fiscal Management / Budgeting for LGU',
      });
      expect(resById.position).toBe('Accountant III');
      expect(resById.required).toBe(5);
      expect(resById.requiredLevel).toBe('Advanced');
      expect(resById.requiredLevelCode).toBe('A');

      // By UUID
      const resByUuid = await getCompetencyTargetTrace({
        employeeNumber: employeeUuid,
        competencyName: 'Fiscal Management / Budgeting for LGU',
      });
      expect(resByUuid.position).toBe('Accountant III');
    });

    it('returns empty trace when employee is not found', async () => {
      const res = await getCompetencyTargetTrace({
        employeeNumber: 'NON-EXISTENT',
        competencyName: 'Fiscal Management / Budgeting for LGU',
      });

      expect(res).toEqual({
        competency: 'Fiscal Management / Budgeting for LGU',
        position: null,
        mappedTargets: [],
        aggregationMethod: 'none',
        possessedComputed: null,
        possessedStored: null,
        required: null,
        requiredLevel: null,
        requiredLevelCode: null,
      });
    });

    it('matches rows with slash whitespace variations in competency names', async () => {
      // Target in DB has NO spaces around slash: "Fiscal Management/Budgeting for LGU"
      mockDb.matches = [
        {
          employee_id: employeeUuid,
          competency: 'Fiscal Management/Budgeting for LGU',
          target_text: 'Core Function — Prepare annual budget matrix',
          confidence: 0.95,
          justification: 'High alignment with budgeting duties',
          success_indicator_id: 'si-1',
          rating_period: null,
        },
      ];
      mockDb.ratings = [
        { success_indicator_id: 'si-1', quality: 4, efficiency: 4, timeliness: 4 },
      ];
      mockDb.employeeCompetencies = [
        {
          employee_id: employeeUuid,
          proficiency_level: 4,
          competencies: { name: 'Fiscal Management/Budgeting for LGU' },
        },
      ];

      // Query has SPACES around slash: "Fiscal Management / Budgeting for LGU"
      const res = await getCompetencyTargetTrace({
        employeeNumber,
        competencyName: 'Fiscal Management / Budgeting for LGU',
      });

      expect(res.mappedTargets).toHaveLength(1);
      expect(res.mappedTargets[0].targetText).toBe('Core Function — Prepare annual budget matrix');
      expect(res.mappedTargets[0].functionType).toBe('Core Function');
      expect(res.mappedTargets[0].individualScore).toBe(4);
      expect(res.possessedComputed).toBe(4);
      expect(res.possessedStored).toBe(4);
      expect(res.required).toBe(5);
    });

    describe('semester matching', () => {
      beforeEach(() => {
        mockDb.cycles = [
          { id: 6, title: 'January–June 2026' },
          { id: 5, title: 'July–December 2025' },
        ];
      });

      it('matches numeric cycleId against semester text like "Jan - Jun 2026"', async () => {
        mockDb.matches = [
          {
            employee_id: employeeUuid,
            competency: 'Fiscal Management / Budgeting for LGU',
            target_text: 'Review disbursements',
            confidence: 0.9,
            justification: 'Cycle 6 target',
            success_indicator_id: 'si-2026',
            rating_period: 'Jan - Jun 2026',
          },
          {
            employee_id: employeeUuid,
            competency: 'Fiscal Management / Budgeting for LGU',
            target_text: 'Historical ledger audit',
            confidence: 0.85,
            justification: 'Cycle 5 target',
            success_indicator_id: 'si-2025',
            rating_period: 'Jul - Dec 2025',
          },
        ];
        mockDb.ratings = [
          { success_indicator_id: 'si-2026', quality: 5, efficiency: 5, timeliness: 5 },
          { success_indicator_id: 'si-2025', quality: 3, efficiency: 3, timeliness: 3 },
        ];

        const res = await getCompetencyTargetTrace({
          employeeNumber,
          competencyName: 'Fiscal Management / Budgeting for LGU',
          cycleId: 6,
        });

        // Should match only the cycle 6 target ('Jan - Jun 2026'), not cycle 5 ('Jul - Dec 2025')
        expect(res.mappedTargets).toHaveLength(1);
        expect(res.mappedTargets[0].targetText).toBe('Review disbursements');
        expect(res.mappedTargets[0].individualScore).toBe(5);
        expect(res.possessedComputed).toBe(5);
      });

      it('matches numeric cycleId when rating_period stores the cycle id as string "6"', async () => {
        mockDb.matches = [
          {
            employee_id: employeeUuid,
            competency: 'Fiscal Management / Budgeting for LGU',
            target_text: 'Quarterly financial statements',
            confidence: 0.92,
            justification: 'Target with cycle ID',
            success_indicator_id: 'si-cycle-id',
            rating_period: '6',
          },
        ];
        mockDb.ratings = [
          { success_indicator_id: 'si-cycle-id', quality: 4, efficiency: 4, timeliness: 4 },
        ];

        const res = await getCompetencyTargetTrace({
          employeeNumber,
          competencyName: 'Fiscal Management / Budgeting for LGU',
          cycleId: 6,
        });

        expect(res.mappedTargets).toHaveLength(1);
        expect(res.mappedTargets[0].targetText).toBe('Quarterly financial statements');
      });

      it('falls back to rating_period = null when no period-scoped match exists', async () => {
        mockDb.matches = [
          {
            employee_id: employeeUuid,
            competency: 'Fiscal Management / Budgeting for LGU',
            target_text: 'General accounting tasks',
            confidence: 0.88,
            justification: 'Unscoped target',
            success_indicator_id: 'si-null',
            rating_period: null,
          },
        ];
        mockDb.ratings = [
          { success_indicator_id: 'si-null', quality: 4, efficiency: 5, timeliness: 3 },
        ];

        const res = await getCompetencyTargetTrace({
          employeeNumber,
          competencyName: 'Fiscal Management / Budgeting for LGU',
          cycleId: 6,
        });

        expect(res.mappedTargets).toHaveLength(1);
        expect(res.mappedTargets[0].targetText).toBe('General accounting tasks');
        expect(res.mappedTargets[0].individualScore).toBe(4);
      });

      it('prioritizes exact cycle matches over unscoped (null) matches', async () => {
        mockDb.matches = [
          {
            employee_id: employeeUuid,
            competency: 'Fiscal Management / Budgeting for LGU',
            target_text: 'Cycle 6 target',
            confidence: 0.95,
            justification: 'Target for Jan-Jun 2026',
            success_indicator_id: 'si-c6',
            rating_period: 'Jan 1-Jun 30 2026',
          },
          {
            employee_id: employeeUuid,
            competency: 'Fiscal Management / Budgeting for LGU',
            target_text: 'Unscoped target',
            confidence: 0.8,
            justification: 'Unscoped fallback',
            success_indicator_id: 'si-unscoped',
            rating_period: null,
          },
        ];
        mockDb.ratings = [
          { success_indicator_id: 'si-c6', quality: 5, efficiency: 5, timeliness: 5 },
          { success_indicator_id: 'si-unscoped', quality: 3, efficiency: 3, timeliness: 3 },
        ];

        const res = await getCompetencyTargetTrace({
          employeeNumber,
          competencyName: 'Fiscal Management / Budgeting for LGU',
          cycleId: 6,
        });

        // Must pick the cycle-specific one and ignore the unscoped one
        expect(res.mappedTargets).toHaveLength(1);
        expect(res.mappedTargets[0].targetText).toBe('Cycle 6 target');
        expect(res.possessedComputed).toBe(5);
      });
    });

    describe('target scoring and aggregation', () => {
      it('calculates mean(Q, E, T) from success_indicator_ratings and aggregates into possessedComputed', async () => {
        mockDb.matches = [
          {
            employee_id: employeeUuid,
            competency: 'Fiscal Management / Budgeting for LGU',
            target_text: 'Strategic Function — Formulate 3-year LGU investment plan',
            confidence: 0.96,
            justification: 'Direct investment planning',
            success_indicator_id: 'si-score-1',
            rating_period: null,
          },
          {
            employee_id: employeeUuid,
            competency: 'Fiscal Management / Budgeting for LGU',
            target_text: 'Support Function — Monthly reconciliation of revenue accounts',
            confidence: 0.91,
            justification: 'Account reconciliation',
            success_indicator_id: 'si-score-2',
            rating_period: null,
          },
        ];
        mockDb.ratings = [
          // Target 1: Q=5, E=4, T=3 -> mean = 4.0
          { success_indicator_id: 'si-score-1', quality: 5, efficiency: 4, timeliness: 3 },
          // Target 2: Q=4, E=5, T=5 -> mean = 4.6666...
          { success_indicator_id: 'si-score-2', quality: 4, efficiency: 5, timeliness: 5 },
        ];

        const res = await getCompetencyTargetTrace({
          employeeNumber,
          competencyName: 'Fiscal Management / Budgeting for LGU',
        });

        expect(res.mappedTargets).toHaveLength(2);
        expect(res.aggregationMethod).toBe('average');

        // Target 1
        expect(res.mappedTargets[0].functionType).toBe('Strategic Function');
        expect(res.mappedTargets[0].individualScore).toBe(4);
        expect(res.mappedTargets[0].quality).toBe(5);
        expect(res.mappedTargets[0].efficiency).toBe(4);
        expect(res.mappedTargets[0].timeliness).toBe(3);
        expect(res.mappedTargets[0].confidence).toBe(0.96);
        expect(res.mappedTargets[0].justification).toBe('Direct investment planning');

        // Target 2
        expect(res.mappedTargets[1].functionType).toBe('Support Function');
        expect(res.mappedTargets[1].individualScore).toBeCloseTo(4.6667, 3);

        // Possessed computed: mean(4.0, 4.6667) = 4.3333
        expect(res.possessedComputed).toBeCloseTo((4.0 + 14 / 3) / 2, 4);
      });

      it('handles partial ratings and sets aggregationMethod to single for 1 scored target', async () => {
        mockDb.matches = [
          {
            employee_id: employeeUuid,
            competency: 'Fiscal Management / Budgeting for LGU',
            target_text: 'Single target without function prefix',
            confidence: 0.85,
            justification: null,
            success_indicator_id: 'si-single',
            rating_period: null,
          },
        ];
        // Only Q and T are present, E is null -> mean(4, 5) = 4.5
        mockDb.ratings = [
          { success_indicator_id: 'si-single', quality: 4, efficiency: null, timeliness: 5 },
        ];

        const res = await getCompetencyTargetTrace({
          employeeNumber,
          competencyName: 'Fiscal Management / Budgeting for LGU',
        });

        expect(res.mappedTargets).toHaveLength(1);
        expect(res.mappedTargets[0].functionType).toBeNull();
        expect(res.mappedTargets[0].individualScore).toBe(4.5);
        expect(res.aggregationMethod).toBe('single');
        expect(res.possessedComputed).toBe(4.5);
      });
    });

    describe('when no targets match', () => {
      it('returns aggregationMethod "none", empty mappedTargets, and null possessedComputed', async () => {
        // No matches in DB
        mockDb.matches = [];
        mockDb.employeeCompetencies = [
          {
            employee_id: employeeUuid,
            proficiency_level: 3,
            competencies: { name: 'Public Communication Skills' },
          },
        ];

        const res = await getCompetencyTargetTrace({
          employeeNumber,
          competencyName: 'Public Communication Skills',
        });

        expect(res.aggregationMethod).toBe('none');
        expect(res.mappedTargets).toEqual([]);
        expect(res.possessedComputed).toBeNull();
        // Still preserves stored possessed and required from map
        expect(res.possessedStored).toBe(3);
        expect(res.required).toBe(4);
        expect(res.requiredLevel).toBe('Intermediate');
        expect(res.requiredLevelCode).toBe('I');
      });
    });

    describe('position requirement fallback', () => {
      it('cleans parenthetical annotations to find position requirements', async () => {
        mockDb.employees = [
          {
            id: employeeUuid,
            employee_id: employeeNumber,
            current_position: 'Accountant III (Special Disbursing Officer)',
          },
        ];
        // Standard has Accountant III requirement
        mockDb.requirements = [
          { position_title: 'Accountant III', competency_id: 1, proficiency_level: 'Advanced' },
        ];

        const res = await getCompetencyTargetTrace({
          employeeNumber,
          competencyName: 'Fiscal Management / Budgeting for LGU',
        });

        expect(res.position).toBe('Accountant III (Special Disbursing Officer)');
        expect(res.required).toBe(5);
        expect(res.requiredLevel).toBe('Advanced');
      });
    });
  });
});
