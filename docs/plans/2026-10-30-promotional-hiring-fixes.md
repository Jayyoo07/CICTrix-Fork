---
title: Repair the promotional hiring pipeline
date: 2026-10-30
status: In Progress
summary: Repair the active employee application and RSP promotion flow, including scheduled interviewer visibility, durable scores, selection visibility, appointment completion, and existing-account preservation. Security remediation and the unused PM promotion module are excluded.
spec: docs/session-summaries/2026-10-30-promotional-hiring-audit-summary.md
---

## Goal

An existing employee can apply from a fresh browser, complete the existing screening and assessment process, appear in For Hiring, be reserved for signing, and receive a promotion without creating a second employee or replacing their account. A promotional interview scheduled by RSP appears in the interviewer's dashboard and applicant list, opens the correct PCPT evaluation, and remains visible after reload. The employee UUID, employee number, original hire date, account ID, username, and password remain unchanged. The employee's current role/office and target plantilla are updated, the appointment is recorded once, and retries do not duplicate any of those actions.

This is a **functional repair plan**, not a production-security sign-off. The user chose to exclude remediation work on 2026-10-30 and approved implementation with “build” after selecting DeepSeek max. Implementation is in the isolated `promotional-hiring-fixes-build` worktree on `fix/promotional-hiring-pipeline`. Approval does not authorize live migrations, deployment, or email.

## Approach

### Design and scope

Keep React/TypeScript/Vite, Supabase, FastAPI, and the existing Submitted → screening → assessment → Qualified → For Contract Signing → Hired flow. `Hired` remains compatible with the workflow normalizer's Selected state. Do not add a PM approval stage.

Fix lookup, score persistence, and list filtering in their existing service/component boundaries. Add a focused **promotion-only appointment transaction** shared by the browser and Python hire paths. It updates the existing employee, fills the reserved target slot, changes application status, and records promotion history together. External hiring keeps its existing behavior and gets regression coverage; this is not a general hiring rewrite.

The transaction is a proposed implementation detail for review: independent employee/status/slot HTTP writes were rejected because a lost response or failed slot write can leave a promotion half-complete. It does not migrate authentication or repair project-wide permissions. Any new callable operation must nevertheless validate its caller and must not introduce another anonymous mutation endpoint.

**Included:** fresh-browser promotion login using the current portal-account mechanism; scheduled promotion visibility and PCPT access in the interviewer portal; truthful score saving and reloading; promotion-aware ranking/selection; canonical employee update; retry-safe promotion completion; promotion-specific result messages; tests and isolated acceptance verification.

**Excluded:** Auth migration, password hashing/rotation, project-wide RLS/grant/Storage changes, changes to the remediation plan, activation/integration of `PMPromotionalApplications`, IPCR competency computation, scoring-policy/weight changes, duplicate-record cleanup, bulk production repairs, replacement of the vacancy-occupancy model, and automatic reopening/advertising of the employee's former position. Existing security findings remain unresolved, not waived or fixed by this plan.

### Existing decisions and constraints

- Use the layout in `docs/mockups/2026-10-21-hire-reservation-flow.html`: existing selection dialogs, cross-department signing queue, and external credential print cards. Only promotion-result copy/state changes are planned; no new navigation or layout. `DESIGN_IDENTITY.md` overrides mockup styling; no token changes.
- An application is identified by its own applicant UUID, not by the employee's email or a prior application. The employee is resolved by the persisted `applicants.employee_id` employee number, never by title, name, or email.
- Use the deployed `employees` base-table fields: `position`, `department`, `division`, `plantilla_num`, and `employee_number`. Do not add `department_id` to accommodate stale code. Do not copy a `positions.id` UUID into the incompatible numeric `employees.position_id` column.
- Resolve the target office/position from the application's exact `plantilla_slot_id` and that slot's `job_posting_id`, not a title-only lookup or legacy department-name substitution. Resolve the employee-facing plantilla number from the stored `Plantilla <n>` label; `item_number` is an internal key, not that number. Reject ambiguous/missing mapping instead of guessing.
- Keep the existing written-exam requirement and scoring conversions. Promotional assessment total uses the existing five-category `calcModalScore(..., 'promotional')` calculation. Oral scores are not required for a promotional appointment; do not invent oral scores from PCPT. Preserve separate written-exam and 130-point summary metrics rather than silently redefining them.
- No service-role credentials in the frontend, no new packages, no broad component refactors, no new module folder. All external calls remain in `src/lib/`.
- Create a migration only during approved implementation using `npx supabase migration new complete_promotional_appointment`. Its timestamp comes from the CLI. Test locally/preview; repository migrations merge by PR, never by manual MCP/dashboard application.
- Do not automatically create a portal account for a promotion with a missing or ambiguous account link. Return an actionable failure before appointment writes. Account provisioning is a separate action.

