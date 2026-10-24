import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { JobPosting } from '../types/recruitment.types';

const posting = (id: string, title: string, department: string, slots: Array<[string, 'open' | 'filled' | 'closed']>) => ({
  id,
  jobCode: `PLT-${id}`,
  title,
  department,
  status: 'Active',
  employmentStatus: 'Permanent',
  applicationDeadline: '2099-12-31',
  postedDate: '2026-10-01T00:00:00.000Z',
  plantillaSlots: slots.map(([label, status], idx) => ({
    id: `${id}-${idx}`, jobPostingId: id, slotNumber: idx + 1, label, itemNumber: `PLT-${id}-${idx}`, status,
  })),
}) as unknown as JobPosting;

const jobs = [
  posting('b', 'Social Welfare Officer IV (Division Chief)', 'Office of the City Social Welfare and Development Officer',
    [['Plantilla 113', 'open'], ['Plantilla 114', 'open'], ['Plantilla 115', 'filled'], ['Plantilla 116', 'closed']]),
  posting('a', 'Engineer II (Drainage / Flood Control)', 'Office of the City Engineer', [['Plantilla 65', 'open']]),
  // Its one plantilla is filled, so it is not a vacancy and gets no row.
  posting('c', 'Carpenter II', 'Office of the City Engineer', [['Plantilla 86', 'filled']]),
];

vi.mock('../lib/recruitmentData', () => ({
  getAuthoritativeJobPostings: () => jobs,
  getJobPostingsLoadError: () => null,
  // The real loader fires this event when it finishes; the page applies the cache on it.
  loadJobPostings: () => Promise.resolve().then(() => {
    window.dispatchEvent(new Event('cictrix:job-postings-updated'));
    return jobs;
  }),
}));
vi.mock('../hooks/useSalarySchedule', () => ({ useSalarySchedule: () => [] }));

const renderPage = async () => {
  const { LandingPage } = await import('./LandingPage');
  render(<MemoryRouter><LandingPage /></MemoryRouter>);
  return screen.findAllByText('Social Welfare Officer IV (Division Chief)');
};

describe('Landing — vacancies table plantilla numbers', () => {
  it('gives each open plantilla its own row and leaves filled and closed ones out', async () => {
    const titles = await renderPage();
    const rows = titles.map((title) => title.closest('tr') as HTMLElement);

    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('113')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: 'Apply' })).toBeEnabled();
    expect(within(rows[1]).getByText('114')).toBeInTheDocument();
    expect(within(rows[1]).getByRole('button', { name: 'Apply' })).toBeEnabled();
    expect(screen.queryByText('115')).not.toBeInTheDocument();
    expect(screen.queryByText('116')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Filled' })).not.toBeInTheDocument();
  });

  it('sorts by department, drops a fully filled posting and counts only vacant rows', async () => {
    await renderPage();
    const titles = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td p')?.textContent);

    expect(titles).toEqual([
      'Engineer II (Drainage / Flood Control)',
      'Social Welfare Officer IV (Division Chief)',
      'Social Welfare Officer IV (Division Chief)',
    ]);
    expect(screen.queryByText('Carpenter II')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 1 to 3 of 3 jobs/)).toBeInTheDocument();
  });
});
