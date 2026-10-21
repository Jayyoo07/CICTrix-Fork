---
title: Unlimited applicants, one hire per plantilla, reserve-then-hire flow
date: 2026-10-21
status: Done
summary: Remove the per-browser block that stops a second person applying to a plantilla. RSP selects one applicant per plantilla (reserved, with a contract-signing deadline), can revoke, and generates credentials in a new tab, which fills the plantilla and archives the rest with a regret letter.
spec: docs/mockups/2026-10-21-hire-reservation-flow.html (steps 1–2; step 3 layout B with cross-department selection; printout option A). Chosen 2026-10-21.
---

## Goal

Any number of people can apply to an open vacancy. A vacancy is one plantilla item (main, 2026-10-21: one row and one posting per plantilla). Exactly one person is hired per plantilla. Hiring happens in two steps. First, Select reserves the plantilla and gives the applicant a deadline to sign. Then Generate hires them, fills the plantilla and archives everyone else on it.

## Findings

**Applicant limit (remove).**

| Where | What it does |
|---|---|
| `src/modules/applicant/flow/applicationDrafts.ts:24,152-169,228` | `localStorage['cictrix_applied_plantilla']` records plantillas applied from **this browser**. `buildChoices` then marks that plantilla `applied` for whoever uses the device next. |
| `src/components/JobDetailsPage.tsx:50-54,251,462-468` | An `applied` target is not selectable, so the next person sees "This plantilla is no longer open" and can't continue. This is the bug: on a shared or test machine, one application blocks everyone after. |
| `src/modules/applicant/ApplicantWizard.tsx:1059-1060` | Writes that flag after a submit. |

**Duplicate guard (keep, already correct).** `uq_applicants_one_per_plantilla` on (normalised email, plantilla_slot_id) in `20261021000006`, plus `findExistingApplication` (`ApplicantWizard.tsx:814`) by email and slot. Together they reject the same person applying twice to one plantilla and nothing more.

**Hire limit (keep).** `plantilla_slots.filled_by_applicant_id`, which holds one applicant. `assignApplicantToSlot` (`src/lib/plantillaSlots.ts:369`) refuses a slot that someone else has already filled.

**What's missing.** No reserved state exists. Nothing archives the other applicants on a filled plantilla. And the landing page hides a posting once it has no open plantilla left (`LandingPage.tsx:122-123`), so a filled vacancy never shows "Filled".

## Approach

