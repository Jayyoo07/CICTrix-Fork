import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SummaryOfRatings } from './SummaryOfRatings';

vi.mock('../../../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }));
vi.mock('./SemesterSummarySection', () => ({ SemesterSummarySection: () => null }));
vi.mock('./CompetencyGapPanel', () => ({ CompetencyGapPanel: () => null }));
vi.mock('../../../lib/api/competencyGapAnalysis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/competencyGapAnalysis')>()),
  getIPCRRecordsFromGapView: vi.fn().mockResolvedValue([
    { id: 'r1', department: 'Budget Office', name: 'Ana Cruz', position: 'Budget Officer', period: 'p', numericalRating: 4, remarks: '', submissionStatus: 'SUBMITTED' },
  ]),
  getActiveHeadcountByDepartment: vi.fn().mockResolvedValue(new Map()),
  getActiveOfficeKeys: vi.fn().mockResolvedValue(null),
}));

describe('PM Summary of Ratings department drill-down', () => {
  it('shows a Back button that returns to the department list', async () => {
    render(<MemoryRouter><SummaryOfRatings /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Budget Office'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Budget Office' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Summary of Ratings' })).toBeInTheDocument();
  });
});
