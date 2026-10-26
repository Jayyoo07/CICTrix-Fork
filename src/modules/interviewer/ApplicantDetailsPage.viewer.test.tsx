import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => {
  const rows: Record<string, unknown[]> = {
    applicants: [{ id: 'a1', first_name: 'Ana', last_name: 'Cruz', email: 'ana@example.test', position: 'Engineer I', office: 'City Hall', status: 'Shortlisted', created_at: '2026-10-01' }],
    applicant_attachments: [{ id: 'cv', applicant_id: 'a1', file_name: 'Cruz-CV.pdf', file_path: 'a1/cv.pdf', file_type: 'application/pdf', document_type: 'curriculum_vitae', created_at: '2026-10-02' }],
  };
  const single = vi.fn();
  // Every query method chains; awaiting the chain resolves to the table's rows.
  const query = (table: string) => {
    const result = { data: rows[table] ?? [], error: null };
    const chain: any = new Proxy({}, {
      get: (_t, prop) => {
        if (prop === 'then') return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject);
        if (prop === 'single' || prop === 'maybeSingle') {
          return () => {
            if (table === 'applicants') single();
            return Promise.resolve({ data: (rows[table] ?? [])[0] ?? null, error: null });
          };
        }
        return () => chain;
      },
    });
    return chain;
  };
  return { single, query };
});

vi.mock('../../lib/supabase', () => ({
  ATTACHMENTS_BUCKET: 'applicant-attachments',
  isMockModeEnabled: false,
  supabase: {
    from: (table: string) => db.query(table),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }),
    removeChannel: () => {},
    storage: { from: () => ({ createSignedUrl: async () => ({ data: { signedUrl: 'https://files.example.test/cv.pdf' }, error: null }) }) },
  },
}));
vi.mock('../../lib/dataSourceMode', () => ({ getPreferredDataSourceMode: () => 'supabase' }));
vi.mock('../../components/AdminHeader', () => ({ AdminHeader: () => null }));
vi.mock('../../components/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('../../lib/documentViewing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/documentViewing')>();
  return { ...actual, prepareDocumentPreview: vi.fn() };
});

import { ApplicantDetailsPage } from './ApplicantDetailsPage';
import { prepareDocumentPreview } from '../../lib/documentViewing';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(prepareDocumentPreview).mockImplementation(async (source) => ({ url: 'blob:fixture', blob: new Blob(['x']), kind: 'pdf', fileName: source.fileName, dispose: vi.fn() }));
  vi.spyOn(window, 'open').mockReturnValue(null);
});

describe('applicant details document viewer', () => {
  it('stays open without reloading the applicant when the viewer adds its Back entry', async () => {
    render(
      <MemoryRouter initialEntries={['/admin/rsp/applicant/a1']}>
        <Routes><Route path="/admin/rsp/applicant/:id" element={<ApplicantDetailsPage />} /></Routes>
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /^Documents/ }));
    const view = (await screen.findByText('Cruz CV')).closest('button') as HTMLElement;
    const loadsBeforeOpening = db.single.mock.calls.length;
    fireEvent.click(view);

    expect(await screen.findByRole('dialog', { name: 'Cruz-CV.pdf' })).toBeInTheDocument();
    // Give any reload loop time to show itself.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    expect(screen.getByRole('dialog', { name: 'Cruz-CV.pdf' })).toBeInTheDocument();
    expect(screen.queryByText('Loading applicant details...')).toBeNull();
    expect(db.single.mock.calls.length).toBe(loadsBeforeOpening);
    expect(prepareDocumentPreview).toHaveBeenCalledTimes(1);
    // The viewer gets the uploaded name and type, not the "Cruz CV" display label.
    expect(prepareDocumentPreview).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'a1/cv.pdf', fileName: 'Cruz-CV.pdf', fileType: 'application/pdf' }), expect.any(AbortSignal));
    expect(window.open).not.toHaveBeenCalled();
  });
});
