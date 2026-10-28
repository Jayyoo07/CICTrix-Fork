import { describe, expect, it } from 'vitest';
import { updateSavedAccomplishments, updateSavedTargets, type IpcrSavedSnapshot } from './ipcrSavedSnapshot';

const saved = (): IpcrSavedSnapshot => ({
  targetRowsJson: JSON.stringify({ core: 'Saved Phase 1 target' }),
  employeeTargets: { core: 'Saved Phase 1 target', strategic: '', support: '' },
  accomplishmentsJson: JSON.stringify({ core: 'Saved accomplishment' }),
  selfRatingsJson: JSON.stringify({ core: 3 }),
  ipcrRowsJson: '[]',
});

describe('independent IPCR saved baselines', () => {
  it('keeps unsaved Phase 1 edits dirty after saving Phase 2', () => {
    const before = saved();
    const editedTargets = { core: 'Unsaved Phase 1 edit' };
    const result = updateSavedAccomplishments(before, { core: 'New accomplishment' }, { core: 4 });
    expect(result?.targetRowsJson).not.toBe(JSON.stringify(editedTargets));
    expect(result?.targetRowsJson).toBe(before.targetRowsJson);
    expect(result?.employeeTargets).toEqual(before.employeeTargets);
    expect(result?.accomplishmentsJson).toBe(JSON.stringify({ core: 'New accomplishment' }));
    expect(result?.selfRatingsJson).toBe(JSON.stringify({ core: 4 }));
  });

  it('keeps unsaved Phase 2 edits dirty after saving Phase 1', () => {
    const before = saved();
    const result = updateSavedTargets(before, { core: 'New target' }, { core: 'New target', strategic: '', support: '' });
    expect(result?.targetRowsJson).toBe(JSON.stringify({ core: 'New target' }));
    expect(result?.accomplishmentsJson).toBe(before.accomplishmentsJson);
    expect(result?.selfRatingsJson).toBe(before.selfRatingsJson);
    expect(result?.ipcrRowsJson).toBe(before.ipcrRowsJson);
  });

  it('does not fabricate a loaded baseline when the initial load has failed', () => {
    expect(updateSavedAccomplishments(null, {}, {})).toBeNull();
    expect(updateSavedTargets(null, {}, { core: '', strategic: '', support: '' })).toBeNull();
  });
});
