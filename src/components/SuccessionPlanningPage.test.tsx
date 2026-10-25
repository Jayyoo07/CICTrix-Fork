import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { SuccessionPlanningPage } from './SuccessionPlanningPage';

const api = vi.hoisted(() => ({
  listCriticalPositions: vi.fn(),
}));

vi.mock('../lib/api/succession', () => ({
  listDepartmentSummaries: () =>
    Promise.resolve({
      ok: true,
      data: [
        { departmentId: 'd-eng', departmentName: 'Engineering', code: 'ENG', criticalPositionCount: 1, vacantCriticalCount: 0, isActive: true },
        { departmentId: 'd-fin', departmentName: 'Finance', code: 'FIN', criticalPositionCount: 1, vacantCriticalCount: 0, isActive: true },
      ],
    }),
  listCriticalPositions: api.listCriticalPositions,
  listAutoSuccessors: () => Promise.resolve({ ok: true, data: { qualified: [], notQualified: [], downwardMovesExcluded: 0 } }),
}));

describe('SuccessionPlanningPage deep link', () => {
  it('opens the office and highlights the position named in the URL', async () => {
    api.listCriticalPositions.mockResolvedValue({
      ok: true,
      data: [{ id: 'p-city-eng', departmentId: 'd-eng', title: 'City Engineer', incumbentName: 'A', incumbentLeavingDate: null }],
    });
    Element.prototype.scrollIntoView = vi.fn();

    render(
      <MemoryRouter initialEntries={['/admin/rsp/succession?dept=d-eng&position=p-city-eng']}>
        <SuccessionPlanningPage />
      </MemoryRouter>,
    );

    await screen.findByText('City Engineer');
    expect(api.listCriticalPositions).toHaveBeenCalledTimes(1);
    expect(api.listCriticalPositions).toHaveBeenCalledWith('d-eng');
    const block = document.getElementById('succession-position-p-city-eng') as HTMLElement;
    await waitFor(() => expect(block.className).toContain('ring-2'));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });
});
