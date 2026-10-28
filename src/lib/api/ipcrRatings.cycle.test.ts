import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadEmployeeRatingSheet } from './ipcrRatings';

const mockFrom = vi.fn();

vi.mock('../supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

describe('ipcrRatings - loadEmployeeRatingSheet cycle scoping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters by cycle_id when cycleId is provided', async () => {
    const mockEq = vi.fn();
    const mockOrder = vi.fn();
    const mockLimit = vi.fn();

    mockFrom.mockImplementation((table: string) => {
      if (table === 'target_settings') {
        const queryBuilder: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockImplementation((col: string, val: any) => {
            mockEq(col, val);
            if (col === 'id') {
              return {
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: val,
                    employee_id: 'emp-1',
                    cycle_id: 2,
                    status: 'approved',
                    phase2_status: 'open',
                    review_comment: null,
                  },
                  error: null,
                }),
              };
            }
            return queryBuilder;
          }),
          order: vi.fn().mockImplementation(() => {
            mockOrder();
            return {
              limit: vi.fn().mockImplementation(() => {
                mockLimit();
                return Promise.resolve({
                  data: [
                    {
                      id: 'setting-cycle-2',
                      employee_id: 'emp-1',
                      cycle_id: 2,
                      status: 'approved',
                      phase2_status: 'open',
                      phase2_open_target_date: null,
                    },
                  ],
                  error: null,
                });
              }),
            };
          }),
        };
        return queryBuilder;
      }
      if (table === 'mfos') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'mfo-1',
                    function_type: 'core',
                    title: 'Core MFO',
                    sort_order: 0,
                    success_indicators: [
                      { id: 'si-1', description: 'Measure 1', sort_order: 0 },
                    ],
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'success_indicator_ratings') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  success_indicator_id: 'si-1',
                  accomplishment: 'Accomplished task',
                  quality: 4,
                  efficiency: 4,
                  timeliness: 4,
                },
              ],
              error: null,
            }),
          }),
        };
      }
      if (table === 'employees_with_department') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { full_name: 'Test Employee' } }),
            }),
          }),
        };
      }
      if (table === 'performance_cycles') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({
              data: [{ id: 2, title: 'July–December 2026' }],
              error: null,
            }),
          }),
        };
      }
      return { select: vi.fn() };
    });

    const res = await loadEmployeeRatingSheet('emp-1', 2);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data?.targetSettingId).toBe('setting-cycle-2');
    }
    expect(mockEq).toHaveBeenCalledWith('employee_id', 'emp-1');
    expect(mockEq).toHaveBeenCalledWith('status', 'approved');
    expect(mockEq).toHaveBeenCalledWith('cycle_id', 2);
  });

  it('returns null when no approved setting exists for the specified cycleId', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'target_settings') {
        const queryBuilder: any = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              data: [],
              error: null,
            }),
          }),
        };
        return queryBuilder;
      }
      return { select: vi.fn() };
    });

    const res = await loadEmployeeRatingSheet('emp-1', 99);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toBeNull();
    }
  });
});