### File responsibilities

| Files | Responsibility |
| --- | --- |
| `src/lib/employeePortalData.ts`, `src/modules/applicant/ApplicantWizard.tsx` | Resolve existing promotion credentials remotely without depending on another browser's cache. |
| `src/lib/api/applicantScores.ts`, `src/components/QualifiedApplicantsSection.tsx` | Save before finalizing/caching; expose durable, typed score summaries. |
| `src/components/ForHiringPage.tsx`, `src/components/ApplicantRankingPage.tsx` | Use application identity and persisted assessment data. |
| `src/lib/applicantSchedule.ts`, `src/lib/interviewerAccess.ts`, interviewer dashboard/list/evaluation components | Trace persisted schedules through assignment and posting filters; restore scheduled promotional interviews without widening access. |
| New `src/lib/api/promotionalHiring.ts` | Typed promotion RPC boundary; no password issuance or external-hire logic. |
| `src/lib/api/employeesApi.ts`, `backend/app/routes/employees.py` | Route every promotion hire entry point to the same transaction, retaining external-hire compatibility. |
| `src/lib/hiringFlow.ts`, `src/components/GenerateCredentialsPage.tsx` | Distinguish promotions from external credential generation and report mixed outcomes accurately. |
| New CLI-generated migration, `supabase/tests/promotional_appointment.test.sql` | Transaction, rollback, caller checks, concurrent completion, and idempotence. |
| `src/lib/hiredApplicantSync.ts` and its new focused test | Prevent startup backfills from creating/rewinding promotion employees or statuses. |

### Review focus

1. A prior account/hire must not hide a different promotion application, and a saved promotion interview must reach the eligible interviewer's dashboard, list and PCPT form without shared browser caches (Tasks 3 and 3A).
2. A rejected score save or stale browser cache must not make an applicant look finalized (Task 2).
3. Double-clicks, simultaneous completions, lost responses, and replay of an old promotion must not duplicate or rewind appointments (Tasks 4–5).
4. Missing/deleted employees, ambiguous accounts, stale reservations, or a mismatched slot must fail without writes (Task 4).
5. A promotion-only or mixed batch must never reset a promotion password, print old credentials, or report a successful promotion as a credential-generation failure (Task 6).

## Steps

### Implementation checkpoint — paused after Task 3

Paused at the user's request on 2026-10-30. Tasks 1–3 are implemented, reviewed and committed on `fix/promotional-hiring-pipeline`: `1dda88f`, `c29adba`, `20c24f1`. Resume at **Task 3A**, not Task 4. Task 3A and Tasks 4–8 remain unstarted; the scheduled-interview exclusion is identified but not fixed in this checkpoint.

Combined verification after Task 3: **136 src test files / 1,239 tests passed**; `npx tsc --noEmit`, repository-wide `npm run lint`, `npm run build`, and `git diff --check` passed. Tests/build used synthetic localhost Supabase settings, not production credentials. Existing React act/refused-localhost test warnings and Vite/Browserslist/bundle-size warnings remain. No migrations were added; live-data seed tests and database/browser end-to-end acceptance were not run. Docker/Podman/local Postgres remain unavailable, blocking Task 4's required transaction verification and Task 8's isolated acceptance. Overall plan stays In Progress, not Done.

Keep this worktree and branch for the next session. No push, PR, merge, deployment, email or live database write has been performed. A separately authorized fork push/upstream PR should describe this as the **Tasks 1–3 partial repair**, not a completed promotional appointment pipeline. See [implementation summary](../session-summaries/2026-10-30-promotional-hiring-fixes-summary.md) for checks and remaining limits.

### Checkpoint smoke/sanity verification — user-requested extension

The user asked for the pre-merge smoke/sanity pass on 2026-10-30 and required the approved DeepSeek builder to run it. A real browser pass is not available in this environment: there is no installed browser-automation package or browser harness, and no isolated Supabase/Postgres runtime. Installing packages or using production is excluded.

Delegated substitute, clearly labeled as such:

- Fresh-browser promotion-entry smoke against a remote-account fixture, with empty browser storage.
- Cross-task handoff smoke using the real Task 2 score save/summary services over a stateful fake Supabase table: save a complete promotional assessment, simulate a hard reload, then verify the saved total and written exam drive For Hiring and Applicant Ranking.
- Fail-closed sanity: a rejected score upsert creates no durable summary and leaves the promotion out of selection while an existing reservation remains visible.
- Built-artifact smoke: serve `dist` with `npm run preview` on localhost, fetch the index and main asset, then stop the server. No external service calls.

