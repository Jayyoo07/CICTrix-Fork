import { describe, expect, it } from 'vitest';
import {
  blobToArrayBuffer,
  decryptApplicantBlob,
  encryptApplicantFile,
  isEncryptedBuffer,
  MAGIC_HEADER,
} from './index';

// Vitest runs in Node / jsdom where window.crypto or globalThis.crypto is available
if (typeof window !== 'undefined' && !window.crypto) {
  (window as any).crypto = globalThis.crypto;
}

const readBlobAsText = async (blob: Blob): Promise<string> => {
  const buf = await blobToArrayBuffer(blob);
  return new TextDecoder().decode(buf);
};

describe('Document Encryption (AES-GCM + RSA-OAEP)', () => {
  it('encrypts a file with the ABYAN_ENC1 header and decrypts it back identically', async () => {
    const originalText = 'Confidential Civil Service Form 212 - Personal Data Sheet';
    const originalFile = new File([originalText], 'pds.pdf', { type: 'application/pdf' });

    const encryptedFile = await encryptApplicantFile(originalFile);

    expect(encryptedFile.name).toBe('pds.pdf');
    expect(encryptedFile.type).toBe('application/pdf');

    const encryptedBuffer = await blobToArrayBuffer(encryptedFile);
    expect(isEncryptedBuffer(encryptedBuffer)).toBe(true);

    // Verify first 10 bytes match MAGIC_HEADER
    const headerStr = new TextDecoder().decode(new Uint8Array(encryptedBuffer, 0, MAGIC_HEADER.length));
    expect(headerStr).toBe(MAGIC_HEADER);

    // Ciphertext must not contain plaintext string
    const fullEncryptedText = new TextDecoder().decode(new Uint8Array(encryptedBuffer));
    expect(fullEncryptedText).not.toContain(originalText);

    // Decrypt
    const decryptedBlob = await decryptApplicantBlob(encryptedFile, 'application/pdf');
    const decryptedText = await readBlobAsText(decryptedBlob);
    expect(decryptedText).toBe(originalText);
  });

  it('passes legacy unencrypted files through unchanged', async () => {
    const legacyText = 'Legacy unencrypted resume submitted last month';
    const legacyBlob = new Blob([legacyText], { type: 'text/plain' });

    const buffer = await blobToArrayBuffer(legacyBlob);
    expect(isEncryptedBuffer(buffer)).toBe(false);

    const resultBlob = await decryptApplicantBlob(legacyBlob, 'text/plain');
    const resultText = await readBlobAsText(resultBlob);
    expect(resultText).toBe(legacyText);
  });

  it('detects tampering and rejects tampered ciphertext', async () => {
    const originalText = 'Valid authenticated payload';
    const originalFile = new File([originalText], 'doc.pdf', { type: 'application/pdf' });
    const encryptedFile = await encryptApplicantFile(originalFile);

    const buffer = await blobToArrayBuffer(encryptedFile);
    const tampered = new Uint8Array(buffer);
    // Flip bytes in the ciphertext portion at the end
    tampered[tampered.length - 1] ^= 0xff;

    const tamperedBlob = new Blob([tampered], { type: 'application/pdf' });

    await expect(decryptApplicantBlob(tamperedBlob)).rejects.toThrow();
  });

  it('handles binary image buffers correctly', async () => {
    // 500-byte pseudo-random binary payload (like a PNG or scanned PDF)
    const binaryData = new Uint8Array(500);
    for (let i = 0; i < binaryData.length; i++) {
      binaryData[i] = (i * 37 + 13) % 256;
    }
    const originalFile = new File([binaryData], 'id-card.png', { type: 'image/png' });

    const encrypted = await encryptApplicantFile(originalFile);
    expect(isEncryptedBuffer(await blobToArrayBuffer(encrypted))).toBe(true);

    const decrypted = await decryptApplicantBlob(encrypted, 'image/png');
    const decryptedBuffer = await blobToArrayBuffer(decrypted);
    const decryptedBytes = new Uint8Array(decryptedBuffer);

    expect(decryptedBytes.length).toBe(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      expect(decryptedBytes[i]).toBe(binaryData[i]);
    }
  });
});
