import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { DocumentCollectionModal } from './DocumentCollectionModal';
import { downloadPreparedDocument, openPdfForPrinting, prepareDocumentPreview, type PreparedDocument, type ViewerDocument } from '../lib/documentViewing';
import { downloadEmployeeDocument } from '../lib/employeeDocuments';

vi.mock('../lib/documentViewing', () => ({
  prepareDocumentPreview: vi.fn(), downloadPreparedDocument: vi.fn(), openPdfForPrinting: vi.fn(),
  hasDocumentFile: (file: { url: string }) => Boolean(file.url && file.url !== '#'),
}));
vi.mock('../lib/employeeDocuments', () => ({ downloadEmployeeDocument: vi.fn() }));
const docx = vi.hoisted(() => ({ renderAsync: vi.fn() }));
vi.mock('docx-preview', () => docx);

const file: PreparedDocument = { url: 'blob:document-fixture', blob: new Blob(['fixture']), kind: 'pdf', fileName: 'Reyes-TOR.pdf', dispose: vi.fn() };
const sources: ViewerDocument[] = [
  { id: 'tor', url: 'applicant-a/tor.pdf', fileName: 'Reyes-TOR.pdf', bucket: 'attachments' },
  { id: 'letter', url: 'applicant-a/letter.pdf', fileName: 'Reyes-Letter.pdf', bucket: 'attachments' },
  { id: 'missing', url: '#', fileName: 'Missing.pdf' },
];
const ViewerHarness = () => {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>View file</button>
    <DocumentPreviewModal open={open} viewFirst fileUrl={sources[0].url} fileName={sources[0].fileName}
      storageBucket="attachments" onClose={() => setOpen(false)} /></>;
};
const CollectionHarness = () => {
  const [open, setOpen] = useState(false);
  return <><button onClick={() => setOpen(true)}>View Documents</button>
    {open && <DocumentCollectionModal title="Submitted Documents" files={sources} onClose={() => setOpen(false)} />}</>;
};
// jsdom does not parse srcdoc; give the frame the containers a browser would.
const loadDocxFrame = (frame: HTMLIFrameElement) => {
  frame.contentDocument!.body.innerHTML = '<div id="docx-styles"></div><div id="docx-body"></div>';
  fireEvent.load(frame);
};
const renderViewer = () => {
  render(<MemoryRouter><ViewerHarness /></MemoryRouter>);
  const opener = screen.getByRole('button', { name: 'View file' });
  opener.focus();
  fireEvent.click(opener);
  return opener;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prepareDocumentPreview).mockResolvedValue({ ...file, dispose: vi.fn() });
  docx.renderAsync.mockResolvedValue(undefined);
  vi.spyOn(window, 'print').mockImplementation(() => {});
  vi.spyOn(window, 'open').mockReturnValue(null);
});