Owned new tests: `src/test/promotionEntry.smoke.test.tsx`, `src/test/promotionPipeline.smoke.test.tsx`. No product edits; defects found are reported to the parent for a separate corrective decision. This is not a substitute for Task 8's isolated-browser/database acceptance, and it must not be reported as browser-verified.

Status 2026-10-30: **accepted**. A fresh `deepseek/deepseek-flash#max` builder (catalog identity DeepSeek V4.1 Flash 1017, `max` advertised) authored and ran the checks; parent reviewed the harness and independently reran both smoke files: **2 files / 5 tests passed**, `npx tsc --noEmit` and scoped ESLint clean. Parent independently reproduced the built-artifact preview smoke: index 200 with root and module script, main JS 200 (3,333,754 bytes), no listener left. Committed as `e483c55` (`test(promotion): add checkpoint smoke and sanity checks`). This remains mocked jsdom evidence, not browser/database/RLS acceptance; Tasks 3A–8 are still unverified. No push or PR.

Execution is task-by-task using test-driven development under the user-invoked `delegate` workflow. For each task, the builder writes the named failing tests, runs them to demonstrate the defect, makes the smallest implementation, and reruns to green. The OpenAI orchestrator then reviews the diff and independently reruns the relevant checks. Task commit steps below belong to the orchestrator after review and applicable approval, never to the builder. No pushes or live writes without explicit authorization.

### Delegation setup — approved for implementation

| Role | Exact model and effort | Existing connection |
| --- | --- | --- |
| Orchestrator, planner, reviewer | `openai/gpt-6.1-sol#high` | OpenAI ChatGPT OAuth; connection metadata reports `oauth`. |
| Product-code, migration, test and integration builder | `deepseek/deepseek-flash#max` | Existing paid DeepSeek API-key connection; catalog identity `DeepSeek V4.1 Flash 1017`. User selected max for this run. |

Preflight on 2026-10-30 confirmed both routes are active; OpenAI advertises `high` and DeepSeek advertises the user-selected `max`. The current session is already `openai/gpt-6.1-sol#high`. Connection metadata shows OpenAI OAuth and DeepSeek key authentication without a needs-auth status. This verifies configured availability, not remaining quota. No credential values were read or changed. A newer OpenAI candidate, `openai/gpt-6.1-terra`, is available; it has not been selected and its later release date alone does not establish suitability. No newer comparable DeepSeek Flash candidate was listed. DeepSeek max is approved for this run only; global skill/model defaults are unchanged. Approval was subsequently granted and builders have returned Task 1 results; see the execution ledger below.

- The user approved this plan, including Task 3A, and the exact model pair with “build” after selecting DeepSeek max. Any later scope/model change needs renewed approval before affected dispatches.
- Before execution, establish an isolated non-main worktree/branch with this plan and its audit available. Preserve the existing uncommitted audit/plan documents and the user's untracked `run-queue.bat`; do not discard or silently move them. Follow the project's worktree procedure.
- Dispatch built-in `general` builders with the explicit override `deepseek/deepseek-flash#max` on every new child. Give each child the approved plan, applicable instructions, exact owned paths from its task, needed prior interfaces, and checks. Exclude credentials from prompts.
- Run Tasks 1 → 2 → 3 → 3A → 4 → 5 → 6 → 7 sequentially for this run. Task 3 consumes Task 2; Task 5 consumes Task 4; Task 6 consumes Task 5. The other tasks remain serial to simplify review and avoid shared-file/generated-state conflicts.
- Builders may edit only assigned code/test/migration paths. They must not spawn helpers, switch models, commit, push, deploy, call live services, run live-data seed scripts, or send email. Database testing is local only; using a remote preview requires separate authorization.
- OpenAI owns planning/tracking and review, not product-code fixes. Any combined-result fix is a separately owned DeepSeek integration dispatch with exclusive ownership of the relevant affected paths and explicit regression checks. Do not overlap it with another builder editing those files.
- After each result, inspect the actual diff and rerun checks before accepting it. Track the original task's corrective counter across resumed/replacement children. After two unsuccessful corrective dispatches, stop that task and ask the user; do not issue a third or have OpenAI take over implementation.
- Report model authentication, quota, rate-limit, unavailable local database, or conflicting user changes as blockers. Never silently substitute Pro, a free model, another account, or another effort level.
- Task 8 is combined-result verification. OpenAI may run checks/browser acceptance and review; any new test code or integration implementation remains delegated to the approved DeepSeek route.
- **Current stopping instruction:** finish Task 3 and its review, run unit tests on the combined Tasks 1–3 changes, then pause. Task 3A and Tasks 4–8 remain unstarted. Update this plan and the implementation summary before reporting the checkpoint; pushing to a fork and opening an upstream PR require separate authorization.

