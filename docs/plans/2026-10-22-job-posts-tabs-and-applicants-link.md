---
title: Job Posts — Vacancies tab first, trimmed row actions, Applicants opens the filtered Application tab
date: 2026-10-22
status: Done
summary: Job Vacancies becomes the first and default tab. Job Positions rows keep only Details and delete. Job Vacancies rows keep only Applicants and Close Vacancy, and Applicants opens Applicants › Applications filtered to that position through ?positionId=, with a heading, Clear filter, a back link and an empty state. The now-unused in-page applicants view on Job Positions is removed. Shipped to main.
---

## Goal

RSP lands on Job Vacancies, opens and closes vacancies there, and jumps from a vacancy straight to its applicants. Job Positions is only for maintaining position records.

## Decisions

| # | Decision |
|---|---|
| D1 | Tabs: Job Vacancies (default, no param) then Job Positions (`?tab=positions`). The old `?tab=vacancies` still opens Job Vacancies. Each tab keeps its own button and count badge. |
| D2 | Links that mean a position record go to `?tab=positions`: the Details page's Edit Posting (`editJobId`) and the Create Job Position link inside the Open Vacancy dialog. Sidebar and dashboard links stay `/admin/rsp/jobs` and now land on Job Vacancies, which is the intent. |
| D3 | Job Positions: remove the Applicants button from the position rows and from the expanded plantilla rows (both are in the Actions column). The in-page applicants view they opened (`viewingApplicantsFor`, its fetch, search and plantilla filter) then has no entry point and is removed as unused code. Actions column becomes Details + delete, right-aligned with a fixed width. |
| D4 | Job Vacancies: remove Details. Actions are **Applicants (N)** and Close Vacancy. Applicants navigates to `/admin/rsp/applications?positionId=<job_postings.id>`. |
| D5 | The Applications page reads `positionId`. An application belongs to the position when any plantilla it is linked to (`application_plantilla_slots`, or `applicants.plantilla_slot_id`) is one of that position's plantillas, or its `job_posting_id` is the position id. This covers positions with several plantillas. It replaces nothing: the existing Office / Position / Type filters still apply on top. |
| D6 | One shared function (`src/lib/applicationsByPosition.ts`) decides membership. Job Posts uses it for the button count, so **N equals what the filtered Applications page lists** (its main table plus its Shortlisted section; Qualified and Disqualified live on other tabs, as today). If the links haven't loaded, the label stays "Applicants". |
| D7 | Filtered page: heading "Applicants for [Position Title]", a **Clear filter** button (drops the param, shows everything), a **‹ Back to Job Vacancies** link, and the empty state "No applicants yet for this vacancy." Opening an applicant and coming back returns to the filtered list. An unknown `positionId` shows "This position no longer exists" with Clear filter. |
| D8 | The saved mockup `docs/mockups/2026-10-19-job-post-split.html` shows Job Positions first. Your request supersedes that order. |

## Steps

1. `src/lib/applicationsByPosition.ts` + tests.
2. `ApplicationsListPage.tsx`: `positionId` param, heading, Clear filter, back link, empty state, return-to-filter on applicant open.
3. `JobVacanciesPanel.tsx`: drop Details, Applicants (N) navigates. `JobPostingsPage.tsx`: tab order and default, drop row Applicants buttons and the unused applicants view, Actions column width, count map. `JobDetailsPage.tsx`: Edit Posting goes to `?tab=positions`.
4. Tests: tab order and default, no Applicants on Job Positions, no Details on Job Vacancies, Applicants navigation with the param, Applications page filtering (including a two-plantilla position) and empty state.
5. `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run check:migrations`.
6. Browser check on the dev server (needs a working RSP sign-in; see Risks).
7. Commit, `git pull --rebase origin main`, push `HEAD:main` (no force), confirm the Vercel and Supabase statuses on the commit.

## Risks

- **Lint can't run.** The repo has no ESLint config, so `npm run lint` errors before linting anything. I won't add one (out of scope); tsc and the build are the gate.
- **Branch.** `main` is checked out in `C:/Users/Trisha/CICTrix`, so this worktree can't switch to it without disturbing that checkout. I'll commit here, rebase on `origin/main` and push `HEAD:main`. The result on `main` is the same.
- **Verification in a browser.** The local `.env` holds a disabled legacy anon key, so the dev server can't sign in, and I won't type the live admin password on production. Unless you sign in or update `.env`, the visual checks are covered only by component tests.
- **Vercel.** No Vercel CLI here. The repo auto-deploys from `main` (confirmed last push via the GitHub commit status). I'll report that status and its URL.

## Checks to run

- `npx tsc --noEmit`, `npm test`, `npm run build`, `npm run check:migrations`.
- Browser (if sign-in works): Vacancies first, refresh keeps `?tab=positions`, row actions, Applicants → filtered list → applicant → back, Clear filter, empty state, mobile width.
- DESIGN_IDENTITY §16 checklist on touched UI.
