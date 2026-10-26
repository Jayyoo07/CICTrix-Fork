---
title: PM dashboard cleanup
date: 2026-10-26
status: Done
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

## Outcome (2026-10-26)

The safeguard stopped half of the removal. The panel's Pending tab is covered by IPCR Management (same `ipcr_submissions` and probationary schedule sources, with stage, type, period and status per employee). Its Recent tab is not: it lists `performance_evaluations` (272 live rows, Approved with final scores), which Summary of Ratings does not read and which no other screen in the PM navigation shows. Decision: keep the IPCR Submissions panel, remove only the Watchlist, and make the panel full width.
