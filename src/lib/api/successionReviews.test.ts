import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isReviewStale,
  organizeReviewsByEmployee,
  fetchSuccessionReviews,
  saveSuccessionReview,
  batchSaveSuccessionReviews,
  SuccessionEvidenceReview,
  SaveEvidenceReviewInput,
} from './successionReviews';
import { supabase } from '../supabase';

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('successionReviews', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isReviewStale', () => {
    const baseReview: SuccessionEvidenceReview = {
      id: 'rev-1',
      criticalPositionId: 'pos-1',
      employeeId: 'emp-1',
      criterion: 'training',
      sourceRecordId: 'train-1',
      isRelevant: true,
      isCityHall: true,
      matchesRequirement: true,
      evidenceSnapshot: { hours: 40, title: 'Leadership Workshop', provider: 'CSC' },
      requirementsSnapshot: { trainingHours: 40, experienceYears: 2 },
      reviewedBy: 'Admin',
      reviewedAt: '2026-10-27T00:00:00Z',
      createdAt: '2026-10-27T00:00:00Z',
      updatedAt: '2026-10-27T00:00:00Z',
    };

    it('returns false when snapshots match exactly', () => {
      const currentEvidence = { title: 'Leadership Workshop', hours: 40, provider: 'CSC' }; // different key order
      const currentReqs = { experienceYears: 2, trainingHours: 40 };
      expect(isReviewStale(baseReview, currentEvidence, currentReqs)).toBe(false);
    });

    it('returns true when evidence details changed', () => {
      const currentEvidence = { title: 'Leadership Workshop', hours: 48, provider: 'CSC' };
      const currentReqs = { trainingHours: 40, experienceYears: 2 };
      expect(isReviewStale(baseReview, currentEvidence, currentReqs)).toBe(true);
    });

    it('returns true when position requirements changed', () => {
      const currentEvidence = { hours: 40, title: 'Leadership Workshop', provider: 'CSC' };
      const currentReqs = { trainingHours: 80, experienceYears: 2 };
      expect(isReviewStale(baseReview, currentEvidence, currentReqs)).toBe(true);
    });
  });

  describe('organizeReviewsByEmployee', () => {
    it('groups reviews by employee and criterion:source key', () => {
      const reviews: SuccessionEvidenceReview[] = [
        {
          id: '1',
          criticalPositionId: 'pos-1',
          employeeId: 'emp-1',
          criterion: 'work',
          sourceRecordId: 'work-10',
          isRelevant: true,
          isCityHall: true,
          matchesRequirement: null,
          evidenceSnapshot: {},
          requirementsSnapshot: {},
          reviewedBy: null,
          reviewedAt: '',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: '2',
          criticalPositionId: 'pos-1',
          employeeId: 'emp-1',
          criterion: 'training',
          sourceRecordId: 'train-20',
          isRelevant: false,
          isCityHall: false,
          matchesRequirement: null,
          evidenceSnapshot: {},
          requirementsSnapshot: {},
          reviewedBy: null,
          reviewedAt: '',
          createdAt: '',
          updatedAt: '',
        },
        {
          id: '3',
          criticalPositionId: 'pos-1',
          employeeId: 'emp-2',
          criterion: 'education',
          sourceRecordId: 'edu-30',
          isRelevant: true,
          isCityHall: null,
          matchesRequirement: true,
          evidenceSnapshot: {},
          requirementsSnapshot: {},
          reviewedBy: null,
          reviewedAt: '',
          createdAt: '',
          updatedAt: '',
        },
      ];

      const organized = organizeReviewsByEmployee(reviews);
      expect(organized.size).toBe(2);
      expect(organized.get('emp-1')?.get('work:work-10')?.isRelevant).toBe(true);
      expect(organized.get('emp-1')?.get('training:train-20')?.isRelevant).toBe(false);
      expect(organized.get('emp-2')?.get('education:edu-30')?.matchesRequirement).toBe(true);
      expect(organized.get('emp-2')?.has('work:work-10')).toBe(false);
    });
  });

  describe('fetchSuccessionReviews', () => {
    it('queries by critical_position_id and maps snake_case rows', async () => {
      const mockSelect = vi.fn().mockReturnThis();
      const mockEq = vi.fn().mockImplementation((col: string, _val: string) => {
        if (col === 'critical_position_id') {
          return {
            eq: vi.fn(),
            data: [
              {
                id: 'row-1',
                critical_position_id: 'pos-123',
                employee_id: 'emp-456',
                criterion: 'work',
                source_record_id: 'src-1',
                is_relevant: true,
                is_city_hall: true,
                matches_requirement: null,
                evidence_snapshot: { title: 'IT Officer' },
                requirements_snapshot: { experienceYears: 3 },
                reviewed_by: 'Admin',
                reviewed_at: '2026-10-28T00:00:00Z',
                created_at: '2026-10-28T00:00:00Z',
                updated_at: '2026-10-28T00:00:00Z',
              },
            ],
            error: null,
          };
        }
        return { data: [], error: null };
      });

      (supabase.from as any).mockReturnValue({
        select: mockSelect.mockReturnValue({ eq: mockEq }),
      });

      const res = await fetchSuccessionReviews('pos-123');
      expect(res).toHaveLength(1);
      expect(res[0].criticalPositionId).toBe('pos-123');
      expect(res[0].employeeId).toBe('emp-456');
      expect(res[0].isRelevant).toBe(true);
      expect(res[0].isCityHall).toBe(true);
      expect(res[0].evidenceSnapshot).toEqual({ title: 'IT Officer' });
    });

    it('throws error when supabase query fails', async () => {
      (supabase.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ data: null, error: { message: 'Database error' } }),
        }),
      });

      await expect(fetchSuccessionReviews('pos-err')).rejects.toThrow('Failed to fetch succession evidence reviews: Database error');
    });
  });

  describe('saveSuccessionReview and batchSaveSuccessionReviews', () => {
    it('upserts a single review', async () => {
      const mockSingle = vi.fn().mockResolvedValue({
        data: {
          id: 'row-new',
          critical_position_id: 'pos-1',
          employee_id: 'emp-1',
          criterion: 'training',
          source_record_id: 't-1',
          is_relevant: true,
          is_city_hall: true,
          matches_requirement: null,
          evidence_snapshot: {},
          requirements_snapshot: {},
          reviewed_by: 'User',
          reviewed_at: '2026-10-28T01:00:00Z',
          created_at: '2026-10-28T01:00:00Z',
          updated_at: '2026-10-28T01:00:00Z',
        },
        error: null,
      });
      const mockSelect = vi.fn().mockReturnValue({ single: mockSingle });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });
      (supabase.from as any).mockReturnValue({ upsert: mockUpsert });

      const input: SaveEvidenceReviewInput = {
        criticalPositionId: 'pos-1',
        employeeId: 'emp-1',
        criterion: 'training',
        sourceRecordId: 't-1',
        isRelevant: true,
        isCityHall: true,
        evidenceSnapshot: {},
        requirementsSnapshot: {},
        reviewedBy: 'User',
      };

      const result = await saveSuccessionReview(input);
      expect(result.id).toBe('row-new');
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          critical_position_id: 'pos-1',
          employee_id: 'emp-1',
          criterion: 'training',
          source_record_id: 't-1',
          is_relevant: true,
          is_city_hall: true,
        }),
        expect.objectContaining({
          onConflict: 'critical_position_id,employee_id,criterion,source_record_id',
        }),
      );
    });

    it('batch upserts multiple reviews', async () => {
      const mockSelect = vi.fn().mockResolvedValue({
        data: [
          {
            id: 'b-1',
            critical_position_id: 'pos-1',
            employee_id: 'emp-1',
            criterion: 'work',
            source_record_id: 'w-1',
            is_relevant: true,
            is_city_hall: true,
            matches_requirement: null,
            evidence_snapshot: {},
            requirements_snapshot: {},
            reviewed_by: null,
            reviewed_at: '2026-10-28',
            created_at: '2026-10-28',
            updated_at: '2026-10-28',
          },
        ],
        error: null,
      });
      const mockUpsert = vi.fn().mockReturnValue({ select: mockSelect });
      (supabase.from as any).mockReturnValue({ upsert: mockUpsert });

      const inputs: SaveEvidenceReviewInput[] = [
        {
          criticalPositionId: 'pos-1',
          employeeId: 'emp-1',
          criterion: 'work',
          sourceRecordId: 'w-1',
          isRelevant: true,
          isCityHall: true,
          evidenceSnapshot: {},
          requirementsSnapshot: {},
        },
      ];

      const res = await batchSaveSuccessionReviews(inputs);
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('b-1');
    });
  });
});
