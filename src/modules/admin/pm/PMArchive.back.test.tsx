import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { PMArchive } from './PMArchive';

vi.mock('../../../lib/api/ipcrArchive', () => ({
  listArchiveEmployees: vi.fn().mockResolvedValue([
    { employeeNum: 'EMP-001', name: 'Ana Cruz', department: 'Budget Office', position: 'Budget Officer', overall: 4, semesterCount: 1 },
  ]),
  getEmployeeArchive: vi.fn().mockResolvedValue({ data: [] }),
}));

describe('PM Archive employee drill-down', () => {
  it('shows a Back button that returns to the employee list', async () => {
    render(<MemoryRouter><PMArchive /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Ana Cruz'));
    expect(await screen.findByRole('heading', { name: 'Ana Cruz' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('heading', { name: 'Ana Cruz' })).not.toBeInTheDocument();
    expect(await screen.findByText('Ana Cruz')).toBeInTheDocument();
  });
});
