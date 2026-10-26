---
title: Load RSP dashboard data per section - session summary
date: 2026-10-26
status: Done
summary: Succession routes now make no parent recruitment, employee, newly-hired or exam-total reads, while Dashboard, Accounts and Reports keep their existing data.
---

# Load RSP dashboard data per section

Plan: [2026-10-26-rsp-route-loading.md](../plans/2026-10-26-rsp-route-loading.md)

## What shipped

`RSPDashboard` now resolves the active section before configuring its data
hooks and only runs the loaders and subscriptions that section renders:

| Section | Recruitment bundle | Newly hired | Employee records | Exam totals | Department names | Plantilla names | Realtime |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard | yes | no | no | no | no | no | yes |
| Accounts | yes | yes | yes | no | yes | no | yes |
| Reports | yes | yes | no | yes | no | no | yes |
| Raters | yes | no | no | no | no | no | yes |
| Succession (both views) | no | no | no | no | no | no | no |

The shared bundle no longer reads `job_postings` or `jobs`; both results were
always discarded, and canonical postings already load through
`getJobPostingsFromSupabase`. Single-flight keys are now
`rsp-dashboard:recruitment:primary` / `:secondary`.

Late responses are ignored after unmount, so a previous route cannot overwrite
state or the global evaluation map. Storage events now reload through the
existing in-flight serializer.

## Deviations

The plan was written to `docs/plans/` after the code change rather than before
it; the user approved the scope in conversation first. No code outside the
approved scope changed.

Accounts still fetches evaluations even though its directory does not display
scores. Removing that read would change applicant score normalization, so it
was left for a separate decision. Sidebar's own applicants read, startup
postings loading, and the `/admin/rsp/succession/*` section-resolution quirk
were intentionally left untouched.

## Verification

- New `RSPDashboard.dataLoading.test.tsx`: seven route-budget tests covering
  both succession views, Dashboard, Accounts, Reports, Rater Management and an
  unmounted late response.
- Read-only live harness against the real Supabase project (real
  `RSPDashboard`, real router, four-second window, GET-only fetch guard).
  REST request counts before → after: Succession Plan 15 → 2, Eligibility
  Points 13 → 1, Dashboard 32 → 25, Accounts 18 → 15, Reports 15 → 10.
  Succession's remaining reads are its own view data
  (`critical_positions`/`departments` or `eligibility_types`). Sidebar's
  `/api/applicants/` request still fires once per route and is excluded from
  these counts.
- `npx tsc --noEmit`: pass.
- `npm run lint`: pass, zero warnings.
- `npm test`: 630 tests across 73 files pass. Existing fixture/act warnings
  remain.
- `npm run build:verify`: pass. Existing Vite CJS/Browserslist notices remain.
- The harness mounts the component directly rather than completing the
  authenticated admin route, so it measures the shell's data budget, not login
  or route-guard work.
