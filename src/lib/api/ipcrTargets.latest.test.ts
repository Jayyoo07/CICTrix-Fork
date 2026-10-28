import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getActiveCycle, loadLatestTargetSetting, unflattenFromWorkspace } from './ipcrTargets';

const mockFrom = vi.fn();

vi.mock('../supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

describe('ipcrTargets - getActiveCycle and loadLatestTargetSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getActiveCycle', () => {
    it('returns Active cycle when available', async () => {
      const cycles = [
        { id: 1, title: 'July–December 2026', start_date: '2026-07-01', end_date: '2026-12-31', status: 'Active' },
        { id: 2, title: 'Planned 2027', start_date: '2027-01-01', end_date: '2027-06-30', status: 'Planned' },
      ];

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: cycles, error: null }),
          }),
        }),
      });

      const res = await getActiveCycle();
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data?.id).toBe(1);
        expect(res.data?.status).toBe('Active');
      }
    });

    it('falls back to latest cycle when no cycle is Active or Planned', async () => {
      let callCount = 0;
      mockFrom.mockImplementation(() => ({
        select: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            // First query: in(['Active', 'Planned']) returns empty
            return {
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            };
          } else {
            // Fallback query: order by start_date DESC limit 1
            return {
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [{ id: 99, title: 'January–June 2026', start_date: '2026-01-01', end_date: '2026-06-30', status: 'Completed' }],
                  error: null,
                }),
              }),
            };
          }
        }),
      }));

      const res = await getActiveCycle();
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data?.id).toBe(99);
        expect(res.data?.title).toBe('January–June 2026');
      }
    });
  });

  describe('loadLatestTargetSetting', () => {
    it('prioritizes approved setting with targets over newer blank draft', async () => {
      const mockSettings = [
        // Newer blank draft
        { id: 'ts-draft', employee_id: 'emp-1', cycle_id: 2, status: 'draft', updated_at: '2026-10-28T10:00:00Z', created_at: '2026-10-28T10:00:00Z' },
        // Older approved setting with real MFOs
        { id: 'ts-approved', employee_id: 'emp-1', cycle_id: 1, status: 'approved', updated_at: '2026-10-28T09:00:00Z', created_at: '2026-10-20T00:00:00Z' },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'target_settings') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockSettings, error: null }),
              }),
            }),
          };
        }
        if (table === 'mfos') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((_col: string, val: string) => {
                if (val === 'ts-approved') {
                  return {
                    order: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: 'mfo-1',
                          function_type: 'core',
                          title: 'Procurement Management',
                          sort_order: 0,
                        },
                      ],
                      error: null,
                    }),
                  };
                }
                // Draft setting has no MFOs
                return {
                  order: vi.fn().mockResolvedValue({ data: [], error: null }),
                };
              }),
            }),
          };
        }
        if (table === 'success_indicators') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'si-1', mfo_id: 'mfo-1', description: 'Process PRs within 2 days', sort_order: 0 },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: vi.fn() };
      });

      const res = await loadLatestTargetSetting('emp-1');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.setting?.id).toBe('ts-approved');
        expect(res.data.setting?.status).toBe('approved');
        expect(res.data.targets.core[0].title).toBe('Procurement Management');
        expect(res.data.targets.core[0].indicators[0].description).toBe('Process PRs within 2 days');
      }
    });

    it('prioritizes submitted_for_approval setting with targets over newer blank draft', async () => {
      const mockSettings = [
        { id: 'ts-blank-draft', employee_id: 'emp-1', cycle_id: 2, status: 'draft', updated_at: '2026-10-28T12:00:00Z', created_at: '2026-10-28T12:00:00Z' },
        { id: 'ts-submitted', employee_id: 'emp-1', cycle_id: 1, status: 'submitted_for_approval', updated_at: '2026-10-28T11:00:00Z', created_at: '2026-10-28T08:00:00Z' },
      ];

      mockFrom.mockImplementation((table: string) => {
        if (table === 'target_settings') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: mockSettings, error: null }),
              }),
            }),
          };
        }
        if (table === 'mfos') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((_col: string, val: string) => {
                if (val === 'ts-submitted') {
                  return {
                    order: vi.fn().mockResolvedValue({
                      data: [
                        {
                          id: 'mfo-sub',
                          function_type: 'strategic',
                          title: 'Digital Transformation',
                          sort_order: 0,
                        },
                      ],
                      error: null,
                    }),
                  };
                }
                return {
                  order: vi.fn().mockResolvedValue({ data: [], error: null }),
                };
              }),
            }),
          };
        }
        if (table === 'success_indicators') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'si-sub', mfo_id: 'mfo-sub', description: 'Deploy portal', sort_order: 0 },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        return { select: vi.fn() };
      });

      const res = await loadLatestTargetSetting('emp-1');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.setting?.id).toBe('ts-submitted');
        expect(res.data.setting?.status).toBe('submitted_for_approval');
        expect(res.data.targets.strategic[0].title).toBe('Digital Transformation');
      }
    });
  });

  describe('unflattenFromWorkspace', () => {
    it('returns a single blank MFO for null, undefined, or empty string', () => {
      expect(unflattenFromWorkspace(null)).toEqual([{ title: '', indicators: [{ description: '' }] }]);
      expect(unflattenFromWorkspace(undefined)).toEqual([{ title: '', indicators: [{ description: '' }] }]);
      expect(unflattenFromWorkspace('')).toEqual([{ title: '', indicators: [{ description: '' }] }]);
      expect(unflattenFromWorkspace('   \n  ')).toEqual([{ title: '', indicators: [{ description: '' }] }]);
    });

    it('parses title and bulleted success indicators', () => {
      const text = 'Payroll Processing\n- Process monthly payroll on time\n• Reconcile deductions';
      const result = unflattenFromWorkspace(text);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Payroll Processing');
      expect(result[0].indicators).toEqual([
        { description: 'Process monthly payroll on time' },
        { description: 'Reconcile deductions' },
      ]);
    });

    it('parses multiple MFO blocks separated by blank lines', () => {
      const text = [
        'Payroll Processing\n- Process monthly payroll',
        'Records Management\n* Archive physical files\n- Digitization scan',
      ].join('\n\n');

      const result = unflattenFromWorkspace(text);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Payroll Processing');
      expect(result[0].indicators).toEqual([{ description: 'Process monthly payroll' }]);
      expect(result[1].title).toBe('Records Management');
      expect(result[1].indicators).toEqual([
        { description: 'Archive physical files' },
        { description: 'Digitization scan' },
      ]);
    });

    it('handles (untitled MFO) placeholder properly by clearing title', () => {
      const text = '(untitled MFO)\n- Lone indicator';
      const result = unflattenFromWorkspace(text);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('');
      expect(result[0].indicators).toEqual([{ description: 'Lone indicator' }]);
    });

    it('handles bullet-only format without explicit title line', () => {
      const text = '- Only bullet 1\n- Only bullet 2';
      const result = unflattenFromWorkspace(text);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('');
      expect(result[0].indicators).toEqual([
        { description: 'Only bullet 1' },
        { description: 'Only bullet 2' },
      ]);
    });
});
});
