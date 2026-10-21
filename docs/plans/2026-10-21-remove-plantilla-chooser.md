---
title: Remove the plantilla chooser from Job Details
date: 2026-10-21
status: Done
summary: Each vacancy row is one plantilla, so Job Details names that plantilla instead of asking the applicant to choose from a list.
spec: follows docs/plans/2026-10-21-vacant-jobs-plantilla-rows.md (one row per plantilla)
---

## Goal

Applying from a vacancy row goes straight to that row's plantilla. No "Choose your plantilla items" step.

## Approach

| # | Decision |
|---|---|
| D1 | The landing row passes `plantillaSlotId` through Apply; Job Details targets that plantilla, else the posting's first open one (Job Portal and direct links). |
| D2 | No card: the submission instruction (info alert) and Continue to Application. The hero names the plantilla. A filled or already-applied plantilla shows "This plantilla is no longer open" and Back to Vacancies. |
| D3 | The hero line, salary, position summary and responsibilities show only that plantilla. The RSP admin view is unchanged. |

## Steps

1. `JobDetailsPage.tsx`, `LandingPage.tsx`.
2. `JobDetailsPage.plantillas.test.tsx`.
3. `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
