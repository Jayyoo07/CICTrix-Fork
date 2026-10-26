import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { LndArchive } from './LndArchive';

vi.mock('../../lib/api/lndArchive', () => ({
  listArchiveOfficeDirectory: vi.fn().mockResolvedValue([{ office: 'Budget Office', employeesWithRecords: 1, recordCount: 2, latestDate: null }]),
  listTrainingArchive: vi.fn().mockResolvedValue([]),
}));

describe('L&D Archive office drill-down', () => {
  it('shows a Back button that returns to the office list', async () => {
    render(<MemoryRouter><LndArchive /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Budget Office'));
    expect(await screen.findByText('Budget Office has no training records on file yet.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByText('Budget Office has no training records on file yet.')).not.toBeInTheDocument();
    expect(await screen.findByText('View Employees')).toBeInTheDocument();
  });
});
