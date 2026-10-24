---
title: Job Posts — Vacancies tab first, trimmed row actions, Applicants opens the filtered Application tab (summary)
date: 2026-10-22
plan: docs/plans/2026-10-22-job-posts-tabs-and-applicants-link.md
---

## What shipped

- **Tabs**: Job Vacancies first and default (`/admin/rsp/jobs`); Job Positions at `?tab=positions`. Refresh and Back keep the tab; an old `?tab=vacancies` still opens Job Vacancies. Each tab keeps its own button and count badge.
- **Job Positions**: rows show only Details and delete (delete still blocked while the vacancy is open). The Applicants buttons on position rows and on expanded plantilla rows are gone, and so is the in-page applicants view they opened. The Actions column is right-aligned at a fixed width.
- **Job Vacancies**: rows show only **Applicants (N)** and Close Vacancy. Applicants opens `/admin/rsp/applications?positionId=<id>`.
- **Applications tab**: reads `positionId`. Shows "Applicants for [title]", **Clear filter**, **‹ Back to Job Vacancies**, and "No applicants yet for this vacancy." when empty. The filter matches through the position's plantillas, so multi-plantilla positions work. Opening an applicant and going back returns to the filtered list.
- **`src/lib/applicationsByPosition.ts`**: one membership rule shared by the filter and the Applicants (N) count, so the number matches the list.
- The Details page's Edit Posting now lands on `?tab=positions`.

## Deviations from the plan

None.

## Checks run

- `npx tsc --noEmit`: clean. `npm test`: 47 files, 421 tests pass (new: tab order/default, URL persistence, Job Positions row actions, Applicants navigation with the param, Applications filter across two plantillas, Clear filter, back link, empty state). `npm run build`: passes. `npm run check:migrations`: OK.
- `npm run lint`: could not run; the repo has no ESLint config.
- Browser check: not done. The local `.env` anon key is a disabled legacy key, so the dev server can't sign in.
