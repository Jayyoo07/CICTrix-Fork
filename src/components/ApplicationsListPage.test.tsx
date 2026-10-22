import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('./Sidebar', () => ({ Sidebar: () => null }));
vi.mock('../lib/mockDatabase', () => ({ mockDatabase: {} }));
vi.mock('../lib/dataSourceMode', () => ({ getPreferredDataSourceMode: () => 'supabase' }));

const row = (id: string, name: string, position: string, extra: Record<string, unknown> = {}) => ({
  id, first_name: name, last_name: 'Cruz', email: `${id}@x.ph`, position, office: 'City Engineering Office',
  status: 'New Application', created_at: '2026-10-20T00:00:00Z', item_number: 'PLT-x', reference_no: `REF-${id}`, ...extra,
});

const applicants = [
  row('a', 'Ana', 'Engineer III', { plantilla_slot_id: 'p1-s1' }),
  // One application covering the position's second plantilla.
  row('b', 'Ben', 'Engineer III', { plantilla_slot_id: null }),
  row('c', 'Cy', 'Nurse II', { plantilla_slot_id: 'q1-s1' }),
];

vi.mock('../lib/supabase', () => ({
  isMockModeEnabled: false,
  supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: applicants, error: null }) }) }) },
}));
vi.mock('../lib/plantillaSlots', () => ({
  fetchApplicantSlotLinks: () => Promise.resolve(new Map([
    ['a', [{ applicantId: 'a', slotId: 'p1-s1', status: 'applied' }]],
    ['b', [{ applicantId: 'b', slotId: 'p1-s2', status: 'applied' }]],
    ['c', [{ applicantId: 'c', slotId: 'q1-s1', status: 'applied' }]],
  ])),
  fetchSlotsByJobPosting: () => Promise.resolve(new Map([
    ['P1', [{ id: 'p1-s1', slotNumber: 1, itemNumber: 'PLT-1' }, { id: 'p1-s2', slotNumber: 2, itemNumber: 'PLT-2' }]],
    ['Q1', [{ id: 'q1-s1', slotNumber: 1, itemNumber: 'PLT-3' }]],
    ['EMPTY', [{ id: 'e-s1', slotNumber: 1, itemNumber: 'PLT-4' }]],
  ])),
}));
vi.mock('../lib/recruitmentData', () => {
  const jobs = [{ id: 'P1', title: 'Engineer III' }, { id: 'Q1', title: 'Nurse II' }, { id: 'EMPTY', title: 'Clerk I' }];
  return { getJobPostings: () => jobs, loadJobPostings: () => Promise.resolve(jobs) };
});

import { ApplicationsListPage } from './ApplicationsListPage';

const Where = () => {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}{location.search}</p>;
};

const renderAt = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/admin/rsp/applications" element={<><ApplicationsListPage /><Where /></>} />
      <Route path="*" element={<Where />} />
    </Routes>
  </MemoryRouter>,
);

describe('ApplicationsListPage ?positionId=', () => {
  it('lists only that position, across its plantillas, under a heading', async () => {
    renderAt('/admin/rsp/applications?positionId=P1');
    expect(await screen.findByRole('heading', { name: 'Applicants for Engineer III' })).toBeTruthy();
    const table = screen.getAllByRole('table')[0];
    expect(await within(table).findByText('Ana Cruz')).toBeTruthy();
    expect(within(table).getByText('Ben Cruz')).toBeTruthy();
    expect(within(table).queryByText('Cy Cruz')).toBeNull();
  });

  it('clears the filter to show every application', async () => {
    renderAt('/admin/rsp/applications?positionId=P1');
    fireEvent.click(await screen.findByRole('button', { name: 'Clear filter' }));
    expect(screen.getByTestId('where').textContent).toBe('/admin/rsp/applications');
    expect(await within(screen.getAllByRole('table')[0]).findByText('Cy Cruz')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /Applicants for/ })).toBeNull();
  });

  it('links back to Job Vacancies', async () => {
    renderAt('/admin/rsp/applications?positionId=P1');
    fireEvent.click(await screen.findByRole('link', { name: /Back to Job Vacancies/ }));
    expect(screen.getByTestId('where').textContent).toBe('/admin/rsp/jobs');
  });

  it('says so when the vacancy has no applicants', async () => {
    renderAt('/admin/rsp/applications?positionId=EMPTY');
    expect(await screen.findByText('No applicants yet for this vacancy.')).toBeTruthy();
  });
});
