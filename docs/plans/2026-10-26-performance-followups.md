---
title: Reduce remaining Supabase fetch fan-out and polling
date: 2026-10-26
status: Blocked
summary: Batch dashboard succession counts, remove duplicate recruitment reads, scope refreshes to active sections, and reduce redundant polling without changing displayed results.
---

## Goal

Make the RSP dashboard, Job Posts, applicant tracker, and interviewer portal issue fewer repeated requests while preserving their counts, matching rules, and update behavior. Ship one measured change at a time.

This follows [Batch succession candidate loading per department](2026-10-26-succession-batch-fetch.md), which is already upstream. That implementation is not repeated here. Publishing this plan did not authorize implementation, deployment, or database changes. The user approved the remaining polling work on 2026-10-27 after the decisions below; no push, deployment, or database change is authorized.

### Approved execution scope (2026-10-27)

- Steps 1–3 are already complete per the user; do not repeat or modify them in this run.
- Implement step 4 first: a named 15-second visible-tab fallback, paused while hidden, with coalesced catch-up on return/reconnect. Preserve realtime, post-upload refresh, last-good data on transient failures, and stale-search protection. Refresh attachments and slot outcomes even when the record timestamp/status is unchanged.
- Evaluate step 5 separately. A 30-second fallback is approved only after actual realtime delivery and independent server-side denial are verified. Keep polling in hidden interviewer tabs and check immediately on focus/return/reconnect; browser timer throttling prevents a hard hidden-tab latency guarantee. Until the gates pass, leave the existing three-second check unchanged.
- Keep new/moved reads and subscriptions in `src/lib/`. Use a tracker-scoped refresh coordinator, not a new global caching framework. Share attachment rows between document display and resubmission flags where possible. Ignore obsolete requests after a new search, row switch, upload invalidation, or unmount.
- Add fake-timer/request-budget and race regression tests, then type-check, lint, the full suite, and a build. Record live checks separately from mocked checks. One read-only independent reviewer is approved using `openai/gpt-6.1-sol#high`.
- Read-only preflight: `raters` is not in `supabase_realtime`; `evaluations` has RLS disabled and authenticated INSERT/UPDATE grants. Step 5 cannot pass its current gates. Do not change publication/policies here; record that blocker separately.

## Approach

Reuse the existing succession batch API, consolidate each recruitment dataset behind one service-layer loader, and make refreshes depend on the active section and the data that changed. Keep realtime updates, explicit post-write refreshes, and visibility catch-up; use polling as a bounded fallback rather than a second continuous refresh system.

All new or moved Supabase calls belong in `src/lib/`, not components. Preserve existing authoritative-empty-result and fetch-failure behavior. Share in-flight reads, but do not let a pre-mutation request satisfy a refresh that must observe a completed write. Keep data scoped to the current identity and clear identity-sensitive caches on session changes.

### Evidence and limits

The planning-session benchmark invoked `getSuccessionDashboardOverview` from a local Vite-served API module against the configured live database: 33 critical positions, 453 REST requests, 17.46 seconds. It measured the API call, not a signed-in dashboard click-through or a production build. Rebaseline current upstream before implementation because the checkout and data can change.

The other request estimates below come from reading effects, event listeners, and polling intervals. They are hypotheses to verify, not measured speedups. Concurrent mounts, cache events, realtime availability, and dataset size affect the actual totals. All proposed post-change timings are targets, not promises.

## Steps

### 1. Batch dashboard succession counts

**Files:** `src/lib/api/succession.ts`, `src/modules/admin/RspDashboardOverview.tsx`, and their tests.

`getSuccessionDashboardOverview` still calls `listAutoSuccessors` once per critical position with four workers. The department expansion is batched, but this overview caller still repeats the shared reads.

- Replace the worker loop with one `listAutoSuccessorsForPositions(allIds)` call and derive each count from `qualified.length`.
- Preserve the overview return shape, department labels, incumbent details, and per-position failure semantics: unavailable counts remain `null`, not zero.
- Retain department scope, incumbent exclusions, title ranking, manual-candidate behavior, and score calculations in the existing evaluator. Do not create a second count algorithm.
- Remove `OVERVIEW_ENGINE_CONCURRENCY` only if the worker loop was its last use.

**Target:** roughly 15-17 REST requests and around two seconds for the planning-session dataset, subject to measurement. The completed department batch took about 1.2 seconds for ten positions; a larger batch may read more rows or require additional chunks.

**Acceptance:** all 33 planning-session positions, or all positions in the current dataset, retain identical counts and failure behavior; request count no longer grows by a full shared fetch per position. Check query-length limits and pagination before treating a larger batch as complete.

### 2. Scope RSP dashboard reads and realtime refreshes

**Files:** `src/modules/admin/RSPDashboard.tsx`, `src/lib/recruitmentData.ts`, relevant service helpers, and tests.

