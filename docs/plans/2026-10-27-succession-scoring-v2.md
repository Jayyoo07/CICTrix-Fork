---
title: Implement reviewed position-specific succession scoring
date: 2026-10-27
status: In Progress
summary: Build and verify the agreed fixed-weight scoring model separately from current results, then integrate position-specific relevance reviews and qualification visibility after the authorization release gate is satisfied.
---

# Succession Scoring V2 Implementation Plan

> For agentic workers: execute the checkboxes in order. One GPT-6.1 Sol High implementer and one GPT-6.1 Sol High reviewer are authorized; reuse those sessions for fixes. Do not spawn additional agents.

**Goal:** Produce trustworthy, position-specific succession scores without changing recruitment or IPCR calculations or treating incomplete reviews as qualification failures.

**Architecture:** A separate, pure V2 evaluator accepts explicit position requirements, reviewed evidence, and one scoring date. Keep the current application path unchanged during preparation. Persisted relevance reviews and application cutover are dependent on verified office-scoped server authorization; browser session flags are not authorization.

**Tech stack:** React 18, TypeScript, Vitest, Supabase Postgres, Vite.

**Spec:** The approved scoring design and the subsequent execution decisions are recorded in the Approach section below; this file is the single design/plan record.

## Goal

Use fixed maximums of performance 30, experience 20, training 20, education 15, and eligibility 15. Rank only candidates whose minimum qualifications and evidence reviews are complete. Confirmed qualification failures are hidden from Succession Planning; incomplete relevance reviews remain visible without final score, rank, or readiness. Do not change recruitment scoring, the shared IPCR reader, or unrelated L&D recommendations.

## Approach

### Approved rules

- Relevant City Hall experience: `min(relevantYears / (2 * requiredYears), 1) * 20`. Do not substitute hire-date tenure, position level, progression, or all government service for relevant City Hall evidence.
- Relevant training: `min(relevantHours / (2 * requiredHours), 1) * 20`. Internal and external hours receive identical treatment; no recency/category bonuses.
- Education: relevant qualifying bachelor's 3, master's 9, doctorate/PhD 15, independent of distance above the minimum. The posting still controls qualification. MD, DMD, JD, LLB, and LLM require an explicitly approved mapping; do not guess a point value or qualification equivalence. These fixed degree points supersede the original proposed posting-specific degree range.
- Eligibility: distinct, recognized, position-relevant, unexpired credentials: none 0, one 7.5, two or more 15. A null expiry means non-expiring; expiry on the scoring date is valid. The existing type-points configuration does not set V2 points.
- Performance: preserve the latest completed IPCR reader; `rating / 5 * 30`, missing rating 0. Performance is not a minimum-qualification gate. Do not invent a readiness label for an unrated candidate; preserve the existing no-current-IPCR readiness behavior.
- Zero experience or training minimum means `Scoring rule needed`; final total/rank remain unavailable until policy explicitly resolves it. Missing/invalid requirements are not zero and also block final scoring.
- Office Account users review position-specific relevance; there is no added HR approval queue. Unreviewed evidence is not implicitly relevant or irrelevant.
- Confirmed minimum failure takes precedence over incomplete review and hides the candidate, including a manual nomination. Unreviewed evidence alone cannot prove a minimum failure.
- `Needs review` candidates remain visible with no final score/rank/readiness. Configuration-blocked candidates are also visible with `Scoring rule needed`, not a fabricated zero.
- Ready candidates use competency coverage for readiness where requirements exist (100% Ready Now, at least 50% Ready in 1–2 Years, otherwise Developmental); otherwise retain score thresholds 80/60. Missing performance retains no readiness label.
- Staged rollout: legacy remains active until V2 is validated, authorized review persistence is available, and activation is approved. Never mix V1 and V2 points within one ranked pool.
- The latest user instruction replaces the push-only request with execution and review. No push, deployment, upstream PR, or live DB write is part of the immediate execution.

