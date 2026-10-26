import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  refetch: vi.fn(), links: vi.fn(), slots: vi.fn(), attachments: vi.fn(), removeChannel: vi.fn(),
}));
type Listener = { table: string; filter?: string; callback: (payload: any) => void };
let listeners: Listener[];
let statusChanged: (status: string) => void;
let visibility: DocumentVisibilityState;

vi.mock('./applicantTracker', async (importOriginal) => ({
  ...await importOriginal<typeof import('./applicantTracker')>(),
  refetchTrackerApplications: api.refetch,
}));
vi.mock('./plantillaSlots', () => ({ fetchApplicantSlotLinksChecked: api.links, fetchSlotsByJobPostingChecked: api.slots }));
vi.mock('./supabase', () => ({
  supabase: {
    from: () => {
      const query = {
        select: () => query, in: (_column: string, ids: string[]) => { query.ids = ids; return query; },
        order: () => query, range: (offset: number) => { query.offset = offset; return query; },
        ids: [] as string[], offset: 0,
        then: (resolve: (value: unknown) => unknown) => api.attachments(query.ids, query.offset).then(resolve),
      };
      return query;
    },
    channel: () => {
      const channel = {
        on: (_type: string, config: { table: string; filter?: string }, callback: Listener['callback']) => {
          listeners.push({ ...config, callback }); return channel;
        },
        subscribe: (callback: typeof statusChanged) => { statusChanged = callback; return channel; },
      };
      return channel;
    },
    removeChannel: api.removeChannel,
  },
}));

import { loadTrackerDetails, loadTrackerRefresh, startTrackerRefresh, TRACKER_FALLBACK_INTERVAL_MS } from './applicantTrackerRefresh';
import { pendingResubmissionIds } from './applicantTracker';

