---
title: RSP dashboard Applicants card links; Applicants pages use the Job Posts tab header (summary)
date: 2026-10-23
plan: docs/plans/2026-10-23-applicant-kpi-links-and-applicants-tabs.md
---

## What shipped

- **All applicants ›** opens Applications (`/admin/rsp/applications`) instead of the Interviewer portal.
- **Tiles and funnel rows are buttons** with §9.7 hover and a focus ring: This quarter, Unscreened, Received and Shortlisted open Applications. The Qualified tile and row open Qualified Applicants, Per vacancy opens Job Posts (Job Vacancies), and Hired opens Newly Hired.
- **Open postings are deadline-aware on the dashboard** (`dashboardPostingStatus` in `vacancySearch.ts`), so Per vacancy, the open count and the closing-soon count agree with the Job Vacancies tab.
- **Applicants header**: `ApplicantsTabBar` is now the page header: title, subtitle and underline tabs with icons in one white block, as in Job Posts. It is no longer sticky. Applications, Qualified Applicants / Applicant Score, For Hiring and Generate Employee Credentials use it. The filtered Applications header keeps its back link and Clear filter through `breadcrumb` and `actions`.

## Deviations from the plan

- D4 said `role="tablist"`. These tabs navigate between routes, so they are links with `aria-current="page"` in a labelled `nav`, which is the correct pattern for route navigation. They look the same as Job Posts' tabs.

## Checks run

- `npx tsc --noEmit`: clean. `npm test`: 49 files, 429 tests pass (new: each tile and funnel row's target, dashboard posting status for expired vacancies, Applicants header title/subtitle/tab order/current page/slots). `npm run build`: passes.
- Not run: lint (no ESLint config); signed-in browser check (disabled legacy key in `.env`).
- Open question left as is: the dashboard still prefers the browser's cached applicant status over the database's.
