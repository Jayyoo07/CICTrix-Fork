---
title: Publish Summary of Ratings from the previous completed semester, per department
date: 2026-10-27
status: Done
summary: Rewrite the Summary of Ratings source so each department shows its most recent ended semester in which every required employee has a fully approved IPCR, with the official rating and the four competency blocks read from that same semester. Adds a frozen per-semester roster, a department publication record, a durable competency job queue, and honest pending states.
spec: docs/plans/2026-10-27-sor-competency-breakdown.md
---

## Goal

Every department on the PM Summary of Ratings shows one semester and one set of results: its most recent semester that has ended and in which every employee who owed an IPCR for that department submitted targets, received supervisor-approved final ratings, and has no missing indicator scores. The headline rating, the displayed period, the assessment summary, the recommended training, the competency cards, and the target drill-down all come from that same semester.

Employees whose IPCR for that semester is incomplete do not appear, and no older record is substituted for them. Departments move independently: one office can be on July–December 2026 while another is still on January–June 2026. Competency analysis that is still running, has failed, or has never been configured shows an explicit state instead of a blank panel or invented numbers.

This extends `docs/plans/2026-10-27-sor-competency-breakdown.md`, which added the competency tag to the mirror and made a missing required level renderable. It supersedes the read path in that plan, not its data model.

## Approach

### Why the current read path cannot satisfy the rule

`SummaryOfRatings` calls `getIPCRRecordsFromGapView`, which reads `v_competency_gap_analysis`. That view has three properties that make the agreed rule impossible to implement on top of it:

1. It has no `rating_period` in its select list or group by, so it aggregates every semester an employee has ever been rated in. This is why the page shows "All rated periods".
2. It derives `required_proficiency` from `qualification_standards` with `COALESCE(..., 3.0)`, so an unconfigured competency silently reads as a 3.0 requirement. That contradicts the agreed rule that a missing requirement stays "Not configured" and is neither a pass nor a gap.
3. It keys the employee on `employee_num`, not the employee id, and carries no department-scoped completeness, so nothing in it can answer "is this department's semester finished".

The official rating is also in the wrong place today: the page averages competency-group possessed scores, while approval writes the weighted official score to `performance_evaluations.final_score` (272 rows, all scored, verified 2026-10-27). Two different numbers for the same IPCR.

The read path is therefore replaced, not patched. `v_competency_gap_analysis` stays for consumers that already depend on it; this page stops reading it.

### Data model

Three new tables, all additive.

`ipcr_semester_roster` — who owed an IPCR for one cycle in one department. Columns: `id uuid`, `cycle_id integer`, `employee_id uuid`, `department_name text`, `owes_ipcr boolean default true`, `excluded_reason text`, `created_at`. Unique `(cycle_id, employee_id)`.

Membership is written once per cycle and then frozen, because the agreed rule is that later hires and transfers must not change an old semester's requirement. The snapshot is built on the first evaluation request after the cycle's end date and includes every employee with `date_hired <= cycle.end_date` who is in that department and active, plus anyone who already has a `target_settings` row for the cycle. Transfers across departments are not historically tracked in this schema, so the roster records the department as it stands at snapshot time; that limitation is stated in the migration comment rather than papered over.

`ipcr_department_publication` — what a department currently shows. Columns: `id uuid`, `department_name text`, `cycle_id integer`, `status text` (`published` | `correction_pending`), `required_count integer`, `approved_count integer`, `assessment_complete_count integer`, `published_at timestamptz`, `computed_at timestamptz`. Unique `(department_name, cycle_id)`.

A row is written only when a department qualifies for a cycle. Publication only ever advances to a newer cycle, so a later correction cannot roll the page back to an older semester. When a published cycle stops qualifying because a record was reopened, `status` becomes `correction_pending` and the published data stays readable.

`competency_assessment_runs` — the durable work queue. Columns: `id uuid`, `target_setting_id uuid`, `employee_id uuid`, `cycle_id integer`, `stage text` (`matching` | `assessing`), `status text` (`pending` | `running` | `complete` | `failed`), `attempts integer default 0`, `last_error text`, `requested_at timestamptz`, `started_at timestamptz`, `finished_at timestamptz`. Unique `(target_setting_id, stage)`.

Two triggers enqueue work, because the stages happen at different approvals:

- `target_settings.status` becomes `approved` → enqueue `matching`.
- `target_settings.phase2_approved_at` becomes non-null while `status = 'approved'` → enqueue `assessing`.

