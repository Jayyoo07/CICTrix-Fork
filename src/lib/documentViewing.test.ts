import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applicantAttachmentDocument, downloadPreparedDocument, hasDocumentFile, listApplicantDocumentAttachments, openPdfForPrinting, prepareDocumentPreview, type PreparedDocument } from './documentViewing';
import * as documentCrypto from './crypto';

const mocks = vi.hoisted(() => ({ sign: vi.fn(), from: vi.fn(), mockFrom: vi.fn() }));
vi.mock('./supabase', () => ({
  ATTACHMENTS_BUCKET: 'applicant-attachments', isMockModeEnabled: false,
  supabase: { storage: { from: () => ({ createSignedUrl: mocks.sign }) }, from: mocks.from },
}));
vi.mock('./mockDatabase', () => ({ mockDatabase: { from: mocks.mockFrom } }));
vi.mock('./dataSourceMode', () => ({ getPreferredDataSourceMode: () => 'supabase' }));

const source = { id: 'tor-2', url: 'applicant-a/tor-2.pdf', fileName: 'Reyes-TOR.pdf', bucket: 'applicant-attachments' };
const signal = () => new AbortController().signal;
const response = (type = 'application/pdf', body = '%PDF-1.7 fixture') => ({
  ok: true, blob: async () => new Blob([body], { type }),
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sign.mockResolvedValue({ data: { signedUrl: 'https://storage.example.test/tor-2.pdf?token=fixture' }, error: null });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response()));
  vi.stubGlobal('URL', URL);
  URL.createObjectURL = vi.fn().mockReturnValue('blob:local-fixture');
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('document preview preparation', () => {
  it('keeps exact attachment identity and never substitutes another row or cached attachment', () => {
    localStorage.setItem('cictrix_attachment_previews', JSON.stringify([{ applicantId: 'applicant-a', fileName: 'different.pdf' }]));
    expect(applicantAttachmentDocument({ id: 'tor-2', file_name: source.fileName, file_path: source.url, file_type: 'application/pdf' }))
      .toEqual({ id: source.id, fileName: source.fileName, url: source.url, fileType: 'application/pdf', bucket: source.bucket });
    localStorage.clear();
  });

  it('signs only the selected object, fetches once, and returns a disposable local preview', async () => {
    const file = await prepareDocumentPreview(source, signal());
    expect(mocks.sign).toHaveBeenCalledWith(source.url, 300);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith('https://storage.example.test/tor-2.pdf?token=fixture', { signal: expect.any(AbortSignal) });
    expect(file).toMatchObject({ kind: 'pdf', fileName: source.fileName, url: 'blob:local-fixture' });
    file.dispose();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(file.url);
  });

  it('corrects generic storage MIME types using the original filename', async () => {
    vi.mocked(fetch).mockResolvedValue(response('application/octet-stream') as Response);
    const file = await prepareDocumentPreview(source, signal());
    expect(file.kind).toBe('pdf');
    expect(file.blob.type).toBe('application/pdf');
  });

  it('uses the actual response MIME type when an extension is missing', async () => {
    vi.mocked(fetch).mockResolvedValue(response('image/png', 'fixture-image') as Response);
    expect(await prepareDocumentPreview({ ...source, fileName: 'scan' }, signal())).toMatchObject({ kind: 'image', fileName: 'scan' });
  });

  it('does not send Office files to an external viewer', async () => {
    vi.mocked(fetch).mockResolvedValue(response('application/vnd.openxmlformats-officedocument.wordprocessingml.document') as Response);
    const file = await prepareDocumentPreview({ ...source, fileName: 'letter.docx' }, signal());
    expect(file.kind).toBe('unsupported');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetch).mock.calls[0][0])).not.toContain('officeapps');
  });

  it.each(['', '#', 'mock://missing', 'javascript:alert(1)'])('rejects unavailable or unsafe file links: %s', async (url) => {
    await expect(prepareDocumentPreview({ ...source, url }, signal())).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it('does not use a public URL or another attachment after signing fails', async () => {
    mocks.sign.mockResolvedValue({ data: null, error: { message: 'denied' } });
    await expect(prepareDocumentPreview(source, signal())).rejects.toThrow('Could not access');
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.sign).toHaveBeenCalledTimes(1);
  });

  it('accepts direct HTTP, data and blob URLs without signing them', async () => {
    for (const url of ['https://storage.example.test/file.pdf', 'data:application/pdf;base64,ZmFrZQ==', 'blob:existing-file']) {
      await prepareDocumentPreview({ ...source, url }, signal());
    }
    expect(mocks.sign).not.toHaveBeenCalled();
  });

  it('reports failed, empty and HTML responses instead of showing a bogus preview', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false } as Response);
    await expect(prepareDocumentPreview(source, signal())).rejects.toThrow('Could not load');
    vi.mocked(fetch).mockResolvedValueOnce(response('application/pdf', '') as Response);
    await expect(prepareDocumentPreview(source, signal())).rejects.toThrow('empty');
    vi.mocked(fetch).mockResolvedValueOnce(response('text/html', '<html>Sign in</html>') as Response);
    await expect(prepareDocumentPreview(source, signal())).rejects.toThrow('web page');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('stops before fetching when the viewer closes while signing', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(prepareDocumentPreview(source, controller.signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('prepares the decrypted blob supplied by the encryption reader, not the stored ciphertext', async () => {
    const plaintext = new Blob(['%PDF-1.7 decrypted fixture'], { type: 'application/pdf' });
    const decrypt = vi.spyOn(documentCrypto, 'decryptApplicantBlob').mockResolvedValueOnce(plaintext);
    vi.mocked(fetch).mockResolvedValueOnce(response('application/octet-stream', 'encrypted fixture') as Response);
    const prepared = await prepareDocumentPreview({ ...source, fileType: 'application/pdf' }, signal());
    expect(decrypt).toHaveBeenCalledWith(expect.any(Blob), 'application/pdf');
    expect(prepared.blob).toBe(plaintext);
    expect(prepared.kind).toBe('pdf');
  });

  it('does not create a preview when decryption fails or the viewer closes during decryption', async () => {
    const decrypt = vi.spyOn(documentCrypto, 'decryptApplicantBlob').mockRejectedValueOnce(new Error('Cannot decrypt this document.'));
    await expect(prepareDocumentPreview(source, signal())).rejects.toThrow('Cannot decrypt');
    const controller = new AbortController();
    decrypt.mockImplementationOnce(async (blob) => { controller.abort(); return blob; });
    await expect(prepareDocumentPreview(source, controller.signal)).rejects.toThrow();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('shows missing files as unavailable in collections', () => {
    expect(hasDocumentFile({ url: '#' })).toBe(false);
    expect(hasDocumentFile({ url: source.url })).toBe(true);
  });
});

describe('explicit document actions', () => {
  const file: PreparedDocument = { url: 'blob:printable', blob: new Blob(['fixture']), fileName: 'Reyes-TOR.pdf', kind: 'pdf', dispose: () => {} };

  it('downloads with the original filename only when explicitly invoked', () => {
    vi.useFakeTimers();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toBe(file.fileName);
      expect(this.href).toBe('blob:local-fixture');
    });
    downloadPreparedDocument(file);
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector('a[download]')).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-fixture');
  });

  it('opens only the local PDF for printing and severs opener access', () => {
    const tab = { opener: window };
    vi.spyOn(window, 'open').mockReturnValue(tab as unknown as Window);
    openPdfForPrinting(file);
    expect(tab.opener).toBeNull();
    expect(window.open).toHaveBeenCalledWith(file.url, '_blank');
  });

  it('reports blocked print tabs instead of claiming printing succeeded', () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    expect(() => openPdfForPrinting(file)).toThrow('blocked');
    expect(() => openPdfForPrinting({ ...file, kind: 'unsupported' })).toThrow('cannot');
  });
});

describe('attachment list access', () => {
  it('scopes metadata reads to the requested applicant and preserves file metadata', async () => {
    const row = { id: source.id, file_name: source.fileName, file_path: source.url, file_type: 'application/pdf' };
    const order = vi.fn().mockResolvedValue({ data: [row], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    mocks.from.mockReturnValue({ select: () => ({ eq }) });
    expect(await listApplicantDocumentAttachments('applicant-a')).toEqual([row]);
    expect(eq).toHaveBeenCalledWith('applicant_id', 'applicant-a');
    expect(mocks.mockFrom).not.toHaveBeenCalled();
  });

  it('reports a failed list rather than returning a successful empty collection', async () => {
    mocks.from.mockImplementation(() => { throw new Error('offline'); });
    mocks.mockFrom.mockImplementation(() => { throw new Error('offline'); });
    await expect(listApplicantDocumentAttachments('applicant-a')).rejects.toThrow('Could not load uploaded documents');
  });
});