### Implementation decisions (not new scoring policy)

- Use `src/lib/api/successionScoringV2.ts` for the pure engine and its public types. Single new files, not a new module directory. Leave V1 helpers intact for comparison and recovery.
- Return a discriminated result: `excluded`, `needs-review`, `configuration-needed`, `scored`. Only `scored` has a numeric total; only a ranked scored result has a rank. Partial component values are not final totals.
- Validate all numbers as finite and nonnegative; IPCR must be within 0–5. Invalid evidence blocks review completion instead of being silently coerced or clamped into plausible evidence.
- Evaluate on one explicit ISO date supplied by the caller. Sum the union of approved City Hall work intervals, including both endpoint days, capped at the scoring date; divide by 365.25 for years. No intermediate rounding before qualification checks. Reject invalid/backwards dates; future completed evidence cannot earn points.
- Record-ID duplicates are counted once. Duplicate/conflicting records cannot be resolved by whichever row comes first. For training, use normalized certificate identity when available, otherwise matching title/provider/dates; flag inconsistent duplicates for review. Eligibility uniqueness is by normalized recognized type, consistent with the existing anti-duplicate rule; duplicate renewal rows represent one eligibility.
- Round each component to two decimals, then sum the rounded components. Tie-break by IPCR contribution descending, normalized name ascending, then employee ID. Pending candidates do not occupy ranked slots.
- Proposed review persistence stores the source record ID, position ID, employee ID, relevance decision, evidence snapshot/fingerprint, requirements fingerprint, verified actor, and server timestamp. Editing/deleting evidence, moving offices, revoked access, or changing requirements invalidates affected reviews. Audit writes and decisions must be atomic; stale submissions are rejected, not last-write-wins.

### Observed release blockers

Read-only live catalog checks on 2026-10-27 confirmed RLS is disabled and anon SELECT/INSERT/UPDATE are granted on `critical_positions`, `succession_candidates`, `employee_work_experience`, `employee_training`, and `employee_eligibility`. `office_role_assignments` has RLS and no anon read/write grants. Its inspected columns have no `auth_user_id` link. The existing security remediation plan is Draft; do not execute that unrelated system-wide rebuild under this request.

**Gate:** Do not persist or activate supposedly authorized Office Account relevance reviews while verified identity and server-side office-scoped permissions cannot be demonstrated. Build/test the independent engine now; hold integration requiring that trust boundary. Do not solve this by opening anon policies, trusting a browser-provided actor/office, or exposing a service-role key. A migration alone cannot secure the source evidence while leaving it anonymously editable.

## Global Constraints

- Fixed maximums: performance 30, experience 20, training 20, education 15, eligibility 15.
- No changes to recruitment scoring, shared IPCR arithmetic, or unrelated training recommendations.
- All external calls live in `src/lib/`; components never call Supabase directly.
- No live DB mutations, hand-applied migrations, pushes, or deployment during this execution.
- Create any future migration with `npx supabase migration new <name>`; apply only through the normal PR migration workflow.
- Use `DESIGN_IDENTITY.md` and token classes for UI; preview new review/configuration surfaces before implementation.
- Preserve user changes and the legacy active scoring path during staged preparation.
- One GPT-6.1 Sol High implementer and one GPT-6.1 Sol High reviewer; no nested delegation.

## Review Focus

1. A confirmed failure plus another unknown review must remain excluded; an unknown review alone must not exclude.
2. Duplicate and overlapping evidence, expiry boundaries, and invalid dates must not inflate points or turn errors into zero.
3. Editing source evidence/requirements or revoking an office assignment must invalidate reviews before reuse.
4. Anonymous/cross-office callers must not write reviews or fabricate reviewer identity/audit entries.
5. Staging must not change current scoring, L&D callers, dashboard counts, or recruitment behavior before cutover.

## Steps

### Task 1: Implement and verify the independent V2 evaluator

**Files:** Create `src/lib/api/successionScoringV2.ts` and `src/lib/api/successionScoringV2.test.ts`. Do not modify V1 runtime files.

