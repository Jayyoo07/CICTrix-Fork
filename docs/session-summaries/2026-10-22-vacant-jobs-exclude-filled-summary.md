# Vacant jobs exclude filled plantillas: summary

Plan: `docs/plans/2026-10-22-vacant-jobs-exclude-filled.md`

## Shipped vs planned

- **Shared rule** (`src/lib/vacancySearch.ts`): `vacantPlantillaSlots` and `hasVacantPlantilla`. `isOpenedVacancy` now also needs at least one non-filled plantilla. A posting with no slot rows counts as vacant, because nothing records it as filled.
- **Public Currently Vacant Jobs** (`LandingPage.tsx`): rows come from open, non-filled plantillas only. The struck-through number and the disabled Filled button are gone, so every row has Apply. The empty state now reads "No vacant positions at the moment." A page-clamp effect keeps a live refresh from leaving the user on an empty page.
- **Job Vacancies tab** (`JobVacanciesPanel.tsx`): hides postings whose plantillas are all filled. Adds Plantilla (non-filled numbers only) and Monthly salary columns. The tab badge uses the same rule as the list.
- **Filled Positions tab** (`FilledPositionsPanel.tsx`, `?tab=filled`): one row per filled plantilla, newest fill first, read-only, with search on title, department and plantilla. The badge is the filled count.
- D10 of the hire-reservation plan is marked superseded. The position-occupancy plan is set to Deferred.

## Deviations

- **Gate skipped:** step 0 (`scripts/audit-filled-slots-vs-employees.sql`) did not run before the build. The user told me to apply and deploy without pasting its result. The code change doesn't depend on it; the audit measures how far slot status lags the employee records.
- **Table container:** the Job Vacancies container changed from `overflow-hidden` to `overflow-x-auto`, so the two extra columns scroll on narrow screens instead of clipping.
- **Lint not run:** `npm run lint` fails repo-wide because no ESLint config file exists.

## Checks run

- `npx tsc --noEmit`: clean.
- `npx vitest run`: 44 files, 404 tests pass. The run needed dummy `VITE_SUPABASE_*` env vars because this worktree has no `.env`.
- `npm run build`: succeeds.
