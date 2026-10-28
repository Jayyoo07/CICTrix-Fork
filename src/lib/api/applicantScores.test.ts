import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  fromMock,
  selectMock,
  inMock,
  upsertMock,
  mockQueryResult,
  mockUpsertResult,
} = vi.hoisted(() => ({
  fromMock: vi.fn(),
  selectMock: vi.fn(),
  inMock: vi.fn(),
  upsertMock: vi.fn(),
  mockQueryResult: { data: [] as unknown[], error: null as unknown },
  mockUpsertResult: { error: null as unknown },
}));

vi.mock('../supabase', () => {
  const queryChain: any = {
    select: (...args: any[]) => {
      selectMock(...args);
      return queryChain;
    },
    in: (...args: any[]) => {
      inMock(...args);
      return queryChain;
    },
    then: (resolve: (val: any) => any) => Promise.resolve(mockQueryResult).then(resolve),
  };

  const tableChain: any = {
    select: (...args: any[]) => {
      selectMock(...args);
      return queryChain;
    },
    upsert: (...args: any[]) => {
      upsertMock(...args);
      return Promise.resolve(mockUpsertResult);
    },
  };

  return {
    supabase: {
      from: (...args: any[]) => {
        fromMock(...args);
        return tableChain;
      },
    },
  };
});

import {
  CAT_SCORES_KEY,
  EXAM_SCORES_KEY,
  CATEGORY_SCORES_UPDATED_EVENT,
  isUuid,
  calcModalScore,
  calcOverallScore,
  deriveDefaultCategoryScores,
  hasFinalizedCategoryScores,
  fetchApplicantCategoryScores,
  saveApplicantCategoryScores,
  savePositionWrittenExamScores,
  type ApplicantCategoryScores,
} from './applicantScores';

const VALID_UUID_1 = 'a1b2c3d4-e5f6-4a1b-8c2d-111111111111';
const VALID_UUID_2 = 'b2c3d4e5-f6a1-4b2c-9d3e-222222222222';

const makeScores = (overrides?: Partial<ApplicantCategoryScores>): ApplicantCategoryScores => ({
  education: { initialScore: 16, finalScore: 16, remarks: '' },
  experience: { initialScore: 14, finalScore: 14, remarks: '' },
  performance: { initialScore: 18, finalScore: 18, remarks: '' },
  pcpt: { initialScore: 16, finalScore: 16, remarks: '' },
  potential: { initialScore: 18, finalScore: 18, remarks: '' },
  writtenExam: { initialScore: 80, finalScore: 80, remarks: '' },
  oralExam: { initialScore: 15, finalScore: 15, remarks: '' },
  appointmentType: 'original',
  positionType: 'rank-and-file',
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mockQueryResult.data = [];
  mockQueryResult.error = null;
  mockUpsertResult.error = null;
});

