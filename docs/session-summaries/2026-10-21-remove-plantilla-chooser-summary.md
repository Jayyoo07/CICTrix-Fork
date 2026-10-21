# Remove the plantilla chooser from Job Details — summary

Plan: `docs/plans/2026-10-21-remove-plantilla-chooser.md`

## Shipped vs planned

All of D1–D3 as planned, no deviations.

## Checks

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 42 files, 386 tests pass; the Job Details plantilla tests were rewritten for one plantilla per vacancy (named plantilla, fallback, filled and already-applied states, own summary and duties only).
- `npm run build`: succeeds.

## Follow-up (same day)

The small plantilla card from D2 was removed too. The right column now holds only the submission instruction ("Please review your application carefully before submission…") as an info alert and the Continue to Application button. A plantilla that is no longer open shows a warning alert with Back to Vacancies in place of the button. Checks: `tsc` clean, 386 tests pass, build succeeds.
