import { beforeEach, describe, expect, it, vi } from 'vitest';

const upsert = vi.fn();
vi.mock('./supabase', () => ({ supabase: { from: () => ({ upsert: (...args: unknown[]) => upsert(...args) }) } }));
vi.mock('./plantillaSlots', () => ({ fetchSlotsByJobPosting: vi.fn() }));

import { getJobPostings, saveJobPostingsAndWait } from './recruitmentData';
import type { JobPosting } from '../types/recruitment.types';

const posting = (id: string, title: string) => ({ id, title, department: 'GSO', status: 'Draft' } as unknown as JobPosting);

describe('saveJobPostingsAndWait (Task 2, RSP failing request)', () => {
  beforeEach(() => { upsert.mockReset(); vi.spyOn(console, 'error').mockImplementation(() => {}); vi.spyOn(console, 'log').mockImplementation(() => {}); });

  it('reports a rejected upsert and rolls the cache back', async () => {
    upsert.mockResolvedValueOnce({ error: null });
    await saveJobPostingsAndWait([posting('a', 'Engineer I')]);

    upsert.mockResolvedValueOnce({ error: { code: '42501', message: 'new row violates row-level security policy' } });
    const result = await saveJobPostingsAndWait([posting('b', 'Clerk I'), posting('a', 'Engineer I')]);

    expect(result.ok).toBe(false);
    expect(getJobPostings().map((p) => p.id)).toEqual(['a']);
  });

  it('reports a network failure the same way', async () => {
    upsert.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const result = await saveJobPostingsAndWait([posting('c', 'Driver')]);
    expect(result.ok).toBe(false);
  });

  it('resolves ok when the rows are stored', async () => {
    upsert.mockResolvedValueOnce({ error: null });
    expect((await saveJobPostingsAndWait([posting('d', 'Nurse I')])).ok).toBe(true);
    expect(getJobPostings().map((p) => p.id)).toEqual(['d']);
  });
});
