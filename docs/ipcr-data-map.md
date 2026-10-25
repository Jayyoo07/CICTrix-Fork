# IPCR data map

Verified 2026-10-26 against the repo and the production schema. Every claim below names its evidence; anything not verified is labelled as second-hand. Read this before touching any IPCR screen or seeding IPCR data.

## Why this file exists

An IPCR is stored in eleven places. Screens each read a different subset, and two of the stores have no writer in the running app at all. That is how the Summary of Ratings came to show 0 of 130 while 272 approved IPCRs existed.

## The stores

| Store | Written by | Live readers | State |
|---|---|---|---|
| `performance_cycles` | migrations only | 15+ files | fine |
| `target_settings` | Phase 1 save, Phase 1 approval, Phase 2 save | semester card, succession score, tracker, 2.4 | **record of truth** |
| `mfos`, `success_indicators` | Phase 1 save | 2.3, 2.4, workspace | fine |
| `success_indicator_ratings` | Phase 2 save, office override | 2.3, semester card, mirror | accomplishment column empty for seeded rows |
| `ipcr_submissions` | `setSubmissionStage` | 2.2 tracker, RSP eligibility | no rows for seeded staff |
| `locked_targets` | `setSubmissionStage` on target forward | 2.3 "In Vault" | no rows for seeded staff |
| `ipcr_workspace` | employee workspace save; roll-up updates only, never inserts | employee portal, PDF | no rows for seeded staff |
| `performance_evaluations` | **nothing live** | PM dashboard, PM reports, 2.4, succession transfer, analytics | empty |
| `ipcr_performance` | **nothing live** | SoR landing via view, archive, gap view, 2.4 rows | empty |
| `employee_competencies` | FastAPI assessor only | semester card, framework, gap analysis | empty |
| `ipcr_competency_matches` | FastAPI matcher only | L&D needs, recommendations, trace | empty |

## What a finished IPCR is meant to leave

Derived from the write paths, not from intent.