### Delegation ledger

Approval and passing isolated baseline recorded; Task 1 is accepted. A correction count excludes the initial implementation and increments only when a dispatched corrective fix is rejected or fails required checks. The detailed recovery ledger is `.superpowers/sdd/2026-10-30-promotional-hiring-fixes/progress.md` in this worktree.

| Task | Owner | State | Unsuccessful corrections |
| --- | --- | --- | --- |
| 1 — fresh-browser promotion entry | DeepSeek builder; OpenAI review | Accepted; 1dda88f; 22 tests, TypeScript and scoped ESLint pass | 0 / 2 |
| 2 — durable scores | DeepSeek builder; OpenAI review | Accepted; c29adba; 52 tests, TypeScript and scoped ESLint pass | 0 / 2 |
| 3 — selection/ranking | DeepSeek builder; OpenAI review | Accepted; 20c24f1; combined 1,239 src tests, TypeScript, lint and build pass | 0 / 2 |
| 3A — scheduled interviewer display | DeepSeek builder; OpenAI review | Next on resume; unstarted, paused by user | 0 / 2 |
| 4 — atomic appointment migration | DeepSeek builder; OpenAI review | Queued; isolated DB prerequisite unresolved | 0 / 2 |
| 5 — shared appointment entry points | DeepSeek builder; OpenAI review | Queued; depends on 4 | 0 / 2 |
| 6 — account-preserving results | DeepSeek builder; OpenAI review | Queued; depends on 5 | 0 / 2 |
| 7 — legacy sync guards | DeepSeek builder; OpenAI review | Queued | 0 / 2 |
| 8 — combined verification / integration | OpenAI verification; DeepSeek for code/tests | Queued | Track corrections against the originating task |

### Task 1: Make promotion entry independent of local credential caches

**Modify:** `src/lib/employeePortalData.ts`, `src/modules/applicant/ApplicantWizard.tsx`.
**Create tests:** `src/lib/employeePortalData.promotion.test.ts`, `src/modules/applicant/ApplicantWizard.promotion.test.tsx`.

**Interface:** `authenticatePromotionalEmployee(identifier: string, password: string): Promise<{ ok: boolean; account?: EmployeePortalAccount; error?: string }>` in the existing service file. Accept username or employee number, normalize the identifier only, and require an exact password match against the current remote account. Do not download the whole account roster. Do not return/cache credentials in diagnostic output. This intentionally retains the legacy credential mechanism; it does not make that mechanism secure.

- [x] Test an empty localStorage browser with valid remote username and employee-number logins; both resolve the same employee and prefill the form.
- [x] Test wrong password, deleted/missing/ambiguous account, failed remote read, and a stale local cached password. None may enter the promotion form on cached authority; show invalid credentials separately from an unavailable lookup.
- [x] Run `npx vitest run src/lib/employeePortalData.promotion.test.ts src/modules/applicant/ApplicantWizard.promotion.test.tsx`; observe failures, implement the helper and awaited wizard call, and rerun to pass. Stub every remote call.
- [x] Commit: `fix(promotion): resolve existing accounts across browsers` (`1dda88f`).

### Task 2: Make score finalization depend on a durable save

**Modify/test:** `src/lib/api/applicantScores.ts`, `src/lib/api/applicantScores.test.ts`, `src/components/QualifiedApplicantsSection.tsx`.
**Create test:** `src/components/QualifiedApplicantsSection.persistence.test.tsx`.

**Interfaces:** retain `saveApplicantCategoryScores`' existing result signature; make scoring modal `onSave` return `Promise<{ ok: boolean; error?: unknown }>` and await it. Add `ApplicantScoreSummary = { applicantId: string; appointmentType: 'original' | 'promotional'; assessmentTotal: number | null; writtenExamRawScore: number | null; isFinalized: boolean }` and `fetchApplicantScoreSummaries(applicantIds: string[]): Promise<{ ok: boolean; data: Map<string, ApplicantScoreSummary>; error?: unknown }>` to the existing score service. Read persisted category rows and calculate the appropriate assessment total with existing formulas; incomplete required categories produce null. Do not read nonexistent score columns from `applicants`.

