# Employee IPCR Phase 1 persistence

## Shipped

- Replacement MFOs and indicators are written and read back before the previous draft is deleted. Failed inserts or failed verification preserve the previous draft.
- Submission status is finalized after persistence succeeds, allowing a failed submission to be retried.
- Failed MFO/indicator reads propagate as loading errors instead of silently becoming blank targets. Employee reload stops before replacing targets on these errors.
- Phase 1 and Phase 2 saves update only their own saved-state baseline; saving accomplishments no longer acknowledges unsaved target edits, and vice versa.
- Added persistence and saved-state regressions. The approved plan is `docs/plans/2026-10-29-ipcr-phase1-persistence.md`.

## Deviations and limits

- Regression tests reproduced loss of a previous draft on failed replacement writes, so write ordering and submission finalization were fixed as part of the persistence path.
- No schema changes or live database writes. Tests use an in-memory Supabase query stub, not a live database.
- The writes remain multiple requests, not a database transaction. Interrupted requests or simultaneous saves from multiple clients are not guaranteed atomic.
- Live employee login and manual browser save/reload have not been verified. No phase scheduling settings were changed.

## Checks

- Seven relevant Vitest files: 55 tests passed, including save/reload, Phase 2 preservation, failed reads, failed replacement writes, failed verification, and submission retry.
- TypeScript and ESLint passed.
- Production build passed with existing bundle-size, Browserslist, and Vite CJS warnings.
- `git diff --check` passed.

## Manual demo check

Using an employee whose Phase 1 is open, enter MFOs and indicators, save the Phase 1 draft, wait for success, reload, and confirm all entries remain. Save Phase 2, reload again, and confirm both phases remain. Failed reads/writes must display an error rather than success or silently blanking existing entries.
