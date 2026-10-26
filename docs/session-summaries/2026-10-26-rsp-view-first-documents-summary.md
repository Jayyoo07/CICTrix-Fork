---
title: RSP view-first document viewing
date: 2026-10-26
plan: docs/plans/2026-10-26-rsp-view-first-documents.md
---

## Implemented versus planned

The view-first document flow has been reapplied on branch `feat/rsp-view-first-documents` on top of the merged baseline (`4a6abca`, which incorporates PR #40 `feat/applicant-file-encryption`), resolving the previous integration blocker.

Applicant document review in `QualifiedApplicantsPage`, category/experience/assessment files in `QualifiedApplicantsSection`, and employee submissions in `RSPDashboard` now use the unified opt-in view-first flow:

- PDFs and supported images open locally in the existing shared-modal layout (`DocumentPreviewModal` with `viewFirst`). Opening a preview does not download the file or open an unsolicited new tab.
- Explicit Download saves the prepared blob with its original filename. Image Print uses the existing printable-modal styles. PDF Print hands the local PDF to a browser tab and explains how to use the native viewer's print command; blocked popups produce a helpful message rather than a false success.
- Document Download All/Download Selected actions became View Documents/View Selected collections (`DocumentCollectionModal`). Staff open one file at a time, and unavailable files are labelled without substituting a metadata CSV.
- The selected attachment's row, filename, MIME type, and storage path remain together. Removed any-attachment/cache fallbacks that could show the wrong file. Applicant metadata requests remain scoped to the applicant and ignore stale failures when a different applicant is opened.
- Missing links, failed access, empty files, HTML responses, unsupported formats, media errors, and retries have explicit states. Loading is cancellable and temporary preview URLs are released on close/replacement.
- Office/unsupported files require an explicit download to a compatible app; the new RSP flow does not send their URLs to Microsoft's viewer. Existing non-RSP `DocumentPreviewModal` behavior and extra actions remain unchanged.
- Recruitment decisions, approval/scoring actions, report/CSV exports, uploads, retention, and storage policies were not changed by this task.

## Files carrying the implementation

- `src/lib/documentViewing.ts`
- `src/components/ViewFirstDocumentPreview.tsx`
- `src/components/DocumentCollectionModal.tsx`
- `src/components/DocumentPreviewModal.tsx`
- `src/components/QualifiedApplicantsPage.tsx`
- `src/components/QualifiedApplicantsSection.tsx`
- `src/modules/admin/RSPDashboard.tsx`

Tests: `src/lib/documentViewing.test.ts`, `src/components/DocumentPreviewModal.test.tsx`, and `src/components/QualifiedApplicantsPage.documents.test.tsx` (33 tests total).

## Deviations and concurrent work

- The existing shared Modal already supports document-only printing, so no token, design-guide, print-style, or viewer-layout redesign was necessary.
- PDF printing uses a deliberate native-viewer tab instead of assuming a cross-origin iframe can be printed programmatically. Images stay in the printable in-site view.
- Merged cleanly with the client-side applicant file encryption feature (`decryptApplicantBlob` in `prepareDocumentPreview`). Encrypted applicant attachments decrypt transparently in memory, while unencrypted/employee files pass through unchanged.
- No push or deployment was performed by this session.

## Checks run

- `npx tsc --noEmit`: passed with 0 errors.
- `npm run lint`: passed with zero warnings.
- Focused viewer/service/applicant-entry-point tests: all 33 tests passed (`DocumentPreviewModal.test.tsx`, `QualifiedApplicantsPage.documents.test.tsx`, `documentViewing.test.ts`).
- `npx vitest run --exclude "**/.claude/**" --exclude "**/.worktrees/**" --maxWorkers=2`: **75 files, 656 tests passed**.
- `npm run build:verify`: passed sequentially (tsc --noEmit + Vite build).
- Plans dashboard regenerated using `docs/plans/build-plans-index.ps1`.

Existing React `act(...)` warnings, Vite's CJS deprecation notice, and the stale Browserslist notice remain outside this task's scope.

## Browser evidence and limits

A temporary fixture harness used the actual components and non-sensitive PDF/image/Office fixtures.

- At 1366x768, the PDF viewer measured 1024px wide, had a white header title, used a local blob iframe, enabled Print after load, and produced no download merely by opening it.
- At 375px, the image viewer filled its 375x812 frame, with no horizontal overflow and visible, enabled footer actions within the sheet. At 768px it switched to the inset modal without horizontal overflow.
- A real explicit image download produced `Reyes-Certificate-fixture.png` (image/png, 20,862 bytes). There were no external Office-viewer requests in the new flow.
- A browser-side print spy confirmed the image Print control invokes printing once with the image inside the printable modal, while the viewer stays open. Unit tests cover the PDF handoff, blocked popups, loading/failure states, late-result cleanup, nested Escape/focus return, browser Back, exact latest attachment selection, and non-RSP compatibility.
- Checked the applicable `DESIGN_IDENTITY.md` section 16 items: existing Poppins/tokens/shared modal, pill buttons, Lucide icons, white modal heading, responsive dimensions, loading/error/disabled states, and keyboard/focus behavior. Untouched top bars, sidebars, tables, and status badges were not redesigned.
- Live authenticated Supabase file access, production encryption-key access, actual OS print-dialog output, and physical printing were not verified. Browser screenshots were limited by intermittent pane visibility; native PDF print handoff is covered in tests rather than claimed as physically printed.
