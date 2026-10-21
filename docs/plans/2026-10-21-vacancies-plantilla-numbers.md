---
title: Plantilla numbers in the landing Job Vacancies table
date: 2026-10-21
status: Done
summary: The landing page vacancies table shows each posting's plantilla numbers instead of "N open slots", filled ones struck through, and sorts by department by default.
spec: docs/mockups/2026-10-21-vacancies-plantilla-numbers.html (option A, chosen 2026-10-21; grouping rejected because the filters already cover it)
---

## Goal

Applicants see which plantilla numbers a vacancy covers without opening it.

## Approach

| # | Decision |
|---|---|
| D1 | Plantilla column lists numbers ("113 · 114 · 115"); open numbers are emphasised, filled ones struck through, closed ones omitted. |
| D2 | Default sort becomes Department (then title). The other sort options and filters are unchanged. |
| D3 | "Open" counts only open plantillas, so a posting whose plantillas are all filled drops off the list (previously filled counted as open). |

## Steps

1. `LandingPage.tsx` row mapping, cell and default sort.
2. `LandingPage.vacancies.test.tsx`.
3. `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