describe('applicantScores service layer', () => {
  describe('isUuid', () => {
    it('returns true for valid UUID strings', () => {
      expect(isUuid(VALID_UUID_1)).toBe(true);
      expect(isUuid(VALID_UUID_2.toUpperCase())).toBe(true);
    });

    it('returns false for non-UUID strings and invalid inputs', () => {
      expect(isUuid('app-1')).toBe(false);
      expect(isUuid('')).toBe(false);
      expect(isUuid('12345')).toBe(false);
      expect(isUuid(null as unknown as string)).toBe(false);
    });
  });

  describe('calcModalScore', () => {
    it('computes promotional score from education, experience, performance, potential, and pcpt', () => {
      const scores = makeScores({
        education: { initialScore: 15, finalScore: 18, remarks: '' },
        experience: { initialScore: 12, finalScore: 16, remarks: '' },
        performance: { initialScore: 14, finalScore: 14, remarks: '' },
        potential: { initialScore: 16, finalScore: 18, remarks: '' },
        pcpt: { initialScore: 10, finalScore: 12, remarks: '' },
        oralExam: { initialScore: 20, finalScore: 20, remarks: '' }, // ignored in promotional
      });

      // 18 + 16 + 14 + 18 + 12 = 78
      expect(calcModalScore(scores, 'promotional')).toBe(78);
    });

    it('falls back to initialScore when finalScore is null', () => {
      const scores = makeScores({
        education: { initialScore: 16, finalScore: null, remarks: '' },
        experience: { initialScore: 14, finalScore: null, remarks: '' },
        performance: { initialScore: 20, finalScore: null, remarks: '' },
        potential: { initialScore: 15, finalScore: null, remarks: '' },
        pcpt: { initialScore: 10, finalScore: null, remarks: '' },
      });

      // 16 + 14 + 20 + 15 + 10 = 75
      expect(calcModalScore(scores, 'promotional')).toBe(75);
    });

    it('computes original score from education, experience, and oralExam', () => {
      const scores = makeScores({
        education: { initialScore: 16, finalScore: 16, remarks: '' },
        experience: { initialScore: 14, finalScore: 14, remarks: '' },
        oralExam: { initialScore: 15, finalScore: 18, remarks: '' },
        performance: { initialScore: 20, finalScore: 20, remarks: '' }, // ignored in original
        pcpt: { initialScore: 20, finalScore: 20, remarks: '' }, // ignored in original
      });

      // 16 + 14 + 18 = 48
      expect(calcModalScore(scores, 'original')).toBe(48);
    });
  });

  describe('calcOverallScore', () => {
    it('returns null when any base category finalScore is null', () => {
      const scores = makeScores({
        performance: { initialScore: 18, finalScore: null, remarks: '' },
      });
      expect(calcOverallScore(scores)).toEqual({ value: null, pct: null });
    });

    it('returns null when writtenExam finalScore is null', () => {
      const scores = makeScores({
        writtenExam: { initialScore: 80, finalScore: null, remarks: '' },
      });
      expect(calcOverallScore(scores)).toEqual({ value: null, pct: null });
    });

    it('calculates value and percentage with default written exam total (100)', () => {
      const scores = makeScores({
        education: { initialScore: 18, finalScore: 18, remarks: '' },
        experience: { initialScore: 16, finalScore: 16, remarks: '' },
        performance: { initialScore: 14, finalScore: 14, remarks: '' },
        pcpt: { initialScore: 16, finalScore: 16, remarks: '' },
        potential: { initialScore: 18, finalScore: 18, remarks: '' },
        writtenExam: { initialScore: 80, finalScore: 80, remarks: '' },
      });

      // base = 18 + 16 + 14 + 16 + 18 = 82
      // exam: 80/100 * 30 = 24
      // total = 82 + 24 = 106
      // pct: (106 / 130) * 100 = 81.538... -> "81.5"
      expect(calcOverallScore(scores)).toEqual({ value: 106, pct: '81.5' });
    });

    it('calculates value with custom exam total (e.g. 50)', () => {
      const scores = makeScores({
        education: { initialScore: 20, finalScore: 20, remarks: '' },
        experience: { initialScore: 20, finalScore: 20, remarks: '' },
        performance: { initialScore: 20, finalScore: 20, remarks: '' },
        pcpt: { initialScore: 10, finalScore: 10, remarks: '' },
        potential: { initialScore: 20, finalScore: 20, remarks: '' },
        writtenExam: { initialScore: 40, finalScore: 40, remarks: '' },
      });

      // base = 90
      // exam: 40/50 * 30 = 24
      // total = 114
      // pct: (114 / 130) * 100 = 87.69... -> "87.7"
      expect(calcOverallScore(scores, 50)).toEqual({ value: 114, pct: '87.7' });
    });
  });

  describe('deriveDefaultCategoryScores', () => {
    it('derives education and experience points from applicant attributes', () => {
      const applicant = {
        id: VALID_UUID_1,
        education_level: 'College Graduate',
        years_of_experience: 7,
        total_score: 80,
        application_type: 'promotion',
      };

      const result = deriveDefaultCategoryScores(applicant);
      expect(result.education.finalScore).toBe(16);
      expect(result.experience.finalScore).toBe(14);
      expect(result.appointmentType).toBe('promotional');
    });

    it('preserves saved scores while filling missing template categories', () => {
      const applicant = { id: VALID_UUID_1 };
      const saved = {
        [VALID_UUID_1]: makeScores({
          education: { initialScore: 20, finalScore: 20, remarks: 'Verified TOR' },
        }),
      };

      const result = deriveDefaultCategoryScores(applicant, saved);
      expect(result.education.finalScore).toBe(20);
      expect(result.education.remarks).toBe('Verified TOR');
    });

    it('incorporates evalSnapshot and posExamScore', () => {
      const applicant = { id: VALID_UUID_1 };
      const evalSnapshot = {
        pcptRawScore: 32, // Converted -> 18
        oralRawScore: 4.5, // (4.5 / 5) * 20 -> 18
      };

      const result = deriveDefaultCategoryScores(applicant, undefined, evalSnapshot, '75');
      expect(result.pcpt.finalScore).toBe(18);
      expect(result.oralExam.finalScore).toBe(18);
      expect(result.writtenExam.finalScore).toBe(75);
    });
  });

  describe('hasFinalizedCategoryScores', () => {
    it('returns true if is_finalized flag is true', () => {
      expect(hasFinalizedCategoryScores({ is_finalized: true })).toBe(true);
      expect(hasFinalizedCategoryScores({ isFinalized: true })).toBe(true);
    });

    it('returns true if any category has a numeric finalScore', () => {
      const entry = {
        education: { initialScore: 16, finalScore: 16, remarks: '' },
      };
      expect(hasFinalizedCategoryScores(entry)).toBe(true);
    });

    it('returns true if appointmentType or positionType is defined', () => {
      expect(hasFinalizedCategoryScores({ appointmentType: 'original' })).toBe(true);
      expect(hasFinalizedCategoryScores({ positionType: 'rank-and-file' })).toBe(true);
    });

    it('returns false for empty or null entries', () => {
      expect(hasFinalizedCategoryScores(null)).toBe(false);
      expect(hasFinalizedCategoryScores({})).toBe(false);
    });
  });

  describe('fetchApplicantCategoryScores', () => {
    it('filters applicantIds by UUID and queries Supabase', async () => {
      const row = {
        applicant_id: VALID_UUID_1,
        education: { initialScore: 18, finalScore: 18, remarks: '' },
        experience: { initialScore: 16, finalScore: 16, remarks: '' },
        performance: { initialScore: 14, finalScore: 14, remarks: '' },
        pcpt: { initialScore: 16, finalScore: 16, remarks: '' },
        potential: { initialScore: 18, finalScore: 18, remarks: '' },
        written_exam: { initialScore: 80, finalScore: 80, remarks: '' },
        oral_exam: { initialScore: 15, finalScore: 15, remarks: '' },
        appointment_type: 'original',
        position_type: 'rank-and-file',
      };
      mockQueryResult.data = [row];

      const res = await fetchApplicantCategoryScores([VALID_UUID_1, 'invalid-id-123']);

      expect(fromMock).toHaveBeenCalledWith('applicant_category_scores');
      expect(inMock).toHaveBeenCalledWith('applicant_id', [VALID_UUID_1]);
      expect(res.ok).toBe(true);
      expect(res.data.get(VALID_UUID_1)?.education.finalScore).toBe(18);

      // Verify synced to localStorage
      const cached = JSON.parse(localStorage.getItem(CAT_SCORES_KEY) ?? '{}');
      expect(cached[VALID_UUID_1]?.education.finalScore).toBe(18);
    });

    it('falls back gracefully to localStorage when Supabase query fails', async () => {
      mockQueryResult.error = new Error('Database connection failed');
      const cachedScores = {
        [VALID_UUID_1]: makeScores({
          education: { initialScore: 20, finalScore: 20, remarks: 'From cache' },
        }),
      };
      localStorage.setItem(CAT_SCORES_KEY, JSON.stringify(cachedScores));

      const res = await fetchApplicantCategoryScores([VALID_UUID_1]);

      expect(res.ok).toBe(false);
      expect(res.data.get(VALID_UUID_1)?.education.remarks).toBe('From cache');
    });

    it('bypasses remote query when only non-UUID IDs are requested', async () => {
      const cachedScores = {
        'mock-app-1': makeScores({
          education: { initialScore: 15, finalScore: 15, remarks: 'Mock score' },
        }),
      };
      localStorage.setItem(CAT_SCORES_KEY, JSON.stringify(cachedScores));

      const res = await fetchApplicantCategoryScores(['mock-app-1']);

      expect(fromMock).not.toHaveBeenCalled();
      expect(res.ok).toBe(true);
      expect(res.data.get('mock-app-1')?.education.remarks).toBe('Mock score');
    });
  });

  describe('saveApplicantCategoryScores', () => {
    it('updates localStorage, dispatches event, and upserts payload with rollups to Supabase', async () => {
      const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
      const scores = makeScores({
        education: { initialScore: 18, finalScore: 18, remarks: '' },
        experience: { initialScore: 16, finalScore: 16, remarks: '' },
        performance: { initialScore: 14, finalScore: 14, remarks: '' },
        pcpt: { initialScore: 16, finalScore: 16, remarks: '' },
        potential: { initialScore: 18, finalScore: 18, remarks: '' },
        writtenExam: { initialScore: 80, finalScore: 80, remarks: '' },
        oralExam: { initialScore: 15, finalScore: 15, remarks: '' },
      });

      const res = await saveApplicantCategoryScores(VALID_UUID_1, scores, true);

      expect(res.ok).toBe(true);

      // Verify localStorage update
      const cached = JSON.parse(localStorage.getItem(CAT_SCORES_KEY) ?? '{}');
      expect(cached[VALID_UUID_1]).toBeDefined();

      // Verify event dispatch
      expect(dispatchSpy).toHaveBeenCalled();
      const eventCall = dispatchSpy.mock.calls.find(
        ([e]) => (e as CustomEvent).type === CATEGORY_SCORES_UPDATED_EVENT,
      );
      expect(eventCall).toBeDefined();

      // Verify upsert call
      expect(fromMock).toHaveBeenCalledWith('applicant_category_scores');
      expect(upsertMock).toHaveBeenCalledWith(
        expect.objectContaining({
          applicant_id: VALID_UUID_1,
          written_exam_raw_score: 80,
          total_score: 106,
          interview_score: 15,
          is_finalized: true,
        }),
        { onConflict: 'applicant_id' },
      );
    });

    it('bypasses Supabase for non-UUID applicantId', async () => {
      const scores = makeScores();
      const res = await saveApplicantCategoryScores('mock-applicant', scores);

      expect(res.ok).toBe(true);
      expect(fromMock).not.toHaveBeenCalled();
      const cached = JSON.parse(localStorage.getItem(CAT_SCORES_KEY) ?? '{}');
      expect(cached['mock-applicant']).toBeDefined();
    });

    it('returns error when Supabase upsert fails', async () => {
      mockUpsertResult.error = new Error('Permission denied');
      const scores = makeScores();

      const res = await saveApplicantCategoryScores(VALID_UUID_1, scores);

      expect(res.ok).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  describe('savePositionWrittenExamScores', () => {
    it('batch updates exam scores in localStorage and upserts rows to Supabase', async () => {
      mockQueryResult.data = [
        {
          applicant_id: VALID_UUID_1,
          education: { initialScore: 16, finalScore: 16, remarks: '' },
          experience: { initialScore: 14, finalScore: 14, remarks: '' },
          performance: { initialScore: 12, finalScore: 12, remarks: '' },
          pcpt: { initialScore: 14, finalScore: 14, remarks: '' },
          potential: { initialScore: 16, finalScore: 16, remarks: '' },
          written_exam: { initialScore: 0, finalScore: 0, remarks: '' },
          oral_exam: { initialScore: 12, finalScore: 12, remarks: '' },
          appointment_type: 'original',
          position_type: 'rank-and-file',
        },
      ];

      const res = await savePositionWrittenExamScores('Computer Programmer II', {
        [VALID_UUID_1]: 85,
        [VALID_UUID_2]: 90,
      });

      expect(res.ok).toBe(true);

      // Verify localStorage cictrix_exam_scores
      const examCache = JSON.parse(localStorage.getItem(EXAM_SCORES_KEY) ?? '{}');
      expect(examCache['Computer Programmer II']?.[VALID_UUID_1]).toBe('85');
      expect(examCache['Computer Programmer II']?.[VALID_UUID_2]).toBe('90');

      // Verify localStorage cictrix_category_scores writtenExam updated
      const catCache = JSON.parse(localStorage.getItem(CAT_SCORES_KEY) ?? '{}');
      expect(catCache[VALID_UUID_1]?.writtenExam.initialScore).toBe(85);
      expect(catCache[VALID_UUID_2]?.writtenExam.initialScore).toBe(90);

      // Verify Supabase upsert called with both UUIDs
      expect(fromMock).toHaveBeenCalledWith('applicant_category_scores');
      expect(upsertMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            applicant_id: VALID_UUID_1,
            written_exam_raw_score: 85,
          }),
          expect.objectContaining({
            applicant_id: VALID_UUID_2,
            written_exam_raw_score: 90,
          }),
        ]),
        { onConflict: 'applicant_id' },
      );
    });

    it('handles non-UUID entries by storing in localStorage and bypassing Supabase', async () => {
      const res = await savePositionWrittenExamScores('Administrative Aide', {
        'mock-1': 70,
      });

      expect(res.ok).toBe(true);
      expect(upsertMock).not.toHaveBeenCalled();

      const examCache = JSON.parse(localStorage.getItem(EXAM_SCORES_KEY) ?? '{}');
      expect(examCache['Administrative Aide']?.['mock-1']).toBe('70');
    });
  });
});