- [x] Test a rejected upsert: modal stays editable/open with the entered values and an error, no finalized state, no success event, and no authoritative cache update.
- [x] Test success, hard reload in an empty-cache client, valid zero scores, incomplete promotion categories/PCPT, and a failed summary read. A read failure is not an empty successful ranking.
- [x] Persist first, then publish the cache/event and UI finalization. For a real applicant ID, local-only data never counts as durable finalization. Keep non-UUID test/demo behavior explicitly separate.
- [x] Run `npx vitest run src/lib/api/applicantScores.test.ts src/components/QualifiedApplicantsSection.persistence.test.tsx` through red/green; commit `fix(rsp): finalize applicant scores after persistence` (`c29adba`).

### Task 3: Restore promotion visibility and use the saved assessment scores

**Modify:** `src/components/ForHiringPage.tsx`, `src/components/ApplicantRankingPage.tsx`.
**Modify tests:** `src/components/ForHiringPage.scored.test.tsx`, `src/components/ForHiringPage.context.test.tsx`.
**Create tests:** `src/components/ForHiringPage.promotion.test.tsx`, `src/components/ApplicantRankingPage.scores.test.tsx`.

**Consumes:** Task 2's `fetchApplicantScoreSummaries`; retain `fetchHiringContext` for slot/reservation state.

- [x] Reproduce the audit case: a new qualified promotion shares an email with both an older hire and an existing account; it must appear. A completed record for this exact applicant UUID must not reappear.
- [x] Remove email-wide exclusion and account-existence-as-completion checks. Preserve terminal/disqualified/deleted exclusions, filled-slot exclusion, existing reservation visibility, and revoked-selection behavior.
- [x] Fetch application type and join durable summaries by applicant UUID. Rank promotions with the saved five-category assessment total, not an invented oral score; retain the separate written-exam eligibility requirement. Do not substitute education alone, a partial local save, or someone else's same-email evaluation.
- [x] Test a fully scored promotion with PCPT but no oral evaluation, missing written exam, an incomplete promotion, original-applicant regression, and reload without localStorage. The report shows saved totals rather than blank `applicants.total_score` fields.
- [x] Run `npx vitest run src/components/ForHiringPage src/components/ApplicantRankingPage --exclude "**/.worktrees/**" --exclude "**/.claude/worktrees/**"` through red/green; commit `fix(promotion): restore selection visibility and ranking` (`20c24f1`).

### Task 3A: Restore scheduled promotional interviews in the interviewer portal

**Reported requirement:** On 2026-10-30 the user reported that scheduled promotional hiring interviews do not display for interviewers. Read-only build investigation confirmed the live promotion has an interview date/time, an active assigned rater, and an Open linked posting/slot. Its email satisfies the blanket `@example.com` demo exclusion in both interviewer screens. Reproduce that confirmed exclusion with a persisted-UUID fixture first; additional causes remain unverified until tested. Do not change the live email or remove assignment rules as a workaround.

**Inspect/modify as evidence requires:** `src/lib/applicantSchedule.ts`, `src/lib/interviewerAccess.ts`, `src/modules/interviewer/InterviewerDashboard.tsx`, `src/modules/interviewer/InterviewerApplicantsList.tsx`, `src/modules/interviewer/EvaluationForm.tsx`.
**Modify tests:** `src/lib/applicantSchedule.scheduled.test.ts`, `src/modules/interviewer/InterviewerApplicantsList.dedupe.test.ts`.
**Create tests:** `src/modules/interviewer/InterviewerDashboard.promotion.test.tsx`, `src/modules/interviewer/InterviewerApplicantsList.promotion.test.tsx`, `src/modules/interviewer/EvaluationForm.promotion.test.tsx`.

**Existing boundaries:** `saveApplicantAssignment`/`scheduleApplicantsBatch` persist the RSP schedule; `isScheduledForInterview` currently checks only `interview_date`; `resolveAssignedPositionsForInterviewer` combines rater assignments and application assignments. `buildJobsFromPostings` additionally filters to Active postings and groups/deduplicates by title/code. The applicant list and evaluation form independently enforce assigned-position access. These are investigation points, not permission to remove every filter.