| # | Decision |
|---|---|
| D1 | **Per-device flag only remembers.** `buildChoices` stops turning `applied` into a block. The device flag is kept only to show the "Already applied" badge in the wizard. The database check by email decides the actual duplicate, and the wizard already reports it as "Already applied". |
| D2 | **New status `For Contract Signing`** between Qualified and Selected. It is not terminal and not in `is_hired_application_status`, so reserving does not withdraw the person's other applications. Applicant message: *"Congratulations! You have been selected for [Job Title]. [Instructions] Due to failure of securing it by [date] may result in losing your place in the recruitment process or giving up your status as selected candidate."* The last sentence is always appended, worded as you gave it. |
| D3 | **Reservation lives on the plantilla.** `plantilla_slots` gains `reserved_by_applicant_id`, `reserved_at`, `signing_deadline`. `applicants` gains `signing_deadline`, `signing_instructions`, `status_before_selection`. Reserving is one conditional update, `... where id = $slot and status = 'open' and reserved_by_applicant_id is null`. If it returns zero rows, someone already holds the slot, and the UI says "Plantilla N is already reserved for <name>". A partial unique index (one reserving applicant per slot) is the backstop. |
| D4 | **Revoke ("Did not report").** Clears the slot's reservation and restores the applicant's `status_before_selection` (normally Qualified), so they return to the For Hiring list with a muted "Selection revoked" note. They are archived with everyone else when the plantilla fills. Revoking is always manual by RSP. No scheduled job runs. |
| D5 | **Generate = hire.** This is the existing `handleConfirmHire` logic, moved to the new tab. It creates the employee, writes Hired, fills the slot, issues credentials, then shows the modal and Print. Writing Hired fires the existing hired-elsewhere trigger, which withdraws the person's other open applications at this point, not at Select. |
| D6 | **Fill archives the rest (database trigger).** When a slot becomes `filled`, every other application on that slot that isn't already final is set to `Not Selected`, with `archived_at = now()` and `regret_letter = true`. A new `applicants.archived_at` column and `applicant_tracker_view` expose it. |
| D7 | **Regret letter on the tracker.** The pasted letter is used with [Applicant Name], [Job Title] and [Company Name] = "City Government of Iloilo" filled in, signed "Recruitment, Selection and Placement Office, CHRMO". The data has no per-person skill or requirement, so that sentence reads *"we have chosen to move forward with another candidate for this position."* Tracker only, no email. |
| D8 | **For Hiring view.** Same Department › Position › list. The button becomes **Select for Hiring** and takes **one** applicant (single select). Step 1 is the notice, shown only if the person has other open applications. Step 2 is the confirmation: date picker, editable instructions, the "cannot be revoked unless…" notice and a required acknowledgement checkbox. A plantilla that is already reserved shows a "Reserved for <name> until <date>" banner, and Select is disabled. |
| D9 | **New tab: Generate Employee Credentials** (`/admin/rsp/credentials`), added to `ApplicantsTabBar`. It uses layout B: groups by Department › Position, rows with checkboxes, and a selection that persists across departments. A sticky bar shows "N selected across M departments · Office (n)…", with Clear and Generate (N). Each row has a "Did not report" action and an "Awaiting signing" or "Deadline passed" badge (§10 warning/error). |
| D10 | **Landing: Filled, not hidden.** A filled plantilla's row stays listed until the posting's closing date, struck through, with a disabled "Filled" button. A reserved plantilla still shows Apply. Pagination, search and the Department filter are untouched. |
| D11 | **RSP Archives.** A fifth card, "Not Selected Applicants", lists rows with `archived_at`, using the toolbar, table and pagination patterns from §9.4–9.6. |
| D12 | **Printout: option A, cut-out cards** (chosen 2026-10-21), several per page. It uses Poppins, ABYAN tokens, and the real logo top-left (§11 Reports/Print). |

## Steps

1. Migration via `npx supabase migration new hire_reservation_and_archive`: D3 columns and index, D6 trigger and `archived_at`, and the tracker view with the new columns appended. Add a rollback in `supabase/rollbacks/`.
2. `applicantStatus.ts` (+ test): add `For Contract Signing`, its message, transitions and funnel bucket, and the regret-letter builder.
3. `applicationDrafts.ts` + test: D1.
4. `src/lib/plantillaSlots.ts`: `reserveSlotForApplicant`, `revokeSlotReservation`, and fetching reservations. All Supabase calls stay in `src/lib/`.
5. `ForHiringPage.tsx`: D8 dialogs, single select and the reserved banner.
6. New `GenerateCredentialsPage.tsx` + route + tab: D9, using the moved hire logic and the D12 printout.
7. `ApplicationStatusPage.tsx`: congratulation notice with instructions and deadline (D2), and the regret letter (D7).
8. `LandingPage.tsx`: D10. `RSPDashboard.tsx`: D11.
9. Save the mockups to `docs/mockups/2026-10-21-hire-reservation-flow.html`, then run the checks below.

## Risks

- Older paths (`hiredApplicantSync`, `QualifiedApplicantsPage`, `RSPDashboard`) still write `Hired` directly and skip the reservation. The D6 trigger keys off the slot filling, so archiving still happens. Those paths are not reworked here.
- The migration needs the repo flow: commit, PR, and merge to main applies it. I won't apply anything by hand or push without your go-ahead.
- Applications created before `plantilla_slot_id` existed have no slot, and D6 can't archive them. The migration prints a count.

## Checks to run

- `npx tsc --noEmit`, `npm run lint`, `npm test` (status, drafts, plantilla tests), `npm run check:migrations`, `npm run build`.
- Acceptance tests 1–7 from the request. The database-backed ones (1, 2, 5, 6) need the migration applied. Until it's merged I can run them only against a local Supabase (`npx supabase start`) if Docker is available. Otherwise I'll report them as unverified rather than claim them.
