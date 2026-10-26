---
title: Open RSP documents in a viewer before printing or downloading
date: 2026-10-26
status: Done
summary: Make RSP document actions view-first using the existing in-site viewer, with explicit Print and Download controls instead of immediate file downloads. Preserve document access rules and leave report exports unchanged.
---

## Goal

RSP staff can review uploaded applicant and employee documents without first saving them to their computer. Opening a document shows a preview; printing and downloading happen only after the user explicitly chooses those actions. Closing the viewer returns staff to the same applicant, report, selection, and scroll position.

Approved by the user on 2026-10-26 with "go ahead and build": use the existing in-site viewer as the default and view collections one file at a time. Status advanced from Draft through Approved to In Progress. This is not a restriction on downloading: Download remains available inside the viewer.

Follow `DESIGN_IDENTITY.md` sections 8.2, 9.1, 9.10, 13, and 16 and the shared-modal decision in `docs/plans/2026-10-25-standard-modal.md`. No document-viewer-specific mockup was found in the full `docs/mockups/` and `docs/mockups/sessions/` listing. Reuse the existing viewer layout rather than redesigning it. If implementation requires a materially different layout, use `ui-preview` and approve that layout first. This plan does not supersede the standard-modal plan.

## Approach

### Current behavior verified in the repository

- `src/components/DocumentPreviewModal.tsx` already previews images, PDFs, and Office documents inside the shared `Modal` at `size="xl"` with a flush body. It provides Download but no explicit Print action. Its Office preview uses Microsoft's external viewer.
- `src/modules/admin/RSPDashboard.tsx` already opens this viewer for employee submissions, but also offers immediate per-file, selected, and office-wide downloads through `triggerDocumentDownload`. When none of the selected entries has a file URL, that helper downloads a metadata CSV instead.
- `src/components/QualifiedApplicantsPage.tsx` opens raw URLs through `handlePreviewDocument` and starts multiple downloads through `handleBulkDownload`. `resolveDocumentForApplicant` can fall back to an unrelated attachment belonging to the same applicant when the requested document is missing.
- `src/components/QualifiedApplicantsSection.tsx` opens raw signed URLs from `FilesViewerModal.openFile` and the experience-document shortcut. These paths do not use the shared preview component.

### Intended behavior and implementation boundaries

1. **One-file viewing.** Use the existing `DocumentPreviewModal` for RSP applicant attachments and employee submissions. Show the actual filename and the applicant/employee and document context. Opening a file must not trigger a download, bulk action, or unsolicited new tab.
2. **Explicit actions.** Provide labelled Print and Download controls in the viewer. Remove direct document-download actions from the affected RSP lists. Keep approval, rejection, validation, and scoring actions unchanged. Do not change report, ranking, rater-list, or archive CSV exports.
3. **Collections.** Replace document Download All/Download Selected with View Documents/View Selected: show the relevant files in a list and let staff open one at a time. Reuse an existing file-list pattern where possible. Do not open a tab or start a download for every selected file. Missing files remain clearly identified; never silently substitute a CSV.
4. **Exact document resolution.** Resolve the selected attachment, not any available attachment. Retain its filename, MIME type when available, and identifier. Missing requested documents produce a clear unavailable state rather than showing another document. Keep signed-URL creation and HTTP/file fetching in `src/lib/`, not inline in components. Preserve current authorization and bucket access; do not make private files public or persist temporary signed URLs.
5. **Printing.** Print the selected document, never the surrounding dashboard. Use a document-only image print surface and verify the browser's PDF printing path before choosing the final handler. Do not assume that calling `print()` on a cross-origin iframe will work. Where an embedded viewer cannot print, provide an explicit open-for-print action only when a previewable destination is available, with popup/error feedback. Do not label a download as successful printing.
6. **Formats and privacy.** PDFs and supported images are the initial acceptance baseline. Office formats and unsupported files must have truthful capability messages; do not promise universal browser printing or conversion. Do not expand the existing Microsoft viewer to new RSP attachment paths without explicit approval for sharing document URLs with that third party. Unsupported files can still be downloaded deliberately. No new conversion service or renderer dependency without approval.
7. **Shared-component compatibility.** `DocumentPreviewModal` is also used outside RSP, including PM. Preserve its existing public props and extra `actions` slot. Make RSP-specific changes opt-in where needed so this task does not silently change other portals' document actions or external-viewer behavior.
8. **Lifecycle and feedback.** Show loading and actionable failure states, disable unavailable actions, prevent duplicate requests, and release temporary object URLs on replacement/close. Preserve keyboard focus, Escape, nested-modal handling, browser Back closing one level, and mobile full-screen-sheet behavior.

