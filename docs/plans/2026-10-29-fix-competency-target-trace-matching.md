---
title: fix(trace): normalize competency matching and semester resolution in drill-down trace
date: 2026-10-29
status: Done
summary: Resolve "No IPCR target is currently mapped to this competency" by normalizing competency name strings and supporting varied rating_period formats in getCompetencyTargetTrace.
---

## Goal

When an evaluator or supervisor clicks any competency card in the Competency Gap / Assessment panel, the expanded drill-down drawer reliably retrieves and displays the mapped IPCR targets, their individual Q/E/T ratings, and AI justification, eliminating spurious "No IPCR target is currently mapped" warnings caused by slash-spacing differences or cycle ID vs. semester text format mismatches.

## Approach

In `src/lib/api/competencyTargetTrace.ts`:
1. Use `normComp()` (stripping non-alphanumeric characters, lowercase) across all competency lookups (`ipcr_competency_matches`, `employee_competencies`, and `competency_standards`) so that `"Fiscal Management / Budgeting for LGU"` matches `"Fiscal Management/Budgeting for LGU"`.
2. Relax the strict database query filter on `rating_period = str(cycleId)`:
   - Query all `ipcr_competency_matches` for the employee.
   - Filter by competency using `normComp()`.
   - Match `rating_period` flexibly: accept matches where `rating_period` is `null`, matches the cycle ID string (`'6'`), matches the performance cycle title (e.g. `'January–June 2026'`), or matches standard abbreviations (e.g. `'Jan - Jun 2026'`). If period-scoped matches are absent, fall back to general/unscoped matches for that competency.
3. Add a dedicated unit test suite in `src/lib/api/competencyTargetTrace.test.ts` covering:
   - Competency name matching with varied spacing and punctuation around slashes.
   - Semester text resolution (`'Jan - Jun 2026'`, `'6'`, `null`).
   - Mapped targets aggregation and fallback behavior.

## Steps

1. **Plan & Review**: Save this plan and update `implementation_plan.md`.
2. **Test Implementation**: Create unit tests in `src/lib/api/competencyTargetTrace.test.ts` demonstrating the failure modes (unmatched slash whitespace and semester string mismatch).
3. **Core Fix**: Update `src/lib/api/competencyTargetTrace.ts` with `normComp()` and flexible cycle/period resolution.
4. **Verification**: Run `npm test`, `npx tsc --noEmit`, and `npm run lint`.
5. **Session Summary**: Record completion summary in `docs/session-summaries/` and rebuild plan index.

## Risks

- **Over-matching across cycles**: If an employee has targets in multiple semesters for the same competency, an overly broad fallback could return targets from a different semester. We mitigate this by prioritizing exact cycle matches (cycle title, abbreviations, cycle ID) before considering `null` or unassigned rows.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test src/lib/api/competencyTargetTrace.test.ts`
- `npx vitest run src/modules/admin/pm/CompetencyGapPanel.test.ts`