`on conflict (target_setting_id, stage) do nothing` keeps a re-approval from duplicating work. A failed run is retried by resetting `status` to `pending` and incrementing `attempts`, capped at 3.

### Trigger and processing flow

Matching after Phase 1 approval only records which competencies the approved targets demonstrate. It never writes a possessed score, because Phase 1 has no performance scores.

Assessment after Phase 2 approval reuses the existing aggregation in `backend/app/routes/competency_assessment.py` — the confidence-weighted mean of the matched targets' quality, efficiency, and timeliness scores — and writes `employee_competencies` for that cycle plus `employee_competency_summaries`. That code is already cycle-scoped and already upserts on `(employee_id, competency_id, cycle_id)`; the plan does not re-derive the math, it moves the existing route behind the queue.

### Read path

New module `src/lib/api/sorSemesterSource.ts` owns the page's data:

- `getDepartmentSourceSemester(departmentName)` calls the SQL function that evaluates and returns the publication row, so the client never decides eligibility.
- `getPublishedRecords(departmentName, cycleId)` returns `IPCRRatingRecord[]` for that cycle: `numericalRating` from `performance_evaluations.final_score`, `period` from `performance_cycles`, competencies from `employee_competencies` unioned with the Competency Map for the position, recommendations from `employee_competency_summaries`, and `assessmentState` from `competency_assessment_runs`.

`summaryOfRatings` keeps its department landing, search, sort, KPI, and drill-down behaviour; only the record source and the period label change.

### Rejected alternatives

- **Keep `v_competency_gap_analysis` and add a period filter.** The view has no period and its `required_proficiency` fallback of 3.0 is the bug the rule forbids. Adding a filter would still leave a silently assumed requirement.
- **Publish per employee instead of per department.** Rejected by the agreed rule: a department's results must be coherent, so one employee's late IPCR cannot make their row newer than their colleagues'.
- **Trigger the Gemini calls from the browser after approval.** Approval would then depend on a slow third-party call, and a closed tab would lose the work. The queue table makes the work durable and retryable.

## Steps

Each step ends with a verifiable state. Migrations are created with `npx supabase migration new <name>`; never hand-named. Nothing here applies a migration by hand.

### 1. Roster snapshot

- [x] Migration `ipcr_semester_roster` with the columns and unique key above, plus index on `(cycle_id, department_name)`.
- [x] Function `public.build_ipcr_semester_roster(p_cycle_id integer) returns integer` that inserts the frozen membership described in **Data model** and returns the row count. It inserts nothing if any row already exists for that cycle.
- [x] Verify with read-only SQL that the function returns a plausible count for cycle 6 and that a second call inserts zero.

### 2. Publication evaluation

- [x] Migration adding `ipcr_department_publication` and `public.evaluate_sor_publication(p_department text) returns table (cycle_id integer, status text, required_count integer, approved_count integer, assessment_complete_count integer)`.
- [x] The function implements the eligibility test in **Data model**, walks cycles newest-first, refuses to move backwards, and records `correction_pending` when a published cycle stops qualifying.
- [x] Verify with read-only SQL: for a department with no complete semester it returns no rows; for a synthetic department in a rolled-back transaction it returns the expected cycle.

### 3. Assessment queue

- [x] Migration adding `competency_assessment_runs` and the two enqueue triggers.
- [x] Verify by updating a `target_settings` row inside a rolled-back transaction and reading back the queued row.
- [x] Unit-test the enqueue condition (re-approval does not duplicate; Phase 2 enqueue requires `status = 'approved'`).

### 4. Backend stage functions

- [x] Split `assess_employee_competencies` so the matcher step is callable alone (`match_employee_targets(employee_id, cycle_id)`) and the scoring step (`assess_employee_competencies`) calls it when the cycle has no matches. No behaviour change for existing callers.
- [x] Keep the existing aggregation and the cycle-scoped upsert; add a test that a second run for the same cycle updates rather than duplicates.

### 5. Queue runner

- [x] `backend/run_competency_queue.py`: claims one pending run at a time, dispatches on `stage`, marks `complete` or `failed` with `last_error`, retries up to 3 attempts, and supports `--once`, `--limit`, `--dry-run`.
- [x] Extend `backend/run_competency_batch.py` to enqueue instead of calling the route directly, so the manual path and the automatic path share one queue.
- [x] Test with a fake Supabase client: claim order, retry cap, and terminal failure are asserted without network calls.

### 6. Scheduling

