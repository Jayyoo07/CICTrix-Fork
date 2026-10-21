---
title: One row per plantilla in the landing vacancies table
date: 2026-10-21
status: Done
summary: The landing page "Currently Vacant Jobs" table lists every plantilla number in its own row, even when postings share a position title.
spec: docs/mockups/2026-10-21-vacant-jobs-plantilla-rows.html (option A, fully flat, chosen 2026-10-21; supersedes D1 of 2026-10-21-vacancies-plantilla-numbers)
---

## Goal

Each plantilla number is its own line in the public vacancies table, so applicants see every item separately.

## Approach

| # | Decision |
|---|---|
| D1 | One table row per non-closed plantilla. Title, office, salary, and closing date repeat on every row. |
| D2 | Filled plantillas keep a row, number struck, with a disabled "Filled" button instead of Apply. |
| D3 | Apply is unchanged: it opens the posting's details page, where the applicant picks plantillas. |
| D4 | Pagination, search, and the "of N jobs" count now run over plantilla rows. |

## Steps

1. `LandingPage.tsx` row mapping (flatMap per plantilla), cell, and Apply button.
2. `LandingPage.vacancies.test.tsx`.
3. `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
