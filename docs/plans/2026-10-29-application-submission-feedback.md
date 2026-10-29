---
title: Fix application confirmation counts and success labels
date: 2026-10-29
status: Approved
summary: Keep submission wording stable while requests run, and identify completed applications by position title with a secondary plantilla label.
---

# Application Submission Feedback Implementation Plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task by task. No delegation is authorized by this plan.

**Architecture:** Keep the existing wizard and submission pipeline. Replace the confirmation boolean with a fixed selection of application keys and the action being confirmed; derive confirmation copy from that selection rather than changing outcomes. Store position and plantilla as separate display fields in completed results.

**Tech stack:** React 18, TypeScript, React Router, Vitest, React Testing Library; existing Supabase submission and storage calls remain unchanged.

**Spec:** The recommendation approved in the planning conversation, reproduced in the contract below. Publishing this plan does not implement the application changes.

## Goal

Applicants see an accurate, stable confirmation and can identify the position they submitted an application for.

| Situation | Confirmation heading | Review action |
|---|---|---|
| One new application | Submit application? | Submit Application |
| Multiple new applications | Submit N applications? | Submit N Applications |
| One failed application to retry | Retry application? | Retry Application |
| Multiple failed applications to retry | Retry N applications? | Retry N Applications |

- The confirmation button remains `Submit` or `Retry`, including while busy. Its existing spinner and disabled behavior remain.
- Heading, description, action mode, and displayed batch count stay fixed from opening confirmation until it closes, even as individual outcomes change.
- Single-application description: `Your application will be sent to HR. You can’t edit it after submitting.`
- Multiple-application description: `Each plantilla item is filed as its own application, all under one Reference No. You can’t edit them after submitting.`
- Success rows show the applied-for position as the main label and the plantilla label below it, when one exists. Status badges and reference-number behavior remain unchanged.
- No confirmation opens when there is nothing eligible to submit. A zero count must not be disguised as one.

## Global constraints

- No database, migration, RLS, authentication, encryption, upload, or reference-number changes.
- No dependency additions, general wizard refactor, or new module directory.
- Preserve existing draft version 2 and its sessionStorage structure; confirmation and submission outcomes remain transient.
- Preserve one application per selected plantilla and existing sequential submission.
- Use `formData.position`, never `formData.current_position`, for the applied-for title.
- Use existing design tokens, `.btn` classes, typography, and Submitted/Already applied badge treatment.
- This is an existing-surface label/state fix, not a modal redesign. Do not migrate the applicant-specific ConfirmModal or change shared dialog behavior as adjacent work.
- No live submissions, pushes, or deployments without explicit permission.

## Approach

### Existing logic and connections

1. `src/components/JobDetailsPage.tsx:305–319` sends the posting title, department, and selected plantilla through `location.state.landingJob` to `/apply`. The current vacancy flow selects one item, but the wizard still supports older multi-item drafts.
2. `src/modules/applicant/ApplicantWizard.tsx:336–351` copies the posting title into each selected form's `position`. General/promotional applications can instead hold their own selected position without a posting.
3. `src/modules/applicant/flow/applicationDrafts.ts` persists posting metadata, selected choices, and form answers. It is not responsible for submission outcomes or completed-screen labels.
4. `ApplicantWizard.tsx:1080–1085` calculates pending and failed keys from outcomes. Marking targets `submitting` removes them from pending keys immediately.
5. `ApplicantWizard.tsx:1938–1954` currently uses those changing pending/failed lists to render the still-open dialog. This explains both the initial zero and potentially changing batch/retry wording.
6. `handleSubmitAll` calls `submitOne` sequentially. That path checks duplicates, inserts the applicant, links the plantilla, uploads files, syncs recruitment data, and returns an outcome/reference. Leave those operations intact.
7. `ApplicantWizard.tsx:1127` currently stores only `choiceLabel(...)` as the completed label. The success list at lines 1478–1499 then displays that plantilla instead of the available position title.

Proposed flow:

```text
Posting/form position + selected plantilla
    → review: choose eligible keys
    → confirmation: capture keys + submit/retry mode
    → execution: submit exactly the captured eligible batch
       outcomes change independently; confirmation does not
    → failure: preserve forms and successful outcomes; reopen only failed keys
    → all final: capture position + plantilla + outcome
    → success: position first, plantilla second, existing reference and status
```

### File responsibilities

| File | Work |
|---|---|
| `src/modules/applicant/ApplicantWizard.tsx` | Confirmation selection, stable copy, local re-entry guard, completed-result metadata, and success-row rendering. |
| `src/modules/applicant/ApplicantWizard.test.tsx` (new) | Component regression tests exercising the actual wizard and confirmation, with mocked external I/O. |
| `src/styles/applicant-flow.css` (only if needed) | A narrowly scoped success-title wrapping rule if existing classes do not handle long titles. No token or layout redesign. |