describe('RSP view-first viewer', () => {
  it('prepares one local preview without downloading or opening a new tab', async () => {
    renderViewer();
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    expect(await screen.findByTitle(file.fileName)).toHaveAttribute('src', file.url);
    expect(prepareDocumentPreview).toHaveBeenCalledWith(expect.objectContaining({ url: sources[0].url, fileName: sources[0].fileName, bucket: 'attachments' }), expect.any(AbortSignal));
    expect(downloadPreparedDocument).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
    expect(downloadEmployeeDocument).not.toHaveBeenCalled();
  });

  it('downloads only when clicked and uses the native PDF print path, not dashboard print', async () => {
    renderViewer();
    const iframe = await screen.findByTitle(file.fileName);
    fireEvent.load(iframe);
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(downloadPreparedDocument).toHaveBeenCalledWith(expect.objectContaining({ fileName: file.fileName }));
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(openPdfForPrinting).toHaveBeenCalledTimes(1);
    expect(window.print).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Use the PDF viewer’s Print');
  });

  it('prints only the loaded image modal body', async () => {
    vi.mocked(prepareDocumentPreview).mockResolvedValue({ ...file, kind: 'image', fileName: 'Reyes-Scan.png' });
    renderViewer();
    const image = await screen.findByRole('img');
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    fireEvent.load(image);
    expect(image.closest('.abyan-modal-printable')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(window.print).toHaveBeenCalledTimes(1);
    expect(openPdfForPrinting).not.toHaveBeenCalled();
  });

  it('renders Word (.docx) files locally in a sandboxed frame and prints only that frame', async () => {
    vi.mocked(prepareDocumentPreview).mockResolvedValue({ ...file, kind: 'docx', fileName: 'Reyes-Letter.docx' });
    renderViewer();
    const frame = await screen.findByTitle('Reyes-Letter.docx') as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('allow-same-origin allow-modals');
    loadDocxFrame(frame);
    const doc = frame.contentDocument!;
    await waitFor(() => expect(docx.renderAsync).toHaveBeenCalledWith(file.blob, doc.getElementById('docx-body'), doc.getElementById('docx-styles'), expect.any(Object)));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Print' })).toBeEnabled());
    const framePrint = vi.spyOn(frame.contentWindow!, 'print').mockImplementation(() => {});
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(framePrint).toHaveBeenCalledTimes(1);
    expect(window.print).not.toHaveBeenCalled();
    expect(openPdfForPrinting).not.toHaveBeenCalled();
    expect(screen.queryByText('Preview unavailable for this file type')).toBeNull();
  });

  it('shows a download fallback when a Word file cannot be rendered', async () => {
    vi.mocked(prepareDocumentPreview).mockResolvedValue({ ...file, kind: 'docx', fileName: 'Reyes-Letter.docx' });
    docx.renderAsync.mockRejectedValueOnce(new Error('corrupt'));
    renderViewer();
    loadDocxFrame(await screen.findByTitle('Reyes-Letter.docx') as HTMLIFrameElement);
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be displayed. Download it');
  });

  it('keeps legacy .doc files local, explains the limit, and disables Print', async () => {
    vi.mocked(prepareDocumentPreview).mockResolvedValue({ ...file, kind: 'unsupported', fileName: 'Reyes-Letter.doc' });
    renderViewer();
    expect(await screen.findByText('Preview unavailable for this file type')).toBeInTheDocument();
    expect(screen.getByText(/older Word format \(\.doc\)/)).toBeInTheDocument();
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download' })).toBeEnabled();
    expect(downloadPreparedDocument).not.toHaveBeenCalled();
  });

  it('shows retryable failures without enabling file actions', async () => {
    vi.mocked(prepareDocumentPreview).mockRejectedValueOnce(new Error('The file could not be accessed.'));
    renderViewer();
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be accessed');
    expect(screen.getByRole('button', { name: 'Print' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByTitle(file.fileName)).toBeInTheDocument();
  });

  it('shows popup errors without claiming printing succeeded', async () => {
    vi.mocked(openPdfForPrinting).mockImplementationOnce(() => { throw new Error('The print tab was blocked.'); });
    renderViewer();
    fireEvent.load(await screen.findByTitle(file.fileName));
    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(screen.getByRole('status')).toHaveTextContent('blocked');
  });

  it('aborts loading on close and disposes a late result without reopening the viewer', async () => {
    let resolve!: (file: PreparedDocument) => void;
    vi.mocked(prepareDocumentPreview).mockReturnValue(new Promise((done) => { resolve = done; }));
    const opener = renderViewer();
    const signal = vi.mocked(prepareDocumentPreview).mock.calls[0][1];
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(signal.aborted).toBe(true);
    expect(opener).toHaveFocus();
    await act(async () => resolve(file));
    expect(file.dispose).toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('document collections and navigation', () => {
  it('opens a list without fetching files, views only the selected file, and closes one level on Escape', async () => {
    render(<MemoryRouter><CollectionHarness /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'View Documents' }));
    expect(prepareDocumentPreview).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'View Missing.pdf' })).toBeDisabled();
    const view = screen.getByRole('button', { name: 'View Reyes-Letter.pdf' });
    view.focus();
    fireEvent.click(view);
    await waitFor(() => expect(prepareDocumentPreview).toHaveBeenCalledTimes(1));
    expect(prepareDocumentPreview).toHaveBeenCalledWith(expect.objectContaining({ url: sources[1].url }), expect.any(AbortSignal));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTitle(file.fileName)).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Submitted Documents' })).toBeInTheDocument();
    expect(view).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(downloadPreparedDocument).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('browser Back closes only the preview, then the collection, without leaving the page', async () => {
    let back!: () => void;
    const Navigation = () => { const navigate = useNavigate(); back = () => navigate(-1); return null; };
    render(<MemoryRouter initialEntries={['/rsp']}><Navigation /><CollectionHarness /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'View Documents' }));
    fireEvent.click(screen.getByRole('button', { name: 'View Reyes-TOR.pdf' }));
    await screen.findByTitle(file.fileName);
    await act(async () => back());
    expect(screen.queryByTitle(file.fileName)).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Submitted Documents' })).toBeInTheDocument();
    await act(async () => back());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'View Documents' })).toBeInTheDocument();
  });
});

describe('existing non-RSP callers', () => {
  it('keeps the legacy viewer, download handler, Office preview and extra actions unchanged', () => {
    render(<DocumentPreviewModal open fileUrl="https://example.test/file.docx" fileName="letter.docx"
      actions={<button>Approve</button>} onClose={() => {}} />);
    expect(prepareDocumentPreview).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Approve' })).toBeInTheDocument();
    expect(screen.getByTitle('letter.docx').getAttribute('src')).toContain('view.officeapps.live.com');
    expect(screen.queryByRole('button', { name: 'Print' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(downloadEmployeeDocument).toHaveBeenCalledWith({ file_url: 'https://example.test/file.docx', file_name: 'letter.docx' });
  });
});
