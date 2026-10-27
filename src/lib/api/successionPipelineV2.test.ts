import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parsePositionRequirementsV2,
  normalizeDegree,
  fetchSuccessionPoolV2,
} from './successionPipelineV2';
import { supabase } from '../supabase';
import * as successionReviews from './successionReviews';
import * as successionApi from './succession';

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('successionPipelineV2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parsePositionRequirementsV2', () => {
    it('parses typical plantilla position requirements', () => {
      const res = parsePositionRequirementsV2({
        min_years_experience: 3,
        required_training_hours: 40,
        required_education: "Bachelor's Degree in Computer Science",
        required_eligibility: 'CSC Professional',
      });

      expect(res.experienceYears).toBe(3);
      expect(res.trainingHours).toBe(40);
      expect(res.education?.minimum).toBe('bachelor');
      expect(res.education?.field).toBe('Computer Science');
      expect(res.eligibility).toEqual({ kind: 'required', key: 'CSC Professional' });
    });

    it('handles master and doctorate requirements', () => {
      const masterRes = parsePositionRequirementsV2({
        required_education: 'Master in Public Administration',
      });
      expect(masterRes.education?.minimum).toBe('master');

      const docRes = parsePositionRequirementsV2({
        required_education: 'Doctorate in Education',
      });
      expect(docRes.education?.minimum).toBe('doctorate');
    });

    it('handles none required eligibility', () => {
      const noneRes = parsePositionRequirementsV2({
        required_eligibility: 'None required',
      });
      expect(noneRes.eligibility).toEqual({ kind: 'none' });
    });
  });

  describe('normalizeDegree', () => {
    it('normalizes professional degrees', () => {
      expect(normalizeDegree('Post-Graduate', 'Doctor of Medicine (MD)')).toBe('MD');
      expect(normalizeDegree(null, 'Juris Doctor (JD)')).toBe('JD');
      expect(normalizeDegree('Law', 'Bachelor of Laws (LLB)')).toBe('LLB');
    });

    it('normalizes standard degrees', () => {
      expect(normalizeDegree('College', 'BS Information Technology')).toBe('bachelor');
      expect(normalizeDegree('Masteral', 'MS Computer Science')).toBe('master');
      expect(normalizeDegree('Doctoral', 'PhD in Public Administration')).toBe('doctorate');
    });
  });

  describe('fetchSuccessionPoolV2', () => {
    it('evaluates candidates and partitions them by status', async () => {
      // Mock critical_positions
      const mockSinglePos = vi.fn().mockResolvedValue({
        data: {
          id: 'pos-1',
          title: 'IT Officer II',
          department_id: 'dept-1',
          min_years_experience: 2,
          required_training_hours: 40,
          required_education: "Bachelor's Degree in IT",
          required_eligibility: 'CSC Professional',
        },
        error: null,
      });

      // Mock employees
      const mockEmps = [
        {
          id: 'emp-1',
          first_name: 'Juan',
          last_name: 'Dela Cruz',
          department_id: 'dept-1',
          date_hired: '2020-01-01',
        },
        {
          id: 'emp-2',
          first_name: 'Maria',
          last_name: 'Santos',
          department_id: 'dept-1',
          date_hired: '2022-01-01',
        },
      ];

      // Mock reviews
      vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([
        // emp-1 has complete reviews
        {
          id: 'rev-w1',
          criticalPositionId: 'pos-1',
          employeeId: 'emp-1',
          criterion: 'work',
          sourceRecordId: 'work-1',
          isRelevant: true,
          isCityHall: true,
          matchesRequirement: null,
          evidenceSnapshot: { from_date: '2020-01-01', to_date: '2024-01-01', is_present: false, position_title: 'IT Staff' },
          requirementsSnapshot: { experienceYears: 2, trainingHours: 40, education: { minimum: 'bachelor', field: 'IT' }, eligibility: { kind: 'required', key: 'CSC Professional' } },
          reviewedBy: 'Admin',
          reviewedAt: '2026-10-28',
          createdAt: '2026-10-28',
          updatedAt: '2026-10-28',
        },
        {
          id: 'rev-t1',
          criticalPositionId: 'pos-1',
          employeeId: 'emp-1',
          criterion: 'training',
          sourceRecordId: 't-1',
          isRelevant: true,
          isCityHall: true,
          matchesRequirement: null,
          evidenceSnapshot: { title: 'Network Admin', hours: 80, from_date: '2023-01-01', to_date: '2023-01-10' },
          requirementsSnapshot: { experienceYears: 2, trainingHours: 40, education: { minimum: 'bachelor', field: 'IT' }, eligibility: { kind: 'required', key: 'CSC Professional' } },
          reviewedBy: 'Admin',
          reviewedAt: '2026-10-28',
          createdAt: '2026-10-28',
          updatedAt: '2026-10-28',
        },
        {
          id: 'rev-ed1',
          criticalPositionId: 'pos-1',
          employeeId: 'emp-1',
          criterion: 'education',
          sourceRecordId: 'ed-1',
          isRelevant: true,
          isCityHall: null,
          matchesRequirement: true,
          evidenceSnapshot: { level: 'College', course: 'BS Information Technology' },
          requirementsSnapshot: { experienceYears: 2, trainingHours: 40, education: { minimum: 'bachelor', field: 'IT' }, eligibility: { kind: 'required', key: 'CSC Professional' } },
          reviewedBy: 'Admin',
          reviewedAt: '2026-10-28',
          createdAt: '2026-10-28',
          updatedAt: '2026-10-28',
        },
        {
          id: 'rev-el1',
          criticalPositionId: 'pos-1',
          employeeId: 'emp-1',
          criterion: 'eligibility',
          sourceRecordId: 'el-1',
          isRelevant: true,
          isCityHall: null,
          matchesRequirement: true,
          evidenceSnapshot: { eligibility_type: 'CSC Professional', validity_date: null },
          requirementsSnapshot: { experienceYears: 2, trainingHours: 40, education: { minimum: 'bachelor', field: 'IT' }, eligibility: { kind: 'required', key: 'CSC Professional' } },
          reviewedBy: 'Admin',
          reviewedAt: '2026-10-28',
          createdAt: '2026-10-28',
          updatedAt: '2026-10-28',
        },
      ]);

      vi.spyOn(successionApi, 'getLatestOverallScores').mockResolvedValue(
        new Map([
          ['emp-1', { overallScore: 4.8, adjectival: 'Outstanding', period: '2025 H2', cycleId: 1 }],
          ['emp-2', { overallScore: 4.0, adjectival: 'Very Satisfactory', period: '2025 H2', cycleId: 1 }],
        ]),
      );

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'critical_positions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: mockSinglePos }),
            }),
          };
        }
        if (table === 'succession_candidates') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === 'employees') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockEmps, error: null }),
            }),
          };
        }
        if (table === 'employee_work_experience') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'work-1',
                    employee_id: 'emp-1',
                    from_date: '2020-01-01',
                    to_date: '2024-01-01',
                    is_present: false,
                    position_title: 'IT Staff',
                  },
                  {
                    id: 'work-2',
                    employee_id: 'emp-2',
                    from_date: '2021-01-01',
                    to_date: '2024-01-01',
                    is_present: false,
                    position_title: 'Computer Operator',
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'employee_training') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 't-1',
                    employee_id: 'emp-1',
                    training_title: 'Network Admin',
                    number_of_hours: 80,
                    from_date: '2023-01-01',
                    to_date: '2023-01-10',
                    conducted_by: 'CSC',
                  },
                  {
                    id: 't-2',
                    employee_id: 'emp-2',
                    training_title: 'Database Admin',
                    number_of_hours: 50,
                    from_date: '2023-02-01',
                    to_date: '2023-02-10',
                    conducted_by: 'DICT',
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'employee_education') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'ed-1',
                    employee_id: 'emp-1',
                    level: 'College',
                    course: 'BS Information Technology',
                  },
                  {
                    id: 'ed-2',
                    employee_id: 'emp-2',
                    level: 'College',
                    course: 'BS Business Administration',
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'employee_eligibility') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'el-1',
                    employee_id: 'emp-1',
                    eligibility_type: 'CSC Professional',
                    validity_date: null,
                  },
                  {
                    id: 'el-2',
                    employee_id: 'emp-2',
                    eligibility_type: 'CSC Professional',
                    validity_date: null,
                  },
                ],
                error: null,
              }),
            }),
          };
        }
        if (table === 'critical_position_competency_requirements') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          };
        }
        if (table === 'employee_training_competencies') {
          return {
            select: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), in: vi.fn().mockResolvedValue({ data: [] }) };
      });

      const pool = await fetchSuccessionPoolV2('pos-1', '2026-10-28');
      expect(pool.positionId).toBe('pos-1');

      // emp-1 has complete reviews and meets minimums -> ranked
      expect(pool.ranked.length).toBe(1);
      expect(pool.ranked[0].candidate.employeeId).toBe('emp-1');
      expect(pool.ranked[0].rank).toBe(1);
      expect(pool.ranked[0].total).toBeGreaterThan(0);

      // emp-2 has unreviewed evidence -> needsReview
      expect(pool.needsReview.length).toBe(1);
      expect(pool.needsReview[0].candidate.employeeId).toBe('emp-2');
      expect(pool.configurationNeeded.length).toBe(0);
      expect(pool.excluded.length).toBe(0);
    });

    it('identifies configuration-needed when position has missing requirements', async () => {
      const mockSinglePos = vi.fn().mockResolvedValue({
        data: {
          id: 'pos-2',
          title: 'Unconfigured Position',
          department_id: 'dept-1',
          min_years_experience: null, // missing experience requirement
          required_training_hours: null,
          required_education: null,
          required_eligibility: null,
        },
        error: null,
      });

      (supabase.from as any).mockImplementation((table: string) => {
        if (table === 'critical_positions') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: mockSinglePos }),
            }),
          };
        }
        if (table === 'succession_candidates') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [] }) }) };
        }
        if (table === 'employees') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: 'emp-1', first_name: 'Ana', last_name: 'Cruz' }],
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: [] }),
            eq: vi.fn().mockResolvedValue({ data: [] }),
          }),
        };
      });

      vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([]);
      vi.spyOn(successionApi, 'getLatestOverallScores').mockResolvedValue(new Map());

      const pool = await fetchSuccessionPoolV2('pos-2');
      expect(pool.configurationNeeded.length).toBe(1);
      expect(pool.ranked.length).toBe(0);
    });
  });
});
