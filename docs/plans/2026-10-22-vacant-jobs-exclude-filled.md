---
title: Leave filled plantillas out of Currently Vacant Jobs and Job Vacancies
date: 2026-10-22
status: Done
summary: A plantilla whose slot status is 'filled' is not a vacancy. Drop it from the public Currently Vacant Jobs table and the admin Job Vacancies tab, and list filled plantillas in a new Filled Positions tab. Frontend only; no schema change.
---

## Goal

A plantilla with `plantilla_slots.status = 'filled'` never shows as a vacancy. The public table and the admin Job Vacancies tab list only non-filled plantillas, and every count, total and page number comes from that filtered list. Filled plantillas stay visible to RSP in a Filled Positions tab, so no record is lost.

## Decisions

| # | Decision |
|---|---|
| D1 | `plantilla_slots.status` is the single source of truth: `'filled'` is filled, `'open'` and `'closed'` are not. The status is set by placing a hire (`assignApplicantToSlot`, `src/lib/plantillaSlots.ts:369`). No schema change. |
| D2 | One shared helper defines the rule, so both pages read it the same way. The public page and the admin share one cached fetch (`loadJobPostings`), and the admin needs filled rows, so the filter lives in the helper rather than in a separate Supabase query. The database already rejects applications to a filled plantilla (migration 20261021200100). |
| D3 | Supersedes D10 of `2026-10-21-hire-reservation-and-credentials.md` (a filled row stays listed, struck through, with a disabled Filled button). The landing table drops filled rows instead. |
| D4 | Supersedes D1 of `2026-10-21-vacancies-plantilla-numbers.md` in the admin Job Vacancies plantilla list: filled numbers are left out instead of greyed and struck. |
| D5 | The admin Job Vacancies tab keeps one row per posting and keeps the existing name "Job Vacancies". A posting appears only while it has at least one non-filled plantilla. Closed postings still appear, as today (closing-date handling is unchanged). |
| D6 | New third tab, **Filled Positions**: one row per filled plantilla (position title, office, plantilla number, monthly salary, filled date). Read-only, no row actions. It uses the existing tab and table pattern (§9.2, §9.4–9.6). The saved mockup `docs/mockups/2026-10-19-job-post-split.html` shows two tabs, so this adds a tab it does not cover. |
| D7 | No manual Filled/Vacant toggle. A slot still becomes filled only through a hire. When it does, the cache refresh (`cictrix:job-postings-updated`) moves it between lists without a page reload. |
| D8 | The position-occupancy plan (`2026-10-21-position-occupancy.md`, filled derived from current employees) is deferred. |

## Approach

The helper takes a posting and returns its non-filled plantillas. The landing row builder, the Job Vacancies panel and its tab badge all call it. The Filled Positions tab uses the complement: filled slots across all postings that aren't deleted.

## Steps

0. **Gate: read-only check.** Run `scripts/audit-filled-slots-vs-employees.sql`, which compares current employees' `plantilla_num` with filled slots. If it returns no rows, continue. If it returns any rows, stop and report them.
1. `src/lib/vacancySearch.ts`: add `vacantPlantillaSlots(job)` (slots whose status isn't `'filled'`) and `hasVacantPlantilla(job)`. Make `isOpenedVacancy` also require `hasVacantPlantilla`. Unit tests in `vacancySearch.test.ts`.
2. `src/components/LandingPage.tsx`: build rows from slots with status `'open'` only (closed slots are already left out). Remove the struck-through plantilla, the disabled "Filled" button state and the `plantilla.open` flag. Change the empty state to "No vacant positions at the moment." Make the page-clamp effect from `JobVacanciesPanel` also apply here, so a live refresh that removes rows never leaves the user on an empty page. Search, sort, entries and the counter already derive from the filtered list and reset to page 1.
3. `src/components/JobVacanciesPanel.tsx`: list only non-filled plantilla numbers per row, and add **Plantilla** and **Monthly Salary** columns (`vacancySalaryLabel` with `useSalarySchedule`, as the landing page uses). The tab badge in `JobPostingsPage.tsx` keeps using `isOpenedVacancy`, so the badge and the list agree.
4. `src/components/FilledPositionsPanel.tsx` (new file) plus a third tab in `JobPostingsPage.tsx` (`?tab=filled`, badge = number of filled plantillas). Toolbar search (title, office, plantilla), table, and pagination at the same page size as Job Vacancies. Empty state: "No filled positions yet."
5. Tests: update `LandingPage.vacancies.test.tsx`, where two tests currently assert the Filled row, so it checks that filled rows are absent and the total counts only vacant rows. Extend `JobVacanciesPanel.test.tsx` to check that a fully filled posting is absent, and add a test for the Filled Positions panel.

## Risks

- **Slot status lags reality.** Incumbents placed outside the hire flow have open slots, so their positions still list as vacant. The step 0 check measures this. The deferred occupancy plan is the fix.
- **Fully filled posting left `Active`.** It disappears from Job Vacancies but stays `Active` in Job Positions. That matches today's behaviour and is out of scope.
- **Out-of-mockup tab.** Filled Positions isn't in the saved mockup. If its layout needs a decision, preview it first.

## Checks to run

- `npx tsc --noEmit`, `npm run lint`, `npm test`.
- Browser (dev server): the public total excludes filled rows; search, sort (including Department) and Show entries work; mobile width doesn't scroll the page sideways; the console is clean. Admin: the Job Vacancies badge equals its row count, and the Filled Positions tab lists the filled plantillas.
- DESIGN_IDENTITY §16 checklist on the touched UI.