- [ ] Reproduce with one original and one promotional application scheduled through the same RSP action. Capture the saved application UUID/type, target slot/posting, canonical interview date/time, assigned interviewer, posting state and resolved assigned positions using synthetic fixtures. Trace RSP write → remote read → schedule predicate → assignment resolution → posting filter → dedupe → type/status filter → evaluation navigation. Identify the first boundary that drops the promotion before changing code.
- [ ] Add a failing dashboard/list regression matching that boundary. Assert the scheduled promotional applicant appears once, the dashboard count equals the drill-down count, the Promotional filter includes them, and the list opens `/interviewer/evaluate/<applicant UUID>` rather than a plantilla ID or another same-email application.
- [ ] Repair the narrowest confirmed mismatch. Use persisted scheduling data, not the applicant's current job/office, local account cache, or a status label alone. If a linked posting has closed to new applications, its already scheduled eligible interviews must remain reachable for assessment; this must not reopen the vacancy. Preserve assignment restrictions and existing original-applicant behavior. Do not widen access to all applicants as a workaround.
- [ ] Keep the scheduled-only rule from `docs/plans/2026-10-28-interviewer-scheduled-applicants-only.md`: no interview schedule means no interview task. A written-exam-only date does not count as an interview; do not invent an oral-interview requirement for promotions. If investigation finds legacy date aliases, support only aliases confirmed by the actual scheduling writer/data contract and add explicit tests rather than treating arbitrary dates as interchangeable.
- [ ] Test empty-cache/second-browser display, refresh/realtime after scheduling and rescheduling, assignment changes, two different applicants sharing one plantilla, identical position titles in different offices/postings, an unscheduled promotion, and a remote read failure. Keep distinct applicant UUIDs distinct; report read/assignment errors rather than a successful empty list. Respect the existing assignment model without silently creating a new permission policy.
- [ ] Test that opening the scheduled promotion resolves Promotional from the persisted application and displays PCPT without requiring oral scores or an appointment-type value cached by the RSP browser. After submission/reload it appears in the existing completed/history view, not as a vanished or still-unrated task. Verify the saved evaluation remains linked to this application UUID and can be read by RSP scoring.
- [ ] Run `npx vitest run src/lib/applicantSchedule.scheduled.test.ts src/modules/interviewer/InterviewerDashboard.promotion.test.tsx src/modules/interviewer/InterviewerApplicantsList.promotion.test.tsx src/modules/interviewer/EvaluationForm.promotion.test.tsx src/modules/interviewer/InterviewerApplicantsList.dedupe.test.ts` through red/green. Mock all clients/Storage calls; do not submit a live evaluation.
- [ ] Commit: `fix(interviewer): display scheduled promotional interviews`.

### Task 4: Complete a promotion in one retry-safe database transaction

**Create:** CLI-generated `supabase/migrations/<generated-version>_complete_promotional_appointment.sql`, `supabase/tests/promotional_appointment.test.sql`.

**Database interface:** `public.complete_promotional_appointment(p_applicant_id uuid, p_actor_user_id uuid DEFAULT NULL) RETURNS jsonb`, returning `{ applicant_id, employee_uuid, employee_number, slot_id, completed_at, already_completed }`. No client-supplied target employee, office, title, password, or decision timestamp.

- [ ] Reinspect table columns, constraints, triggers, role mappings and function grants against the isolated database before authoring the migration. Confirm the audit's missing `employees.department_id`; validate the `employee_history` action and actor foreign keys. Do not run writes against production to discover these facts.
- [ ] Add failing database tests for preserving the existing employee UUID/number/email/original hire date/account credentials, updating the exact target role/office/division/plantilla, writing one `employee_history` action `promoted`, and firing existing fill/archive/withdraw behavior only on successful completion.
- [ ] Add failure/rollback tests: missing or deleted employee/account, ambiguous account match, non-promotion application, absent/mismatched slot, another reservation holder, already-filled target, incomplete required assessment, and invalid actor. Assert employee, application, target slot, history and affected applications are unchanged on rejection or an injected failure.
- [ ] Implement as `SECURITY INVOKER` with a fixed `search_path` and schema-qualified references. Revoke effective PUBLIC/anon execution on this new function; grant only intended authenticated/service callers. Normal calls derive the actor from `auth.uid()` and reject a conflicting actor parameter. A service-role backend call may supply only the identity already verified by the backend. In both cases require the current active RSP or ADMIN `user_roles` row; do not trust browser metadata. This guards the new operation only, not existing open table grants.
- [ ] Acquire row locks in a documented consistent order, compatible with reservation/fill triggers; serialize completions for the same employee as well as the same application/slot. First completion requires the application's current reservation and valid assessment. Resolve the target through the linked slot/posting; never use title-only matching. Reject an ambiguous plantilla-number mapping.
- [ ] In the same transaction update the employee's assignment fields only, mark the target slot filled by this application, write canonical `Hired`, and append history using the verified actor and database time. Preserve employment status, personal details, original hire date and account identity. Do not insert into `employees` or `employee_portal_accounts`, reopen the old posting, or reseed onboarding.
- [ ] Test a repeated/lost-response completion returns `already_completed: true` with no new writes/history, including replay after a later promotion. Inconsistent legacy partial completion must return a conflict for investigation, not fabricate success or silently repair production data. Use two database sessions to prove concurrent requests cannot duplicate history or take another holder's slot.
- [ ] Run the database suite on a local/preview stack via the installed Supabase CLI's documented test command, plus `npm run check:migrations`; record the exact commands/version and results. If no isolated stack is available, mark this task blocked rather than replacing it with production tests.
- [ ] Commit: `fix(promotion): complete appointments atomically`.

