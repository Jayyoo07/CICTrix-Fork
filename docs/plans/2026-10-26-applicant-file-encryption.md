---
title: Client-side asymmetric encryption for applicant files
date: 2026-10-26
status: Done
summary: Encrypt applicant file uploads client-side via Web Crypto (AES-256-GCM + RSA-OAEP) before storing in Supabase Storage, and gate the private decryption key in Postgres to Super Admin, RSP, and active Interviewers.
---

## Goal

Files uploaded by job applicants (resumes, Personal Data Sheets, transcripts, certificates) are encrypted in the applicant's browser before being written to Supabase Storage. Anyone with direct access to the storage bucket or database dumps sees only encrypted ciphertext. Only authenticated staff with authorized roles (Super Admin, RSP Admin, and active Interviewers) receive the private key to decrypt and view or download files in memory, while legacy unencrypted files remain readable without corruption.

## Approach

1. **Hybrid / Envelope Encryption Architecture (Web Crypto API):**
   - **Upload (Browser):** When an applicant attaches a file in `ApplicantWizard` or `ApplicationStatusPage`, the browser generates a cryptographically random 256-bit AES-GCM session key and a 96-bit Initialization Vector (IV). The file bytes are encrypted with `AES-256-GCM`. The AES session key is then encrypted with the system's public key using `RSA-OAEP-256`.
   - **Payload Format:** Stored objects in the `applicant-attachments` bucket follow an envelope format with magic header bytes `ABYAN_ENC1`, followed by the length of the encrypted key, the RSA-encrypted AES key, the 12-byte IV, and the ciphertext with GCM authentication tag.
   - **Backwards Compatibility:** Files lacking the `ABYAN_ENC1` magic header are treated as legacy plaintext files, allowing existing attachments to be viewed without errors.
   - **Download / Preview:** When authorized staff open or download a document in `RSPDashboard`, `QualifiedApplicantsPage`, `QualifiedApplicantsSection`, `ApplicantDetailsPage`, or `InterviewerApplicantsList`, the client fetches the payload, decrypts the session key using the private key, decrypts the file bytes, and creates a temporary in-memory Object URL (`blob:`).

2. **Key Storage and Role-Based Release (Supabase):**
   - **Public Key:** Configured via application environment (`VITE_DOCUMENT_ENCRYPTION_PUBLIC_KEY`) and bundled default in `src/lib/crypto/documentKeys.ts` for unauthenticated applicants and local development.
   - **Private Key:** Stored in a restricted table in Supabase (`document_encryption_keys`) and accessed via a `SECURITY DEFINER` Postgres function `get_document_decryption_key()`.
   - **Authorization Gate:** `get_document_decryption_key()` verifies that the caller has an active Supabase Auth session and belongs to `user_roles` (`ADMIN`, `RSP`, `super-admin`) OR is listed as an active interviewer in `raters`. Unauthorized callers (PM, L&D, employees, anonymous users) are rejected with a permission error.
   - **Client Caching:** The decrypted `CryptoKey` is cached in memory for the active browser session to prevent repeated RPC calls during rapid document review.

## Steps

1. **Cryptographic service layer:**
   - Create `src/lib/crypto/documentEncryption.ts` and `src/lib/crypto/documentKeys.ts` using the native Web Crypto API (`crypto.subtle`). Implement key derivation, payload packaging (`ABYAN_ENC1`), file encryption, decryption, and backward-compatible legacy detection.
   - Add unit tests in `src/lib/crypto/documentEncryption.test.ts` verifying encryption round-trips, tampering detection (GCM auth tag check), legacy unencrypted pass-through, and corrupt payload handling.

2. **Database migration & access RPC:**
   - Create migration using `npx supabase migration new document_encryption_keys`.
   - Create table `document_encryption_keys` with RLS disabled for public/anon and restricted to postgres.
   - Add `SECURITY DEFINER` function `get_document_decryption_key()` that returns the private key only to callers authenticated as `super-admin`, `rsp`, or active `raters`.

3. **Wire upload surfaces:**
   - Update `src/modules/applicant/ApplicantWizard.tsx` (`uploadFiles`) to encrypt files before calling Supabase storage upload.
   - Update `src/modules/applicant/ApplicationStatusPage.tsx` (`handleReupload`) to encrypt re-uploaded files.
   - Update interviewer document upload handlers in `src/modules/interviewer/ApplicantDetailsPage.tsx` if used.

4. **Wire preview and download surfaces:**
   - Add helper `fetchAndDecryptAttachment(filePath: string)` in `src/lib/applicantDocuments.ts` that retrieves the blob, decrypts if `ABYAN_ENC1` is present, and yields a safe Object URL and clean-up release handle.
   - Update `QualifiedApplicantsPage.tsx` and `DocumentPreviewModal.tsx` to display decrypted Object URLs.
   - Update `QualifiedApplicantsSection.tsx` (`FilesViewerModal`) and `ApplicantDetailsPage.tsx` (`openDocument`) to decrypt before opening/previewing.
   - Update download triggers in `RSPDashboard.tsx` to export decrypted files with original names and MIME types.

5. **Verification and regression testing:**
   - Run unit and integration tests (`npm test`).
   - Run type-check (`npx tsc --noEmit`) and lint (`npm run lint`).
   - Verify that uploading an encrypted document yields unreadable ciphertext in storage, while opening it as RSP/Interviewer renders the original document perfectly.
   - Verify that existing plaintext documents remain fully viewable.

## Risks

- **Third-party Office Document Viewer:** The current `DocumentPreviewModal` embeds Microsoft Office files via `view.officeapps.live.com` using a signed URL. Microsoft's viewer cannot decrypt client-side encrypted blobs. For encrypted Office files (`.docx`, `.xlsx`), the viewer will fall back to in-browser download of the decrypted file rather than passing ciphertext to Microsoft.
- **Memory Management:** Large decrypted files converted to Object URLs must have their memory released via `URL.revokeObjectURL()` when modals close.
- **Offline / Mock Mode:** In demo or test mode where Supabase Auth is bypassed, the service layer will fall back to a local development key pair so local tests and offline development do not fail.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `node scripts/check-migrations.mjs`
