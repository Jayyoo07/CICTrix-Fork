import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompetencyGapPanel, summarizeGaps } from './CompetencyGapPanel';
import type { IPCRRatingRecord } from './SummaryOfRatings';

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  },
}));

vi.mock('../../../lib/api/competencyTargetTrace', () => ({
  getCompetencyTargetTrace: vi.fn().mockResolvedValue(null),
}));

const record = (
  competencies: IPCRRatingRecord['competencies'],
  overrides?: Partial<IPCRRatingRecord>,
): IPCRRatingRecord => ({
  id: 'EMP-1',
  department: 'Office of the City Engineer',
  name: 'Martin, Elizabeth',
  position: 'Construction & Maint General Foreman',
  period: 'January–June 2026',
  numericalRating: 3.67,
  remarks: '',
  submissionStatus: 'SUBMITTED',
  competencies,
  ...overrides,
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

describe('CompetencyGapPanel 4 explicit states', () => {
  it('renders "Analysis pending" state with clock icon and pending badge', () => {
    const pendingRecord = record([], { assessmentState: 'pending' });
    render(React.createElement(CompetencyGapPanel, { record: pendingRecord }));

    expect(screen.getByTestId('assessment-pending')).toBeInTheDocument();
    expect(screen.getByText('Analysis pending')).toBeInTheDocument();
    expect(screen.getByText(/queued or in progress/i)).toBeInTheDocument();
  });

  it('renders "Analysis pending" when assessmentState is running', () => {
    const runningRecord = record([], { assessmentState: 'running' });
    render(React.createElement(CompetencyGapPanel, { record: runningRecord }));

    expect(screen.getByTestId('assessment-pending')).toBeInTheDocument();
    expect(screen.getByText('Analysis pending')).toBeInTheDocument();
  });

  it('renders "Analysis failed" with error alert and "Retry assessment" trigger', async () => {
    const onRetry = vi.fn();
    const failedRecord = record([], { assessmentState: 'failed', cycleId: 6 });
    render(React.createElement(CompetencyGapPanel, { record: failedRecord, onRetryAssessment: onRetry }));

    expect(screen.getByTestId('assessment-failed')).toBeInTheDocument();
    expect(screen.getByText('Analysis failed')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /retry assessment/i });
    expect(retryBtn).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(retryBtn);
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(failedRecord);
  });

  it('renders "Never assessed" and clearly distinguishes from zero score', () => {
    const neverAssessedRecord = record([], { assessmentState: 'never_assessed' });
    render(React.createElement(CompetencyGapPanel, { record: neverAssessedRecord }));

    expect(screen.getByTestId('never-assessed')).toBeInTheDocument();
    expect(screen.getByText('Never assessed')).toBeInTheDocument();
    expect(screen.getByText(/distinct from a zero score/i)).toBeInTheDocument();
  });

  it('renders "Never assessed" when competencies are empty and no state is specified', () => {
    const emptyRecord = record([]);
    render(React.createElement(CompetencyGapPanel, { record: emptyRecord }));

    expect(screen.getByTestId('never-assessed')).toBeInTheDocument();
    expect(screen.getByText('Never assessed')).toBeInTheDocument();
  });

  it('renders "Required level not configured" for unconfigured position without gap badge', async () => {
    const unconfiguredRecord = record(
      [
        {
          name: 'Knowledge of Local Governance',
          possessed: 3.6,
          required: null,
          isGap: false,
          possessedAvailable: true,
        },
      ],
      { assessmentState: 'complete' },
    );
    await act(async () => {
      render(React.createElement(CompetencyGapPanel, { record: unconfiguredRecord }));
    });

    expect(screen.getByText('Required level not configured')).toBeInTheDocument();
    expect(screen.queryByText('Gap')).not.toBeInTheDocument();
  });

  it('renders all four training stream blocks when competencies are present', async () => {
    const fullRecord = record(
      [
        { name: 'Knowledge of Local Governance', possessed: 0, required: 3, isGap: false, possessedAvailable: false, stream: 'LEADERSHIP' },
        { name: 'Fiscal Management/Budgeting for LGU', possessed: 0, required: 4, isGap: false, possessedAvailable: false, stream: 'TECHNICAL' },
        { name: 'Community Engagement Skills', possessed: 0, required: 3, isGap: false, possessedAvailable: false, stream: 'EMPLOYEE DEVELOPMENT' },
        { name: 'Transparency and Accountability Practices', possessed: 0, required: 3, isGap: false, possessedAvailable: false, stream: 'CULTURAL TRANSFORMATION' },
      ],
      { assessmentState: 'never_assessed' },
    );

    await act(async () => {
      render(React.createElement(CompetencyGapPanel, { record: fullRecord }));
    });

    // Both the never-assessed banner and the 4 stream blocks must be rendered
    expect(screen.getByTestId('never-assessed')).toBeInTheDocument();
    expect(screen.getByTestId('stream-block-leadership')).toBeInTheDocument();
    expect(screen.getByTestId('stream-block-technical')).toBeInTheDocument();
    expect(screen.getByTestId('stream-block-employee-development')).toBeInTheDocument();
    expect(screen.getByTestId('stream-block-cultural-transformation')).toBeInTheDocument();

    // Check that cards show "Not yet assessed"
    expect(screen.getAllByText('Not yet assessed')).toHaveLength(4);
  });
});
