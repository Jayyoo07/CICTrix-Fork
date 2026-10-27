import { describe, expect, it } from 'vitest';
import { summarizeGaps } from './CompetencyGapPanel';
import type { IPCRRatingRecord } from './SummaryOfRatings';

const record = (competencies: IPCRRatingRecord['competencies']): IPCRRatingRecord => ({
  id: 'EMP-1',
  department: 'Office of the City Engineer',
  name: 'Martin, Elizabeth',
  position: 'Construction & Maint General Foreman',
  period: 'All rated periods',
  numericalRating: 3.67,
  remarks: '',
  submissionStatus: 'SUBMITTED',
  competencies,
});

describe('summarizeGaps', () => {
  it('says no evaluation exists when the panel has nothing', () => {
    expect(summarizeGaps(record([]))).toContain('No competency evaluation');
  });

  it('does not claim a gap when the Map has no required level', () => {
    const text = summarizeGaps(
      record([
        { name: 'Knowledge of Local Governance', possessed: 3.6, required: null, isGap: false },
        { name: 'Public Communication Skills', possessed: 4.1, required: null, isGap: false },
      ]),
    );
    expect(text).toContain('no required level for the Construction & Maint General Foreman role');
    expect(text).not.toContain('development need');
  });

  it('reports configured gaps and counts unconfigured competencies separately', () => {
    const text = summarizeGaps(
      record([
        { name: 'Technical Writing for Government Documents', possessed: 2.4, required: 4, isGap: true },
        { name: 'Data and Records Management and Organization', possessed: 3.2, required: null, isGap: false },
      ]),
    );
    expect(text).toContain('development need in 1 competency');
    expect(text).toContain('1 competency has no required level configured');
  });

  it('keeps a pending assessment out of the strengths and gaps', () => {
    const text = summarizeGaps(
      record([
        {
          name: 'Ethical Conduct and Public Service Standards',
          possessed: 0,
          required: 4,
          isGap: false,
          possessedAvailable: false,
        },
      ]),
    );
    expect(text).toContain("hasn't run yet");
    expect(text).toContain('awaiting competency assessment');
  });
});
