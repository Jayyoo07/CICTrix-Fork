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
    it('discovers department employees, applies fallbacks, and ranks candidates', async () => {
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
          incumbent_employee_id: 'emp-incumbent',
        },
        error: null,
      });

      // Mock department lookup
      const mockSingleDept = vi.fn().mockResolvedValue({
        data: { id: 'dept-1', name: 'Information Technology Office' },
        error: null,
      });

      // Mock active employees in department
      const mockEmps = [
        {
          id: 'emp-1',
          first_name: 'Juan',
          last_name: 'Dela Cruz',
          position: 'IT Officer I',
          department: 'Information Technology Office',
          employment_status: 'Regular',
          date_hired: '2020-01-01',
          highest_educational_attainment: 'BS Information Technology',
          eligibility: 'CSC Professional',
        },
        {
          id: 'emp-2',
          first_name: 'Maria',
          last_name: 'Santos',
          position: 'Computer Programmer II',
          department: 'Information Technology Office',
          employment_status: 'Permanent',
          date_hired: '2019-01-01',
          highest_educational_attainment: 'BS Computer Science',
          eligibility: 'CSC Professional',
        },
        {
          id: 'emp-incumbent',
          first_name: 'Current',
          last_name: 'Incumbent',
          position: 'IT Officer II',
          department: 'Information Technology Office',
          employment_status: 'Permanent',
          date_hired: '2015-01-01',
        },
        {
          id: 'emp-peer',
          first_name: 'Same',
          last_name: 'Title',
          position: 'IT Officer II', // same title peer -> excluded
          department: 'Information Technology Office',
          employment_status: 'Permanent',
          date_hired: '2018-01-01',
        },
        {
          id: 'emp-probationary',
          first_name: 'New',
          last_name: 'Hire',
          position: 'IT Staff',
          department: 'Information Technology Office',
          employment_status: 'Probationary', // probationary -> excluded
          date_hired: '2026-01-01',
        },
      ];

      vi.spyOn(successionReviews, 'fetchSuccessionReviews').mockResolvedValue([]);

      vi.spyOn(successionApi, 'getLatestOverallScores').mockResolvedValue(
        new Map([
          ['emp-1', { overallScore: 4.8, adjectival: 'Outstanding', period: '2025 H2', cycleId: 1 }],
          ['emp-2', { overallScore: 4.2, adjectival: 'Very Satisfactory', period: '2025 H2', cycleId: 1 }],
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
        if (table === 'departments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: mockSingleDept }),
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
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: mockEmps, error: null }),
              }),
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
                  // emp-2 has empty work experience records -> tests date_hired tenure fallback
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
                    training_title: 'Network Administration',
                    number_of_hours: 80,
                    from_date: '2023-01-01',
                    to_date: '2023-01-10',
                    conducted_by: 'CSC',
                  },
                  {
                    id: 't-2',
                    employee_id: 'emp-2',
                    training_title: 'Database Systems',
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
                  // emp-2 has empty education rows -> tests profile highest_educational_attainment fallback
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
                  // emp-2 has empty eligibility rows -> tests profile eligibility fallback
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

      // Incumbent, same-title peer, and probationary staff were excluded during discovery
      // emp-1 and emp-2 meet all minimum requirements and are ranked
      expect(pool.ranked.length).toBe(2);
      expect(pool.ranked[0].candidate.employeeId).toBe('emp-1');
      expect(pool.ranked[0].rank).toBe(1);
      expect(pool.ranked[0].total).toBeGreaterThan(0);

      expect(pool.ranked[1].candidate.employeeId).toBe('emp-2');
      expect(pool.ranked[1].rank).toBe(2);
      expect(pool.ranked[1].total).toBeGreaterThan(0);

      // Automated bypass means candidates are not stuck in needsReview
      expect(pool.needsReview.length).toBe(0);
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
        if (table === 'departments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { id: 'dept-1', name: 'IT' } }) }),
            }),
          };
        }
        if (table === 'succession_candidates') {
          return { select: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: [] }) }) };
        }
        if (table === 'employees') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [{ id: 'emp-1', first_name: 'Ana', last_name: 'Cruz', employment_status: 'Regular' }],
                }),
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
