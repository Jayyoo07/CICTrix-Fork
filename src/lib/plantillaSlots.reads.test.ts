import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ result: { data: [] as any[], error: null as any } }));
vi.mock('./supabase', () => ({
  supabase: {
    from: () => {
      const query = { select: () => query, order: () => query, in: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(db.result).then(resolve) };
      return query;
    },
  },
}));

import { fetchApplicantSlotLinks, fetchApplicantSlotLinksChecked, fetchSlotsByJobPosting, fetchSlotsByJobPostingChecked } from './plantillaSlots';

beforeEach(() => { db.result = { data: [], error: null }; });

describe('checked slot reads', () => {
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