const lookup = { col: 'email' as const, val: 'ana@example.com' };
const rows = [{ id: 'a1', status: 'Submitted', updated_at: 'unchanged' }];
const attachment = { id: 'doc', applicant_id: 'a1', file_name: 'pds.pdf', file_path: 'a1/pds.pdf', document_type: 'pds_with_photo', created_at: '2026-10-27' };
const cleanups: Array<() => void> = [];
const start = (callback = vi.fn(), ids = ['a1']) => {
  const refresh = startTrackerRefresh(lookup, ids, callback);
  cleanups.push(refresh.dispose);
  return { ...refresh, callback };
};
const emit = (table: string, id = 'a1') => listeners.filter((l) => l.table === table).forEach((l) => l.callback({ new: { id } }));
const flush = () => vi.advanceTimersByTimeAsync(1);
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  listeners = [];
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  api.refetch.mockReset().mockResolvedValue(rows);
  api.attachments.mockReset().mockResolvedValue({ data: [attachment], error: null });
  api.links.mockReset().mockResolvedValue({ ok: true, data: new Map([['a1', [{ slotId: 's1', status: 'applied' }]]]) });
  api.slots.mockReset().mockResolvedValue({ ok: true, data: new Map() });
});
afterEach(() => {
  cleanups.splice(0).forEach((dispose) => dispose());
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('tracker fallback and realtime coordinator', () => {
  it('makes four record/document refreshes per minute without realtime, plus outcome reads', async () => {
    const refresh = start();
    await vi.advanceTimersByTimeAsync(TRACKER_FALLBACK_INTERVAL_MS - 1);
    expect(api.refetch).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(45_002);
    expect(api.refetch).toHaveBeenCalledTimes(4);
    expect(api.attachments).toHaveBeenCalledTimes(4);
    expect(api.links).toHaveBeenCalledTimes(4);
    expect(api.slots).toHaveBeenCalledTimes(4);
    expect(api.slots).toHaveBeenCalledWith(['s1']);
    expect(refresh.callback).toHaveBeenCalledTimes(4);
  });

  it('stops hidden polling and coalesces return, focus, online and realtime reconnect', async () => {
    start();
    statusChanged('SUBSCRIBED');
    visibility = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60_000);
    window.dispatchEvent(new Event('online'));
    expect(api.refetch).not.toHaveBeenCalled();
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    statusChanged('CHANNEL_ERROR');
    statusChanged('SUBSCRIBED');
    await flush();
    expect(api.refetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(api.refetch).toHaveBeenCalledTimes(2);
  });

  it('does not start a timer for an initially hidden tracker', async () => {
    visibility = 'hidden';
    start();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.refetch).not.toHaveBeenCalled();
  });

  it('refreshes immediately for relevant realtime events and ignores unrelated applicants', async () => {
    start();
    emit('applicants', 'someone-else');
    await flush();
    expect(api.refetch).not.toHaveBeenCalled();
    emit('applicants');
    emit('applicant_attachments');
    await flush();
    expect(api.refetch).toHaveBeenCalledTimes(1);
    expect(listeners.find((l) => l.table === 'applicant_attachments')?.filter).toBe('applicant_id=in.(a1)');
  });

  it('refreshes independent slot outcomes even when status and updated_at are unchanged', async () => {
    const slot = { id: 's1', jobPostingId: 'j1', slotNumber: 1, itemNumber: '1', status: 'open' };
    api.slots.mockResolvedValue({ ok: true, data: new Map([['j1', [slot]]]) });
    api.links.mockResolvedValue({ ok: true, data: new Map([['a1', [{ slotId: 's1', status: 'applied' }]]]) });
    const refresh = start();
    refresh.request();
    await flush();
    api.links.mockResolvedValue({ ok: true, data: new Map([['a1', [{ slotId: 's1', status: 'not_selected' }]]]) });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(refresh.callback.mock.lastCall?.[0].outcomesByApplicant.get('a1')).toEqual([{ slot, status: 'not_selected' }]);
  });

  it('serializes overlapping triggers and discards a pre-upload response after invalidation', async () => {
    const old = deferred<typeof rows>();
    api.refetch.mockReturnValueOnce(old.promise);
    const refresh = start();
    refresh.request();
    await flush();
    refresh.invalidate();
    refresh.request();
    refresh.request();
    emit('applicant_attachments');
    expect(api.refetch).toHaveBeenCalledTimes(1);
    old.resolve([{ id: 'a1', status: 'old', updated_at: 'old' }]);
    await flush();
    expect(api.refetch).toHaveBeenCalledTimes(2);
    expect(refresh.callback).toHaveBeenCalledTimes(1);
    expect(refresh.callback.mock.lastCall?.[0].rows).toEqual(rows);
  });

  it('does not queue redundant polls behind a slow read', async () => {
    const slow = deferred<typeof rows>();
    api.refetch.mockReturnValueOnce(slow.promise);
    const refresh = start();
    refresh.request();
    await flush();
    await vi.advanceTimersByTimeAsync(45_000);
    expect(api.refetch).toHaveBeenCalledTimes(1);
    slow.resolve(rows);
    await flush();
    expect(refresh.callback).toHaveBeenCalledTimes(1);
    expect(api.refetch).toHaveBeenCalledTimes(1);
  });

  it('cleans up queued work, listeners, subscriptions and late responses on dispose', async () => {
    const slow = deferred<typeof rows>();
    api.refetch.mockReturnValueOnce(slow.promise);
    const refresh = start();
    refresh.request();
    await flush();
    refresh.dispose();
    slow.resolve(rows);
    window.dispatchEvent(new Event('focus'));
    window.dispatchEvent(new Event('online'));
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(refresh.callback).not.toHaveBeenCalled();
    expect(api.refetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(api.removeChannel).toHaveBeenCalledTimes(1);
  });
});

describe('tracker snapshot loading', () => {
  it('shares all applications documents with action-required flags and display', async () => {
    const notice = { ...attachment, document_type: 'resubmission_request', file_name: 'resubmission::Personal Data Sheet::Unreadable scan' };
    api.attachments.mockResolvedValue({ data: [notice], error: null });
    const details = await loadTrackerDetails(['a1', 'a2']);
    expect(api.attachments).toHaveBeenCalledExactlyOnceWith(['a1', 'a2'], 0);
    expect(pendingResubmissionIds(details.attachments!)).toEqual(new Set(['a1']));
  });

  it('distinguishes failed reads from authoritative empty results', async () => {
    api.refetch.mockResolvedValueOnce(null);
    api.attachments.mockResolvedValueOnce({ data: null, error: { message: 'offline' } });
    expect(await loadTrackerRefresh(lookup, ['a1'])).toMatchObject({ rows: null, attachments: null });
    expect(api.attachments).toHaveBeenCalledWith(['a1'], 0);
    api.refetch.mockResolvedValueOnce([]);
    expect(await loadTrackerRefresh(lookup, ['a1'])).toMatchObject({ rows: [], attachments: [] });
    expect(api.attachments).toHaveBeenCalledTimes(1);
  });

  it.each(['links', 'slots'] as const)('keeps failed %s reads distinct from empty successful outcomes', async (key) => {
    api[key].mockResolvedValueOnce({ ok: false, error: 'offline' });
    expect((await loadTrackerDetails(['a1'])).outcomesByApplicant).toBeNull();
    expect((await loadTrackerDetails(['a1'])).outcomesByApplicant).toEqual(new Map([['a1', []]]));
  });

  it('paginates a capped combined attachment snapshot without losing older documents', async () => {
    const documents = Array.from({ length: 5 }, (_, i) => ({ ...attachment, id: String(i) }));
    api.attachments.mockImplementation((_ids: string[], offset: number) => Promise.resolve({
      data: documents.slice(offset, offset + 2), count: 5, error: null,
    }));
    expect((await loadTrackerDetails(['a1', 'a2'])).attachments).toEqual(documents);
    expect(api.attachments.mock.calls.map((call) => call[1])).toEqual([0, 2, 4]);
  });
});
