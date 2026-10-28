import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlantillaSlot } from '../types/recruitment.types';

const mocks = vi.hoisted(() => ({
  slotsByJobPosting: vi.fn(),
  applicantSlotLinks: vi.fn(),
  supabaseFrom: vi.fn(),
  selectCalls: [] as { table: string; cols: string; inField?: string; inValues?: string[] }[],
  mockSupabaseResponse: { data: [] as any[], error: null as any },
  shouldThrowInSupabase: false,
}));

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      mocks.supabaseFrom(table);
      const callRecord: { table: string; cols: string; inField?: string; inValues?: string[] } = {
        table,
        cols: '',
      };
      const builder: any = {
        select: (cols: string) => {
          callRecord.cols = cols;
          return builder;
        },
        in: (field: string, values: string[]) => {
          callRecord.inField = field;
          callRecord.inValues = values;
          mocks.selectCalls.push(callRecord);
          return builder;
        },
        then: (resolve: (v: unknown) => unknown, reject?: (err: unknown) => unknown) => {
          if (mocks.shouldThrowInSupabase) {
            return Promise.reject(new Error('Network error connecting to Supabase')).catch(reject);
          }
          return Promise.resolve(mocks.mockSupabaseResponse).then(resolve);
        },
      };
      return builder;
    },
  },
}));

vi.mock('./plantillaSlots', () => ({
  fetchSlotsByJobPosting: (...args: unknown[]) => mocks.slotsByJobPosting(...args),
  fetchApplicantSlotLinks: (...args: unknown[]) => mocks.applicantSlotLinks(...args),
  plantillaLabel: (s: any) => s.itemNumber || 'Plantilla',
}));

import { fetchHiringContext, isUuid } from './hiringFlow';

describe('isUuid', () => {
  it('accurately identifies UUIDs vs mock strings', () => {
    // Valid standard v4 and general UUIDs
    expect(isUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isUuid('1C2A873B-5A12-4C6E-8D9E-112233445566')).toBe(true);
    expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
    expect(isUuid('a0b1c2d3-e4f5-6789-abcd-ef0123456789')).toBe(true);

    // Mock strings and non-UUID IDs
    expect(isUuid('test-app-001')).toBe(false);
    expect(isUuid('app-123')).toBe(false);
    expect(isUuid('mock-applicant-id')).toBe(false);
    expect(isUuid('')).toBe(false);
    expect(isUuid('12345')).toBe(false);
    expect(isUuid('123e4567-e89b-12d3-a456')).toBe(false);
    expect(isUuid('123e4567-e89b-12d3-a456-426614174000-extra')).toBe(false);
    expect(isUuid('not-a-uuid-at-all')).toBe(false);
  });
});

describe('fetchHiringContext', () => {
  const validUuid1 = '123e4567-e89b-12d3-a456-426614174000';
  const validUuid2 = '223e4567-e89b-12d3-a456-426614174001';
  const mockSlot: PlantillaSlot = {
    id: 'slot-uuid-1',
    jobPostingId: 'job-1',
    slotNumber: 1,
    itemNumber: 'ITEM-001',
    status: 'open',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectCalls.length = 0;
    mocks.shouldThrowInSupabase = false;
    mocks.mockSupabaseResponse = { data: [], error: null };
    mocks.slotsByJobPosting.mockResolvedValue(new Map([['job-1', [mockSlot]]]));
    mocks.applicantSlotLinks.mockResolvedValue(new Map());
  });

  it('filters out non-UUID IDs and does not pass invalid IDs to Supabase', async () => {
    mocks.mockSupabaseResponse = {
      data: [
        { id: validUuid1, plantilla_slot_id: 'slot-uuid-1', selection_revoked_at: null },
      ],
      error: null,
    };

    const res = await fetchHiringContext([validUuid1, 'test-app-001', 'mock-user-99']);

    expect(res.ok).toBe(true);
    // Supabase should only receive the valid UUID
    expect(mocks.selectCalls.length).toBe(1);
    expect(mocks.selectCalls[0].inField).toBe('id');
    expect(mocks.selectCalls[0].inValues).toEqual([validUuid1]);
    expect(mocks.selectCalls[0].inValues).not.toContain('test-app-001');
    expect(mocks.selectCalls[0].inValues).not.toContain('mock-user-99');

    // fetchApplicantSlotLinks should also only receive valid UUIDs
    expect(mocks.applicantSlotLinks).toHaveBeenCalledWith([validUuid1]);
  });

  it('skips querying Supabase applicants table when no valid UUIDs remain', async () => {
    const res = await fetchHiringContext(['test-app-001', 'mock-app-002']);

    expect(res.ok).toBe(true);
    expect(mocks.selectCalls.length).toBe(0);
    expect(mocks.applicantSlotLinks).toHaveBeenCalledWith([]);
    expect(res.slotByApplicant.size).toBe(0);
    expect(res.revokedAt.size).toBe(0);
  });

  it('returns { ok: true, slotByApplicant, revokedAt } on empty input without querying', async () => {
    const res = await fetchHiringContext([]);

    expect(res.ok).toBe(true);
    expect(res.slotByApplicant.size).toBe(0);
    expect(res.revokedAt.size).toBe(0);
    expect(mocks.slotsByJobPosting).not.toHaveBeenCalled();
    expect(mocks.applicantSlotLinks).not.toHaveBeenCalled();
    expect(mocks.selectCalls.length).toBe(0);
  });

  it('returns { ok: true, slotByApplicant, revokedAt } on successful response', async () => {
    const revokedTimestamp = '2026-10-25T14:30:00.000Z';
    mocks.mockSupabaseResponse = {
      data: [
        {
          id: validUuid1,
          plantilla_slot_id: 'slot-uuid-1',
          selection_revoked_at: revokedTimestamp,
        },
        {
          id: validUuid2,
          plantilla_slot_id: null,
          selection_revoked_at: null,
        },
      ],
      error: null,
    };

    // validUuid2 is linked via application_plantilla_slots
    mocks.applicantSlotLinks.mockResolvedValue(
      new Map([
        [validUuid2, [{ applicantId: validUuid2, slotId: 'slot-uuid-1', status: 'applied' }]],
      ]),
    );

    const res = await fetchHiringContext([validUuid1, validUuid2]);

    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
    expect(res.slotByApplicant.get(validUuid1)).toEqual(mockSlot);
    expect(res.slotByApplicant.get(validUuid2)).toEqual(mockSlot);
    expect(res.revokedAt.get(validUuid1)).toBe(revokedTimestamp);
    expect(res.revokedAt.has(validUuid2)).toBe(false);
  });

  it('returns { ok: false, error } when Supabase returns an error', async () => {
    const dbError = { message: 'invalid input syntax for type uuid', code: '22P02' };
    mocks.mockSupabaseResponse = {
      data: null,
      error: dbError,
    };

    const res = await fetchHiringContext([validUuid1]);

    expect(res.ok).toBe(false);
    expect(res.error).toEqual(dbError);
    expect(res.slotByApplicant).toBeInstanceOf(Map);
    expect(res.revokedAt).toBeInstanceOf(Map);
  });

  it('returns { ok: false, error } when an underlying query throws', async () => {
    mocks.shouldThrowInSupabase = true;

    const res = await fetchHiringContext([validUuid1]);

    expect(res.ok).toBe(false);
    expect(res.error).toBeInstanceOf(Error);
    expect((res.error as Error).message).toBe('Network error connecting to Supabase');
    expect(res.slotByApplicant).toBeInstanceOf(Map);
    expect(res.revokedAt).toBeInstanceOf(Map);
  });
});
