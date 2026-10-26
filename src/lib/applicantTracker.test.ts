import { beforeEach, describe, expect, it, vi } from 'vitest';

const { eqMock, rpcMock, rowsByValue } = vi.hoisted(() => ({
  eqMock: vi.fn(),
  rpcMock: vi.fn(),
  rowsByValue: new Map<string, unknown[]>(),
}));

vi.mock('./supabase', () => {
  const chain = (value: { current: string }): any => ({
    select: () => chain(value),
    eq: (column: string, v: string) => {
      eqMock(column, v);
      value.current = v;
      return chain(value);
    },
    order: async () => ({ data: rowsByValue.get(value.current) ?? [], error: null }),
  });
  return {
    supabase: {
      from: () => chain({ current: '' }),
      rpc: (...args: unknown[]) => rpcMock(...args),
    },
  };
});

import {
  fetchTrackerApplications,
  pendingResubmissionTypes,
  pickDefaultApplicationId,
  type TrackerAttachment,
} from './applicantTracker';

beforeEach(() => {
  eqMock.mockClear();
  rpcMock.mockReset();
  rowsByValue.clear();
});

const app = (id: string, status: string, schedule = false) => ({
  id,
  status,
  exam_date: schedule ? '2026-10-30' : null,
  interview_date: null,
});

describe('pickDefaultApplicationId', () => {
  it('opens the first application waiting on the applicant, not the newest', () => {
    const apps = [app('newest', 'Under Initial Screening'), app('needs-docs', 'Pending'), app('old', 'Submitted')];
    expect(pickDefaultApplicationId(apps, new Set())).toBe('needs-docs');
  });

  it('counts an unresolved resubmission notice as waiting on the applicant', () => {
    const apps = [app('newest', 'Submitted'), app('flagged', 'Under Initial Screening')];
    expect(pickDefaultApplicationId(apps, new Set(['flagged']))).toBe('flagged');
  });

  it('counts an upcoming schedule, but not one left on a decided application', () => {
    const scheduled = [app('newest', 'Submitted'), app('interview', 'Interview/Exam Scheduled', true)];
    expect(pickDefaultApplicationId(scheduled, new Set())).toBe('interview');

    const decided = [app('newest', 'Submitted'), app('qualified', 'Qualified', true)];
    expect(pickDefaultApplicationId(decided, new Set())).toBe('newest');
  });

  it('never opens a closed application first, and falls back to the newest', () => {
    const apps = [app('newest', 'Under Initial Screening'), app('closed', 'Disqualified')];
    expect(pickDefaultApplicationId(apps, new Set(['closed']))).toBe('newest');
  });

  it('returns null for no applications', () => {
    expect(pickDefaultApplicationId([], new Set())).toBeNull();
  });
});

describe('pendingResubmissionTypes', () => {
  const notice = (created_at: string): TrackerAttachment => ({
    id: `n-${created_at}`,
    file_name: 'resubmission::Transcript of Records::Unreadable scan',
    file_path: '—',
    document_type: 'resubmission_request',
    created_at,
  });
  const upload = (created_at: string): TrackerAttachment => ({
    id: `u-${created_at}`,
    file_name: 'tor.pdf',
    file_path: `x/${created_at}-tor.pdf`,
    document_type: 'transcript_of_records',
    created_at,
  });

  it('is pending while no upload of that document came after the notice', () => {
    const rows = [upload('2026-10-20T00:00:00Z'), notice('2026-10-21T00:00:00Z')];
    expect([...pendingResubmissionTypes(rows)]).toEqual(['transcript_of_records']);
  });

  it('resolves once a newer upload of that document exists', () => {
    const rows = [notice('2026-10-21T00:00:00Z'), upload('2026-10-22T00:00:00Z')];
    expect(pendingResubmissionTypes(rows).size).toBe(0);
  });
});

describe('fetchTrackerApplications', () => {
  it('resolves an alias to the primary number, so every application is found', async () => {
    rpcMock.mockResolvedValue({ data: 'ABYAN-584-392', error: null });
    rowsByValue.set('ABYAN584392', [{ id: 'a' }, { id: 'b' }]);

    const { rows, lookup } = await fetchTrackerApplications('abyan-111-222');

    expect(rpcMock).toHaveBeenCalledWith('resolve_application_reference', { raw: 'abyan-111-222' });
    expect(rows).toHaveLength(2);
    expect(lookup).toEqual({ col: 'reference_no_normalized', val: 'ABYAN584392' });
  });

  it('tries the number as typed when the resolver knows nothing', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    rowsByValue.set('ABYAN584392', [{ id: 'a' }]);

    const { rows } = await fetchTrackerApplications('ABYAN 584 392');
    expect(rows).toHaveLength(1);
  });

  it('looks an email up in lower case without calling the resolver', async () => {
    rowsByValue.set('patricia@example.com', [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);

    const { rows, lookup } = await fetchTrackerApplications('Patricia@Example.com');

    expect(rpcMock).not.toHaveBeenCalled();
    expect(rows).toHaveLength(3);
    expect(lookup).toEqual({ col: 'email', val: 'patricia@example.com' });
  });

  it('returns no lookup when nothing matches', async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    const { rows, lookup } = await fetchTrackerApplications('ABYAN-000-000');
    expect(rows).toEqual([]);
    expect(lookup).toBeNull();
  });
});
