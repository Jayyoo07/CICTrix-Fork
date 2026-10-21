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
  // Every plantilla filled: nothing to apply to, so it is not listed.
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
  it('gives each plantilla its own row, striking filled ones and leaving closed ones out', async () => {
    const titles = await renderPage();
    const rows = titles.map((title) => title.closest('tr') as HTMLElement);

    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('113')).toBeInTheDocument();
    expect(within(rows[0]).getByRole('button', { name: 'Apply' })).toBeEnabled();
    expect(within(rows[1]).getByText('114')).toBeInTheDocument();
    expect(within(rows[2]).getByText('115').tagName).toBe('S');
    expect(within(rows[2]).getByRole('button', { name: 'Filled' })).toBeDisabled();
    expect(screen.queryByText('116')).not.toBeInTheDocument();
  });

  it('sorts by department by default and hides fully filled postings', async () => {
    await renderPage();
    const titles = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('td p')?.textContent);

    expect(titles).toEqual([
      'Engineer II (Drainage / Flood Control)',
      'Social Welfare Officer IV (Division Chief)',
      'Social Welfare Officer IV (Division Chief)',
      'Social Welfare Officer IV (Division Chief)',
    ]);
  });
});