1. `target_settings` — status approved, phase2 completed, approver and timestamps.
2. `mfos` → `success_indicators` → `success_indicator_ratings` — targets, accomplishment, Q/E/T, remarks.
3. `ipcr_submissions` — one row per phase, `target` and `rating`, each at `Forwarded to PM` ([ipcrApproval.ts:162](src/lib/api/ipcrApproval.ts#L162), [ipcrRatings.ts:365](src/lib/api/ipcrRatings.ts#L365)).
4. `locked_targets` — one frozen set per employee and period ([ipcrSubmissions.ts:180-193](src/lib/api/ipcrSubmissions.ts#L180-L193)).
5. `ipcr_workspace` — category averages and overall rolled up, if a row already exists ([ipcrRatings.ts:505-533](src/lib/api/ipcrRatings.ts#L505-L533)).
6. `ipcr_audit_log` — approve and rate actions.
7. `performance_evaluations` — never written by the Phase 1/2 path at all.

The seed migration wrote 1 and 2 (without accomplishments) and none of 3 to 7.

## Dead code, verified by call-site search

- `handleSaveIPCR` at [EmployeePage.tsx:999](src/modules/employee/EmployeePage.tsx#L999) is never called. `isEditingIPCR` and `ipcrSaving` are set and never read in JSX. `saveOrSubmitEmployeeIPCR` has no other caller. **The legacy employee IPCR form cannot be reached**, so `ipcr_performance` and `performance_evaluations` have no live writer.
- `LockedTargetsVault`, `ComplianceTracker` and the `TABS` array in `SystemAdministrationPage.tsx` are defined and never rendered. The page wires only Office Directory and Access Role Management.
- `ipcr_performance` has no `remarks` column; `saveOrSubmitEmployeeIPCR` still sends one. Latent, unreachable.

## Constraints, read from production on 2026-10-26

- `ipcr_performance`: no CHECK constraints. All columns nullable except bigint `id`. FK `employee_num → employees.employee_number`, FK `competency_id → competency_dictionary`. No `remarks`.
- `ipcr_submissions`: unique `(employee_id, period, phase)`; `period`, `phase` NOT NULL; `stage` CHECK includes `Forwarded to PM`.
- `performance_evaluations`: unique `(employee_id, cycle_id)`; `status` CHECK is Planning / Self Evaluation / Supervisor Review / Approved / Rejected; `final_score` 0–5; `employee_id` NOT NULL.
- `locked_targets`: **no** unique key on `(employee_id, period)`; `targets` NOT NULL default `[]`; `locked_at` NOT NULL default now.

## The gap view

`pg_get_viewdef` captured 2026-10-26. `FROM ipcr_performance` with LEFT JOINs to `employees` (on `employee_num`), `competency_dictionary`, and `qualification_standards` (on `position_id` + `competency_id`). Consequences:

- Rows with null competency survive and still count; `required_proficiency` falls back to 3.0 and `training_stream` to "General Training".
- `possessed_proficiency = avg(ave_rating)`, so any row with rating ≤ 0 is dropped by the app's `> 0` filter.
- `required_proficiency` comes from `qualification_standards`, not `position_competency_requirements`. This resolves Known Issue 1 in `IPCR_DATA_INTEGRITY_CHECKLIST.md`.
- The view exposes no `rating_period`, so no reader can scope it to a semester.

## Period labels are three strings for one semester

- `performance_cycles.title`: `July–December 2025`
- `ipcr_performance.rating_period` and the archive: `Jul 1-Dec 31 2025`
- `ipcr_workspace.period`: whichever the employee typed
- `ipcr_submissions.period` and `locked_targets.period`: the cycle title

`normalizeSemesterKey` in [semesterTransition.ts:98](src/lib/api/semesterTransition.ts#L98) already reduces all of them to `2025-H2`. `getEmployeeHistory` does not use it, and merges on the raw string, so a semester stored under two spellings renders as two half-filled cycles on 2.4.

## Failure modes a sync migration must survive

1. Employee with null `employee_number` — FK and view both misbehave. Skip and raise a notice with the count.
2. Rating row with all of Q/E/T null — `ave_rating` null, row vanishes from SoR. Skip the indicator.
3. Unrecognised cycle title — derive the legacy label from `start_date`/`end_date` instead of a hardcoded map, so a new semester needs no code edit. `to_char` month abbreviations depend on `lc_time`; assert the produced label or pass an explicit format.
4. Phase 2 reopened after finalization — mirrored rows linger. Re-run deletes tagged rows; a reopen that never re-completes leaves them. Decide explicitly.
5. Duplicate tagged rows — delete by `ipcr_id like 'IPCR-TS-%'` before insert, not `insert` alone.
6. Untagged legacy rows for the same employee and period — skip the whole key so the employee's own filing wins.
7. Trigger recursion — the function must not update `target_settings`.
8. `security definer` without a pinned `search_path` — set `search_path = public, pg_temp`.
9. Grants — the admin portals authenticate with Supabase Auth, so `EXECUTE` goes to `authenticated` and `service_role`, never `anon`. A `security definer` function in `public` is reachable by every role by default, and nothing stops an anonymous caller passing an arbitrary uuid.
10. RLS — running as owner bypasses it; that is why the previous writes as anon worked when their policies were permissive.
11. `check:migrations` — create both files with `npx supabase migration new`, never by hand.
12. Backfill inside the migration — assert counts and raise on mismatch rather than leaving half-written stores.
13. Order — accomplishments must land before the mirror's backfill, or mirrored rows carry null text.
14. `performance_evaluations` conflict — `on conflict (employee_id, cycle_id) do nothing`, so a legacy row is never overwritten.
15. `locked_targets` shape — `[{function_type, target_text, competency_id, mapped_competency_standard}]`, the shape `fetchTargetRowsForEmployee` produces.
16. Trigger syntax — `EXECUTE FUNCTION` takes no arguments, so `execute function f(new.id)` is a syntax error (42601). A trigger function must be `returns trigger`, take no parameters, and read `NEW`/`OLD` itself. Wrap any argument-taking function in a thin `returns trigger` function.

## Verified against production (2026-10-26)

Read over the Data API with the publishable key `sb_publishable_…`, so the numbers are current, not remembered.

- Row counts: `target_settings` 272, `success_indicator_ratings` 760, `success_indicators` 760, `mfos` 760. Everything else is empty: `ipcr_performance` 0, `performance_evaluations` 0, `ipcr_submissions` 0, `locked_targets` 0, `employee_competencies` 0, `ipcr_competency_matches` 0, `v_competency_gap_analysis` 0.
- One indicator per MFO, so the mirror writes 760 `ipcr_performance` rows across the three semesters, and the accomplishment fill touches the same 760 rating rows.
- Finalized IPCRs by cycle: January–June 2025 holds 78, July–December 2025 holds 80, January–June 2026 holds 114. **272 in total**, and in each cycle the IPCR count equals the distinct employee count, so no employee has two records in one cycle. Expect 114 of 130 on the Summary of Ratings once the mirror runs.
- Cycles are ids 7, 5, 6, 2 with the expected dates; the derived legacy labels match the canonical list once `Jan 1-Jun 30 2026` is added.
- `employees` has `employee_number`, `first_name`, `last_name`, `department`, `position`, `position_id` and `plantilla_num`. It has **no `department_id`** — the office resolves by name. `departments.id` is a uuid, matching `locked_targets.office_id`.
- `finalize_ipcr_surfaces` does not exist yet (`PGRST202`), so the app's RPC call will fail until this migration applies. The fan-out is idempotent, so a retry after it lands is safe.
- The 805 `ipcr_performance` rows recorded in `IPCR_DATA_INTEGRITY_CHECKLIST.md` on 2026-07-19 are gone, most likely truncated by the dataset reset. That history cannot be recovered; the archive will hold only the three semesters this work mirrors.
- The `VITE_SUPABASE_ANON_KEY` in `.env` is the legacy JWT anon key, disabled on 2026-09-24. Every request with it returns 401, so local `npm run dev` cannot read the project until it is replaced with the publishable key.

## Not verified here

- The migrations themselves have never run. No local Postgres, no Docker, and repo migrations are not hand-applied, so they are validated at merge time.
