---
title: Succession Planning sub-tabs in the Job Posts style; Applications title follows the vacancy filter (summary)
date: 2026-10-23
plan: docs/plans/2026-10-23-succession-tabs-and-applications-title.md
---

## What shipped

- **Succession Planning** (`RSPDashboard.tsx`): the Succession Plan / Eligibility Points pills are now the §9.2 underline tabs Job Posts uses, with `git-branch` and `list-checks` icons, sitting on the bottom edge of the white page header (`role="tablist"`, `aria-selected`). Eligibility Points is `?view=eligibility-points`, so refresh and Back keep it.
- **Applications page** (`ApplicationsListPage.tsx`): with `?positionId=`, the H1 is "Applicants for [Position]" and the subtitle is office · plantilla numbers · deadline (or Closed). "‹ Back to Job Vacancies" sits above the title and Clear filter at the header's right. The separate blue banner is gone. Unfiltered, the header is unchanged.

## Deviations from the plan

None. The office label uses the app's existing `formatOfficeLabel`, so it reads "… Department", as in the Job Vacancies table.

## Checks run

- `npx tsc --noEmit`: clean. `npm test`: 48 files, 424 tests pass (new: Succession tab order, default, URL persistence and deep link; Applications filtered title and subtitle, unfiltered title after Clear filter). `npm run build`: passes.
- Not run: lint (no ESLint config); signed-in browser check (disabled legacy key in `.env`).
