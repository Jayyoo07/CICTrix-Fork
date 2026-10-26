import { getPreferredDataSourceMode } from './dataSourceMode';
import { mockDatabase } from './mockDatabase';
import { ATTACHMENTS_BUCKET, isMockModeEnabled, supabase } from './supabase';
import { decryptApplicantBlob } from './crypto';

export interface ViewerDocument {
  id: string;
  fileName: string;
  fileType?: string | null;
  /** Direct URL, or an object key when bucket is supplied. Never another file's fallback URL. */
  url: string;
  bucket?: string;
  label?: string;
  subtitle?: string;
}

export interface ApplicantDocumentAttachment {
  id: string;
  file_name: string;
  file_path: string;
  file_type?: string | null;
  document_type?: string;
  created_at?: string;
  file_size?: number;
}

export interface PreparedDocument {
  url: string;
  blob: Blob;
  fileName: string;
  kind: 'pdf' | 'image' | 'unsupported';
  dispose: () => void;
}

const SIGNED_URL_LIFETIME_SECONDS = 300;
const DOWNLOAD_URL_LIFETIME_MS = 60_000;
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', bmp: 'image/bmp', avif: 'image/avif',
};

export const hasDocumentFile = (file: Pick<ViewerDocument, 'url'>): boolean =>
  Boolean(file.url?.trim() && file.url.trim() !== '#' && !file.url.startsWith('mock://'));

/** Keep the exact row identity, filename and MIME type through list -> preview. */
export const applicantAttachmentDocument = (row: ApplicantDocumentAttachment): ViewerDocument => ({
  id: row.id,
  fileName: row.file_name,
  fileType: row.file_type,
  url: row.file_path,
  bucket: ATTACHMENTS_BUCKET,
});

const ATTACHMENT_PREVIEW_CACHE_KEY = 'cictrix_attachment_previews';

type CachedPreviewFile = {
  applicantId: string;
  documentType: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
};

/**
 * Local/demo rows store `mock://` paths; the applicant wizard caches the file itself
 * as a data URL. Match on applicant and exact document type so a missing file never
 * shows another one.
 */
const withCachedPreviews = (applicantId: string, rows: ApplicantDocumentAttachment[]): ApplicantDocumentAttachment[] => {
  if (!rows.some((row) => row.file_path?.startsWith('mock://'))) return rows;
  let cache: CachedPreviewFile[] = [];
  try {
    cache = JSON.parse(localStorage.getItem(ATTACHMENT_PREVIEW_CACHE_KEY) ?? '[]') as CachedPreviewFile[];
  } catch {
    return rows;
  }
  return rows.map((row) => {
    if (!row.file_path?.startsWith('mock://')) return row;
    const cached = cache.find((entry) => entry.applicantId === applicantId
      && entry.documentType === (row.document_type ?? '')
      && entry.dataUrl?.startsWith('data:'));
    return cached ? { ...row, file_path: cached.dataUrl, file_type: row.file_type || cached.mimeType } : row;
  });
};

export async function listApplicantDocumentAttachments(applicantId: string): Promise<ApplicantDocumentAttachment[]> {
  const local = isMockModeEnabled || getPreferredDataSourceMode() === 'local';
  const clients = local ? [mockDatabase, supabase] : [supabase, mockDatabase];
  let primaryFailed = false;
  for (const client of clients) {
    try {
      const { data, error } = await (client as any).from('applicant_attachments')
        .select('id,file_name,file_path,file_type,document_type,created_at,file_size')
        .eq('applicant_id', applicantId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const rows = ((data ?? []) as ApplicantDocumentAttachment[]).filter((row) => row.file_path || row.file_name);
      // An empty fallback after a failed primary read is not "no documents".
      if (primaryFailed && rows.length === 0) break;
      return withCachedPreviews(applicantId, rows);
    } catch {
      // Retain the existing local-data fallback, scoped to this applicant only.
      primaryFailed = true;
    }
  }
  throw new Error('Could not load uploaded documents. Close the applicant details and try again.');
}

async function resolveDocumentUrl(file: ViewerDocument): Promise<string> {
  const url = file.url?.trim() || '';
  if (!hasDocumentFile(file)) throw new Error('No file is available for this document.');
  if (/^https?:\/\//i.test(url) || /^blob:/i.test(url) || /^data:/i.test(url)) return url;
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || !file.bucket) {
    throw new Error('This document link is not supported.');
  }
  const { data, error } = await supabase.storage.from(file.bucket)
    .createSignedUrl(url, SIGNED_URL_LIFETIME_SECONDS);
  if (error || !data?.signedUrl) throw new Error('Could not access this document. Close the viewer and try again.');
  return data.signedUrl;
}

/** Fetch once into a local blob so attachment response headers cannot start a browser download. */
export async function prepareDocumentPreview(file: ViewerDocument, signal: AbortSignal): Promise<PreparedDocument> {
  const url = await resolveDocumentUrl(file);
  signal.throwIfAborted();
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('Could not load this document. Close the viewer and try again.');
  const rawBlob = await response.blob();
  signal.throwIfAborted();
  if (!rawBlob.size) throw new Error('This file is empty. Ask for a new upload.');
  const original = await decryptApplicantBlob(rawBlob, file.fileType);
  signal.throwIfAborted();

  const fileName = file.fileName || decodeURIComponent(new URL(url, window.location.href).pathname.split('/').pop() || 'document');
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  const receivedType = original.type.split(';')[0].toLowerCase();
  const genericType = !receivedType || receivedType === 'application/octet-stream';
  const type = genericType
    ? (file.fileType || (extension === 'pdf' ? 'application/pdf' : IMAGE_MIME_BY_EXTENSION[extension]) || 'application/octet-stream')
    : receivedType;
  if (receivedType === 'text/html' || receivedType === 'application/xhtml+xml') {
    throw new Error('The document link returned a web page instead of a file. Close the viewer and try again.');
  }
  const kind = type === 'application/pdf' ? 'pdf'
    : Object.values(IMAGE_MIME_BY_EXTENSION).includes(type) ? 'image' : 'unsupported';
  // A PDF stored as octet-stream still needs a PDF blob type for the native viewer.
  const blob = genericType && kind !== 'unsupported' ? new Blob([original], { type }) : original;
  const blobUrl = URL.createObjectURL(blob);
  return { url: blobUrl, blob, fileName, kind, dispose: () => URL.revokeObjectURL(blobUrl) };
}

/** Only call in response to an explicit Download click. No direct-link fallback. */
export function downloadPreparedDocument(file: PreparedDocument): void {
  const url = URL.createObjectURL(file.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser time to consume the blob, even if the viewer closes immediately.
  window.setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_LIFETIME_MS);
}

/** Native PDF viewers own their Print command; never print the containing dashboard/iframe. */
export function openPdfForPrinting(file: PreparedDocument): void {
  if (file.kind !== 'pdf') throw new Error('This file cannot be opened as a printable PDF.');
  // Do not pass noopener here: it returns null even on success, hiding blocked-popup failures.
  const tab = window.open(file.url, '_blank');
  if (!tab) throw new Error('The print tab was blocked. Allow popups for this site and try Print again.');
  tab.opener = null;
}
