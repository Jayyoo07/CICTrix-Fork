export {
  encryptApplicantFile,
  decryptApplicantBlob,
  isEncryptedBuffer,
  blobToArrayBuffer,
  MAGIC_HEADER,
} from './_internal/cipher';

export {
  getPublicEncryptionKey,
  getPrivateDecryptionKey,
  clearCachedDecryptionKey,
} from './_internal/keys';
