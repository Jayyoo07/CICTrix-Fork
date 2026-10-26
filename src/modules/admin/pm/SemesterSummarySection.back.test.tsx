import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SemesterSummarySection } from './SemesterSummarySection';

vi.mock('../../../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }));
vi.mock('./CompetencyGapPanel', () => ({ CompetencyGapPanel: () => null }));
vi.mock('../../../lib/api/semesterSummaryOfRatings', () => ({
  getSemesterSectionState: vi.fn().mockResolvedValue({ visible: true, newCycleId: 2, newCyclePeriod: 'Jan–Jun 2027' }),
  getSemesterRatingRecords: vi.fn().mockResolvedValue([
    { id: 'r1', department: 'Budget Office', name: 'Ana Cruz', position: 'Budget Officer', period: 'p', numericalRating: 4, remarks: '', submissionStatus: 'SUBMITTED' },
  ]),
}));
vi.mock('../../../lib/api/semesterTransition', () => ({
  computeNewSemesterCompletion: vi.fn().mockResolvedValue({ completed: 1, expected: 2, pct: 50, is100: false }),
  confirmSemesterTransition: vi.fn(),
}));

describe('PM Semester Summary office drill-down', () => {
  it('shows a Back button that returns to the office list', async () => {
    render(<MemoryRouter><SemesterSummarySection /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Budget Office'));
    expect(await screen.findByPlaceholderText('Search employees in this office…')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByPlaceholderText('Search employees in this office…')).not.toBeInTheDocument();
    expect(await screen.findByText('Budget Office')).toBeInTheDocument();
  });
});
