import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyTargets, flattenForWorkspace, hasTargetContent, hasSubmittableTarget, loadLatestTargetSetting, loadTargetSetting, saveTargetSetting } from './ipcrTargets';
import { getWorkspace, saveAccomplishments, saveTargets } from './ipcrWorkspace';

const db = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, any>>>,
  failRead: '',
  failInsert: '',
  hideIndicators: false,
  nextId: 0,
}));

vi.mock('../supabase', () => ({
  supabase: {
    from(table: string) {
      let action = 'read';
      let payload: any;
      let conflict = '';
      let single = false;
      const filters: Array<(row: any) => boolean> = [];
      const query: any = {
        select: () => query,
        eq: (key: string, value: any) => { filters.push((row) => row[key] === value); return query; },
        in: (key: string, values: any[]) => { filters.push((row) => values.includes(row[key])); return query; },
        order: () => query,
        limit: () => query,
        single: () => { single = true; return query; },
        maybeSingle: () => { single = true; return query; },
        delete: () => { action = 'delete'; return query; },
        insert: (value: any) => { action = 'insert'; payload = value; return query; },
        update: (value: any) => { action = 'update'; payload = value; return query; },
        upsert: (value: any, options: any) => { action = 'upsert'; payload = value; conflict = options.onConflict; return query; },
        then(resolve: any, reject: any) {
          return Promise.resolve().then(() => {
            if ((action === 'read' && db.failRead === table) || (action === 'insert' && db.failInsert === table)) {
              return { data: null, error: { message: `${table} request failed` } };
            }
            const rows = db.tables[table] ?? (db.tables[table] = []);
            const matches = (row: any) => filters.every((test) => test(row));
            let result: any[] = [];
            if (action === 'read') result = db.hideIndicators && table === 'success_indicators' ? [] : rows.filter(matches);
            if (action === 'update') {
              result = rows.filter(matches);
              for (const row of result) Object.assign(row, payload);
            }
            if (action === 'delete') {
              const removed = rows.filter(matches);
              db.tables[table] = rows.filter((row) => !matches(row));
              if (table === 'mfos') {
                db.tables.success_indicators = (db.tables.success_indicators ?? []).filter((si) => !removed.some((mfo) => mfo.id === si.mfo_id));
              }
            }
            if (action === 'insert' || action === 'upsert') {
              for (const input of Array.isArray(payload) ? payload : [payload]) {
                const existing = action === 'upsert' ? rows.find((row) => conflict.split(',').every((key) => row[key] === input[key])) : null;
                if (existing) { Object.assign(existing, input); result.push(existing); }
                else { const row = { id: `row-${++db.nextId}`, ...input }; rows.push(row); result.push(row); }
              }
            }
            return { data: single ? result[0] ?? null : result.map((row) => ({ ...row })), error: null };
          }).then(resolve, reject);
        },
      };
      return query;
    },
  },
}));
vi.mock('./phaseSchedules', () => ({
  loadEffectiveSchedules: async () => ({ target: { mode: 'Open' } }),
  effectiveState: () => 'Open',
}));
vi.mock('./performanceEvaluations', () => ({ bucketForScore: () => 'Satisfactory' }));
vi.mock('./ipcrSubmissions', () => ({ setSubmissionStage: vi.fn() }));
vi.mock('./officeWeighting', () => ({ resolveOfficeWeights: async () => null }));

const identity = {
  employeeId: 'employee-1', employeeNum: 'EMP-1', employeeName: 'Ana Cruz',
  officeId: null, officeName: 'City Health Office', period: 'July–December 2026', updatedBy: 'employee',
};
const targets = () => {
  const value = emptyTargets();
  value.core = [
    { title: 'Payroll', indicators: [{ description: 'Process payroll in 3 days' }, { description: 'Verify all records' }] },
    { title: 'Reports', indicators: [{ description: 'Submit monthly reports' }] },
  ];
  value.strategic = [{ title: 'Training', indicators: [{ description: 'Conduct two sessions' }] }];
  return value;
};

beforeEach(() => {
  db.tables = {}; db.failRead = ''; db.failInsert = ''; db.hideIndicators = false; db.nextId = 0;
});

