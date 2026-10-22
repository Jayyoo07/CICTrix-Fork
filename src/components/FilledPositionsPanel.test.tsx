import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JobPosting } from '../types/recruitment.types';

vi.mock('../lib/recruitmentData', () => ({
  formatPHDate: (value: string) => value.slice(0, 10),
}));
vi.mock('../hooks/useSalarySchedule', () => ({ useSalarySchedule: () => [] }));

import { FilledPositionsPanel, filledPlantillas } from './FilledPositionsPanel';

const posting = (id: string, title: string, slots: Array<[number, 'open' | 'filled' | 'closed', string?]>) => ({
  id,
  title,
  status: 'Active',
  department: 'City Engineering Office',
  monthlySalary: 20000,
  plantillaSlots: slots.map(([n, status, filledAt]) => ({
    id: `${id}-${n}`, jobPostingId: id, slotNumber: n, label: `Plantilla ${n}`, itemNumber: `PLT-${id}-${n}`, status, filledAt,
  })),
}) as unknown as JobPosting;

const jobs = [
  posting('a', 'Administrative Aide IV (Clerk II)', [[40, 'filled', '2026-10-20T08:00:00Z']]),
  posting('b', 'Engineer II', [[65, 'open'], [66, 'filled', '2026-10-21T08:00:00Z'], [67, 'closed']]),
];

describe('FilledPositionsPanel', () => {
  it('lists one row per filled plantilla, newest first, and nothing open or closed', () => {
    expect(filledPlantillas(jobs)).toHaveLength(2);
    render(<FilledPositionsPanel jobs={jobs} loading={false} />);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);

    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Engineer II')).toBeTruthy();
    expect(within(rows[0]).getByText('66')).toBeTruthy();
    expect(within(rows[1]).getByText('Administrative Aide IV (Clerk II)')).toBeTruthy();
    expect(screen.queryByText('65')).toBeNull();
    expect(screen.queryByText('67')).toBeNull();
  });

  it('searches by plantilla number', () => {
    render(<FilledPositionsPanel jobs={jobs} loading={false} />);
    fireEvent.change(screen.getByPlaceholderText(/Search title/), { target: { value: '40' } });
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(1);
    expect(within(rows[0]).getByText('Administrative Aide IV (Clerk II)')).toBeTruthy();
  });
});
