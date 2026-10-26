---
title: Applicant tracker lists every application — summary
date: 2026-10-26
plan: docs/plans/2026-10-26-tracker-application-list.md
---

## What shipped

- A tracker search by Reference No. (primary or alias) or email now loads all of the person's applications. A "Your applications" list sits under the search card with one row per application: position, office, plantilla, submitted date and live status badge. A row with a resubmission still waiting on the applicant shows "Action required".
- Clicking a row expands that application's status in place, using the page's existing sections unchanged. Clicking it again collapses it, and only one row is open at a time. The default open row is the first one waiting on the applicant, otherwise the newest.
- A person with one application sees the page as before, with no list.
- Withdrawn (hired elsewhere) rows are muted, read "Withdrawn: hired on <plantilla>", and get a neutral badge. `resolvePhase` now handles `Withdrawn - Hired Elsewhere`. It used to return nothing for that status, which would have crashed the Current Status card once such a row could be opened.
- The "New" badge is now Info (blue) per DESIGN_IDENTITY §10, via a new `received` tone. "Action Required" stays orange.
- `src/lib/applicantTracker.ts` holds the lookup, the resubmission-notice rule (moved out of the page so the open row and the row flags share it), the closed-status rule and the default-row rule.

## What "the expandable status must work" was checked against

- Switching rows resets every piece of per-application state (documents, plantilla outcomes, upload state), and `fetchAttachments` drops a response for a row that's no longer open. A test with a slow response for the first row proves the guard: it fails with the guard removed and passes with it in place.
- Realtime and the 2s poll now cover every application, so a collapsed row's badge updates on its own (tested). The attachments channel follows the open row.
- Re-upload writes to the open application's id, and the optimistic status update targets that row only.

## Deviations from the plan

- **New `.abyan-tokens` scope in `abyan-tokens.css`.** The tokens were only defined inside `.abyan-ds` and `.rsp-ds`. `.abyan-ds` would have reset the text colour of every existing section inside the expanded row, and `.rsp-ds` remaps utilities like `rounded-2xl`. `.abyan-tokens` provides the variables only. No token values changed.
- **No live-data walkthrough.** The local `.env` holds a legacy Supabase key that Supabase now rejects ("Legacy API keys are disabled"), so the dev server can't read data. Instead, the component test drives the real page against a fake Supabase, and the dev-server preview ran with a stubbed `fetch` using the same three-application data, at desktop and 375px widths. Realtime WebSocket errors in that session come from the disabled key.
- **Rebased onto main for deploy.** Applied on top of `origin/main` (which had gained an ESLint config and lint fixes to this page in the meantime). The conflict was resolved by keeping this change and re-applying main's lint edits; two `exhaustive-deps` disables the linter called unused were dropped.

## Checks run

- `npx tsc --noEmit`: clean.
- `npm run lint`: clean.
- `npm run check:migrations`: OK.
- `npm test`: 63 files, 547 tests pass, including `src/lib/applicantTracker.test.ts` (11) and `src/modules/applicant/ApplicationStatusPage.test.tsx` (6).
- `npm run build`: passes (existing chunk-size warning only).
- `impeccable detect` on the page: no findings.
- Preview: default row, expand, switch, collapse, withdrawn row, no horizontal scroll at 375px.

## Found, not fixed (out of scope)

- `mapRow` never maps `signing_deadline`, `signing_instructions` or `archived_at`, although the view and the page use them. In the tracker, the contract-signing notice shows no deadline and the Not Selected regret letter never shows. This predates the change.
- The `item_number` fallback for pre-20260923 codes still compares the raw uppercased input, as before.