describe('employee IPCR save and reload', () => {
  it('restores Phase 1 after saving, editing, and saving Phase 2', async () => {
    const input = targets();
    const save = () => saveTargetSetting({ employeeId: identity.employeeId, cycleId: 1, targets: input, submit: false });
    expect((await save()).ok).toBe(true);
    input.core[0].indicators[0].description = 'Process payroll in 2 days';
    expect((await save()).ok).toBe(true);
    const flattened = {
      core: flattenForWorkspace(input.core), strategic: flattenForWorkspace(input.strategic), support: flattenForWorkspace(input.support),
    };
    expect((await saveTargets({ ...identity, ...flattened, submit: false })).ok).toBe(true);
    const before = await loadTargetSetting(identity.employeeId, 1);
    expect(before.ok).toBe(true);
    if (!before.ok) throw new Error('Phase 1 reload failed');
    expect(flattenForWorkspace(before.data.targets.core)).toBe(flattened.core);
    const category = { accomplishment: 'Completed payroll', quality: 4, efficiency: 4, timeliness: 5, weight: null };
    expect((await saveAccomplishments({ ...identity, core: category, strategic: category, support: category, submit: false })).ok).toBe(true);
    const after = await loadTargetSetting(identity.employeeId, 1);
    expect(after).toEqual(before);
    const workspace = await getWorkspace(identity.employeeId, identity.period);
    expect(workspace?.core_target).toBe(flattened.core);
    expect(workspace?.strategic_target).toBe(flattened.strategic);
    expect(workspace?.core_accomplishment).toBe('Completed payroll');
    expect(db.tables.mfos).toHaveLength(3);
  });

  it.each(['mfos', 'success_indicators'])('reports a failed %s read instead of returning blank targets', async (table) => {
    expect((await saveTargetSetting({ employeeId: identity.employeeId, cycleId: 1, targets: targets(), submit: false })).ok).toBe(true);
    db.failRead = table;
    expect(await loadTargetSetting(identity.employeeId, 1)).toEqual({ ok: false, error: `${table} request failed` });
  });

  it('does not report success if saved indicators cannot be read back', async () => {
    db.hideIndicators = true;
    const result = await saveTargetSetting({ employeeId: identity.employeeId, cycleId: 1, targets: targets(), submit: false });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.error).toContain('could not be verified');
  });

  it.each(['mfos', 'success_indicators'])('preserves the previous draft when replacing %s fails', async (table) => {
    const original = targets();
    const save = (value: ReturnType<typeof targets>) => saveTargetSetting({ employeeId: identity.employeeId, cycleId: 1, targets: value, submit: false });
    expect((await save(original)).ok).toBe(true);
    const edit = targets();
    edit.core[0].title = 'Revised payroll';
    db.failInsert = table;
    expect((await save(edit)).ok).toBe(false);
    db.failInsert = '';
    const reloaded = await loadTargetSetting(identity.employeeId, 1);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) expect(flattenForWorkspace(reloaded.data.targets.core)).toBe(flattenForWorkspace(original.core));
  });

  it('retains the previous draft if replacement verification fails', async () => {
    const original = targets();
    const save = (value: ReturnType<typeof targets>) => saveTargetSetting({ employeeId: identity.employeeId, cycleId: 1, targets: value, submit: false });
    expect((await save(original)).ok).toBe(true);
    db.hideIndicators = true;
    const edit = targets();
    edit.core[0].title = 'Replacement';
    expect((await save(edit)).ok).toBe(false);
    db.hideIndicators = false;
    const reloaded = await loadTargetSetting(identity.employeeId, 1);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) expect(flattenForWorkspace(reloaded.data.targets.core)).toBe(flattenForWorkspace(original.core));
  });

  it('leaves a failed submission editable and allows a successful retry', async () => {
    db.failInsert = 'success_indicators';
    const submit = () => saveTargetSetting({ employeeId: identity.employeeId, cycleId: 1, targets: targets(), submit: true });
    expect((await submit()).ok).toBe(false);
    expect(db.tables.target_settings[0].status).toBe('draft');
    db.failInsert = '';
    const result = await submit();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe('submitted_for_approval');
    const reloaded = await loadTargetSetting(identity.employeeId, 1);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) expect(flattenForWorkspace(reloaded.data.targets.core)).toBe(flattenForWorkspace(targets().core));
  });
});


describe('partial Phase 1 draft recovery', () => {
  it('restores title-only drafts without treating them as ready to submit', async () => {
    const partial = emptyTargets();
    partial.core[0].title = 'Prepare payroll';
    expect(hasTargetContent(partial)).toBe(true);
    expect(hasSubmittableTarget(partial)).toBe(false);
    expect((await saveTargetSetting({ employeeId: identity.employeeId, cycleId: 1, targets: partial, submit: false })).ok).toBe(true);
    const restored = await loadTargetSetting(identity.employeeId, 1);
    expect(restored.ok).toBe(true);
    if (restored.ok) {
      expect(restored.data.targets.core[0].title).toBe('Prepare payroll');
      expect(hasTargetContent(restored.data.targets)).toBe(true);
    }
  });

  it('recovers a partial draft instead of selecting an empty fallback record', async () => {
    db.tables.target_settings = [
      { id: 'empty', employee_id: identity.employeeId, cycle_id: 2, status: 'draft' },
      { id: 'partial', employee_id: identity.employeeId, cycle_id: 1, status: 'draft' },
    ];
    db.tables.mfos = [{ id: 'mfo-partial', target_setting_id: 'partial', function_type: 'core', title: 'Prepare payroll', sort_order: 0 }];
    const restored = await loadLatestTargetSetting(identity.employeeId);
    expect(restored.ok).toBe(true);
    if (restored.ok) expect(restored.data.setting?.id).toBe('partial');
  });
});