### Task 5: Make all promotion hire entry points use the same operation

**Create:** `src/lib/api/promotionalHiring.ts`, `src/lib/api/promotionalHiring.test.ts`, `src/lib/api/employeesApi.promotion.test.ts`, `backend/test_promotional_hiring.py`.
**Modify:** `src/lib/api/employeesApi.ts`, `backend/app/routes/employees.py`.

**Interfaces:** `PromotionalAppointmentResult = { applicantId: string; employeeUuid: string; employeeNumber: string; slotId: string; completedAt: string; alreadyCompleted: boolean }`; `completePromotionalAppointment(applicantId: string): Promise<PromotionalAppointmentResult>` throws on rejection. Retain `hireApplicant(applicantId: string): Promise<EmployeeRow>` for existing callers; its promotion branch invokes the transaction and returns the same canonical employee via the compatibility view.

- [ ] Convert the audit's in-memory duplicate-employee reproduction into a regression test. For a promotion, assert zero employee inserts, zero number/email generation, zero password writes, and unchanged original hire date with the backend both reachable and unavailable.
- [ ] Classify from the saved application, not cached UI metadata. Route promotions to Task 4's RPC before the generic external-hire fallback. Missing identity, authorization failures, unsupported/missing RPC, or a timeout must never cause an INSERT fallback. Surface an uncertain response as retryable without claiming failure or success prematurely.
- [ ] Make the Python promotion branch call the same RPC with its server-verified user UUID; remove its obsolete `department_id` update. Never accept an actor UUID from the request body. A rejected transaction is not retried through another privileged path.
- [ ] Test retry after an RPC committed but the following response/view read failed; read the existing result rather than appointing again. Test a normal external applicant to prove its existing hire behavior is retained.
- [ ] Run `npx vitest run src/lib/api/promotionalHiring.test.ts src/lib/api/employeesApi.promotion.test.ts` and `python -m unittest test_promotional_hiring` from `backend` through red/green using the existing environment and mocked clients; commit `fix(promotion): unify frontend and backend appointment paths`.

### Task 6: Preserve accounts and distinguish promotion results from credentials

**Modify:** `src/lib/hiringFlow.ts`, `src/components/GenerateCredentialsPage.tsx`, `src/lib/hiringFlow.columns.test.ts`, `src/components/GenerateCredentialsPage.test.tsx`.
**Create test:** `src/lib/hiringFlow.promotion.test.ts`.

**Interfaces:** extend `ReservedApplicant` with `applicationType: 'job' | 'promotion'` and `employeeNumber: string | null`, mapped from the remote application. Extend `GenerateOutcome` with `promotions: PromotionalAppointmentResult[]`; keep `credentials` exclusively for newly issued external credentials and `failures` for per-row failures. Update all callers/test doubles for the explicit result shape.

- [ ] Test promotion-only, external-only and mixed batches. A promotion must call Task 5's transaction, never call `assignApplicantToSlot` a second time, never generate/upsert a password/account, never send a credential email, and never write a `newly_hired` record that overwrites the employee's original hire information. Existing account/profile reads use the updated `employees` source.
- [ ] Validate the promotion account link remotely before appointment completion inside the transaction. An empty cache is fine; a genuinely missing/ambiguous account is not replaced by a new one. Employee account details remain byte-for-byte unchanged.
- [ ] Report success when either completed promotions or issued credentials exist. Promotion result copy: **"Promotion completed. Your existing employee account is unchanged."** Show the employee number, position and office; no password field for promotions. Print includes only newly issued external credentials; a promotion-only result disables credential printing. Keep the saved modal/table structure and shared components.
- [ ] Handle per-row rejection and thrown batch errors without a stuck loading state or losing unprocessed selections. No completed promotion is described as "No credentials generated" failure. Any non-transactional optional notification/listing failure must not rerun the appointment; no promotion notification email is added in this scope.
- [ ] Run `npx vitest run src/lib/hiringFlow src/components/GenerateCredentialsPage --exclude "**/.worktrees/**" --exclude "**/.claude/worktrees/**"` through red/green; commit `fix(promotion): retain accounts during appointment completion`.

### Task 7: Keep legacy startup synchronization from undoing promotion repairs

**Modify/test:** `src/lib/hiredApplicantSync.ts`, new `src/lib/hiredApplicantSync.promotion.test.ts`.

