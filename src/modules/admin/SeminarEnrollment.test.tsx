import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  employees: vi.fn(), generate: vi.fn(), add: vi.fn(), candidates: vi.fn(), all: vi.fn(),
  counts: vi.fn(), send: vi.fn(), dismiss: vi.fn(),
}));
vi.mock('../../lib/api/trainingRecommendations', () => ({
  getOfficeEmployeesWithScores: api.employees,
  generateRecommendations: api.generate,
  lndAddAttendees: api.add,
  getManualPickerOffices: async () => [{ office: 'Engineering', relatedGapCount: 1 }, { office: 'Finance', relatedGapCount: 0 }],
  listRecommendationCandidates: api.candidates,
  listAllRecommendations: api.all,
  sendBatchToOffice: api.send,
  dismissRecommendation: api.dismiss,
  listRosterGroups: async () => [],
  listNextMonthPublishedCourses: async () => [{ sessionId: 's', title: 'Test course', category: 'Technical', start: '2099-01-01', capacity: 10, competencies: [] }],
  listRecommendationEvents: async () => [],
}));
vi.mock('../../lib/api/lndArchive', () => ({ getCurrentYearTrainingCounts: api.counts }));
vi.mock('../../lib/api/trainingNeeds', () => ({ computeNeedsAssessment: async () => [] }));
vi.mock('../../lib/api/trainingLifecycle', () => ({ isLocked: () => false, LOCK_LEAD_DAYS: 3 }));

import { SeminarEnrollment } from './SeminarEnrollment';
import type { PipelineRecFull } from '../../lib/api/trainingRecommendations';

const openPicker = async () => {
  render(<SeminarEnrollment />);
  fireEvent.click(await screen.findByRole('button', { name: /Test course/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Add Attendee' }));
  return within(await screen.findByRole('dialog'));
};

beforeEach(() => {
  vi.resetAllMocks();
  api.generate.mockResolvedValue({ ok: true });
  api.employees.mockResolvedValue([{ id: 'e', name: 'Test Employee', hasIpcr: true, overallLabel: '4.2/5', cycle: '2026' }]);
  api.candidates.mockResolvedValue([]);
  api.all.mockResolvedValue([]);
  api.counts.mockResolvedValue({ ok: true, counts: new Map() });
  api.send.mockResolvedValue({ ok: true });
  api.dismiss.mockResolvedValue({ ok: true });
});

const candidate = (id = 'a', overrides: Partial<PipelineRecFull> = {}): PipelineRecFull => ({
  id: `rec-${id}`, employeeId: id, employeeName: `Employee ${id}`, department: 'Engineering',
  position: 'Engineer', sessionId: 's', sessionTitle: 'Test course', sessionCategory: 'Technical',
  sessionStart: '2099-01-01', sessionCapacity: 10, competency: 'Project Management in a Public Setting',
  priority: 'LOW', status: 'SUGGESTED', triggerScoreLabel: '4/5', gapDetail: 'Development need',
  officeActor: null, batchId: null, source: 'ai_recommended', ...overrides,
});

function showCandidates(rows = [candidate()]) {
  api.candidates.mockImplementation(async () => [...rows]);
  api.all.mockResolvedValue(rows);
}

async function openRecommendations() {
  const view = render(<SeminarEnrollment />);
  fireEvent.click(await screen.findByRole('button', { name: /Test course/ }));
  return view;
}

describe('annual training progress in recommendations', () => {
  it('shows each employee\'s actual current-year count out of two without hiding over-target candidates', async () => {
    showCandidates(['a', 'b', 'c', 'd'].map((id) => candidate(id)));
    api.counts.mockResolvedValue({ ok: true, counts: new Map([['a', 0], ['b', 1], ['c', 2], ['d', 3]]) });
    await openRecommendations();

    for (const [id, count] of [['a', 0], ['b', 1], ['c', 2], ['d', 3]] as const) {
      const row = screen.getByText(`Employee ${id}`).closest('li')!;
      expect(await within(row).findByText(`${count}/2 Completed this year`)).toBeInTheDocument();
      expect(within(row).getByRole('checkbox', { name: 'Accept' })).toBeEnabled();
    }
    expect(api.counts).toHaveBeenCalledWith(['a', 'b', 'c', 'd']);
  });

  it('keeps names and selection available while counts are loading', async () => {
    showCandidates();
    let resolveCounts: (value: unknown) => void;
    api.counts.mockReturnValue(new Promise((resolve) => { resolveCounts = resolve; }));
    await openRecommendations();

    expect(screen.getByText('Employee a')).toBeInTheDocument();
    expect(await screen.findByText('Loading training count…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Accept' }));
    expect(screen.getByRole('checkbox', { name: 'Accept' })).toBeChecked();
    expect(screen.queryByText('0/2 Completed this year')).not.toBeInTheDocument();
    await act(async () => { resolveCounts({ ok: true, counts: new Map([['a', 1]]) }); });
    expect(await screen.findByText('1/2 Completed this year')).toBeInTheDocument();
  });

  it.each(['result', 'rejection'])('shows Unavailable, not zero, on count %s failure', async (failure) => {
    showCandidates();
    if (failure === 'result') api.counts.mockResolvedValue({ ok: false, counts: new Map(), error: 'Could not read history' });
    else api.counts.mockRejectedValue(new Error('Network unavailable'));
    await openRecommendations();

    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('0/2 Completed this year')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Accept' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeEnabled();
  });

  it('does not mislabel a missing employee in an incomplete successful response as zero', async () => {
    showCandidates();
    await openRecommendations();
    expect(await screen.findByText('Unavailable')).toBeInTheDocument();
    expect(screen.queryByText('0/2 Completed this year')).not.toBeInTheDocument();
  });

  it.each([
    ['Sent to Office Account', 'LND_APPROVED'],
    ['Returned to L&D', 'OFFICE_FINALIZED'],
  ] as const)('does not add the indicator to the %s subtab', async (tab, status) => {
    showCandidates();
    api.all.mockResolvedValue([candidate('later', { status })]);
    api.counts.mockResolvedValue({ ok: true, counts: new Map([['a', 1]]) });
    await openRecommendations();
    expect(await screen.findByText('1/2 Completed this year')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(tab) }));

    expect(await screen.findByText('Employee later')).toBeInTheDocument();
    expect(screen.queryByText(/Completed this year/)).not.toBeInTheDocument();
    expect(screen.queryByText('Unavailable')).not.toBeInTheDocument();
  });

  it('loads each employee once across courses and refreshes progress after regeneration', async () => {
    showCandidates([candidate(), candidate('a', { id: 'rec-a-other', sessionId: 'other' })]);
    api.counts.mockResolvedValueOnce({ ok: true, counts: new Map([['a', 1]]) })
      .mockResolvedValue({ ok: true, counts: new Map([['a', 2]]) });
    await openRecommendations();
    expect(await screen.findByText('1/2 Completed this year')).toBeInTheDocument();
    expect(api.counts).toHaveBeenLastCalledWith(['a']);

    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(await screen.findByText('2/2 Completed this year')).toBeInTheDocument();
  });

  it('still routes selected over-target employees to the office', async () => {
    showCandidates();
    api.counts.mockResolvedValue({ ok: true, counts: new Map([['a', 3]]) });
    await openRecommendations();
    expect(await screen.findByText('3/2 Completed this year')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Accept' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send to Office Account (1)' }));

    await waitFor(() => expect(api.send).toHaveBeenCalledWith(['rec-a'], 'L&D Admin'));
    expect(await screen.findByText('Sent 1 recommendation(s) to the offices.')).toBeInTheDocument();
  });

  it('ignores an old count response after a newer refresh', async () => {
    showCandidates();
    let resolveOld: (value: unknown) => void;
    api.counts.mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValue({ ok: true, counts: new Map([['a', 2]]) });
    await openRecommendations();
    expect(await screen.findByText('Loading training count…')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate' }));
    expect(await screen.findByText('2/2 Completed this year')).toBeInTheDocument();
    await act(async () => { resolveOld({ ok: true, counts: new Map([['a', 0]]) }); });
    expect(screen.getByText('2/2 Completed this year')).toBeInTheDocument();
    expect(screen.queryByText('0/2 Completed this year')).not.toBeInTheDocument();
  });

  it('ignores a count request that finishes after unmount', async () => {
    showCandidates();
    let resolveCounts: (value: unknown) => void;
    api.counts.mockReturnValue(new Promise((resolve) => { resolveCounts = resolve; }));
    const view = await openRecommendations();
    expect(await screen.findByText('Loading training count…')).toBeInTheDocument();
    view.unmount();
    await act(async () => { resolveCounts({ ok: true, counts: new Map([['a', 1]]) }); });
    expect(screen.queryByText(/Completed this year/)).not.toBeInTheDocument();
  });
});