`RSPDashboard` serves the overview, accounts, succession, and reports routes. Its unconditional load reads postings, legacy jobs, applicants, raters, and evaluations. The bundle's postings result is discarded before another canonical postings fetch; boot-time cache loading can add another read. Applicant and evaluation events can reload the entire bundle even on an unrelated section.

- Map each section's real data dependencies before changing the effect. Do not assume a route needs every dataset or that succession needs recruitment postings.
- Split the bundle into section-appropriate loaders without rewriting the dashboard component.
- Remove discarded reads and reuse the canonical postings loader, including its plantilla-slot mapping. Add in-flight deduplication where boot, mount, and refresh calls overlap.
- Scope subscriptions to sections that consume the data. Refresh only the affected dataset and derived views; do not reload unrelated tables on each realtime event.
- Keep explicit invalidation after writes, empty database results authoritative, and error handling distinct from an empty successful response.

**Target:** eliminate the unused applicant, rater, evaluation, and legacy-job reads on succession visits; eliminate duplicate postings reads where they overlap. The earlier estimate was about four fewer requests on succession entry, but establish the actual baseline first.

**Acceptance:** route-specific network captures show only required reads; overview KPIs, accounts, reports, and succession still populate correctly after direct navigation and client-side navigation. Applicant events must not trigger recruitment bundle reads on succession-only views.

### 3. Consolidate Job Posts applicant refreshes and route events

**Files:** `src/components/JobPostingsPage.tsx`, `src/App.tsx`, applicant and slot-link service helpers, plus tests for `NewlyHiredPage` and `RaterManagementPage`.

Job Posts independently fetches applicants and slot links for raw rows and for `resolveLiveApplicants`. Mount, postings-cache updates, focus, visibility, storage, and route events can repeat the work. `App.tsx` dispatches `cictrix:route-activated` immediately and again after 120 ms; Newly Hired and Rater Management listen too.

- Load applicants and applicant-slot links once per refresh and derive the raw list, card counts, and mapped applicant list from the same snapshot.
- Keep slot-link precedence, title and office matching, status normalization, and existing fallback behavior unchanged.
- Route refresh triggers through one coordinator that coalesces simultaneous triggers and prevents overlapping loads or stale responses replacing newer data.
- Replace the double route event with one reliable activation path after listeners are ready. Initial page loading must not depend on catching an event dispatched before mount.
- Preserve focus, visibility, storage, and explicit post-write catch-up without turning every cache update into another fetch.

**Target:** one applicants read plus one slot-links read per logical refresh, rather than repeated pairs. The earlier code-based estimate was up to eight mount-related reads, possibly ten with boot cache updates; verify the actual count before claiming a reduction.

**Acceptance:** counts and applicant lists remain equal to the baseline. Job Posts, Newly Hired, and Rater Management refresh after direct navigation, Back/Forward, and same-route query changes without requiring the 120 ms duplicate event.

### 4. Make applicant tracker polling a fallback

**Files:** `src/modules/applicant/ApplicationStatusPage.tsx`, tracker service helpers, and tests.

The tracker polls the record and attachments every two seconds while also subscribing to both datasets. That timer alone schedules about 60 reads per minute per open tab and continues when hidden. Slot-outcome reads can add requests when record status or timestamps change.

- Keep realtime as the primary update path and retain immediate refresh after search and upload.
- Approved fallback (2026-10-27): a named 15-second interval while visible. Do not lengthen it to 30 seconds in this run.
- Pause fallback polling when hidden and perform one coalesced catch-up refresh on return or reconnect.
- Deduplicate overlapping realtime and poll refreshes; protect against stale results from an earlier applicant search.
- Keep record, attachment, and plantilla-outcome updates correct. A record-only refresh must not miss an attachment or slot-link change.

**Target:** reduce timer-driven record and attachment reads from about 60/minute to eight/minute at 15 seconds, or four/minute at 30 seconds; zero timer-driven reads while hidden. Realtime-triggered reads and visibility catch-up are additional, not included in those totals.

**Acceptance:** status changes, attachment review, re-upload, and per-slot outcomes update without manual reload. Force realtime failure to verify fallback freshness. Hidden tabs stop polling and catch up on return.

### 5. Reduce interviewer access polling without weakening revocation

**Files:** `src/App.tsx`, rater-access service helpers, and access-enforcement tests.

Interviewer routes check rater access every three seconds, approximately 20 timer-driven reads per minute, plus focus checks. Same-browser revocation also has an immediate local-state path.

- Preserve immediate same-browser revocation and focus checks.
- Verify an identity-scoped realtime subscription can observe access changes under the actual permissions. Realtime is an invalidation signal, not a replacement for server-side authorization.
- Approved conditional fallback (2026-10-27): 30 seconds only after testing actual realtime delivery, realtime failure, and independent server-side denial. Continue checks while hidden and immediately on return/focus/reconnect; background browser throttling prevents a hard hidden-tab guarantee. Until the gates pass, keep the existing three-second check.
- Prefer an identity-scoped access read where existing email normalization and permissions permit it; do not fetch the entire roster merely to check one interviewer.
- Preserve current behavior on transient failures and ensure subscription and timer cleanup on logout or identity changes.