**Interfaces:** Export typed position requirements, reviewed evidence inputs, `evaluateSuccessionV2(input): SuccessionV2Result`, and `rankSuccessionV2(results): RankedSuccessionV2Result[]`. Input must include candidate identity/name, scoring date, explicit review decisions for each evidence category, IPCR, and competency coverage. Results distinguish the four states above, with reason codes and audit-friendly component inputs. Signature details may use a cohesive options object; avoid loose `any`, silent numeric coercion, and unsafe non-null assertions.

- [ ] Write failing tests for the exact agreed examples: 4 relevant years vs 2 required = 20; vs 4 required = 10; 40 relevant hours vs 40 required = 10; 80+ vs 40 = 20; bachelor's 3/master's 9/PhD 15; master meets master's minimum for 9; bachelor fails master's minimum; eligibility 0/7.5/15 with two-or-more cap; IPCR 5 = 30 and missing = 0.
- [ ] Add tests for irrelevant/external work exclusion, internal/external training equality, overlaps, duplicates including inconsistent renewals/certificates, missing/invalid/negative/NaN/infinite values, ISO date validation, future evidence, expiry today/yesterday, unsupported professional degrees, and zero/missing requirements.
- [ ] Add tests for all result states, precedence of known failure over unknown evidence, manual nominations never bypassing failure, no final totals/ranks/readiness on pending states, competency readiness versus score readiness, deterministic ties, stable batch rankings, and two-decimal rounding.
- [ ] Run the focused new test file; record expected RED output before implementation.
- [ ] Implement the smallest pure engine satisfying these cases; no Supabase, UI, feature flags, or invented equivalence mappings.
- [ ] Run focused tests, all current succession tests, type-check, lint, and full test suite once before commit. Keep pure engine disconnected from live application imports.
- [ ] Self-review, commit as `feat(succession): add staged fixed-weight scoring engine`, and report exact evidence. Controller dispatches the authorized reviewer; fix Important/Critical findings using the same worker/reviewer sessions.

### Task 2: Establish authorized evidence and review persistence (gated)

**Files:** Expected `src/lib/api/successionReviews.ts`, `src/lib/api/successionReviews.test.ts`, generated migration in `supabase/migrations/`, and focused database authorization tests in `supabase/tests/`. Exact auth helpers must come from the approved identity work, not invented metadata.

**Consumes:** Task 1 reviewed evidence types and a demonstrated authenticated Office Account identity linked to an active office assignment.

**Produces:** `loadSuccessionReviews(positionIds, scoringDate)` and `saveSuccessionReview(input, expectedRevision)` with verified server attribution and atomic audit. Source reads must preserve IDs/dates/certificates/expiry and fail explicitly on read errors or truncation.

- [ ] First prove identity, own-office access, revoked-assignment rejection, and protection of both reviews and source evidence in a local/preview database. If unavailable, mark this task Blocked and report; do not proceed with insecure review persistence.
- [ ] Once the gate is cleared, pin the concrete authorization helpers/DDL and API types in this plan before implementing the migration. Inspect current tables first, generate the migration through CLI, enable RLS on new exposed tables, and index FK/query predicates.
- [ ] Write failing tests for anon denial, authenticated-but-unassigned denial, cross-office denial, server-derived actor, immutable audit, stale-version conflict, edited/deleted sources, changed requirements, office movement, and transactional save failure.
- [ ] Implement and run API/pgTAP tests locally. No remote application of migration files.

### Task 3: Integrate one V2 evaluation path across succession and gap analysis (gated)

**Files:** `src/lib/api/succession.ts`, `src/lib/api/criticalPositionGapAnalysis.ts`, their existing tests, plus focused V2 query-boundary tests. Preserve `getLatestOverallScores` arithmetic and other callers.

**Consumes:** Task 1 evaluator and Task 2 authorized, current reviews. **Produces:** one consistent V2 result per candidate/position and explicitly versioned V1/V2 comparison results.

