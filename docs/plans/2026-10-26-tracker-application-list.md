---
title: Applicant tracker lists every application, each row expands to its status
date: 2026-10-26
status: Done
summary: A tracker search returns all of a person's applications (same Reference No. or email). A "Your applications" list sits above the existing sections; clicking a row expands that position's status in place. The existing sections and their realtime behaviour stay as they are, scoped to the open row.
spec: docs/mockups/2026-10-26-tracker-application-list.html (chosen 2026-10-26). Delivers step 4 / D9 of docs/plans/2026-10-15-one-reference-multi-plantilla.md.
---

## Goal

An applicant who applied for several positions searches once and sees every application with its live status. Opening a row shows that position's full status: notices, details, current phase, and documents, exactly as the page shows them today. Someone with one application sees the page unchanged.

## Approach

Today `runSearch` and `fetchRecord` in `ApplicationStatusPage.tsx` query `applicant_tracker_view` with `.limit(1)`, so only the newest application is ever loaded. Since migration `20261021200000_one_reference_per_applicant.sql`, all of a person's applications share one Reference No., so dropping the limit returns the full set. Old numbers are aliases, which `resolve_application_reference(raw)` (granted to anon) maps to the primary.

| # | Decision |
|---|---|
| D1 | **The page holds a list, plus one open row.** `record` becomes `applications.find(a => a.id === openId)`, so every existing section keeps reading `record` unchanged. |
| D2 | **Expand in place, one at a time.** Each row is a button (`aria-expanded`, `aria-controls`). The open row's panel renders the existing sections (Action Required banner, Application Details, Notices, Current Status, Submitted Documents) directly under it. Clicking the open row collapses it. Opening another row collapses the first. |
| D3 | **Default open row:** the first application needing action (a pending resubmission, Pending, or a schedule set), otherwise the newest. This is the rule already set in D9. |
| D4 | **Per-row live status.** Each row shows position, office, plantilla label, submitted date and a status badge from the same `STATUS_BADGE` map. A row with a pending resubmission shows an "Action required" flag, so the page-level banner is no longer the only place that says which application needs it. |
| D5 | **Withdrawn rows** (`Withdrawn - Hired Elsewhere`) are muted and read "Withdrawn: hired on <hired_elsewhere_plantilla_label>". These columns already exist in the view. |
| D6 | **One application → no list.** The page renders as it does today. |
| D7 | **Queries go through `src/lib/applicantTracker.ts`** (new single file, not a module folder): `fetchTrackerApplications(lookup)`, `fetchPendingResubmissionIds(ids)`, and the pure `pickDefaultApplicationId`. The existing pending-notice logic (lines ~752–790) moves into a pure `pendingResubmissionTypes(attachments)` there, so the open-row banner and the row flags use one rule. |
| D8 | **The "New" badge tone becomes Info (blue)**, per DESIGN_IDENTITY §10 (Submitted = Info). It is currently amber. This is the only style change, and it's in a file already being edited. |

### What "the expandable status must work" means here

Switching rows must never show one application's data under another. All per-application state is reset when `openId` changes: `attachments`, `slotOutcomes` (already keyed on `record.id`), `uploadSuccess`, `uploadErrors`, `pendingFiles`, `resolvedDocTypes`, `submittedFileNames`. A re-upload must write to the open row's applicant id. Realtime and polling must keep **every** row's badge current, not only the open one's.

| Today | After |
|---|---|
| `applicants` UPDATE channel refetches when `payload.new.id === rid` | Refetches the whole set when the id is any of the person's application ids |
| `applicant_attachments` channel filtered on the open id | Unchanged, re-subscribes when `openId` changes |
| 2s poll: one record + its attachments | Whole set + open row's attachments + resubmission flags for all ids. `openId` is kept across polls unless that row disappears. |

## Steps

1. `src/lib/applicantTracker.ts` + `applicantTracker.test.ts`: lookup (reference via `resolve_application_reference`, with a fallback to the raw normalised value and the legacy `item_number`; email by lowercased match), `pendingResubmissionTypes`, `fetchPendingResubmissionIds`, `pickDefaultApplicationId`. Tests cover the default-row rule, notice-then-newer-upload resolution, and alias → primary.
2. `ApplicationStatusPage.tsx`, data: replace the `record` state with `applications` + `openId`, drop both `.limit(1)`s by calling the lib, reset per-application state on `openId` change, and widen realtime and polling as in the table above.
3. `ApplicationStatusPage.tsx`, UI: the "Your applications" card between Search and the sections, with rows, an expanded panel holding the existing sections, the withdrawn treatment, the "Action required" flag, and keyboard/ARIA. On mobile (<640px) rows stack. Tokens and badge classes from `abyan-tokens.css`, plus D8.
4. Verify in the dev server with a person who has 3 applications (one action-needed, one open, one closed): default row, expand/collapse, switching rows, re-upload on a non-newest row, a status change from RSP reflecting in a collapsed row's badge within 2s, a single-application search, an alias search, an email search, and the `?ref=` deep link.
5. Run the checks, run the §16 checklist and the impeccable detector, write the session summary, and mark step 4 of the 2026-10-15 plan done.

## Risks

- **Test data.** Step 4 needs one email with several applications. Creating them in the live database counts as an external write, so I'll ask before creating them, or use the dev data source if it has multi-application rows.
- **Polling cost.** The 2s poll now reads N rows plus a resubmission query across all ids. That's small for realistic N (≤5), but it's 2–3 queries per tick instead of 2.
- **Alias RPC availability.** If `resolve_application_reference` is missing (migration not applied somewhere), the lookup falls back to the raw normalised value, which still finds applications holding the primary number.
- **Privacy is unchanged.** An email search already returns that email's newest application anonymously, and now returns all of them. The view still hides `disqualified_by` and hidden disqualification messages per row.
- **Uploads on a non-newest row** are the easiest place for a cross-row bug. Step 4 tests this explicitly.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test` (incl. `applicantTracker.test.ts`)
- Manual walkthrough from step 4 at desktop and 375px widths
- DESIGN_IDENTITY §16 checklist; `impeccable detect --json src/modules/applicant/ApplicationStatusPage.tsx`
