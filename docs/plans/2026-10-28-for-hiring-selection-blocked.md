---
title: For Hiring — make plantilla resolution fail loudly and selection only target open plantillas
date: 2026-10-28
status: Done
summary: Selection is disabled because the page cannot tell "no plantilla linked" from "the lookup failed", and because applicants sit on a closed plantilla while their position still reads Open. Surface the lookup failure, refuse selection into a closed or unopen plantilla with a stated reason, and repair open postings that have no active vacancy row.
spec: Reported 2026-10-28 with a screenshot of Administrative Aide IV (Clerk II) · Office of the City Accountant, plantilla slots Plantilla 17 (open) and Plantilla 27 (closed)
---

## Goal

On For Hiring, RSP can see why Select for Hiring is unavailable, and when a
plantilla is genuinely open they can select exactly one qualified applicant
for it. A failed lookup never looks like "not linked to a plantilla", and a
closed plantilla never looks open. When the vacancy state contradicts itself
(an Open position with no active vacancy), the app states that plainly and
the repair is a recorded migration, not an ad-hoc SQL edit.

## Evidence gathered (2026-10-28, read-only)

| Layer | Finding |
|---|---|
| Screen | Every radio circle is disabled and **Select for Hiring** is disabled. `ForHiringPage.tsx:815-819` disables a row when `row.slot` is missing; `:766` disables the button until a row is selected. |
| Lookup | `fetchHiringContext` (`src/lib/hiringFlow.ts:108-131`) wraps both reads in one `try`, logs a warning, and returns two empty maps. The page cannot distinguish that from "no links". `fetchSlotsByJobPosting` and `fetchApplicantSlotLinks` also degrade to an empty map on failure. |
| Query Crash | In `ForHiringPage.tsx`, `ensureRecruitmentSeedData()` loads mock applicants with string IDs (`test-app-001`, etc.) into `localStorage`. `mergedMap` passes both string IDs and UUIDs to `fetchHiringContext`. Supabase Postgres rejects `.in('id', applicantIds)` with error `22P02: invalid input syntax for type uuid: "test-app-001"`. Because `fetchHiringContext` ignores `res.error`, `data` is `null` and it silently returns an empty map, leaving `row.slot = null` for all applicants. |
| Data | Ryan Castro, Beatriz Locsin and Jose Segovia's `Reviewed` applications all point to **Plantilla 27**, status `closed`. The one open plantilla on that posting, **Plantilla 17**, has no applicants. |
| Vacancy | The posting (`1c2a873b…`, "Administrative Aide IV (clerk Ii)") is `Open` with deadline `2026-11-17`, but `job_vacancies` has **zero rows for the whole project**. 13 postings are `Open` without an active vacancy row, so the invariant in `20261022131331_vacancy_open_close.sql` ("Open ⇔ one active vacancy") is already broken in this database. |
| Behaviour | A closed slot is not filtered out and not shown as blocked. `blockedReason` only covers `!row.slot` and `reservedRow`. Clicking Select opens the dialog; `canConfirm` passes; `reserve_plantilla_slot` then returns "This plantilla is already closed." So a closed plantilla fails late, at the last step, instead of at the point of choice. |

Two independent defects therefore stack:

1. **Ambiguity.** A failed lookup, a missing link, and a closed plantilla all
   collapse into the same disabled control with no explanation.
2. **Stale vacancy state.** Slots closed by an earlier vacancy close were
   never reopened, and the current `Open` posting has no vacancy row to
   reopen them. The applicants' only plantilla is closed.

## Approach

Keep the hiring safeguard: a closed or non-open plantilla cannot be reserved.
Fix the information flow so the screen says which of the states it is in.

- **One result type for the hiring context & UUID sanitization.** `fetchHiringContext` filters `applicantIds` to valid UUIDs before querying PostgREST to prevent Postgres `22P02` syntax aborts. It returns
  `{ ok, slotByApplicant, revokedAt, error }`, using the *checked* slot and
  link readers. A failed read keeps `ok: false` and names the failed layer.
  Callers that only need the maps keep working through the checked variants'
  existing legacy wrappers.
- **Page states, one per cause.** No selection possible until the context
  loads successfully. A failure shows `ErrorBanner` with Retry. A resolved but
  missing link says the application is not linked. A resolved slot that is
  `closed` says the plantilla is closed and how it becomes selectable again.
  `filled` stays filtered exactly as today.
- **Disable at the point of choice.** A row is selectable only when its slot
  status is `open` and the plantilla is not reserved. The position header
  states the reason once, rather than a tooltip on each radio.
- **Repair the vacancy history in one migration.** For every `Open` posting
  with no active vacancy row, insert the missing row (deadline from the
  posting, `remarks = 'Backfilled when For Hiring found no active vacancy'`)
  and reopen its `closed` plantillas. Filled plantillas stay filled. Then a
  CHECK or trigger keeps the invariant from drifting again through the app.

UI follows `DESIGN_IDENTITY.md` tokens and §9.9 alerts; no new visual
direction, so no mockup is required. The pages already use the `.btn` classes
and `badge` tokens reviewed in the 2026-10-21 hire flow.

