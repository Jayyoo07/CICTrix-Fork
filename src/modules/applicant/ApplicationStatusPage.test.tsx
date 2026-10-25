import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const { db } = vi.hoisted(() => ({
  db: {
    applications: [] as Row[],
    attachments: [] as Row[],
    // Per-applicant delay on the attachments read, to race a row switch.
    attachmentDelayMs: {} as Record<string, number>,
  },
}));

vi.mock('../../lib/supabase', () => {
  const builder = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let delay = 0;
    const run = () => {
      const source = table === 'applicant_tracker_view' ? db.applications : db.attachments;
      const rows = source
        .filter((r) => filters.every((f) => f(r)))
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return new Promise((resolve) => setTimeout(() => resolve({ data: rows, error: null }), delay));
    };
    const b: any = {
      select: () => b,
      order: () => b,
      eq: (col: string, val: unknown) => {
        if (table === 'applicant_attachments' && col === 'applicant_id') delay = db.attachmentDelayMs[String(val)] ?? 0;
        filters.push((r) => r[col] === val);
        return b;
      },
      in: (col: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[col])); return b; },
      then: (ok: (v: unknown) => unknown, fail?: (e: unknown) => unknown) => run().then(ok, fail),
    };
    return b;
  };
  const channel: any = { on: () => channel, subscribe: () => channel };
  return {
    ATTACHMENTS_BUCKET: 'attachments',
    supabase: {
      from: (table: string) => builder(table),
      rpc: () => Promise.resolve({ data: null, error: null }),
      channel: () => channel,
      removeChannel: () => undefined,
    },
  };
});
vi.mock('../../lib/plantillaSlots', () => ({
  fetchApplicantSlotLinks: () => Promise.resolve(new Map()),
  fetchSlotsByJobPosting: () => Promise.resolve(new Map()),
}));

import { ApplicationStatusPage } from './ApplicationStatusPage';

const REF = 'ABYAN-584-392';

const application = (id: string, position: string, status: string, created_at: string): Row => ({
  id, position, status, created_at,
  office: 'Office of the City Engineer',
  reference_no: REF,
  reference_no_normalized: 'ABYAN584392',
  first_name: 'Patricia Ann', last_name: 'Cordero',
  email: 'patricia@example.com',
  updated_at: created_at,
});

const upload = (applicant_id: string, file_name: string, document_type: string, created_at: string): Row => ({
  id: `${applicant_id}-${file_name}`, applicant_id, file_name, file_path: `${applicant_id}/${file_name}`, document_type, created_at,
});

const notice = (applicant_id: string, created_at: string): Row => ({
  id: `${applicant_id}-notice`, applicant_id,
  file_name: 'resubmission::Transcript of Records::Unreadable scan',
  file_path: '—', document_type: 'resubmission_request', created_at,
});

beforeEach(() => {
  db.applications = [
    application('newest', 'Engineer II (Drainage / Flood Control)', 'Submitted', '2026-10-23T00:00:00Z'),
    application('needs-docs', 'Engineer I', 'Under Initial Screening', '2026-10-20T00:00:00Z'),
    application('closed', 'Draftsman II', 'Not Selected', '2026-10-02T00:00:00Z'),
  ];
  db.attachments = [
    upload('newest', 'engineer-ii-pds.pdf', 'pds_with_photo', '2026-10-23T00:00:00Z'),
    upload('needs-docs', 'engineer-i-tor.pdf', 'transcript_of_records', '2026-10-20T00:00:00Z'),
    notice('needs-docs', '2026-10-21T00:00:00Z'),
  ];
  db.attachmentDelayMs = {};
});

const renderTracker = (ref = REF) => render(
  <MemoryRouter initialEntries={[`/track?ref=${ref}`]}>
    <Routes><Route path="/track" element={<ApplicationStatusPage />} /></Routes>
  </MemoryRouter>,
);

const rowButton = (position: string) => screen.getByRole('button', { name: new RegExp(position.replace(/[()/]/g, '.')) });

describe('ApplicationStatusPage with several applications', () => {
  it('lists every application and opens the one waiting on the applicant', async () => {
    renderTracker();

    expect(await screen.findByRole('heading', { name: 'Your applications' })).toBeInTheDocument();
    const rows = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(rows).toHaveLength(3);

    const needsDocs = screen.getByRole('button', { name: /^Engineer I\b(?! \()/ });
    expect(needsDocs).toHaveAttribute('aria-expanded', 'true');
    expect(within(needsDocs).getByText('Action required')).toBeInTheDocument();
    expect(await screen.findByText('Notices from RSP Admin')).toBeInTheDocument();
    expect(await screen.findByText('engineer-i-tor.pdf')).toBeInTheDocument();
  });

  it('expands another row with its own status and collapses the first', async () => {
    renderTracker();
    await screen.findByText('Notices from RSP Admin');

    fireEvent.click(rowButton('Engineer II (Drainage / Flood Control)'));

    expect(rowButton('Engineer II (Drainage / Flood Control)')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^Engineer I\b(?! \()/ })).toHaveAttribute('aria-expanded', 'false');
    expect(await screen.findByText('engineer-ii-pds.pdf')).toBeInTheDocument();
    // Nothing from the other application carries over.
    expect(screen.queryByText('engineer-i-tor.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('Notices from RSP Admin')).not.toBeInTheDocument();
  });

  it('collapses the open row when it is clicked again', async () => {
    renderTracker();
    await screen.findByText('Notices from RSP Admin');

    fireEvent.click(screen.getByRole('button', { name: /^Engineer I\b(?! \()/ }));

    expect(screen.queryByRole('heading', { name: 'Current Status' })).not.toBeInTheDocument();
    within(screen.getByRole('list')).getAllByRole('button').forEach((b) => expect(b).toHaveAttribute('aria-expanded', 'false'));
  });

  it('never shows a slow response for a row the applicant has already left', async () => {
    db.attachmentDelayMs = { 'needs-docs': 150 };
    renderTracker();
    await screen.findByRole('heading', { name: 'Your applications' });

    // Switch before the default row's documents arrive.
    fireEvent.click(rowButton('Engineer II (Drainage / Flood Control)'));
    expect(await screen.findByText('engineer-ii-pds.pdf')).toBeInTheDocument();

    await new Promise((r) => setTimeout(r, 250));
    expect(screen.queryByText('engineer-i-tor.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('Notices from RSP Admin')).not.toBeInTheDocument();
  });

  it('keeps a collapsed row status live through polling', async () => {
    renderTracker();
    await screen.findByText('Notices from RSP Admin');
    const closedRow = () => screen.getByRole('button', { name: /Draftsman II/ });
    expect(within(closedRow()).getByText('Not Selected')).toBeInTheDocument();

    db.applications = db.applications.map((a) => (a.id === 'newest' ? { ...a, status: 'Shortlisted' } : a));

    const newestRow = rowButton('Engineer II (Drainage / Flood Control)');
    await waitFor(() => expect(within(newestRow).getByText('Shortlisted')).toBeInTheDocument(), { timeout: 3500 });
    expect(newestRow).toHaveAttribute('aria-expanded', 'false');
  });
});

describe('ApplicationStatusPage with one application', () => {
  it('shows the page as before, with no list', async () => {
    db.applications = [db.applications[0]];
    renderTracker();

    expect(await screen.findByRole('heading', { name: 'Application Details' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Your applications' })).not.toBeInTheDocument();
    expect(await screen.findByText('engineer-ii-pds.pdf')).toBeInTheDocument();
  });
});