**Target:** one or two fallback reads per minute instead of 20, only if the agreed revocation guarantee is maintained.

**Acceptance:** deactivate and reactivate access from the same browser and a second browser; test realtime connected, disconnected, hidden-tab return, logout, and identity switch. Confirm unauthorized operations remain denied server-side independently of the UI check.

### Delivery order

Implement step 1 alone first, then step 2, then step 3. Steps 4 and 5 form the polling follow-up, but each interval decision and acceptance test remains separate. Keep focused commits and PRs; do not start later phases merely because an earlier PR was approved.

No database migration is currently planned. If correct realtime delivery requires publication, policy, or schema changes, stop and propose that separately rather than applying live SQL. Region relocation, broad `select('*')` replacement, unrelated UI redesign, and a new caching framework are out of scope.

## Risks

- A shared cache can hide writes, reuse an earlier identity's data, or let an old response overwrite a new result. Use explicit invalidation, scoped keys, and stale-response protection; test failed and empty reads separately.
- Narrowing dashboard loads can leave stale state when React reuses the component across routes. Verify both entry and transitions between all affected sections.
- Removing the delayed route event can miss listeners mounted later. Components must own their initial load; test all three known listeners.
- Realtime delivery depends on permissions, connectivity, and database configuration. Keep a tested fallback and do not silently widen access or assume subscription success means delivery works.
- Longer polling can delay applicant updates or interviewer revocation. Agree on latency before changing intervals; preserve server-side authorization.
- A larger batch can hit URL, response-row, or pagination limits. Measure the actual dataset and verify complete results, not just fewer requests.
- The quoted benchmark is historical evidence from a local API invocation, not proof of current production UI speed. Repeat it on the implementation baseline and after each phase.

## Checks to run

For this documentation-only PR:

- Validate required plan frontmatter, internal links, and the diff.
- Regenerate `docs/plans/index.html` and confirm this plan is listed.
- Confirm no application code, environment files, or migrations are included.

For each later implementation PR:

- `npx tsc --noEmit`
- `npm run lint`
- Targeted Vitest coverage for the changed loader, component, or timer behavior, then `npm test`.
- Capture before/after REST request count, elapsed time, and relevant response sizes using the same dataset, identity, route, and action. Increase the resource timing buffer if using PerformanceResourceTiming so requests are not silently omitted.
- Compare returned counts and displayed data; test failure, authoritative empty results, overlapping triggers, stale responses, and post-write invalidation.
- Complete a signed-in UI pass on affected routes, including hidden-tab return, navigation, and realtime-disconnected fallback tests.
- Record measured outcomes and deviations in the plan and session summary; regenerate the plans dashboard. Do not mark implementation Done based only on this plan being merged.

## Execution results (2026-10-27)

- Steps 1–3 are complete per the user and were left unchanged.
- Step 4 implementation: `src/lib/applicantTrackerRefresh.ts` owns the visible 15-second fallback, realtime subscription, catch-up events, serialization, invalidation and cleanup. The page keeps only search/row/upload state. One paginated attachment snapshot supplies document display and action-required flags for every application. Stable ordering and exact counts avoid truncation even below the requested page size. Independent slot/link reads run on each refresh; checked failures retain last-good outcomes. Search, row and upload-attempt generations reject obsolete responses, including React StrictMode effect replay.
- Fake-clock verification: four refreshes per visible minute, one record and one document service read each, plus one link and one slot read each: 16 steady-state reads/minute for single-page results, not eight total. Eight is only the record/document subset; pagination, realtime and catch-up can add reads. Hidden fallback timers make zero reads. No live timing or byte-volume improvement is claimed.
- Step 5 preflight failed: `raters` is not published to `supabase_realtime`. `evaluations` has RLS disabled and authenticated INSERT/UPDATE grants; `raters` policies also allow unconditional public updates. Server-side revocation denial therefore cannot be certified. The three-second interviewer check and `src/App.tsx` remain unchanged. Publication/policy fixes require separate approval; see [Supabase RLS advisory guidance](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public).
- Live before/after and delivery tests are blocked: the configured browser client returned HTTP 401 for the reference resolver and tracker view. The branch-only suite also logged the server error `Legacy API keys are disabled` from existing live-reading tests. Use a current publishable key for normal local access; do not re-enable disabled legacy keys as a workaround. No credentials, auth settings, policies, publications or live records were changed. The temporary read-only harness was removed. A successful normal-access UI/network pass is still required before step 4's live acceptance is complete.
- Independent review found missing slot-failure handling, attachment pagination, and an A → B → A upload race; fixes and focused regression tests were added. Follow-up review found no remaining actionable issues. Type-check, lint, all 734 tests across 85 files in the isolated branch-only suite, and `build:verify` pass. The overall plan remains Blocked on live acceptance and step 5. Details are recorded in the [session summary](../session-summaries/2026-10-27-tracker-polling-summary.md).
