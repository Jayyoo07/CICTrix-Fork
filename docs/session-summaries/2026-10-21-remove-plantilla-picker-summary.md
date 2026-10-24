# Remove the plantilla picker — summary

Plan: `docs/plans/2026-10-21-remove-plantilla-picker.md`

## Shipped

- `JobDetailsPage.tsx`: the "Choose your plantilla items" card, its checkboxes, select-all and the discard-answers modal are gone. The right column is an "Apply for this position" card with the closing date and Continue to Application; a posting with no open plantilla shows "This position is no longer open". Continue passes the first open plantilla as the single selection, so the wizard is unchanged.
- The note under Required documents now reads the new instruction text.
- `JobDetailsPage.plantillas.test.tsx`: picker tests replaced with tests for no picker, Continue passing the open plantilla (skipping filled and already-applied), and the new instruction text.

## Deviations

None from the plan.

## Checks

- `npx tsc --noEmit`: pass.
- `npx vitest run`: 41 files, 383 tests pass.
- `npm run lint`: not run; ESLint finds no config file in this repo.
- Browser: not verified. The local `.env` Supabase anon key is a disabled legacy key (401), so no postings load locally.
