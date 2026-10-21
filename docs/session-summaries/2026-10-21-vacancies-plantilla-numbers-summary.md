# Plantilla numbers in the landing Job Vacancies table — summary

Plan: `docs/plans/2026-10-21-vacancies-plantilla-numbers.md`

## Shipped vs planned

All of D1–D3 as planned, no deviations.

## Checks

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 42 files, 386 tests pass, including two new cases (numbers with filled struck and closed omitted; department sort and fully filled postings hidden).
- `npm run build`: succeeds.
- Not checked in a browser against live data (local Supabase key disabled).
