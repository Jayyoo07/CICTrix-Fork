# One row per plantilla in the landing vacancies table — summary

Plan: `docs/plans/2026-10-21-vacant-jobs-plantilla-rows.md`

## Shipped vs planned

All of D1–D4 as planned, no deviations.

## Checks

- `npx tsc --noEmit`: clean.
- `npx vitest run src/components/LandingPage`: full suite 42 files, 386 tests pass; landing: 2 tests (one row per plantilla with filled struck and disabled, closed omitted; department sort with repeated titles).
- `npm run build`: succeeds.
