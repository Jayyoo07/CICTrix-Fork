---
title: Mark promotional applicants in interviewer candidate tables
date: 2026-10-30
status: Draft
summary: Show a "Promotional" tag and the employee's current position on interviewer candidate rows, so promotional applicants are distinguishable from new applicants before the interviewer opens the evaluation.
---

## Goal

In the Interviewer Dashboard's candidate list modal (the "To evaluate / Due today / Completed" lists), a promotional applicant shows a "Promotional" tag under their name and "From: <current position>" under the position they applied for. New (original) applicants show neither. The Interviewer Applicants List, which already has a Type column, uses the same tag styling so the two screens agree.

No saved mockup in `docs/mockups/` covers these tables. Layout follows the existing table pattern (§9.5): the tag and the "From:" line use the existing `.badge` and `.ivd-job-meta` styles.

## Approach

**The data path is already in place and was checked end to end.**

1. `ApplicantWizard.submitOne` (`src/modules/applicant/ApplicantWizard.tsx:941`, `:950-955`) writes `application_type: 'promotion'`, `employee_id` (the employee number) and `current_position` to the `applicants` row for promotional applications.
2. `InterviewerDashboard` loads `applicants` with `select('*')` (`InterviewerDashboard.tsx:113`). `buildCandidateRows` (`interviewerDashboardModel.ts:148`) already sets `appType` on every `CandidateRow` through `getApplicantType` (`src/lib/interviewerEvalNavigation.ts`).
3. `getApplicantType` is the same check that `Evaluate` uses to choose the PCPT/promotional scoring setup (`InterviewerDashboard.tsx:458`). It matches `isPromotionalSource` in `ApplicantDetailsPage.tsx:648`. So the tag always agrees with the scoring mode the interviewer gets.

So the tag needs no new query. Only rendering changes:

- `CandidateRow` gains `currentPosition: string`, read from `applicant.current_position` in `buildCandidateRows`. It is empty for original applicants.
- `CandidateListModal` (`InterviewerDashboardParts.tsx:463-465`): under the name, render `<span className="badge badge-tint">Promotional</span>` when `row.appType === 'Promotional'`. Under the position, render `<span className="ivd-job-meta text-body-s">From: {row.currentPosition}</span>` when it is non-empty.
- `InterviewerApplicantsList.tsx:994`: swap the colors so `Promotional` gets `badge-tint` and `Original` gets `badge-neutral`. Today they are the other way round, which makes the common case the louder one.

Per §10, application type is a category, not a status, so it uses the brand-tint chip, not green/orange/red. It is paired with a text label, never color alone.

**Rejected:** a separate Type column in the dashboard modal (the table is already tight at 1366px), and a colored left row border (reads as a status and relies on color alone).

## Caveats found while checking

