---
title: Load RSP dashboard data per section
date: 2026-10-26
status: Done
summary: Stop the RSP shell from loading recruitment, employee and exam data on Succession, and remove the queries whose results were always discarded.
---

## Goal

Opening either Succession view no longer triggers the RSP shell's recruitment
snapshot, employee-directory, newly-hired, exam-total, department or plantilla
reads, and no longer subscribes to their realtime changes. Dashboard, Accounts
and Reports keep the data they render, and their visible behaviour is
unchanged. This is item 2 of the performance follow-ups; items 3–5 are not
included.

## Approach

`RSPDashboard` derives `section` from the route before configuring its hooks.
Three booleans (`loadsRecruitmentData`, `loadsNewlyHired`, `loadsAccountData`)
decide whether each parent loader and subscription runs. Succession resolves
all three to false; Dashboard, Accounts, Reports and Rater Management each
enable only what their rendered branch consumes. Rater Management is the same
shell reached through `RaterManagementPage`.

The shared recruitment bundle drops the `job_postings` and `jobs` reads whose
results were discarded (canonical postings already come from
`getJobPostingsFromSupabase`). Its single-flight keys are renamed to
`rsp-dashboard:recruitment:*` so the smaller shape cannot collide with a cached
five-result bundle. Applicant/evaluation normalization and the fallback
selection are unchanged.

Async safety: each load checks `disposed` after its awaits so an unmounted
route cannot publish state or the global `__evaluationsByApplicantId` map, and
storage changes go through `syncJobs()` instead of calling `load()` outside the
serializer. `useDepartmentOptions`/`useDepartmentNames` and
`usePlantillaNames` gain an opt-in `enabled` flag (default true, so other
callers are unaffected).

Deliberately unchanged: Sidebar's own applicants read, startup postings
loading and synchronization in `main.tsx`, the global postings cache design,
scoring, polling, persistence, auth, and the pre-existing mismatch where
`/admin/rsp/succession/*` resolves to the dashboard section.

## Steps

1. Save this plan before editing. (Saved after implementation; recorded in the
   session summary.)
2. Gate the parent loaders and realtime subscriptions by section.
3. Remove the discarded bundle reads and rename the cache keys.
4. Guard late async responses and serialize storage-triggered reloads.
5. Add route-budget regression tests for both succession views, Dashboard,
   Accounts, Reports, and a late response after unmount.
6. Run type-check, lint, the full Vitest suite and `build:verify`.

## Risks

- Hiding a loader on a section that silently consumes it would blank a visible
  table. The route budget test asserts both the positive and negative cases.
- `getAuthoritativeJobPostings` is an in-memory cache filled asynchronously at
  startup, so postings fallback behaviour is timing-sensitive. The loader and
  fallback code itself is untouched.
- Gating subscriptions means a section left mounted only through a query-string
  change would stop receiving updates. Sections that need the data never
  change section via query string, and pathname changes remount the shell.
- Accounts still reads evaluations even though its directory does not print
  scores, preserving applicant normalization exactly; that read is left for a
  later pass rather than changed here.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run build:verify`
- Route-budget tests for `/admin/rsp/succession`,
  `/admin/rsp/succession?view=eligibility-points`, `/admin?module=rsp`,
  `/admin/rsp/accounts`, `/admin/rsp/reports`, plus the late-response case.

## Results

- Read-only live component harness against the real Supabase project, five
  routes rendered for four seconds each, REST GET counts before → after:
  Succession Plan 15 → 2, Eligibility Points 13 → 1, Dashboard 32 → 25,
  Accounts 18 → 15, Reports 15 → 10.
- On Succession the removed reads were `job_postings` (3), `jobs` (1),
  `plantilla_slots` (2), `applicants`, `raters`, `evaluations`, `newly_hired`,
  `employees_with_department` and `employees`. What remains is the view's own
  `critical_positions`/`departments` (Plan) or `eligibility_types` (Points).
- Rater Management is reached through `RaterManagementPage`, which renders the
  same shell, so it keeps the recruitment snapshot: 5 REST GETs
  (`applicants`, `raters`, `evaluations`, `job_postings`, `plantilla_slots`).
  No before figure was recorded for this route.
- Sidebar's own `/api/applicants/` request still fires once on every route and
  is excluded from those REST counts. It is outside this item's scope.
- Both succession views make zero parent recruitment/employee/newly-hired/
  exam-total/office-directory requests and register no enabled realtime
  subscription.
- Dashboard, Accounts and Reports load their own dependencies only; the
  discarded `job_postings`/`jobs` bundle reads are gone. Rater Management
  (`/admin/rsp/raters`, which renders the same shell) keeps the recruitment
  snapshot so its rater table and assigned-position options still populate.
- `npx tsc --noEmit`, `npm run lint`, `npm test` (630 tests / 73 files) and
  `npm run build:verify` pass. Existing fixture/act and Vite/Browserslist
  warnings remain.
- Details: [session summary](../session-summaries/2026-10-26-rsp-route-loading-summary.md).