No database migration, storage-policy change, live database write, deployment, or push is part of this work. No changes to uploads, retention, document requirements, or recruitment workflow rules.

### Implementation outcome (2026-10-26)

**Reintegration and verification:** The previous blocker (concurrent PR #40 overwrite) was resolved. On branch `feat/rsp-view-first-documents`, the view-first wiring was reapplied on top of the merged `main` baseline (`4a6abca`, including client-side applicant file encryption). Verification was successfully rerun: `npx tsc --noEmit` passed, `npm run lint` passed with 0 warnings, `npm run build:verify` passed, and `npx vitest run --exclude "**/.claude/**" --exclude "**/.worktrees/**" --maxWorkers=2` passed (all 75 test files, 656 tests).

- RSP entry points now use `DocumentPreviewModal` with the opt-in `viewFirst` flow implemented by `src/components/ViewFirstDocumentPreview.tsx`. Existing non-RSP callers retain their legacy behavior and extra actions.
- `src/components/DocumentCollectionModal.tsx` replaces immediate batch document downloads with file-by-file review. `src/lib/documentViewing.ts` owns exact-row mapping, metadata reads, signed URLs, local blob preparation, downloads, and the native PDF print-tab handoff. Images reuse the shared modal's existing document-only print styles; no token changes were needed.
- The concurrent applicant-encryption session added `decryptApplicantBlob` to preview preparation. That integration was preserved, with tests added for decrypted output, decryption failure, and closing during decryption. The crypto implementation, uploads, key management, and migration belong to that separate task, not this plan.
- The implementation and checks completed and verified against the current merged codebase. No push or deployment was performed.
- Current checkout verification: all 656 tests in 75 files passed using two workers and excluding nested worktrees; lint and `npm run build:verify` passed.

Detailed results and limitations: `docs/session-summaries/2026-10-26-rsp-view-first-documents-summary.md`.

### Re-land after revert (2026-10-26)

The first implementation was merged (`c4b4ea3`) and reverted (`87593cf`) so it could be reviewed before landing again. Branch `feat/rsp-view-first-documents-v2` re-applies `72a1845` on `main` and fixes five defects the review found:

1. **Failed reads looked like "no documents."** In Supabase mode, a failed attachment read fell through to the local mock database, which answered with an empty list, so the new error state never appeared. An empty fallback after a failed primary read now reports the failure.
2. **Local/demo previews were removed.** Local rows store `mock://` paths, and the old page previewed them from the applicant wizard's cached copy. That path was deleted, so every local document showed as unavailable. It is restored with an exact applicant and document-type match only, so a missing file still never borrows another one.
3. **The Experience CV shortcut was dropped** instead of moved into the viewer, as Step 5 required. It now opens the CV in the in-site viewer.
4. **The scoring file list lost each file's size and upload date.** They are restored as the row subtitle.
5. **View stayed enabled for documents with no file,** opening a viewer that could only show an error. It is now disabled.

The applicant details page (`src/modules/interviewer/ApplicantDetailsPage.tsx`), used by RSP admins and interviewers, was missed by the original trace. It opened documents in a new tab with `noopener`, so `window.open` always returned `null` and a "Pop-up blocked" alert showed even when the tab opened. It now uses the same in-site viewer, and View Experience Documents opens the file-by-file list instead of one tab per file.

After that change shipped, the viewer on this page flickered with "Loading applicant details...". Opening the viewer adds a Back marker to `location.state`, and the page's loader re-ran on any change to that state object, so it remounted the page, which reopened the viewer, which added another marker, in a loop. The loader now re-runs only when the route id or the passed-in applicant changes. The page also passed its display label ("Cruz CV") as the file name, which would have saved downloads without an extension and could hide previews of encrypted files with no MIME type. The viewer now gets the uploaded file name and type.

Word files showed "Preview unavailable", although the application form accepts `.docx` and `.doc`. The viewer now renders `.docx` in the browser with `docx-preview`, loaded only when a Word file opens. The pages render in a sandboxed frame (no scripts or popups), which keeps the portal's styles out of the document, and Print prints that frame only. Nothing is sent to an external viewer. Legacy `.doc` files keep the download fallback, with a message naming the older format, because no browser library renders them reliably.


## Steps

1. Obtain approval for this draft's in-site default and collection behavior. Before implementation, use a task branch, mark the plan Approved then In Progress, and regenerate the plans index after status changes.
2. Trace the affected RSP document entry points and their current attachment metadata. Confirm supported upload formats and identify any additional RSP raw-file links that serve the same viewing flow. Keep unrelated downloads and other portals out of scope.
3. Add focused document-resolution and preview-preparation helpers in the existing `src/lib/` service layer as needed. Cover exact attachment matching, signed-URL errors, missing files, MIME/filename handling, and cleanup with tests. Use fixtures or mocks, not live writes.
4. Extend the shared viewer for the RSP view-first flow, including explicit Print and Download, document-only printing, loading/error/unavailable states, and an honest unsupported-format fallback. Preserve existing non-RSP callers and extra actions.
5. Wire `QualifiedApplicantsPage`, `QualifiedApplicantsSection` (including its file list and experience shortcut), and `RSPDashboard` employee submissions into the same flow. Replace immediate single and batch document downloads with the approved viewing actions. Verify that review/scoring state and list context are preserved.
6. Add component/integration tests for opening, selecting a file from a collection, printing, explicit downloading, failure handling, nested close behavior, and non-RSP compatibility. Tests must prove that View does not invoke a download or open multiple tabs.
7. Run the checks below and one batched desktop/mobile browser pass. Record browser-specific printing limits rather than claiming untested support. On completion, mark this plan Done, write `docs/session-summaries/2026-10-26-rsp-view-first-documents-summary.md` with actual results and deviations, and regenerate the plans index.

## Risks

- **File response behavior.** A raw URL may be served as an attachment or with an incorrect MIME type. Inspect actual response behavior during implementation; use an authorized preview representation where needed rather than assuming a new tab prevents downloads.
- **Browser PDF support.** Native PDF viewers, mobile browsers, cross-origin restrictions, and popup blocking differ. Verify document-only printing in supported browsers; provide a clear manual path where direct printing is unavailable.
- **Sensitive documents.** A third-party viewer can receive private or signed document URLs. Do not broaden that data flow without approval. Keep unsupported formats explicit instead of silently uploading files elsewhere.
- **Wrong attachment.** Existing any-attachment fallbacks can display a different file from the one selected. Missing-document tests must prevent this in the affected flow.
- **Shared viewer regressions.** PM and other existing callers must retain their actions and behavior. Verify them without extending this task into a portal-wide redesign.
- **Collection scope.** Replacing bulk downloads changes a deliberate existing action. The user approved the view-one-at-a-time replacement on 2026-10-26.
- **Verification access.** If authenticated RSP data is unavailable locally, use fixture-backed component checks and explicitly record that live authenticated behavior remains unverified. Do not expose personal documents in screenshots or test fixtures.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- Relevant Vitest tests with `npx vitest run <test paths>`, then `npx vitest run` for regression coverage.
- `npm run build`
- `powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1`
- Browser checks at 1366x768 and a 375px mobile width, using non-sensitive fixture files:
  - Open a PDF and image from each affected RSP entry point; no file downloads automatically.
  - Print only the selected document; cancel printing without losing the viewer or applicant state.
  - Download only after an explicit click, retaining the original filename and extension.
  - Open selected/all document collections without bulk downloads or multiple popup tabs; select the correct file.
  - Exercise missing attachments, expired/failed URLs, unsupported formats, blocked popups, slow loads, repeated clicks, and closing during loading.
  - Confirm no fallback displays another attachment and no new third-party preview request occurs without approval.
  - Confirm Escape, Tab/Shift+Tab, focus return, nested close, browser Back, and mobile scrolling.
  - Confirm existing viewer callers outside RSP and report/CSV exports remain unchanged.
- `DESIGN_IDENTITY.md` section 16 consistency checklist for the touched UI files.

For this documentation-only update, validate the plan contents, regenerate the index, and confirm its new link. Application checks above are for implementation; they are not evidence of completed functionality.
