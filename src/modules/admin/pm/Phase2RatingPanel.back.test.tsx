import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../lib/supabase', async () => {
  const { supabaseStub } = await import('../../../test/supabaseStub');
  return { supabase: supabaseStub() };
});
vi.mock('../../../hooks/useRealtimeRefresh', () => ({ useRealtimeRefresh: () => undefined }));
vi.mock('../../../lib/api/ipcrRatings', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/api/ipcrRatings')>()),
  listPendingRatingApprovals: vi.fn().mockResolvedValue({
    ok: true,
    data: [{ targetSettingId: 't1', employeeId: 'e1', employeeName: 'Ana Cruz', period: 'Jan–Jun 2026', phase2Status: 'submitted', mfos: [], position: 'Budget Officer', department: 'Budget Office' }],
  }),
}));

import { Phase2RatingPanel } from './Phase2RatingPanel';

describe('Phase 2 rating sheet drill-down', () => {
  it('shows a Back button that returns to the submission list', async () => {
    render(<MemoryRouter><Phase2RatingPanel currentEmployeeId={null} /></MemoryRouter>);

    fireEvent.click(await screen.findByText('Ana Cruz'));
    expect(await screen.findByRole('heading', { name: 'Ana Cruz' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('heading', { name: 'Ana Cruz' })).not.toBeInTheDocument();
    expect(await screen.findByText('Ana Cruz')).toBeInTheDocument();
  });
});
