---
title: Job Vacancies table and left-aligned RSP action buttons
date: 2026-10-22
status: Done
summary: Fit the Job Vacancies table in its card, split Office/Department, compact row actions, and left-align the primary actions on Job Vacancies, For Hiring and Generate Employee Credentials.
---

## Goal

The Job Vacancies table clips its Actions column and wraps cells to many lines. Primary actions on three RSP screens sit at the far right, unlike "Create Job Position" on Job Positions.

## Approach

UI-only changes in three components, using existing `.btn`/`.badge` classes and tokens. No data, routing or business-logic changes.

Decisions (taken with the recommended defaults):
- Applicants count stays right-aligned (§9.5 numbers right); the count is removed from the button label so it shows once.
- Job Vacancies search/select start at the left (departs from §9.4 right-aligned toolbar, per request).
- Disabled button token unchanged (changing a token needs a separate decision).
- `.btn-sm` height (32px in tokens vs 36px in §9.1) unchanged.

## Steps

1. `JobVacanciesPanel.tsx`: fixed table layout with column widths; sticky Actions column; Office on line one, division muted on line two; title clamped to 2 lines with hover text; dates same color, no wrap; header labels no wrap; "Applicants" button without count.
2. `JobVacanciesPanel.tsx` toolbar: "Open Vacant Job Position" on its own left row above the filters; search flex-1, select min width, no `ml-auto`.
3. `ForHiringPage.tsx`: "Select for Hiring" under the description, left-aligned.
4. `GenerateCredentialsPage.tsx`: selection bar order "N selected · Generate · Clear", left-aligned; "Select all" left of the search.
5. Update `JobVacanciesPanel.test.tsx` for the new button label.

## Risks

- Sticky Actions column needs an opaque background on hover rows.
- Tests that assert button text may need updating.

## Checks to run

- `npx tsc --noEmit`, `npm run lint`, `npm test`.
- Visual check at 1440, 1280, 1024, 768.
