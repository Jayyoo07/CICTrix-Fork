# Approved Phase 1 to Phase 2

## Shipped

- EmployeePage passes its resolved target setting ID to Phase 2. The service filters the exact record by employee and approved status, avoiding an independent cycle/latest-record selection and approved_at sorting for this path.
- Initial Phase 1 fields and save actions remain locked until hydration succeeds. Failed loads remain locked and offer a workspace retry; the badge no longer briefly reports an editable state before status loads.
- Phase 2 exposes actual load errors with retry before rendering the missing-approval empty state. Failed rating reads propagate instead of returning blank accomplishments.
- Submitted/closed Phase 2 sheets ignore stale draft caches and preserve server details as read-only. A closed global window no longer incorrectly labels an unsubmitted sheet as submitted.
- No live writes, deployment, schema changes, or token changes.

## Verification

- Six targeted test files: 44 tests passed. New coverage checks the exact approved-record lookup, target display before the rating window opens, retry after errors, and submitted details surviving remount with stale cached drafts.
- Final changed component/API suites: seven tests passed after the status-label change.
- TypeScript, ESLint and production build passed; final TypeScript and ESLint rechecks also passed after the status-label change.
- Build emitted existing Vite CJS, Browserslist-age and chunk-size warnings.
- Diff check passed. Branch diff reviewed for scope, locks, owner filtering and error states.
- Design checklist: existing layout retained; new error state uses tokens and shared button classes, role=alert/status and native keyboard-accessible buttons. No connected browser session was available for rendered mobile/tablet/desktop QA.

## Limits

The employee's live saved record and browser save/reload remain unverified. Local regressions establish application behavior with mocked services; missing or unreadable live database records still require the displayed error to diagnose.


## Follow-up: notice displayed without the sheet

The user reported only the global Phase 2 notice and a profile-save success banner. The workspace-entry effect depended on a callback whose identity changed on each hydration state update, repeatedly starting hydration and preventing Phase 2 from remaining mounted. Entry refresh now reads the latest dirty guard through a ref, while effect triggers follow workspace entry, employee identity, and loader inputs. Profile-save success has a separate state so it cannot appear as IPCR feedback.

A parent-level regression reproduces the reported notice-only display with the old effect (failed), and passes with the fixed effect: hydration runs once, Phase 2 appears, and approved targets remain disabled after tab switching. Seven relevant suites / 45 tests passed; TypeScript, ESLint and diff check passed. No additional production build was needed for this focused follow-up; the prior build is recorded above. Browser/live-account validation is still unavailable.

The employeePortal profile PATCH 400 remains unresolved pending the expanded response message/code/details/hint. No profile payload or schema changes were made without that evidence.
