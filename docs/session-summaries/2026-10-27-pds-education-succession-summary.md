# PDS education into succession readiness: session summary

Plan: [2026-10-27-pds-education-succession](../plans/2026-10-27-pds-education-succession.md)

## What shipped vs. planned

All five code steps shipped; step 5 (manual pass on dev/staging) is not done and needs a human at a browser.

- New helper `src/lib/api/educationAttainment.ts`: `EducationRow`, `EDUCATION_LEVEL_RANK`, `highestEducation`, `educationLevelLabel`, `educationLabel`, `educationSearchTexts`. 13 tests in `educationAttainment.test.ts`.
- `AutoSuccessorContext` gained `educationByEmployee`. `loadAutoSuccessorContext` reads `employee_education` (`employee_id, level, course, year_graduated`) in the same `Promise.all` as eligibility, IPCR and training, groups by employee, and on a read error logs `[succession] education read failed:` and leaves the map empty so the evaluator falls back to the legacy column.
- `evaluateAutoSuccessors` gates on every row's field (`educationTextsMatch` replaced the single-string `educationFieldMatches`), ranks on the highest row's label (`educationFor`), and scores manual candidates from the same derived label.
- Tests: 4 new evaluator cases in `successionAutoSuccessors.test.ts` (unrelated master's on top of a matching bachelor's still qualifies; graduate row with a blank legacy column is read; PDS rows beat a mismatched legacy column; a PDS row with no course falls back to the legacy column) and 2 loader cases in `successionDashboardOverview.test.ts` (real PDS rows flow through `getSuccessionDashboardOverview`; read failure falls back and logs).

## Deviations

- **One extra test and one extra rule.** The plan specified appending the legacy column only "when rows exist but carry no course". Building that revealed a second gap: `educationFor` returned the highest row's level label ("College Graduate"), which shadowed a legacy column that did name the field. Both now key off `namesCourse(rows)` — a row with a level but no course cannot name a field of study, so the legacy text wins when the PDS has none. Test added first, watched fail, then the rule.
- **`educationLevelLabel` is its own export.** The plan described the level fallback as part of `educationLabel`; splitting it lets the gate reuse the same wording without inventing a degree for a course-less Graduate Studies row. A graduate row with no course labels "Graduate Studies", not "Master's" — level alone cannot tell a master's from a doctorate.
- **Higher-than-planned read cost only on failure.** No change from the plan, noted because it is the degrade path: a failed read is indistinguishable from "no PDS rows", so the symptom would look like this ticket's original bug. Called out in the plan's risks.

## Read-only production check (before merge)

- 0 employees have more than one education row, so ranking by "highest row" matches the single row that exists today.
- All 12 Graduate Studies / Doctorate rows have a `course` equal to `employees.highest_educational_attainment`.
- 111 employees have no education rows; 78 of them have a non-blank legacy column and therefore ride the fallback.

Together these mean current gates, labels and scores are unchanged on live data, and the PDS edit path is the only behaviour that moves.

## Checks run

- `npx tsc --noEmit` — clean.
- `npm run lint` — clean, zero warnings.
- Targeted: `educationAttainment.test.ts` 13/13, `successionAutoSuccessors.test.ts` 9/9, `successionDashboardOverview.test.ts` 11/11.
- `npm test` — 435 files, 3544 tests, all passing (baseline before this branch: 434 / 3525). File count includes duplicate suites under `.worktrees/` and `.claude/worktrees/`; that noise is pre-existing.

## Known limits, untouched here

- Unfinished graduate units ("Masteral Units", "JURIS DOCTOR (54 UNITS)") still earn degree points through `educationRank`.
- Clearing every PDS education row falls back to the legacy column, because "never filled" and "cleared" are indistinguishable.
- `criticalPositionGapAnalysis.ts` still reads `employees.highest_educational_attainment`; the gap-analysis page keeps showing pre-PDS education.
- `employee_education` has RLS disabled with full `anon`/`authenticated` grants. Needs its own security ticket.
