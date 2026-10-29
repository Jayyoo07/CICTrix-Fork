---
title: Fix applicants fetch 500 error and backend invocation crash
date: 2026-10-28
status: Done
summary: Point getApplicantsFromSupabase and applicant views directly to the Supabase client, and harden backend config against missing Vercel environment variables.
---

## Goal

Opening any CICTrix portal route no longer triggers a `500 (Internal Server Error)` on `GET /api/applicants/?skip=0&limit=1000` and the corresponding `[recruitmentData] Failed to fetch applicants from API` console error. The navigation sidebar qualified count badge accurately reflects live Supabase applicant records, and the Vercel Python serverless function avoids `FUNCTION_INVOCATION_FAILED` crashes caused by strict Pydantic settings loading.

## Approach

1. **Frontend Data Source Correction (`src/lib/recruitmentData.ts`)**:
   `getApplicantsFromSupabase()` in `src/lib/recruitmentData.ts` currently fetches `/api/applicants/?skip=0&limit=1000` under the legacy premise of bypassing RLS. In reality, the rest of the application reads the `applicants` table directly via `@supabase/supabase-js`. We will update `getApplicantsFromSupabase()` to query `supabase.from('applicants').select('*')` directly, map the database columns to the frontend `Applicant` model identically, and retain localStorage as an error fallback.

2. **Eliminate Speculative API Calls in Views (`ForHiringPage`, `ApplicantRankingPage`, `InterviewerDashboard`)**:
   `ForHiringPage.tsx`, `ApplicantRankingPage.tsx`, and `InterviewerDashboard.tsx` currently probe `/api/applicants/?skip=0&limit=...` first before falling back to Supabase. We will invert them to query Supabase directly first, eliminating wasted failing network requests on initial page load.

3. **Backend Environment Configuration Hardening (`backend/app/core/config.py`)**:
   The Vercel Python serverless runtime crashes on module import (`FUNCTION_INVOCATION_FAILED`) because `backend/app/core/config.py` defines required Pydantic fields (`SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET_KEY`) without defaults. When deployed on Vercel without these explicit backend secrets, it crashes before booting. We will add fallback detection to `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` and safe optional defaults so the Python app imports cleanly.

## Steps

1. In `src/lib/recruitmentData.ts`:
   - Refactor `getApplicantsFromSupabase` to query `supabase.from('applicants').select('*').order('created_at', { ascending: false })`.
   - Preserve the exact existing data transformation into `Applicant` objects.
   - Maintain the catch block fallback to `getApplicants()` (`localStorage`).

2. In `src/components/ForHiringPage.tsx`, `src/components/ApplicantRankingPage.tsx`, and `src/modules/interviewer/InterviewerDashboard.tsx`:
   - Prioritize direct `supabase.from('applicants')` queries over `/api/applicants/` HTTP calls.

3. In `backend/app/core/config.py`:
   - Set fallback reads for `SUPABASE_URL` (to `VITE_SUPABASE_URL`) and `SUPABASE_KEY` (to `VITE_SUPABASE_ANON_KEY`).
   - Default `SUPABASE_SERVICE_ROLE_KEY` to `""` and `JWT_SECRET_KEY` to a sensible fallback so import-time validation does not crash the serverless container.

4. Run verification checks:
   - `npx tsc --noEmit`
   - `npm run lint`
   - `npm test`
   - `npm run build:verify`

## Risks

- **Data Schema Drift**: If column mappings between `applicants` in Supabase and the frontend `Applicant` interface diverge, fields could be missing. *Mitigation*: Reuse the exact column-to-field mapping already established in `getApplicantsFromSupabase()`.
- **Active User Sessions / Badges**: Changing `getApplicantsFromSupabase` to live Supabase reads will cause the badge count to immediately show live database numbers rather than localStorage fallback values. This is desired behavior.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npm run build:verify`
- Regression test for `getApplicantsFromSupabase()` in Vitest.