- **Step 1 result (2026-10-30, read-only GET with the publishable key).** `applicants` has `application_type`, `employee_id` and `current_position` in the live database, even though no file in `supabase/migrations/` creates the last two. Of 57 applicants, 1 is `application_type = 'promotion'`, and it has both `employee_id` and `current_position` filled in. No fallback to `employees` is needed.
- **Bug found: hired external applicants read as Promotional.** 7 applicants with `application_type = 'job'` also have `employee_id` set. All 7 are `Hired` with an interview date. The hire path writes it: `src/lib/api/employeesApi.ts:278` runs `.update({ status: 'Hired', employee_id: empId })`. `getApplicantType` treats any `employee_id` as promotional, so these 7 already show as "Promotional" in the interviewer Applicants List's Type column and filter today. The new tag would repeat the error. Fix: `getApplicantType` trusts `application_type` when it is set, and uses `employee_id` only as a fallback for rows with no type. `isPromotionalSource` in `ApplicantDetailsPage.tsx:648` has the same rule (it would force the promotional scoring view on those 7). Fixing it there is decision D1 below.
- **Overlap with other plans (rechecked after pulling `main` at `0e26f03`).** Task 3A of `2026-10-30-promotional-hiring-fixes.md` is now merged (Jayyoo07/CICTrix-Fork PR #84). It changed only `isDemoApplicant` in `InterviewerDashboard.tsx` and `InterviewerApplicantsList.tsx`, which is not code this plan touches. `2026-10-30-applicant-status-and-score-writes.md` (Draft) Step 4 edits the *status* badge in `InterviewerApplicantsList.tsx` (around line 241). This plan edits the *type* badge (line 994). Same file, different lines, no logic conflict. Whichever lands second rebases.
- **Tests added by PR #84 still hold.** `InterviewerApplicantsList.promotion.test.tsx` asserts the text "Promotional" in the row, not a class, so the badge swap keeps it green. `InterviewerDashboard.promotion.test.tsx` asserts posting counts and the View button, and the added tag and "From:" line don't change either. All 51 interviewer tests pass on the merged branch before any change.

## Files affected

| File | Change |
|---|---|
| `src/modules/interviewer/interviewerDashboardModel.ts` | `CandidateRow.currentPosition`; set in `buildCandidateRows` |
| `src/modules/interviewer/InterviewerDashboardParts.tsx` | Tag and "From:" line in `CandidateListModal` rows |
| `src/modules/interviewer/InterviewerApplicantsList.tsx` | Swap the two badge classes on line 994 |
| `src/lib/interviewerEvalNavigation.ts` | `getApplicantType` checks `application_type` first (Step 1a) |
| `src/modules/interviewer/ApplicantDetailsPage.tsx` | Same rule in `isPromotionalSource`, only if D1 is yes |
| A new model test and a `CandidateListModal` render test | New coverage |

Not affected: `InterviewerDashboard.tsx` (it already passes rows through), the KPI quick-view cards (`KpiCard`, unchanged unless asked), `EvaluationForm.tsx`, `src/lib/api/employeesApi.ts` (writing `employee_id` on hire is correct; the reader was wrong), the database and migrations.

## Decisions

- **D1.** Apply the same `application_type`-first rule to `isPromotionalSource` in `ApplicantDetailsPage.tsx`? Recommended yes: it keeps the details page agreeing with the list and the tag. It is one line, plus a test.

## Steps

1. ~~Confirm the columns exist.~~ Done; see Step 1 result above.
1a. Make `getApplicantType` (`src/lib/interviewerEvalNavigation.ts`) trust `application_type` first. Add a test: `job` + `employee_id` → Original; `promotion` → Promotional; empty type + `employee_id` → Promotional. If D1 is yes, change `isPromotionalSource` to match.
2. Add `currentPosition` to `CandidateRow` and `buildCandidateRows`. Add a unit test in the model's test file: a promotional applicant gets `appType: 'Promotional'` and its `currentPosition`, and an original applicant gets `'Original'` and `''`.
3. Render the tag and the "From:" line in `CandidateListModal`. Add a render test: a promotional row shows "Promotional" and "From: …", and an original row shows neither.
4. Swap the badge classes in `InterviewerApplicantsList.tsx:994`.
5. Manual pass at 1366×768 and at mobile width: rows stay one line high or wrap cleanly, and the name tooltip still works.

## Risks

- **Row height grows** by one line for promotional rows. Acceptable at the 8-row page size. Checked in step 5.
- **Changing `getApplicantType` also changes the score setup** that Evaluate stores (`storeApplicantTypeForEval`). For the 7 hired rows that is a correction, not a regression: they were original applicants. Rows with an empty `application_type` keep today's behaviour.
- **Stale `current_position`:** it is the position at the time of application. After the promotion completes, the tag still shows the old "From:". That is correct for an interview record.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test` (plus the new model and render tests)
- DESIGN_IDENTITY.md §16 checklist: tokens only, the §10 category rule, contrast of `#191FA8` on `--bg-tint`, and mobile/tablet/desktop widths.
