---
title: RSP dashboard Applicants card links; Applicants pages use the Job Posts tab header
date: 2026-10-23
status: Done
summary: The dashboard's Applicants card goes to the right places. All applicants opens Applications (not the Interviewer portal), every stat tile and funnel row opens the list behind it, and Per vacancy counts only vacancies still open by deadline. The Applicants pages' separate bold tab bar becomes the Job Posts header, with title, subtitle and §9.2 underline tabs in one white block.
spec: docs/mockups/2026-10-15-rsp-dashboard-kpis.html (stat tiles are clickable there); Job Posts header in JobPostingsPage.tsx
---

## Goal

Every number on the Applicants card is a way into the list it counts, and the Applicants pages' navigation looks like Job Posts'.

## Findings

- **"All applicants ›" goes to `/interviewer/dashboard`**, the Interviewer portal (`RSPDashboard.tsx`, `onOpenApplicants`).
- **Tiles and funnel rows are inert.** The saved mockup gives them `cursor: pointer`, but they were built as plain `div`s.
- **Per vacancy counts expired vacancies.** It divides by postings whose status is Open, so a vacancy past its deadline that the 5-minute auto-close hasn't swept yet still counts. The Job postings card next to it does the same. The Job Vacancies tab already uses the deadline-aware rule (`isOpenVacancy`).
- **Possible cause of "Hired 0"** (not changed here, see Open question): the dashboard replaces each applicant's database status with the status cached in this browser's localStorage whenever one exists (`RSPDashboard.tsx`, `resolvedStatus`). A stale cache can therefore show Qualified for someone the database records as Hired. I can't query the live data to confirm, because the local key is disabled.

## Decisions

| # | Decision |
|---|---|
| D1 | **All applicants ›** opens `/admin/rsp/applications`. |
| D2 | Tiles and funnel rows become buttons (keyboard-focusable, same look, hover per §9.7: `--color-primary-200` border). **This quarter / Received / Unscreened / Shortlisted** → Applications. **Qualified** tile and row → Qualified Applicants. **Per vacancy** → Job Posts (Job Vacancies). **Hired** → Newly Hired. Destinations open unfiltered: none of those pages has a period or "unscreened" filter, and adding one is out of scope. |
| D3 | The dashboard treats a posting as Open only when `isOpenVacancy` says so (status and Manila deadline). This fixes Per vacancy, and also the Job postings card's open count and closing-soon count, which read the same list. |
| D4 | **Applicants header**: `ApplicantsTabBar` becomes the whole page header, copying Job Posts' white block: title, subtitle, then a `role="tablist"` row of §9.2 underline tabs (14px Medium, icon + label, `aria-selected`). Icons (§6 where it has one): Applications `file-text`, Qualified Applicants `user-check`, Applicant Score `clipboard-check`, For Hiring `briefcase`, Generate Employee Credentials `key-round`. No count chips, because these pages don't share applicant counts. It is no longer sticky, matching Job Posts. |
| D5 | The four routed Applicants pages pass their title and subtitle to it instead of rendering their own header. The filtered Applications header (back link, Clear filter) is kept, through optional `breadcrumb` and `actions` slots. The unrouted `ApplicantRankingPage` keeps the tabs-only form. |

## Steps

1. `RSPDashboard.tsx`: D1, and the deadline-aware Open status passed to the overview (D3).
2. `RspDashboardOverview.tsx`: tiles and funnel rows as buttons with targets (D2); new `onOpenQualifiedList`, `onOpenHired` props as needed.
3. `ApplicantsTabBar.tsx` header (D4); `ApplicationsListPage`, `QualifiedApplicantsRSPPage`, `ForHiringPage`, `GenerateCredentialsPage` use it (D5).
4. Tests: overview tile and row targets, All applicants target, Per vacancy ignoring an expired vacancy; Applicants header renders title, subtitle, five tabs in order with the active one `aria-selected`. Update tests that look for the old header text.
5. `npx tsc --noEmit`, `npm test`, `npm run build`.
6. Commit, rebase on `origin/main`, push to `main`, confirm the Vercel status and the live bundle on cic-trix.vercel.app.

## Open question

Should the dashboard trust the database status over the browser's cached one? It changes every RSP section that reads `applicants`, so it isn't in this plan unless you say so.

## Risks

- No signed-in browser check (disabled legacy key in `.env`).
- `RSPDashboard.tsx` is shared with other sessions; rebase right before pushing.

## Checks to run

- `npx tsc --noEmit`, `npm test`, `npm run build`. DESIGN_IDENTITY §16 on the card and the header.
