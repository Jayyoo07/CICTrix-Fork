---
title: Succession Planning sub-tabs in the Job Posts style; Applications title follows the vacancy filter
date: 2026-10-23
status: Done
summary: Succession Planning's Succession Plan / Eligibility Points pills become the §9.2 underline tabs Job Posts uses, sitting at the bottom of the white page header and kept in the URL. When the Applications tab is opened from a vacancy, its page title becomes "Applicants for [Position]" with the vacancy's details, replacing the separate banner.
---

## Goal

The same level of navigation looks the same on every RSP page, and the Applications page says in its own title which vacancy it is showing.

## Decisions

| # | Decision |
|---|---|
| D1 | **Succession tabs** copy Job Posts' header (`JobPostingsPage.tsx`): white header block with title and subtitle, then a `role="tablist"` row on its bottom edge. Each tab has an underline, a Lucide icon (§6: `git-branch` for Succession Plan, `list-checks` for Eligibility Points), the label, and `aria-selected`. No count chip, since neither view has a natural count. |
| D2 | This supersedes the pill tabs in `docs/mockups/2026-10-07-succession-table.html`, at your request. The mockup's table design is unchanged. |
| D3 | The Succession view lives in the URL like Job Posts' tab: Succession Plan is the default (no param), and Eligibility Points is `?view=eligibility-points`, so refresh and Back keep it. |
| D4 | **Applications title.** With `?positionId=` the H1 becomes "Applicants for [Position Title]", and the subtitle becomes the vacancy's office · plantilla numbers · application deadline (or "Closed"). "‹ Back to Job Vacancies" sits above the title as a breadcrumb, and **Clear filter** sits at the right of the header. The separate blue banner is removed. Unfiltered, the header is unchanged. |
| D5 | Out of scope: the Applicants top tab bar (Applications / Qualified / …) and other RSP sections' headers. |

## Steps

1. `RSPDashboard.tsx`: Succession header with the tab row; view from `?view=`.
2. `ApplicationsListPage.tsx`: filtered title, subtitle, breadcrumb and Clear filter in the header; banner removed.
3. Tests: Succession tab order, URL persistence and `aria-selected`; Applications filtered title, subtitle, Clear filter and back link (update the existing test).
4. `npx tsc --noEmit`, `npm test`, `npm run build`.
5. Commit, rebase on `origin/main`, push to `main`, confirm the Vercel status and the live bundle on cic-trix.vercel.app.

## Risks

- `RSPDashboard.tsx` is ~5,000 lines and other sessions are editing RSP pages today; I'll rebase right before pushing and re-run checks.
- No signed-in browser check is possible (disabled legacy key in `.env`).

## Checks to run

- `npx tsc --noEmit`, `npm test`, `npm run build`.
- DESIGN_IDENTITY §16 on the two headers.
