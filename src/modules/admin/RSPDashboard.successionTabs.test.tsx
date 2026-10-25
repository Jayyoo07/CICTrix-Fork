import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../components/AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('../../components/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('../../components/SuccessionPlanningPage', () => ({ SuccessionPlanningPage: () => <p>plan view</p> }));
vi.mock('../../components/EligibilityPointsPanel', () => ({ EligibilityPointsPanel: () => <p>points view</p> }));
vi.mock('./RspDashboardOverview', () => ({ RspDashboardOverview: () => null }));
vi.mock('../../components/QualifiedApplicantsSection', () => ({ QualifiedApplicantsSection: () => null }));
vi.mock('./rsp-archives', () => ({ RspArchives: () => null }));
vi.mock('../../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }));
vi.mock('../../hooks/useDepartmentOptions', () => ({ useDepartmentNames: () => [], useDepartmentOptions: () => [] }));

import { RSPDashboard } from './RSPDashboard';

const Where = () => {
  const location = useLocation();
  return <p data-testid="where">{location.pathname}{location.search}</p>;
};

const renderAt = (url: string) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/admin/rsp/succession" element={<><RSPDashboard /><Where /></>} />
    </Routes>
  </MemoryRouter>,
);

describe('Succession Planning sub-tabs', () => {
  it('uses the Job Posts tab row, with Succession Plan selected by default', () => {
    renderAt('/admin/rsp/succession');
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Succession Plan', 'Eligibility Points']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('plan view')).toBeTruthy();
  });

  it('keeps Eligibility Points in the URL so refresh and Back keep it', () => {
    renderAt('/admin/rsp/succession');
    fireEvent.click(screen.getByRole('tab', { name: 'Eligibility Points' }));
    expect(screen.getByTestId('where').textContent).toBe('/admin/rsp/succession?view=eligibility-points');
    expect(screen.getByRole('tab', { name: 'Eligibility Points' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('points view')).toBeTruthy();
  });

  it('opens Eligibility Points straight from the URL', () => {
    renderAt('/admin/rsp/succession?view=eligibility-points');
    expect(screen.getByText('points view')).toBeTruthy();
  });
});
