import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ employees: vi.fn(), generate: vi.fn(), add: vi.fn() }));
vi.mock('../../lib/api/trainingRecommendations', () => ({
  getOfficeEmployeesWithScores: api.employees,
  generateRecommendations: api.generate,
  lndAddAttendees: api.add,
  getManualPickerOffices: async () => [{ office: 'Engineering', relatedGapCount: 1 }, { office: 'Finance', relatedGapCount: 0 }],
  listRecommendationCandidates: async () => [],
  listAllRecommendations: async () => [],
  listRosterGroups: async () => [],
  listNextMonthPublishedCourses: async () => [{ sessionId: 's', title: 'Test course', category: 'Technical', start: '2099-01-01', capacity: 10, competencies: [] }],
  listRecommendationEvents: async () => [],
}));
vi.mock('../../lib/api/trainingNeeds', () => ({ computeNeedsAssessment: async () => [] }));
vi.mock('../../lib/api/trainingLifecycle', () => ({ isLocked: () => false, LOCK_LEAD_DAYS: 3 }));

import { SeminarEnrollment } from './SeminarEnrollment';

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
