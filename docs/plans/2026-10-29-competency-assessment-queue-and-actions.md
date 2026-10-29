---
title: Drain Competency Assessment Queue and Setup GitHub Actions Automation
date: 2026-10-29
status: Done
summary: Clear the 21 pending IPCR competency assessment jobs in the new semester and establish a scheduled GitHub Actions workflow to automatically process incoming approvals.
---

## Goal

Clear the "awaiting" state and placeholder `NON-SUBMISSION` status in the Semester Summary of Ratings by processing the 21 pending assessment jobs across the Office of the City Engineer (7), Office of the City Accountant (2), and Office of the City Health Officer (1). Going forward, automatically process new IPCR approvals via a scheduled GitHub Action without requiring manual operator intervention.

## Approach

1. **Immediate Queue Drain**:
   - Install Python dependencies (`fastapi`, `supabase`, `pydantic-settings`, etc. from `backend/requirements.txt`) in the local Python environment.
   - Run `python backend/run_competency_queue.py --once` to drain the current backlog of 21 pending jobs (11 matching, 10 assessing) for cycle 2 (July–December 2026).
   - This writes computed proficiency levels (1–5) to `employee_competencies` and qualitative feedback (strengths, growth areas, course recommendations) to `employee_competency_summaries`.

2. **Automated Scheduled Runner (GitHub Actions)**:
   - Create `.github/workflows/competency-assessment-queue.yml` running on a cron schedule (`*/30 * * * *`) and on-demand (`workflow_dispatch`).
   - The workflow sets up Python 3.12, caches dependencies, installs `backend/requirements.txt`, and executes `python backend/run_competency_queue.py --once`.
   - Pass necessary environment variables (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`) securely via GitHub Actions Secrets.

## Steps

1. **Prepare Python Environment & Drain Backlog**:
   - Execute `python -m pip install -r backend/requirements.txt`.
   - Run `python backend/run_competency_queue.py --once`.
   - Verify that all 21 pending jobs in `competency_assessment_runs` transition to `complete`.
   - Verify that `employee_competencies` and `employee_competency_summaries` contain records for cycle 2.

2. **Verify Frontend Reflection**:
   - Check that in `SemesterSummarySection.tsx`, City Engineer, Accountant, and Health Officer show numerical rating averages instead of `—`, adjectival badges (e.g., `Very Satisfactory`) instead of `NON-SUBMISSION`, and 0 awaiting under *Needs Attention*.

3. **Create GitHub Actions Workflow**:
   - Write `.github/workflows/competency-assessment-queue.yml` with:
     - Schedule trigger: `cron: '*/30 * * * *'` (every 30 minutes).
     - Manual trigger: `workflow_dispatch`.
     - Job steps: checkout, setup-python (version 3.12), pip cache, pip install, and `python backend/run_competency_queue.py --once`.
     - Environment variables mapped to repository secrets.

4. **Regenerate Plan Index**:
   - Run `powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1`.

## Risks

- **Gemini API rate limiting or quota exhaustion during batch**: Handled by `backend/run_competency_queue.py`, which records `attempts` and `last_error` without crashing the queue.
- **Missing GitHub Actions Secrets**: If secrets (`SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`) are not configured in the GitHub repository settings, the remote workflow will exit with error code 2 ("Ensure backend/.env is populated"). We document the required secrets clearly.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- Database queue status check: 0 pending, 21 complete in `competency_assessment_runs` for cycle 2.
- `powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1`