- [ ] Write failing integration tests for visible pending reviews, hidden known failures including manual nominations, consistent Gap Analysis evidence, reviewed qualified counts separated from pending counts, full batch/single parity, data-read failure versus empty data, and complete pagination.
- [ ] Keep existing discovery restrictions (employment status, office, incumbent, same-title, downward moves) unchanged; audit/remove heuristic field filters only where they would prevent an authorized relevance decision from being evaluated.
- [ ] Adapt scoring/qualification inputs without any tenure fallback; use the posting requirements snapshot and report drift rather than silently guessing which repeated job posting applies.
- [ ] Add a default-off, application-wide V2 activation boundary with no fallback from failed V2 reads to plausible V1 scores. Keep comparison read-only and label the model version.
- [ ] Run integration and shared-caller regressions; commit only once the authorization gate is satisfied.

### Task 4: Build review/configuration UI and finish staged validation (gated)

**Files:** `src/components/CriticalPositionPage.tsx`, `src/components/CriticalPositionGapAnalysisPage.tsx`, `src/components/SuccessionPlanningPage.tsx`, `src/components/EligibilityPointsPanel.tsx`, `src/modules/admin/RspDashboardOverview.tsx`, `src/modules/admin/RSPDashboard.tsx`, and their tests. Additional single components only where needed; no unrelated redesign.

- [ ] Read `DESIGN_IDENTITY.md`, list all saved mockups and sessions, read matching mockups, and preview genuinely new review/configuration interactions before implementation.
- [ ] Write failing UI tests for own-office review, visible Needs review rows with blank final totals/ranks/readiness, no known-failure rows in succession, configuration-needed explanations, no editable V2 weight overrides/type point values, failed save retention, stale-save retry, disabled pending actions, and keyboard/accessibility behavior.
- [ ] Implement these states using the service APIs, fixed model constants, shared modal/table patterns, and existing tokens. Do not expose confidential evidence to other offices.
- [ ] Compare old/new results locally or with authorized read-only live data; report ranking changes and pending/configuration counts without storing PII in committed reports. Do not write reviews or regenerate persisted recommendations live.
- [ ] Run complete checks and whole-branch review. Keep V2 inactive until authorization, migrations, source protections, reviewed configuration, and activation approval are all satisfied.
- [ ] Update this plan and `docs/session-summaries/2026-10-27-succession-scoring-v2-summary.md`; regenerate the dashboard. Mark Done only if the complete scope ships, otherwise Blocked with delivered-versus-remaining scope.

## Risks

- The live authorization gap is a release blocker, not a cosmetic warning. Pure calculation work can ship locally without representing reviews as secure or activating them.
- Current source work history has `company_name` and `is_government_service`, neither proving City Hall relevance. Review must establish City Hall employment and role relevance explicitly.
- Professional degrees cannot receive invented points or degree equivalences. Unsupported categories and explicit zero minima remain unranked until policy exists.
- Date/duplicate policy choices above are implementation proposals; independent review must flag any conflict with approved rules rather than changing them silently.
- The worktree starts from the user's current HEAD, which contains other commits. Before any future publication compare with fork main and exclude unrelated unpublished changes; no force push or history rewrite.
- Plans tooling `_template.md` and `build-plans-index.ps1` are present only as untracked files in the original checkout. Use the template structure read there, and run a temporary local copy of the generator without committing someone else's untracked tooling.

## Checks to run

- `npx tsc --noEmit`, `npm run lint`, focused Vitest files, full `npm test`, and `npm run build:verify`.
- `npm run check:migrations` when migrations exist; local/preview authorization and atomic-audit tests before persistence integration.
- `git diff --check`, whole-branch review, DESIGN_IDENTITY.md section 16 for changed UI, and no secrets/PII in new files or test reports.
- Prove V1 remains the active path throughout preparation; do not claim this staged engine changes current live scores.