Read/reference only: `JobDetailsPage.tsx`, `flow/applicationDrafts.ts`, `flow/FlowUi.tsx`, form validation, and submission dependencies. No changes are expected there.

## Review focus

1. Deferred requests and intermediate multi-item results must not change the confirmed count or switch Retry to Submit; Task 1 tests both.
2. A successful item must not be resent when another item fails; Task 1 asserts per-item insert calls across retry.
3. A promotion must show the target position rather than the employee's current position; Task 2 uses deliberately different values.
4. Missing/whitespace title metadata, general applications, and repeated position titles must remain distinguishable; Task 2 tests fallbacks and secondary labels.
5. Cancellation, repeated confirmation, and starting another application must not reuse an old selection or leave the wizard busy; Tasks 1 and 3 cover these transitions.

## Steps

### Task 1: Make the confirmed submission selection stable

**Files:** Modify `ApplicantWizard.tsx`; create `ApplicantWizard.test.tsx`.

**Internal interfaces:**

```ts
type SubmitConfirmation = {
  keys: readonly string[];
  mode: 'submit' | 'retry';
};
// Replace confirmSubmit boolean state with SubmitConfirmation | null.
// openSubmitConfirmation(): void
// handleSubmitAll(batch: SubmitConfirmation): Promise<void>
```

These types/functions stay local to the wizard; no new public API is required.

- [ ] Build a component-test fixture using `MemoryRouter` and existing v2 draft storage to enter the review step. Clear browser storage per test and stub jsdom scrolling methods locally. Mock Supabase, profile lookups, encryption/storage, and recruitment sync so no real requests occur. Use controlled deferred promises rather than timing sleeps. Do not mock the confirmation component or the pending/outcome logic being tested.
- [ ] Add failing tests: `single confirmation stays singular while submission is pending` asserts the dialog name remains `Submit application?` and its singular description remains unchanged after the insert starts; `batch confirmation keeps its original count` asserts `Submit 2 applications?` before and after the first item completes while the second remains unresolved.
- [ ] Add failing tests for retry: make one insert succeed and another fail before saving; assert `Retry application?`, resolve the retry slowly, and assert the heading/action mode stay unchanged. Confirm the successful item's insert call count remains one. Add a two-failure fixture asserting `Retry 2 applications?` throughout retry.
- [ ] Run `npx vitest run src/modules/applicant/ApplicantWizard.test.tsx`; confirm these fail for the current changing wording, not for fixture/mocking errors.
- [ ] Implement `openSubmitConfirmation()`: refuse if busy, undeclared, or no eligible keys; capture a fresh array of failed keys for retry, otherwise pending keys, with a fixed mode. Clear that state on ordinary cancellation. Use its presence to control modal visibility and its contents for heading, description, confirm action, and review action while busy.
- [ ] Implement `handleSubmitAll(batch)`: use the captured keys rather than recomputing the queue during execution. Before writing, reject an empty/stale batch or one containing a missing form or an already-terminal outcome; close a stale confirmation without making a request so review can be reopened. Add a synchronous ref lock before the first await, retaining the visible busy state; release the lock and busy state in `finally`. Keep the existing per-key outcome/error handling and sequential pipeline.
- [ ] Merge the captured batch's results with prior outcomes. Complete only when every selected key has `ok` or `already`; otherwise retain the existing review/error recovery and all successful outcomes. Clear the confirmation after an attempt finishes. Never clear drafts on failure.
- [ ] Add tests that unchecked declaration prevents confirmation; empty eligibility cannot produce an actionable zero-item dialog; cancel then reopen captures a fresh selection; rapid repeated confirmation starts only one pipeline; a failed attempt unlocks retry. Keep these through observable UI behavior; do not add test-only product exports.
- [ ] Rerun the focused suite and `npx tsc --noEmit`. Expected: all pass.
- [ ] Commit only the Task 1 code/tests: `fix(applicant): stabilize submission confirmation state`.

### Task 2: Show the applied-for position on success

**Files:** Modify `ApplicantWizard.tsx` and `ApplicantWizard.test.tsx`; conditional scoped CSS only.

**Internal interface:**

```ts
type CompletedApplication = {
  key: string;
  positionTitle: string;
  plantillaLabel?: string;
  outcome: SubmitOutcome;
};
// completed becomes CompletedApplication[] | null.
```