- [ ] Test that a legacy promotion-related `newly_hired` row cannot create a second employee, set a current promotion to Hired before completion, reset the original hire date, or rewind the employee's current role after a later promotion.
- [ ] Fetch the associated persisted application type before applying those legacy backfills; skip promotions and report ambiguous links rather than assigning new identities. Preserve existing external-hire backfill behavior. Do not run a cleanup/backfill against production or change unrelated startup services.
- [ ] Run `npx vitest run src/lib/hiredApplicantSync.promotion.test.ts` through red/green; commit `fix(promotion): exclude promotions from legacy hire backfills`.

### Task 8: Verify the functional pipeline in an isolated environment

- [ ] Use synthetic Filipino-named employee/applicant fixtures on a local or approved preview database; use a mail sink/mock for external credential sends. No copied live passwords or personal records. Browser tests must point at the isolated database because app startup still contains legacy writes.
- [ ] From an empty-cache browser, sign in to apply, submit for an exact open plantilla, screen and schedule. In a separate interviewer browser, confirm the promotional interview appears in dashboard counts and the applicant list, open its PCPT form, submit and reload to verify completion/history and RSP receipt. Then save promotion categories and written exam, reload, confirm report/For Hiring totals, reserve, revoke once, reserve again, and complete signing.
- [ ] Verify one employee before/after, the same employee UUID/number/original hire date and unchanged portal account, the new assignment, one promotion history event, the target slot filled, other target-slot applicants archived, and other open applications handled by existing triggers. Replaying the same completion must change nothing. Do not reopen the former posting automatically.
- [ ] Sign in again from a clean browser using the existing account and confirm the updated role/office. Run an external-hire regression and a mixed promotion/external batch; verify only the external applicant receives newly issued credentials and credential print output.
- [ ] Exercise rejected score save, stale reservation, concurrent completion, and response loss in the isolated stack. Verify no duplicate/partial transaction and actionable UI feedback.
- [ ] Run the checks below, inspect the whole branch, complete `DESIGN_IDENTITY.md` §16 for touched UI, and record outcomes/remaining limits in the implementation session summary. Mark this plan Done only after the functional acceptance checks pass; otherwise record Blocked with the precise failed gate.

## Risks

- **Security remains unresolved by explicit scope choice.** The legacy login still uses plaintext credentials; existing broad grants can bypass even a correctly guarded new RPC. Functional acceptance must not be described as production-security readiness.
- **A new transaction needs a migration before compatible clients can use it.** If absent, fail with an actionable deployment message; never restore the unsafe promotion INSERT fallback. Rollout is reviewed migration first, compatible client/backend second, with separate push/deployment approval. Rollback must not re-enable duplicate-employee promotion logic.
- **Current data may already contain inconsistent identities/partial hires.** Reject ambiguous links and report them; inventory/repair is a separate approved task. Do not repair the live scheduled promotion as a test.
- **History and triggers interact.** Slot fill archives competitors; Hired withdraws other applications. Tests must verify trigger-induced changes roll back with a failed promotion and that historical successful applications are not rewound.
- **The occupancy redesign remains deferred.** This plan assigns the target and records the promotion; it does not automatically reopen or advertise the former position, rewrite historical filled-slot records, or infer position IDs from duplicate titles.
- **Scoring differences are policy, not cleanup.** Reuse existing promotional conversions and show consistent assessment totals, but do not change weights, thresholds, or the written-exam requirement. Any newly discovered rule conflict that cannot be resolved from current behavior requires user confirmation before implementation.
- **Baseline test noise:** the audit's scoped run had 1,189 passes and one unrelated live-data training-seed count failure (167 expected, 172 received). Recheck the baseline; do not silently fix or suppress that test in this task.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- The targeted Vitest commands in Tasks 1–7, including Task 3A's scheduled-interviewer regressions, with all clients/email calls mocked.
- `npm test -- --exclude "**/.worktrees/**" --exclude "**/.claude/worktrees/**"` (nested worktrees must not contaminate this branch's run).
- `python -m unittest test_promotional_hiring` from `backend` using the existing Python environment.
- Local/preview database transaction tests, including two-session concurrency and rollback; discover the installed CLI flags with `--help` rather than assuming them.
- `npm run check:migrations`
- `npm run build`
- Isolated browser acceptance from Task 8, plus mobile/tablet/desktop and keyboard/error-state checks for the touched modal/table/login surfaces.
- Read-only post-deployment verification only after separately approved deployment; any live submission/appointment/email still requires explicit approval.

## Plan review and execution gate

Plan and exact model pair approved in chat. Follow the delegation ledger and task checkboxes for execution state; approval does not authorize live database changes, sends, pushes or deployments. Stop affected work if the required isolated database or model route is unavailable; report the precise blocker rather than substituting production access or another model.
