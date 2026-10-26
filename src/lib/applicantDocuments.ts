import { ATTACHMENTS_BUCKET, supabase } from './supabase';
import { decryptApplicantBlob } from './crypto';

/**
 * Resolves a file path or URL to an accessible HTTP/signed URL.
 */
export const resolveApplicantSignedUrl = async (
  filePathOrUrl: string,
  expiresInSeconds: number = 300
): Promise<string | null> => {
  if (!filePathOrUrl || filePathOrUrl === '#' || filePathOrUrl.startsWith('mock://')) {
    return null;
  }
  if (
    filePathOrUrl.startsWith('http://') ||
    filePathOrUrl.startsWith('https://') ||
    filePathOrUrl.startsWith('blob:') ||
    filePathOrUrl.startsWith('data:')
  ) {
    return filePathOrUrl;
  }

  try {
    const signedResult = await (supabase as any).storage
      .from(ATTACHMENTS_BUCKET)
      .createSignedUrl(filePathOrUrl, expiresInSeconds);
    const signedUrl = (signedResult as any)?.data?.signedUrl as string | undefined;
    if (signedUrl) return signedUrl;
  } catch {
    // Continue to public URL fallback
  }

  try {
    const publicResult = (supabase as any).storage
      .from(ATTACHMENTS_BUCKET)
      .getPublicUrl(filePathOrUrl);
    const publicUrl = (publicResult as any)?.data?.publicUrl as string | undefined;
    if (publicUrl) return publicUrl;
  } catch {
    // Final fallback
  }

  return null;
};

export interface DecryptedAttachmentResult {
  blob: Blob;
  objectUrl: string;
  cleanup: () => void;
}

/**
 * Fetches an applicant attachment from Supabase Storage and decrypts it
 * in memory using the active session's private key.
 * If the file is legacy unencrypted, passes through unharmed.
 */
export const fetchAndDecryptApplicantAttachment = async (
  filePathOrUrl: string,
  mimeType?: string | null
): Promise<DecryptedAttachmentResult> => {
  if (filePathOrUrl.startsWith('blob:') || filePathOrUrl.startsWith('data:')) {
    const response = await fetch(filePathOrUrl);
    const blob = await response.blob();
    return {
      blob,
      objectUrl: filePathOrUrl,
      cleanup: () => {},
    };
  }

  const resolvedUrl = await resolveApplicantSignedUrl(filePathOrUrl, 300);
  if (!resolvedUrl) {
    throw new Error('Unable to resolve storage URL for applicant attachment.');
  }

  const response = await fetch(resolvedUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch attachment: HTTP ${response.status}`);
  }

  const rawBlob = await response.blob();
  const decryptedBlob = await decryptApplicantBlob(rawBlob, mimeType);
  const objectUrl = URL.createObjectURL(decryptedBlob);

  return {
    blob: decryptedBlob,
    objectUrl,
    cleanup: () => {
      URL.revokeObjectURL(objectUrl);
    },
  };
};

/**
 * Downloads an applicant document by fetching, decrypting in memory,
 * and triggering a browser download of the decrypted plaintext file.
 */
export const downloadApplicantAttachment = async (
  filePathOrUrl: string,
  fileName: string,
  mimeType?: string | null
): Promise<void> => {
  const { objectUrl, cleanup } = await fetchAndDecryptApplicantAttachment(
    filePathOrUrl,
    mimeType
  );

  try {
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName || 'applicant-document';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Delay revocation slightly so browser finishes starting download
    setTimeout(() => {
      cleanup();
    }, 5000);
  }
};
