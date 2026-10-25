---
title: PM dashboard submission rate merged into the department card
date: 2026-10-25
status: Done
summary: Remove the lone IPCR submission rate KPI card and show the office rate as a summary strip at the top of the submission-by-department card, with a bar segmented by deadline and a tie-break sort that surfaces offices to chase.
spec: docs/mockups/2026-10-25-pm-submission-rate-merged.html
---

## Goal

On the PM dashboard, the IPCR submission rate sits in one 336px KPI card alone on a full-width row (the other three cards were removed in 863dcf7), and it repeats what the table below it shows. At 0% its bar is empty and says nothing. One card should give the office total and then the offices behind it.

## Approach

Build to `docs/mockups/2026-10-25-pm-submission-rate-merged.html`. It supersedes two parts of `docs/mockups/2026-10-16-pm-dashboard.html`: the submission rate KPI card and the submission-by-department card. The rest of that mockup stands.

| | Decision |
|---|---|
| D1 | The `pd-kpis` section is removed. The department card is retitled **IPCR submission** and gets the clipboard-check icon. A summary strip under its header shows the rate (36px value, "X of Y submitted") beside a segmented bar and legend. |
| D2 | Bar segments, in order: **Submitted** (`completed`, brand blue), **Overdue** (red 500), **Due in 30 days** (orange 500), **Not yet due** (track tint, the remainder). Remainder = `max(0, total - completed - overdue - dueSoon)`. Status colors appear only for overdue and due-soon, each with a text label in the legend (§3.6, §10). |
| D3 | Department rows sort by rate ascending, then overdue desc, then due-in-30-days desc, then not submitted desc, then name. Today every office is 0%, so "lowest rate first" alone gives no order. |
| D4 | The strip stacks (value above bar) below 640px. The card stays where it is; the cards below no longer overlap the hero via a KPI row, so the department card takes the hero-overlap position. |

Submitted counts rated IPCRs, while overdue and due-soon come from the pending pipeline (`pending` prop). That definition gap already exists (2026-10-16 plan, Risks); the bar just puts both on one line, which is why the remainder is clamped.

## Steps

1. `summarizeSubmission` in `src/modules/admin/PmDashboardOverview.tsx`: add `notYetDue` to `SubmissionSummary` and sort `rows` per D3. Update `PmDashboardOverview.test.tsx` for both.
2. Same file: delete the `pd-kpis` section, move its content into a summary strip inside the department card, retitle the card, render the segmented bar with `role="img"` and an `aria-label` listing all four counts.
3. `src/styles/pm-dashboard.css`: add `.pd-sum` (strip grid), `.pd-seg` (segmented bar), reuse `.pd-legend`. Remove now-unused `.pd-kpis` / `.pd-kpi*` rules here and in `src/styles/dashboard-scale.css` only if nothing else uses them. Check that the card overlapping the hero keeps the same top offset the KPI row had.
4. Verify in the browser at 1366×768, tablet and mobile widths, with the department filter set to all and to one office.

## Risks

- Removing the KPI row changes the hero overlap. If the card looks detached, keep the `pd-main` negative margin and check it against §7.1.
- Overdue + due-soon can exceed not-submitted for an office if pipeline and rating data disagree. The clamp hides that in the bar; the counts in the legend stay true.
- `dashboard-scale.css` has large-screen overrides for `pd-kpi-*`; new strip classes need matching overrides or the strip looks small on `.dash-lg`.

## Revision 2026-10-25: count "Forwarded to PM" (after critique)

The critique (`.impeccable/critique/2026-10-25T14-21-06Z__src-modules-admin-pmdashboardoverview-tsx.md`, 18/36) found the card's numbers wrong. "Submitted" came from `getIPCRRecordsFromGapView`, which cannot be scoped to a period (`competencyGapAnalysis.ts:108-114`) and counts anyone with a competency rating. The hero labelled it with the `'January–June 2025'` constant. Overdue and due-soon came from a different population, so D2's bar added unrelated numbers and the legend totals did not match the rows (legend 2 overdue / 4 due vs rows 1 / 3). The user chose: **count IPCRs Forwarded to PM for the current period.**

| | Decision (replaces D2 and the definition note above) |
|---|---|
| R1 | One source for the whole card: `PMDashboard`'s existing per-employee tracker (Active employees, each on its current period and phase, stage from `ipcr_submissions`). It now also passes every employee's status, not only the pending ones, as `statuses: { dept, dueDate, forwarded }[]`. |
| R2 | Each employee lands in exactly one segment: **Submitted** (stage is "Forwarded to PM"), else **Overdue** (due date passed), **Due in 30 days**, or **Not yet due**. The four add up to the total by construction; the `max(0, …)` floor is gone. |
| R3 | Rows are active offices (`getActiveOfficeKeys`). Employees with no office, or in an inactive office, go to one **Unassigned or inactive office** row instead of vanishing, so the legend equals the sum of the rows. |
| R4 | The card waits for the tracker: while it loads, the rate shows "…" and no counts. |
| R5 | Remove false period claims: the hero sub-line and the results subtitle no longer print `REPORT_PERIOD`, because neither source is limited to that period. The card subtitle says what is counted: "Current IPCR forwarded to PM, Active employees · lowest rate first". |

Deferred, with reason:
- Critique P1 "office-name variants overwrite counts" lives in `groupByDept` / `buildDeptCompletionRows` (`SummaryOfRatings.tsx`). After R1 the submission card no longer uses them; the remaining effect is on IPCR results and Summary of Ratings, which is a separate change.
- Critique P2 items (both badges in the Status cell, "—" wording, the invisible "Not yet due" swatch) and the warning-badge contrast token (separate session).

Revised steps:
5. `PMDashboard.tsx` `loadIpcrStats`: collect `statuses` for every employee alongside `pendingList`; pass `statuses` and `ipcrLoading` to `PmDashboardOverview`.
6. `PmDashboardOverview.tsx`: replace the `pending` prop and `summarizeSubmission(rows, pending, today)` with `summarizeSubmission(statuses, activeOffices, today)` per R2 and R3; keep the D3 sort; store the active-office map from the existing load; R4 and R5.
7. Tests: one bucket per employee, totals equal row sums, inactive and blank offices go to the other row, forwarded beats overdue.

Revised risk: `PMDashboard` computes each regular employee's period from their hire anniversary ("1st Half 2026"). If `ipcr_submissions.period` uses different labels, forwarded rows will not match and everyone reads as not submitted. That is the same logic as the dashboard's existing IPCR Submissions table, so the card and that table will at least agree; verify against real data after deploy.

## Checks to run

- `npx tsc --noEmit`
- `npm test -- PmDashboardOverview`
- `npm run lint`
- Browser check at mobile, tablet and desktop widths; §16 checklist (tokens, contrast, status colors with labels).