## Steps

1. **Diagnostic SQL file (no live write).** Add
   `docs/runbooks/2026-10-28-for-hiring-vacancy-audit.sql` listing, for every
   posting: status, deadline, active-vacancy count, open/closed/filled slot
   counts, and qualified applicants per slot. Purpose: RSP can re-run the
   audit before and after the repair. Verifiable: running it against the
   current database reproduces 13 Open postings with zero active vacancies
   and Plantilla 27 `closed` with 3 applicants.
2. **Service-layer result contract.** Change `fetchHiringContext`
   (`src/lib/hiringFlow.ts`) to return
   `{ ok: boolean; slotByApplicant: Map<string, PlantillaSlot>; revokedAt: Map<string, string>; error?: unknown }`.
   Read slots and links through `fetchSlotsByJobPostingChecked` and
   `fetchApplicantSlotLinksChecked`; set `ok: false` with the first error if
   either fails, and keep the maps partially filled so the page can still
   render names. Update `HiringContext` consumers (`ForHiringPage` only).
3. **Page: context load state.** In `ForHiringPage.tsx`, hold
   `contextError`. When `ok: false`, set `loadError` for the page banner and
   do not present rows as selectable. Rows still render read-only. Verifiable
   in a test where both readers reject: the banner names the failure and no
   radio is enabled.
4. **Page: per-row blocked reason.** Replace the `!row.slot` / `reservedRow`
   ternary with one resolver, in priority order:
   `context failed` → `not linked` → `slot filled` (filtered, unreachable) →
   `slot closed` → `reserved`. Each returns `{ blocked: boolean; reason: string }`.
   The radio gets `aria-describedby` pointing at a single position-level
   message that names the reason and the next action ("Open the vacancy from
   Job Vacancies to make this plantilla selectable again"). Verifiable:
   Plantilla 27 rows are disabled with the closed reason; Plantilla 17 rows
   are selectable.
5. **Confirm-step guard.** In `handleSelectClick`, return early with
   `selectError` when `selectTarget.slot?.status !== 'open'`, so RSP never
   reaches a confirm button that the RPC is certain to reject. Keep the RPC's
   own check as the backstop. Verifiable: a closed-slot target shows the
   reason in the dialog and no Confirm Selection button.
6. **Migration: backfill missing vacancies.** Create with
   `npx supabase migration new for_hiring_vacancy_backfill`. Contents: insert
   one `job_vacancies` row per `Open` posting with no active row; reopen
   `closed` plantillas of those postings (`status = 'open'`, never touching
   `filled`); leave applicants, scores and reservations untouched. Add
   `supabase/rollbacks/` for the same version, closing only the backfilled
   rows by their remark and returning slots that the migration reopened to
   `closed`. Do not run it by hand; it merges by PR.
7. **Tests.**
   - `src/lib/hiringFlow.test.ts`: both readers succeed → `ok: true`;
     slot read fails → `ok: false` and the link map is still returned;
     link read fails → `ok: false`.
   - `src/components/ForHiringPage.context.test.tsx`: lookup failure shows
     the banner and disables every radio; a closed-slot row is disabled with
     the closed reason; an open-slot row is enabled; Confirm Selection never
     appears for a closed slot.
   - Extend `src/components/ForHiringPage.scored.test.tsx` fixtures with
     slot ids and statuses so the "scored only" rule still passes with the
     new block logic.
8. **RSP verification pass (after migration merges).** Run the audit SQL,
   open For Hiring for Office of the City Accountant › Administrative Aide IV
   (Clerk II), select one applicant, confirm the reservation, then revoke it
   with "Did not report" to restore the test data. Verify the applicant's
   tracker shows the congratulatory notice and that Plantilla 27 returns to
   open.

## Risks

- **Reopening a closed plantilla widens eligibility.** The backfill reopens
  Plantilla 27 and any like it. That is the intended effect of an Open
  posting, but RSP should confirm each reopened plantilla is genuinely still
  hiring before the migration merges.
- **`job_vacancies` was never populated.** The backfill creates the first
  rows in this database. A wrong deadline would appear as an active vacancy;
  the migration copies `job_postings.application_deadline`, not a default.
- **Partially failed context.** Keeping partial maps means a page can render
  a row whose slot failed to load while still reporting the failure. The
  banner and the disabled state must both derive from `ok`, never from the
  map being non-empty.
- **Scores still live in localStorage** (`cictrix_category_scores`,
  `cictrix_exam_scores`). An applicant visible on one machine can be absent
  on another; this plan does not move scores into Supabase.
- **No live writes from this session.** The audit SQL and the migration are
  committed artifacts; applying them follows the repo PR flow.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test` (new context tests plus the existing For Hiring tests)
- `npm run check:migrations`
- `npm run build`
- `docs/runbooks/2026-10-28-for-hiring-vacancy-audit.sql` before and after
  the migration, with both outputs pasted into the session summary.
- `DESIGN_IDENTITY.md` §16 checklist on the changed For Hiring states (banner,
  blocked row reason, dialog error).
