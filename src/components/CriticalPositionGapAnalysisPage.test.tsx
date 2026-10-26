import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ summaries: vi.fn(), profile: vi.fn(), department: vi.fn() }));
vi.mock('../lib/api/departments', () => ({ getDepartmentById: api.department }));
vi.mock('../lib/api/succession', () => ({
  listCriticalPositions: async () => ({ ok: true, data: [{ id: 'p', title: 'Engineer III' }] }),
  listEmployeeOptions: async () => [{ id: 'e', fullName: 'Test Employee', department: 'Engineering' }],
}));
vi.mock('../lib/api/criticalPositionGapAnalysis', () => ({
  getQualificationSummaries: api.summaries,
  getEmployeeQualificationProfile: api.profile,
  getPositionRequirements: async () => ({}),
  compareQualifications: () => ({ rows: [], gaps: [], recommendations: [] }),
}));
vi.mock('./CriticalPositionPage', () => ({ IPCR_RATING_OPTIONS: [] }));
vi.mock('./table-loading', () => ({ useDelayedLoading: (pending: boolean) => pending, SkeletonList: ({ label }: { label: string }) => <p>{label}</p> }));

import { CriticalPositionGapAnalysisPage } from './CriticalPositionGapAnalysisPage';

const renderPage = () => render(<CriticalPositionGapAnalysisPage officeId="d" officeName="Engineering" />);
const chooseComparison = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /Engineer III/ }));
  fireEvent.click(screen.getByRole('button', { name: /Test Employee/ }));
};

beforeEach(() => {
  vi.resetAllMocks();
  api.department.mockResolvedValue({ success: true, data: { name: 'Engineering' } });
  api.summaries.mockResolvedValue(new Map());
  api.profile.mockResolvedValue({ fullName: 'Test Employee', yearsOfExperience: 4, adjectival: 'Very Satisfactory', overallScore: 4.2 });
});

describe('Gap Analysis scoring failures', () => {
  it('reports a failed summary load, clears the loader and retries without a false empty result', async () => {
    api.summaries.mockRejectedValueOnce(new Error('IPCR lookup failed'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load qualifications');
    expect(screen.queryByText('Loading employees…')).not.toBeInTheDocument();
    expect(screen.queryByText('No matching employees.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: /Test Employee/ })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('reports a failed profile score and retries instead of showing an unrated employee', async () => {
    api.profile.mockRejectedValueOnce(new Error('IPCR lookup failed'));
    renderPage();
    await chooseComparison();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this comparison');
    expect(screen.queryByText('Comparing qualifications…')).not.toBeInTheDocument();
    expect(screen.queryByText('Not yet rated')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Very Satisfactory (4.20)')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('ignores a stale summary request after switching offices', async () => {
    let rejectOld: (error: Error) => void;
    api.summaries.mockImplementationOnce(() => new Promise((_, reject) => { rejectOld = reject; }));
    const view = renderPage();
    await waitFor(() => expect(api.summaries).toHaveBeenCalledTimes(1));
    view.rerender(<CriticalPositionGapAnalysisPage officeId="new" officeName="Finance" />);
    expect(await screen.findByRole('button', { name: /Test Employee/ })).toBeInTheDocument();
    await act(async () => { rejectOld(new Error('Old failure')); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
