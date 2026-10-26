import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ from: vi.fn(), scores: vi.fn(), upsert: vi.fn() }));
vi.mock('../supabase', () => ({ supabase: { from: api.from } }));
vi.mock('./succession', () => ({ getLatestOverallScores: api.scores }));
vi.mock('./semesterTransition', () => ({ getLndSourceCycleId: async () => 7 }));
vi.mock('./departments', () => ({ getActiveOfficeNameSet: async () => new Set(['engineering']) }));

import { generateRecommendations, getOfficeEmployeesWithScores } from './trainingRecommendations';

beforeEach(() => {
  vi.resetAllMocks();
  api.scores.mockRejectedValue(new Error('Unable to load department weights for IPCR scoring. Please try again.'));
  const tables: Record<string, unknown[]> = {
    training_sessions: [{
      id: 's', title: 'Course', category: 'Technical', capacity: 10, objectives: ['Ethical Conduct and Public Service Standards'],
      instructor_name: 'Trainer', location: 'Room', description: 'Description', materials: 'Notes', prerequisites: 'None', scheduled_date: '2099-01-01',
      training_competencies: [{ training_competency_tags: { name: 'Ethical Conduct and Public Service Standards' } }],
    }],
    ipcr_competency_matches: [{ employee_id: 'e', competency: 'Ethical Conduct and Public Service Standards' }],
    employees_with_department: [{ id: 'e', full_name: 'Test Employee', department: 'Engineering', status: 'Active' }],
  };
  api.from.mockImplementation((table: string) => {
    const query = {
      select: () => query, in: () => query, eq: () => query, gte: () => query, lt: () => query, not: () => query,
      upsert: api.upsert,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: tables[table] ?? [], error: null })),
    };
    return query;
  });
});

describe('shared L&D scoring callers', () => {
  it('returns a scoring failure before any recommendation persistence (mocked database only)', async () => {
    expect(await generateRecommendations()).toMatchObject({ ok: false, error: expect.stringContaining('IPCR') });
    expect(api.scores).toHaveBeenCalledWith(['e'], 7);
    expect(api.upsert).not.toHaveBeenCalled();
    expect(api.from).not.toHaveBeenCalledWith('training_recommendations');
  });

  it('rejects a picker score failure instead of labelling the employee never rated', async () => {
    await expect(getOfficeEmployeesWithScores('Engineering')).rejects.toThrow('IPCR');
    expect(api.scores).toHaveBeenCalledWith(['e'], 7);
  });

  it('still labels a genuinely unrated employee correctly after a successful read', async () => {
    api.scores.mockResolvedValue(new Map());
    expect(await getOfficeEmployeesWithScores('Engineering')).toMatchObject([{ id: 'e', hasIpcr: false, overallLabel: 'No rating yet' }]);
  });
});
