---
title: Loading and action feedback — first slice summary
date: 2026-10-26
plan: docs/plans/2026-10-26-loading-and-action-feedback.md
---

## What shipped

The shared layer plus the auth, applicant, employee and interviewer portals. RSP, L&D, PM and the audit document are still open in the plan.

**Shared module.** `src/components/action-feedback/`:

- `FeedbackProvider` / `useFeedback()`: one toast queue. Success and info dismiss after 5s, warnings after 8s, errors stay until dismissed; hovering or focusing pauses the timer. Three visible at once, errors kept over other tones. The stack starts below the 64px portal top bar so a persistent error cannot cover Logout.
- `ActionFeedback`: the §9.9 inline alert, with title, what happened, whether it completed, a `Next:` line, Retry and dismiss. Focuses itself for errors.
- `useAsyncAction`: pending state, re-entry guard, `{ ok: false }` / `{ success: false }` detection, failure translation, success toast. Always clears `pending`, including on throw.
- `Button` now keeps its label with a spinner and marks itself `aria-busy`, matching §9.1. The `.btn.is-loading` rule was ported to `components.css` because `main` did not have it.
- `describeActionFailure(action, error, { mode })` in `src/lib/friendlyErrors.ts`: action or load copy with a completion statement and a next step. Raw error text stays in the console. `ErrorBanner` now uses the same copy and gains the next-step line.

**Auth.** Admin, employee and interviewer sign-in keep their labels and show a spinner; each failure names the cause and the next step. The initial-password page does the same and keeps its label.

**Applicant.** Status lookup errors are friendly and retryable; the search button keeps its label. Re-upload failures say the file is not attached and how to retry; success is a toast. The wizard's failure list no longer prints raw error text, and the confirm modal keeps its label while submitting (`applicant-flow.css`).

**Employee.** IPCR draft/submit, Phase 2 self-ratings, IDP draft/submit and every PDS section keep their labels and show a spinner on the button that is actually running. Trainings and archive now distinguish a failed read from an empty list: `listMyTrainings` and `getEmployeeArchive` return `{ ok, data, error? }`, and both sections show `ActionFeedback` with Retry.

**Interviewer.** Delete uses the shared dialog error instead of `alert()`, keeps its label and confirms success. Document validation, resubmission, status decisions, the details modal, the evaluation submit and both email dialogs report success and failure. A failed status write no longer closes the decision dialog as if it worked.

## Deviations from the plan

- **Only the agreed first slice.** RSP, L&D, PM, the ad-hoc toast replacements outside these portals, and the per-screen audit document remain.
- **Two read contracts changed earlier than planned.** `listMyTrainings` and `getEmployeeArchive` now return a flat result instead of an array, so the employee screens can tell "failed" from "empty". `PMArchive` was updated for the new archive return.
- **PDS was included.** It is a large employee form with a label-swapping save bar, so it was fixed with the rest of the portal.
- **Settings page skipped.** Its profile and mock 2FA/backup controls write localStorage only; adding success toasts there would claim a server result that does not exist. It is recorded as out of scope under D9.
- **No visual preview.** §9.9 already fixes the toast and alert treatment; this run used it rather than opening a layout question.

## Bugs found along the way

- `ApplicantDetailsPage` kept its toast setter but discarded the value (`const [, setToast]`), so every "Resubmission requested", "Documents validated", "Validation undone" and "Score draft saved" message was invisible.
- The resubmission and validation loops did not check Supabase insert errors, and the decision dialog closed even when the `applicants` update wrote no row. Both bulk actions now read the records already in the database before inserting, so a retry after a partial failure does not duplicate notices or validation markers.
- `.af-loading` hid the button label with `visibility: hidden` and painted a spinner over it, against §9.1. It now keeps the label.
- My Trainings and My Archive rendered their empty state when the read failed, stating "No trainings yet" / "No archived semesters" for a connection error.
- `main` did not have the loading-button fix: the shared `Button` still replaced its label with a spinner, and `components.css` had no `.btn.is-loading` rule. Both were ported here.
- Admin and interviewer sign-in treated a network failure (Supabase status 0) as a wrong password. They now distinguish 429, 400 and transport/server failures.

## Checks run

- `npx tsc --noEmit`: clean.
- `npm test`: 195 files, 1,759 tests pass, including the new Button, provider and async-action tests. The count includes duplicate test files from the checked-out worktrees; the repo's own suite is 191 files.
- `npm run build`: passes. The default Windows temp folder denied esbuild's temp-file cleanup, so the build ran with `TEMP` pointed at `scratch/.build-tmp`. The failure is environmental, not code.
- **Headless Chrome smoke test** against the production build: `/`, `/track`, `/admin/login`, `/employee/login` and `/interviewer/login` render; the toast region mounts; the error boundary does not fire. On `/admin/login`, with the Supabase token request intercepted and failed, the button kept "Sign in" with `aria-busy="true"` and `is-loading`, then showed "The request didn't reach the server…" with the connection next step and no raw error text.
- `npm run lint`: cannot run. The repo still has no ESLint config, so ESLint 8 exits before linting. This predates the branch.
- **Not verified in a browser:** the applicant upload, resubmission and employee portal flows. They need a signed-in session and real records; they are covered by type-check and the full suite only.

## Next

1. RSP mutations: `NewlyHiredPage` (last `alert()` in that portal), jobs, credentials, rater management, salary grades, critical positions, dashboard.
2. L&D and PM mutations, including `PMIPCRManagement` and `PMDashboard`.
3. Replace the remaining ad-hoc toasts and run the read-failure pass.
4. Write the per-screen audit and close the plan.
