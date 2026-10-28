import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ result: { data: [] as any[], error: null as any }, filters: [] as unknown[][], reads: 0 }));
vi.mock('./supabase', () => ({
  supabase: {
    from: () => {
      db.reads++;
      const query = { select: () => query, order: () => query, in: (...filter: unknown[]) => { db.filters.push(filter); return query; },
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(db.result).then(resolve) };
      return query;
    },
  },
}));

import { fetchApplicantSlotLinks, fetchApplicantSlotLinksChecked, fetchSlotsByJobPosting, fetchSlotsByJobPostingChecked } from './plantillaSlots';

beforeEach(() => { db.result = { data: [], error: null }; db.filters = []; db.reads = 0; });

describe('checked slot reads', () => {
  it('scopes tracker slot metadata to linked IDs and skips an empty link set', async () => {
    expect(await fetchSlotsByJobPostingChecked([])).toEqual({ ok: true, data: new Map() });
    expect(db.reads).toBe(0);
    const slotId1 = '11111111-1111-1111-1111-111111111111';
    const slotId2 = '22222222-2222-2222-2222-222222222222';
    await fetchSlotsByJobPostingChecked([slotId1, slotId2]);
    expect(db.filters).toEqual([['id', [slotId1, slotId2]]]);
    // Non-UUID IDs are skipped before query
    expect(await fetchSlotsByJobPostingChecked(['s1', 's2'])).toEqual({ ok: true, data: new Map() });
    await fetchSlotsByJobPosting();
    expect(db.reads).toBe(2);
    expect(db.filters).toHaveLength(1);
  });
  it.each([
    ['slots', fetchSlotsByJobPostingChecked, fetchSlotsByJobPosting],
    ['links', fetchApplicantSlotLinksChecked, fetchApplicantSlotLinks],
  ] as const)('distinguishes failed %s reads from successful empty results without changing legacy fallbacks', async (_name, checked, legacy) => {
    expect(await checked()).toEqual({ ok: true, data: new Map() });
    db.result = { data: null, error: { message: 'offline' } };
    expect(await checked()).toEqual({ ok: false, error: 'offline' });
    expect(await legacy()).toEqual(new Map());
  });
});
