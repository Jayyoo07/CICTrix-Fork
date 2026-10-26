import { getPrivateDecryptionKey, getPublicEncryptionKey } from './keys';

export const MAGIC_HEADER = 'ABYAN_ENC1';
export const IV_LENGTH = 12;

const textEncoder = new TextEncoder();
const MAGIC_BYTES = textEncoder.encode(MAGIC_HEADER);

/**
 * Checks if the given buffer begins with the ABYAN_ENC1 magic signature.
 */
export const isEncryptedBuffer = (buffer: ArrayBuffer): boolean => {
  if (buffer.byteLength < MAGIC_BYTES.length + 2 + IV_LENGTH) return false;
  const view = new Uint8Array(buffer, 0, MAGIC_BYTES.length);
  for (let i = 0; i < MAGIC_BYTES.length; i++) {
    if (view[i] !== MAGIC_BYTES[i]) return false;
  }
  return true;
};

/**
 * Encrypts an ArrayBuffer of file data using AES-256-GCM and encrypts the
 * symmetric key using the provided RSA-OAEP public key.
 */
export const encryptBuffer = async (
  data: ArrayBuffer,
  publicKey: CryptoKey
): Promise<ArrayBuffer> => {
  // 1. Generate unique 256-bit AES-GCM session key
  const aesKey = await window.crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  // 2. Export raw AES key and encrypt with RSA-OAEP public key
  const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey);
  const encryptedKey = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    rawAesKey
  );

  // 3. Generate random 12-byte IV and encrypt file payload
  const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    data
  );

  // 4. Assemble package: [Magic 10B] [KeyLen 2B] [EncKey] [IV 12B] [Ciphertext]
  const keyLength = encryptedKey.byteLength;
  const totalLength = MAGIC_BYTES.length + 2 + keyLength + IV_LENGTH + ciphertext.byteLength;
  const result = new Uint8Array(totalLength);

  let offset = 0;
  result.set(MAGIC_BYTES, offset);
  offset += MAGIC_BYTES.length;

  // Key length as 16-bit big endian integer
  result[offset] = (keyLength >> 8) & 0xff;
  result[offset + 1] = keyLength & 0xff;
  offset += 2;

  result.set(new Uint8Array(encryptedKey), offset);
  offset += keyLength;

  result.set(iv, offset);
  offset += IV_LENGTH;

  result.set(new Uint8Array(ciphertext), offset);

  return result.buffer;
};

/**
 * Decrypts an encrypted ArrayBuffer using the provided RSA-OAEP private key.
 * If the buffer does not begin with the ABYAN_ENC1 signature, it is returned
 * unmodified for backwards compatibility with legacy unencrypted files.
 */
export const decryptBuffer = async (
  buffer: ArrayBuffer,
  privateKey: CryptoKey
): Promise<ArrayBuffer> => {
  if (!isEncryptedBuffer(buffer)) {
    return buffer;
  }

  let offset = MAGIC_BYTES.length;
  const headerView = new Uint8Array(buffer);
  const keyLength = (headerView[offset] << 8) | headerView[offset + 1];
  offset += 2;

  if (buffer.byteLength < offset + keyLength + IV_LENGTH) {
    throw new Error('Corrupted encrypted file: payload is truncated.');
  }

  const encryptedKeyBytes = buffer.slice(offset, offset + keyLength);
  offset += keyLength;

  const iv = new Uint8Array(buffer.slice(offset, offset + IV_LENGTH));
  offset += IV_LENGTH;

  const ciphertext = buffer.slice(offset);

  // Decrypt AES session key
  const rawAesKey = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encryptedKeyBytes
  );

  // Import AES key and decrypt payload
  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    rawAesKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  return window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ciphertext
  );
};

/**
 * Safely reads a Blob or File into an ArrayBuffer across both modern browsers
 * and jsdom/test environments.
 */
export const blobToArrayBuffer = async (blob: Blob): Promise<ArrayBuffer> => {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read blob as ArrayBuffer'));
    reader.readAsArrayBuffer(blob);
  });
};

/**
 * Encrypts an applicant File before upload to Supabase storage.
 * Preserves the original file name, type, and last modified timestamp.
 */
export const encryptApplicantFile = async (file: File): Promise<File> => {
  const publicKey = await getPublicEncryptionKey();
  const fileBuffer = await blobToArrayBuffer(file);
  const encryptedBuffer = await encryptBuffer(fileBuffer, publicKey);

  return new File([encryptedBuffer], file.name, {
    type: file.type || 'application/octet-stream',
    lastModified: file.lastModified,
  });
};

/**
 * Decrypts an attachment Blob.
 * If the file is encrypted, decrypts using the active session's private key.
 * If legacy unencrypted, passes through untouched.
 */
export const decryptApplicantBlob = async (
  blob: Blob,
  mimeType?: string | null
): Promise<Blob> => {
  const buffer = await blobToArrayBuffer(blob);
  if (!isEncryptedBuffer(buffer)) {
    return blob;
  }

  const privateKey = await getPrivateDecryptionKey();
  const decryptedBuffer = await decryptBuffer(buffer, privateKey);
  return new Blob([decryptedBuffer], {
    type: mimeType || blob.type || 'application/octet-stream',
  });
};
