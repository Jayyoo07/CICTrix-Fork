import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompetencyGapPanel, summarizeGaps } from './CompetencyGapPanel';
import type { IPCRRatingRecord } from './SummaryOfRatings';
import { getCompetencyTargetTrace, type CompetencyTargetTrace } from '../../../lib/api/competencyTargetTrace';

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

describe('CompetencyGapPanel TraceDetail drawer', () => {
  it('expands TraceDetail drawer when a competency card is clicked and renders targets, Q/E/T, confidence, justification, and average calculation', async () => {
    const mockTrace: CompetencyTargetTrace = {
      competency: 'Knowledge of Local Governance',
      position: 'Construction & Maint General Foreman',
      mappedTargets: [
        {
          targetText: 'Core Function — Oversee road repair and drainage maintenance',
          functionType: 'Core Function',
          individualScore: 4.2,
          quality: 4,
          efficiency: 4,
          timeliness: 4.6,
          confidence: 0.95,
          justification: 'Evidences knowledge of municipal project supervision guidelines.',
        },
        {
          targetText: 'Support Function — Prepare monthly accomplishment reports',
          functionType: 'Support Function',
          individualScore: 3.8,
          quality: 4,
          efficiency: 4,
          timeliness: 3.4,
          confidence: 0.88,
          justification: 'Evidences administrative governance reporting standards.',
        },
      ],
      aggregationMethod: 'average',
      possessedComputed: 4.0,
      possessedStored: 4.0,
      required: 3,
      requiredLevel: 'Intermediate',
      requiredLevelCode: 'I',
    };

    vi.mocked(getCompetencyTargetTrace).mockResolvedValueOnce(mockTrace);

    const testRecord = record([
      { name: 'Knowledge of Local Governance', possessed: 4.0, required: 3.0, isGap: false, stream: 'LEADERSHIP' },
    ]);

    await act(async () => {
      render(React.createElement(CompetencyGapPanel, { record: testRecord }));
    });

    const cardBtn = screen.getByRole('button', { name: /Knowledge of Local Governance/i });
    expect(cardBtn).toHaveAttribute('aria-expanded', 'false');

    await act(async () => {
      fireEvent.click(cardBtn);
    });

    expect(cardBtn).toHaveAttribute('aria-expanded', 'true');
    expect(await screen.findByTestId('trace-detail-drawer')).toBeInTheDocument();

    // Required section from Competency Map
    expect(screen.getByText(/Required — from Competency Map/i)).toBeInTheDocument();
    expect(screen.getByText(/Intermediate \(3\.00\)/i)).toBeInTheDocument();

    // Mapped targets header & items
    expect(screen.getByText('Mapped IPCR targets')).toBeInTheDocument();
    expect(screen.getByText('Core Function —')).toBeInTheDocument();
    expect(screen.getByText('Oversee road repair and drainage maintenance')).toBeInTheDocument();
    expect(screen.getByText('Support Function —')).toBeInTheDocument();
    expect(screen.getByText('Prepare monthly accomplishment reports')).toBeInTheDocument();

    // Individual scores & ratings
    expect(screen.getByText('4.20')).toBeInTheDocument();
    expect(screen.getByText('3.80')).toBeInTheDocument();
    expect(screen.getAllByText('Q 4')).toHaveLength(2);
    expect(screen.getByText('T 4.6')).toBeInTheDocument();

    // Confidence badges
    expect(screen.getByText('95% confidence')).toBeInTheDocument();
    expect(screen.getByText('88% confidence')).toBeInTheDocument();

    // Justifications
    expect(screen.getByText('Evidences knowledge of municipal project supervision guidelines.')).toBeInTheDocument();
    expect(screen.getByText('Evidences administrative governance reporting standards.')).toBeInTheDocument();

    // Aggregation explanation
    expect(screen.getByText(/average of 2 IPCR targets mapped to this competency/i)).toBeInTheDocument();
    expect(screen.getByText(/mean 4\.00/i)).toBeInTheDocument();
  });

  it('renders single target trace aggregation clearly', async () => {
    const singleTrace: CompetencyTargetTrace = {
      competency: 'Technical Writing for Government Documents',
      position: 'Construction & Maint General Foreman',
      mappedTargets: [
        {
          targetText: 'Core Function — Draft engineering inspection reports',
          functionType: 'Core Function',
          individualScore: 2.5,
          quality: 2,
          efficiency: 3,
          timeliness: 2.5,
          confidence: 0.92,
          justification: 'Involves drafting official engineering reports.',
        },
      ],
      aggregationMethod: 'single',
      possessedComputed: 2.5,
      possessedStored: 2.5,
      required: 4,
      requiredLevel: 'Advanced',
      requiredLevelCode: 'A',
    };

    vi.mocked(getCompetencyTargetTrace).mockResolvedValueOnce(singleTrace);

    const testRecord = record([
      { name: 'Technical Writing for Government Documents', possessed: 2.5, required: 4.0, isGap: true, stream: 'TECHNICAL' },
    ]);

    await act(async () => {
      render(React.createElement(CompetencyGapPanel, { record: testRecord }));
    });

    const cardBtn = screen.getByRole('button', { name: /Technical Writing for Government Documents/i });
    await act(async () => {
      fireEvent.click(cardBtn);
    });

    expect(await screen.findByTestId('trace-detail-drawer')).toBeInTheDocument();
    expect(screen.getByText('Mapped IPCR target')).toBeInTheDocument();
    expect(screen.getByText(/comes directly from the single mapped IPCR target above \(scored 2\.50\)/i)).toBeInTheDocument();
    expect(screen.getByText('92% confidence')).toBeInTheDocument();
  });

  it('renders clear empty state when no IPCR target is mapped', async () => {
    const emptyTrace: CompetencyTargetTrace = {
      competency: 'Disaster Risk Reduction and Management',
      position: 'Construction & Maint General Foreman',
      mappedTargets: [],
      aggregationMethod: 'none',
      possessedComputed: null,
      possessedStored: null,
      required: 3,
      requiredLevel: null,
      requiredLevelCode: null,
    };

    vi.mocked(getCompetencyTargetTrace).mockResolvedValueOnce(emptyTrace);

    const testRecord = record([
      { name: 'Disaster Risk Reduction and Management', possessed: 3.0, required: 3.0, isGap: false, stream: 'TECHNICAL' },
    ]);

    await act(async () => {
      render(React.createElement(CompetencyGapPanel, { record: testRecord }));
    });

    const cardBtn = screen.getByRole('button', { name: /Disaster Risk Reduction and Management/i });
    await act(async () => {
      fireEvent.click(cardBtn);
    });

    expect(await screen.findByTestId('trace-detail-drawer')).toBeInTheDocument();
    expect(screen.getByText(/No IPCR target is currently mapped to this competency/i)).toBeInTheDocument();
  });

  it('renders pending assessment note when possessedAvailable is false', async () => {
    const pendingTrace: CompetencyTargetTrace = {
      competency: 'Community Engagement Skills',
      position: 'Construction & Maint General Foreman',
      mappedTargets: [
        {
          targetText: 'Support Function — Coordinate community consultations',
          functionType: 'Support Function',
          individualScore: null,
          quality: null,
          efficiency: null,
          timeliness: null,
          confidence: 0.9,
          justification: 'Target maps to community outreach.',
        },
      ],
      aggregationMethod: 'none',
      possessedComputed: null,
      possessedStored: null,
      required: 3,
      requiredLevel: null,
      requiredLevelCode: null,
    };

    vi.mocked(getCompetencyTargetTrace).mockResolvedValueOnce(pendingTrace);

    const testRecord = record([
      { name: 'Community Engagement Skills', possessed: 0, required: 3.0, isGap: false, possessedAvailable: false, stream: 'EMPLOYEE DEVELOPMENT' },
    ]);

    await act(async () => {
      render(React.createElement(CompetencyGapPanel, { record: testRecord }));
    });

    const cardBtn = screen.getByRole('button', { name: /Community Engagement Skills/i });
    await act(async () => {
      fireEvent.click(cardBtn);
    });

    expect(await screen.findByTestId('trace-detail-drawer')).toBeInTheDocument();
    expect(screen.getByText(/Possessed score is awaiting competency assessment for this semester/i)).toBeInTheDocument();
  });
});
