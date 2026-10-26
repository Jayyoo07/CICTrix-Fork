# Document Encryption Module (`src/lib/crypto`)

Client-side asymmetric envelope encryption for files uploaded by job applicants.

## What It Does
- Encrypts files in the applicant's browser before upload using `AES-256-GCM` with a random per-file session key.
- Encapsulates the AES session key using `RSA-OAEP-256` with the system public key.
- Packages encrypted files with an `ABYAN_ENC1` binary envelope containing the encrypted session key and IV.
- Provides seamless backwards-compatible decryption for authorized HR staff (Super Admin, RSP, active Interviewers). Legacy unencrypted files pass through unchanged.
- Fetches and caches the private decryption key for authenticated staff via Supabase RPC `get_document_decryption_key`.

## Public Interface
- `encryptApplicantFile(file: File): Promise<File>`: Encrypts a `File` before uploading to `applicant-attachments` bucket.
- `decryptApplicantBlob(blob: Blob, mimeType?: string | null): Promise<Blob>`: Decrypts an encrypted blob or passes through legacy unencrypted blobs.
- `isEncryptedBuffer(buffer: ArrayBuffer): boolean`: Checks if a buffer contains the `ABYAN_ENC1` header.
- `getPublicEncryptionKey(): Promise<CryptoKey>`: Loads public encryption key.
- `getPrivateDecryptionKey(): Promise<CryptoKey>`: Loads private decryption key for authorized roles.
- `clearCachedDecryptionKey(): void`: Purges cached decryption keys from memory on logout.

## What It Does NOT Handle
- Does not encrypt employee files in the `employee-documents` bucket (out of scope; employee documents are managed post-hire).
- Does not modify document metadata in Postgres tables.
- Does not transmit private keys to unauthenticated callers.

## Dependencies
- Native browser `crypto.subtle` (Web Crypto API).
- `@supabase/supabase-js` for fetching the private key via RPC.