describe('Seminar Enrollment scoring failures', () => {
  it('shows a retryable score failure without claiming an empty office or unrated employee', async () => {
    api.employees.mockRejectedValueOnce(new Error('IPCR lookup failed'));
    const modal = await openPicker();
    fireEvent.click(await modal.findByRole('button', { name: /Engineering/ }));
    expect(await modal.findByRole('alert')).toHaveTextContent('Could not load employees and their IPCR scores');
    expect(modal.queryByText('Loading employees…')).not.toBeInTheDocument();
    expect(modal.queryByText('No active employees in this office.')).not.toBeInTheDocument();
    expect(modal.queryByText(/New employee — no rating yet/)).not.toBeInTheDocument();
    fireEvent.click(modal.getByRole('button', { name: 'Try again' }));
    expect(await modal.findByText('Test Employee')).toBeInTheDocument();
    expect(modal.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.add).not.toHaveBeenCalled();
  });

  it('keeps loading and errors scoped to each office during overlapping requests', async () => {
    let rejectEngineering: (error: Error) => void;
    api.employees.mockImplementationOnce(() => new Promise((_, reject) => { rejectEngineering = reject; }));
    const modal = await openPicker();
    fireEvent.click(await modal.findByRole('button', { name: /Engineering/ }));
    fireEvent.click(modal.getByRole('button', { name: /Finance/ }));
    expect(await modal.findByText('Test Employee')).toBeInTheDocument();
    await act(async () => { rejectEngineering(new Error('Old office failed')); });
    expect(modal.queryByRole('alert')).not.toBeInTheDocument();
    expect(modal.getByText('Test Employee')).toBeInTheDocument();
  });

  it('warns when automatic regeneration fails while displaying saved data', async () => {
    api.generate.mockResolvedValue({ ok: false, error: 'Unable to load department weights for IPCR scoring.' });
    render(<SeminarEnrollment />);
    expect(await screen.findByText(/Showing saved recommendations/)).toBeInTheDocument();
  });
});
