import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { JobPosting } from '../types/recruitment.types';

vi.mock('./AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('./Sidebar', () => ({ Sidebar: () => null }));
vi.mock('./RecruitmentNavigationGuide', () => ({ RecruitmentNavigationGuide: () => null }));
vi.mock('../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }));
vi.mock('../hooks/useDepartmentOptions', () => ({ useDepartmentNames: () => [] }));
vi.mock('../lib/api/salaryGrades', () => ({ listSalaryGrades: () => Promise.resolve({ ok: true, data: [] }), formatSalary: String }));
vi.mock('../lib/mockDatabase', () => ({ mockDatabase: {} }));
vi.mock('../lib/dataSourceMode', () => ({ getPreferredDataSourceMode: () => 'supabase' }));
vi.mock('../lib/vacancies', () => ({
  listActiveVacancies: () => Promise.resolve(new Map()),
  openVacancy: vi.fn(), closeVacancy: vi.fn(), CLOSE_REASONS: [],
}));

const { applicantRows, jobs } = vi.hoisted(() => {
  const position = (id: string, title: string, status: string, deadline = '') => ({
    id, title, status, department: 'City Engineering Office', applicationDeadline: deadline,
    postedDate: '2026-10-01T00:00:00Z', jobCode: `PLT-${id}`, summary: '', requiredDocuments: [],
    plantillaSlots: [
      { id: `${id}-s1`, jobPostingId: id, slotNumber: 1, label: 'Plantilla 1', itemNumber: `PLT-${id}-1`, status: 'open' },
      { id: `${id}-s2`, jobPostingId: id, slotNumber: 2, label: 'Plantilla 2', itemNumber: `PLT-${id}-2`, status: 'open' },
    ],
  } as unknown as JobPosting);
  return {
    applicantRows: [
      { id: 'x1', status: 'New Application', plantilla_slot_id: 'open-s1' },
      { id: 'x2', status: 'Under Review', plantilla_slot_id: 'open-s2' },
    ],
    jobs: [position('open', 'Engineer III', 'Active', '2099-12-31'), position('closed', 'Nurse II', 'Closed')],
  };
});
vi.mock('../lib/supabase', () => {
  const result = { data: applicantRows, error: null };
  const query: any = { select: () => query, order: () => query, eq: () => query, delete: () => query, then: (r: any) => Promise.resolve(result).then(r) };
  return { isMockModeEnabled: false, supabase: { from: () => query } };
});
vi.mock('../lib/plantillaSlots', () => ({
  fetchApplicantSlotLinks: () => Promise.resolve(new Map([['x2', [{ applicantId: 'x2', slotId: 'open-s2', status: 'applied' }]]])),
  fetchSlotApplicantCounts: () => Promise.resolve(new Map()),
  fetchSlotApplicantCountsChecked: () => Promise.resolve({ ok: true, counts: new Map() }),
  saveSlotsForJob: vi.fn(),
}));


vi.mock('../lib/recruitmentData', () => ({
  archiveDeletedJobPosting: vi.fn(),
  ensureRecruitmentSeedData: () => undefined,
  excludeApplicantIdsFromBackfill: vi.fn(),
  formatPHDate: (value: string) => String(value).slice(0, 10),
  getApplicants: () => [],
  getJobPostings: () => jobs,
  getJobPostingsLoadError: () => null,
  isJobPostingsLoaded: () => true,
  loadJobPostings: () => Promise.resolve(jobs),
  saveApplicants: vi.fn(),
  saveJobPostings: vi.fn(),
  saveJobPostingsAndWait: vi.fn(),
  toTitleCase: (value: string) => value,
}));

import { JobPostingsPage } from './JobPostingsPage';

const Where = () => {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}{location.search}</p>;
};

const renderAt = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/admin/rsp/jobs" element={<><JobPostingsPage /><Where /></>} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter>,
);

const tabNames = () => screen.getAllByRole('tab').map((tab) => tab.textContent?.replace(/\d+$/, '').trim());

describe('Job Posts tabs', () => {
  it('puts Job Vacancies first and opens it by default', async () => {
    renderAt('/admin/rsp/jobs');
    expect(tabNames()).toEqual(['Job Vacancies', 'Job Positions']);
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('Job Vacancies');
    expect(await screen.findByRole('button', { name: /Open Vacant Job Position/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Create Job Position/ })).toBeNull();
  });

  it('keeps Job Positions in the URL so a refresh stays there', async () => {
    renderAt('/admin/rsp/jobs');
    fireEvent.click(screen.getByRole('tab', { name: /Job Positions/ }));
    expect(screen.getByTestId('where').textContent).toBe('/admin/rsp/jobs?tab=positions');
    expect(screen.getByRole('button', { name: /Create Job Position/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Open Vacant Job Position/ })).toBeNull();
  });

  it('shows only Details and delete on Job Positions rows', async () => {
    renderAt('/admin/rsp/jobs?tab=positions');
    const row = (await screen.findByText('Nurse II')).closest('tr') as HTMLElement;
    const actions = within(row).getAllByRole('button').filter((b) => b.getAttribute('title'));
    expect(actions.map((b) => b.getAttribute('title'))).toEqual(['View Details', 'Delete']);
    expect(screen.queryByRole('button', { name: /^Applicants/ })).toBeNull();
  });

  it('sends Applicants to the Applications tab filtered to the position', async () => {
    renderAt('/admin/rsp/jobs');
    // Both applications count: one through its own plantilla, one through a linked plantilla.
    const button = await screen.findByRole('button', { name: 'Applicants' });
    expect(within(button.closest('tr') as HTMLElement).getByText('2')).toBeTruthy();
    fireEvent.click(button);
    expect(screen.getByTestId('where').textContent).toBe('/admin/rsp/applications?positionId=open');
  });
});