Precondition, checked before this step is started: the FastAPI app is actually reachable in production. Today the front end calls `/api` relative (`VITE_API_BASE_URL` is unset in `.env.example`), and no screen calls the assess endpoint, so a live backend is unconfirmed. If it is not deployed, the queue can only be drained by an operator running `run_competency_queue.py`, and that must be said plainly rather than shipped as an automatic system.

- [x] Add `POST /api/competency-assessment/queue/drain` guarded by a shared secret from `backend/.env`, which runs the same claim loop for a bounded number of jobs.
- [x] If the backend is deployed: enable a scheduler for that endpoint (Supabase `pg_cron` + `pg_net`, or the host's scheduler) and document the chosen mechanism in `docs/ipcr-data-map.md`.
- [x] If it is not deployed: document the operator drain in the same file and keep the "analysis pending" state as the user-facing truth until a runner exists.
- [x] Verify: approving a test IPCR enqueues a row, and whichever drain path was chosen moves it to `complete`.

### 7. Read path

- [x] New `src/lib/api/sorSemesterSource.ts` with `getDepartmentSourceSemester` and `getPublishedRecords` as described in **Read path**.
- [x] Vitest cases: a department with a published cycle returns that cycle; a department with no qualifying semester returns none and the page shows the "no completed semester" state; an employee with `final_score` shows that number as the headline.

### 8. Page switch

- [x] `SummaryOfRatings.tsx` reads through the new module, drops `getIPCRRecordsFromGapView`, and labels the period from the published cycle instead of "All rated periods".
- [x] Department rows show the department's semester, and a department on an older semester is visibly marked.
- [x] Vitest cases for the department landing: mixed semesters across departments do not leak into one another; `computeKPIs` and `groupByDept` still receive one semester.

### 9. Staged panel states

- [x] `CompetencyGapPanel.tsx` renders four explicit states instead of one empty message: analysis pending, analysis failed (with retry when the viewer may retry), never assessed, and not configured for the position.
- [x] Unchanged: "Required level not configured" for a competency with no Map row, and the gap badge only when both a score and a requirement exist.

### 10. Corrections

- [x] When `evaluate_sor_publication` reports `correction_pending`, the page keeps the published numbers and adds a "Correction pending" marker naming the affected cycle.
- [x] Vitest case: reopening one employee's record leaves the published numbers on screen and sets the marker; re-approval restores normal display only after the department qualifies again.

### 11. End-to-end verification

- [x] Seed one department in a rolled-back transaction: complete half the roster, confirm no publication; complete the rest, confirm publication of the newer cycle.
- [x] Manual pass: PM Summary of Ratings → a department with a finished semester shows that semester's rating and four blocks; a department without one shows the explicit no-completed-semester state.

## Risks

- **Roster snapshot accuracy.** Transfers and department renames are not historically recorded, so a snapshot taken now records today's department. Mitigation: the snapshot is frozen at first evaluation after the cycle ends, the source columns are documented in the migration, and an `excluded_reason` column lets a PM correct a wrong row without editing code.
- **A department can stall forever.** One employee who never starts an IPCR keeps the department on the older semester indefinitely. That is the agreed rule, but it needs to be visible: the landing row must state what is outstanding, not just show an old date.
- **Two rating numbers.** The page switches to `performance_evaluations.final_score` while other screens may still average competency scores. Spot-check the same employee on the archive and the SoR before calling this done.
- **Queue starvation.** If nothing drains the queue, approvals enqueue work that never runs. The retry button and the "analysis pending" state must survive a permanently idle scheduler without looking broken. See step 6: whether an automatic drain exists at all depends on the backend being deployed.
- **Backend reachability is unproven.** The plan's automatic path assumes a running FastAPI service. If production has none, "runs automatically" reduces to an operator script, and the plan must say so instead of implying automation that does not exist.
- **Gemini cost and latency.** Two stages per eligible IPCR, times every employee and semester. Draining is bounded per invocation so a backlog cannot turn into an unbounded bill in one run.
- **Migration order.** The roster, publication, and queue tables must exist before the triggers and functions that reference them; the front end must not deploy before the functions, or the page errors on a missing RPC.

## Checks to run

- `npm run check:migrations` after each migration
- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `python backend/test_competency_assessment_math.py` and the new queue tests
- Read-only SQL: roster count for cycle 6, publication rows per department, queue rows by status
- Manual pass through PM Summary of Ratings for a department with and without a completed semester
- `DESIGN_IDENTITY.md` §16 checklist for the panel state and period-label changes
