---
title: PM dashboard cleanup
date: 2026-10-26
status: Approved
summary: Remove the Competency & Succession Watchlist and the IPCR Submissions panel from the PM dashboard, after confirming the submissions data exists elsewhere.
---

## Goal

The PM dashboard drops two redundant sections without leaving gaps.

## Approach

- Safeguard: confirm pending and recent IPCR submissions are available in `PMIPCRManagement` or Summary of Ratings. If not, stop and report before deleting.
- Remove the two sections plus state, API calls, styles and imports used only by them. Keep `pendingSubmissions` (used by `PmDashboardOverview`). Delete `src/lib/api/competencies.ts` or the retirement query only if nothing else uses them.
- The bottom 50/50 grid goes; the Action Required Queue becomes the last section.

## Steps

1. Verify the safeguard.
2. Remove the sections and dead code; check usages first.
3. Remove references in nav, tests and docs.

## Risks

- Shared state feeding both removed and kept sections.

## Checks to run

`npx tsc --noEmit`, `npm run lint`, `npm test`.
