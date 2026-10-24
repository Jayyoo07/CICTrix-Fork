---
title: Score eligibility above the position's minimum
date: 2026-10-05
status: Done
summary: Score eligibility above the position's minimum at 15%, and merge tenure into experience as one 20% criterion.
spec: Succession specification section E (ranking criteria and initial weights)
---

## Goal

Holding a higher eligibility than the position requires should improve a
candidate's rank. Today eligibility is filter-only: clear the required level or
you are not ranked at all, and holding more gives no advantage.

## Approach

### Scoring rule

Employee and required eligibility are both levels 0–2 (none / Sub-Professional
/ Professional, with PRC, Bar and RA 1080 counting as Professional). The filter
already guarantees employee ≥ required for anyone being ranked, so the ranking
scores only the gap above it:

```
ratio = (employeeLevel − requiredLevel) / (2 − requiredLevel)
```

Meeting the bar exactly earns nothing; exceeding it earns the full weight. This
is the rule the module already applies to education and training — the filter
checks the minimum, the ranking counts only what is above it — and it exists so
that clearing a bar is never paid for twice.

### Not assessable when the position already requires Professional

When `requiredLevel === 2` nothing can exceed it. Scoring everyone 0 would
quietly shrink the achievable total and make those candidates look weaker than
candidates for a lower-graded post. Eligibility is instead reported as *not
assessed* and dropped from both the numerator and the denominator, the same
treatment a missing IPCR already gets.

### Weight

`eligibility: 5`, taken from `tenure` (10 → 5). The four weights already
approved — ipcr 30, experience 25, training 20, education 15 — are untouched.
Tenure is the criterion the specification itself says does not make somebody
more qualified, so it is the defensible place to take from.

Per-position overrides already live in `critical_positions.succession_weights`
and pass through `normalizeWeights`, so HR can retune without a code change.

## Steps

1. `successionCriteria.ts`: add `eligibility` to `RankingWeights` and
   `RANKING_WEIGHTS`; drop tenure to 5.
2. `normalizeWeights`: stop discarding a stored `eligibility` key. Legacy rows
   carry `{ipcr, training, education, eligibility}` and that value is now
   meaningful again. Include it in the sum and the renormalisation.
3. Add `eligibilityRatio(employee, required)` implementing the margin rule,
   returning `null` when not assessable.
4. `rankingScore`: accept `eligibilityRatio: number | null`, add the component,
   and exclude its weight from `max` when null so the total stays comparable.
5. `succession.ts`: delete the dead `eligibilityRatio` helper (never called, and
   its shape — 1 for "meets", 0.5 for "below" — cannot differentiate candidates
   who have all passed the filter). Pass employee and required eligibility into
   the ranking.
6. `SuccessionPlanningPage.tsx`: one column, `Eligibility (5%)`, matching the
   existing per-criterion columns; show "not assessed" in the detail panel when
   the position requires Professional.
7. Tests in `successionCriteria.test.ts` pinning: margin rule, exact-match earns
   zero, not-assessable case, legacy weight migration, and that weights still
   sum to 100.

## Risks

- **Scores move for every ranked candidate**, because tenure's weight halves.
  Rankings may reorder. This is intended but should be expected.
- **Legacy stored weights change meaning.** Rows written under the old shape
  carried an eligibility weight that was being discarded; it now counts again.
  `normalizeWeights` renormalises to 100, so no row produces an out-of-range
  score, but a position configured long ago may rank differently than yesterday.
- No migration. `succession_weights` is JSON and normalised on read.

## Checks to run

- `npx tsc --noEmit`
- `npx vitest run`
- `npm run build`

## Correction, 2026-10-05

The weights above were proposed rather than taken from the specification, and
they were wrong. The spec table gives:

| Criterion | Weight |
|---|---|
| Performance / IPCR | 30 |
| Experience | 20 |
| Training | 20 |
| Education | 15 |
| Eligibility | 15 |

So eligibility is 15, not 5, and tenure is not a criterion at all — it is part
of experience.

Merging tenure into experience also removed a double-count. `tenureYears` was
already the years component of the experience score *and* the whole of the
standalone tenure criterion, so the same number was scored twice. That is the
double-count the module's two-stage split exists to prevent.

`tenureRatio` and `TENURE_FULL_YEARS` are deleted; nothing calls them now.
`normalizeWeights` folds a stored `tenure` weight into experience rather than
dropping it, since those points were allocated to length of service.