- [ ] Add failing success-screen tests. With position `Administrative Officer II` and choice `Plantilla 27`, assert each appears in a separate main/secondary element in the same result row. With promotion `current_position: 'Administrative Aide I'`, assert the main label is still `Administrative Officer II`.
- [ ] Add fallback cases: trim nonblank form position first, then nonblank posting title, otherwise `Your application`. General applications with no choice have no invented plantilla subtitle. Two completed items sharing a position title retain their distinct plantilla labels. These display fallbacks do not weaken existing form validation.
- [ ] Run the focused suite and confirm the new expectations fail against plantilla-only rendering.
- [ ] Capture the resolved `positionTitle` and optional `choiceLabel(choice)` when constructing completed results, before clearing persisted drafts. Render title with the existing headline style and plantilla with the existing caption/body-secondary style. Do not change `choiceLabel` or global `labelFor`, which serve other screens and controls.
- [ ] Add assertions that an `already` result uses the same title/plantilla presentation and keeps `Already applied`; a newly saved result keeps `Submitted`. Preserve shared-reference presentation, mixed-reference fallback, and `/track` navigation state using the returned reference rather than a position/item code.
- [ ] Run focused tests and `npx tsc --noEmit`. Expected: pass. Inspect a long position title at mobile width; add only a scoped wrapping rule if required.
- [ ] Commit only Task 2 changes: `fix(applicant): show position titles on submission success`.

### Task 3: Verify entry paths and final regression coverage

**Files:** Extend `ApplicantWizard.test.tsx` only if coverage gaps remain.

**Consumes:** Task 1 confirmation behavior and Task 2 completed-result metadata; produces no new product interface.

- [ ] Add a route-state test using the actual `landingJob` shape from Job Details: its title must populate the submitted `position` and the success headline; its selected choice must supply the secondary plantilla label. Keep the existing `JobDetailsPage.plantillas.test.tsx` suite as the selection regression check.
- [ ] Test general and promotional draft restoration, plus restarting an application after cancellation/failure: no stale confirmation selection, no unintended current-position substitution, and no new persisted state fields. Do not imply uploads survive refresh; File objects still need reattachment.
- [ ] Run `npx vitest run src/modules/applicant/ApplicantWizard.test.tsx src/components/JobDetailsPage.plantillas.test.tsx`.
- [ ] Run `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build`. Expected: exit 0 for every command; record any pre-existing failure rather than claiming a clean result.
- [ ] With mocked/intercepted local submission responses, inspect single, multi-item, retry, already-applied, and success states at desktop and 375px mobile width, plus 200% zoom. Verify long-title wrapping, status badges, button labels, disabled/busy behavior, cancel/Escape behavior, focus return, and unchanged reference/tracker navigation. Do not submit a real application for verification without permission.
- [ ] Review `DESIGN_IDENTITY.md` §16 for the changed surface. Record the existing applicant-specific modal's divergence from §9.10 without turning this fix into an unrelated shared-modal migration.
- [ ] Commit any remaining test-only coverage: `test(applicant): cover submission entry and recovery paths`.

## Risks

- **A stable label alone would hide the cause.** Tests must hold requests open and exercise outcome transitions, proving confirmed selection is independent from the live queue.
- **React disabled state is not an immediate lock.** The synchronous ref guard protects the interval before rerender; this is a local UI guarantee, not a new server-side idempotency guarantee.
- **Existing upload recovery is not transactional.** The applicant row can be inserted before a later file upload fails; the current duplicate check may then treat a retry as already applied. This plan does not repair or certify that separate recovery problem. Retry tests for this change use failures before applicant creation; attachment recovery needs its own scoped investigation.
- **Existing remote schema state is unverified.** No live database inspection or write is needed for these identified UI causes; the plan preserves current service contracts and server-issued references.
- **Title fallback is display-only.** Do not fetch a new posting after submission, since that could substitute changed metadata, add unnecessary network failures, or lose the employee's chosen target position.

## Checks to run

- `npx vitest run src/modules/applicant/ApplicantWizard.test.tsx src/components/JobDetailsPage.plantillas.test.tsx`
- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run build`
- Mocked local browser checks and `DESIGN_IDENTITY.md` §16 review described in Task 3.
- These are implementation checks, not claims that they have run during plan publication.

## Execution handoff

Only planning and plan publication are authorized in this session. No application implementation has occurred; publication checks do not replace the implementation regression tests above. Recheck repository status and create a feature branch before application code edits in a later implementation session.

This plan was originally drafted outside the repository under Plan mode and is now published at `docs/plans/2026-10-29-application-submission-feedback.md`. Its approved status records the chosen direction; application implementation has not started. Update status through In Progress/Done when implementation begins and finishes, write the required session summary on completion, and regenerate the plans dashboard after plan or summary changes. Publishing this document does not authorize deployment of the eventual application changes.
