# Semester IPCRs for succession planning: summary

Plan: [2026-10-25-semester-ipcr-seed](../plans/2026-10-25-semester-ipcr-seed.md)

## Shipped

- **PR #25** (migration `20261024174932_seed_semester_ipcrs.sql`), applied to production. The year-long cycles became semesters: Jul–Dec 2025 (cycle 5), Jul–Dec 2026 (cycle 2, Active, empty), plus new Jan–Jun 2025 and Jan–Jun 2026 (Completed). It inserted 194 finalized IPCRs for 114 employees (78 for H1 2025, 2 for H2 2025, 114 for H1 2026), each with a position-tailored Core MFO, the office's Strategic and Support wording, deterministic ratings, and the department head as approver where one exists.
- **PR #26**: `poolExclusionReason` in `successionCriteria.ts`, applied in `listAutoSuccessors`. Auto-listed successors now exclude the incumbent, anyone holding the same title, and employees from other offices. Manual nominations are unaffected. Eight new tests.

## Planned vs shipped

Matches the plan. The 10 settled decisions were built as written.

## Deviations

- The plan estimated about 196 new IPCRs. The rule "hired on or before the semester's first day" gives 194: H1 2025 is 78, not 80, because two employees were hired after Jan 1, 2025.
- Preview deployments of both PRs waited on a Vercel authorization from a `dehandenver` team member (the PR comes from a fork). #25's Vercel check ended in FAILURE and the PR was merged anyway.
- The migration could not be executed before merge (no local Postgres, and writes through the Supabase MCP are declined here). It was validated by a read-only dry run of its logic and by parsing it with Postgres's parser instead.

## Checks run

- `npm run check:migrations`: OK (107 files). `npx tsc --noEmit`: clean. `npx vitest run`: 762 passed.
- Production after #25: 272 IPCRs (78 + 80 + 114), all approved and completed, 0 duplicate (employee, cycle) pairs, 0 ratings outside 1 to 5. Only the 3 employees hired in 2026 have no IPCR. The 36 IPCRs with no approver are the 5 heads' own (15), Information Technology (head soft-deleted, 10) and Legal (no head, 11).
- Real `listAutoSuccessors` run for all 33 critical positions with #26's code, read-only, through the publishable key: 26 positions have ranked successors, 7 have none, 0 incumbent, same-title or cross-department violations, and every ranked candidate has an IPCR.

## Not verified / known gaps

- `npm run lint` cannot run: the repo has no ESLint configuration (fails the same way on `main`).
- **7 positions have no qualified successor**, reported rather than forced, as decided:
  - City Health Officer II: 2 candidates fail course, experience and training hours.
  - Dentist IV (Chief Dentist): 1 candidate fails experience.
  - Nutritionist-Dietitian III (City Nutrition Officer) and City General Services Officer: nobody else shares the title keyword.
  - Administrative Officer V (Admin Officer, Social Welfare): 2 candidates fail experience and training, and one lacks the required eligibility level.
  - Supervising Building Official and Supervising Transportation Regulation Officer: 1 candidate each fails the course match.
- **The seniority rule (spec section C) never fires.** No employee's position string matches a row in `positions`, so senior people are ranked as successors to junior posts (for example the City Engineer for Assistant City Engineer). Proposed as a separate task, not fixed here.
- The existing 78 IPCRs keep their generic Core wording and their Jan 2025 `approved_at`, although they are now labelled Jul–Dec 2025. Ranking is unaffected, because everyone with an older record also has a newer Jan–Jun 2026 one.
- Counts reflect the database on 2026-10-25 and will drift as employees change.
