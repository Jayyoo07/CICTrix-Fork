---
title: Security remediation (credentials, document encryption, authorization and public applicant flows)
date: 2026-10-16
status: Draft
summary: Expanded by the October 27 evidence-based review. Contain leaked service-role and document keys, replace browser-only credentials, enforce role and record authorization, and secure applicant identity, document validation, audit history and resource limits.
---

## Goal

After this plan, someone holding only the public publishable/anon key (which every visitor's browser has) can read open job postings and public reference data, and start a controlled application submission. Access to an existing person's applications, resubmissions and documents requires verified ownership. A reference number or a typed email address is not proof of identity. Staff access requires a signed-in Supabase Auth user, and database policies and backend checks limit that user to their active role and assigned records.

The remediation remains **Draft**. The user approved the investigation and expansion of this document on 2026-10-27, not execution of the remediation phases. Review scope: trace code and live read-only security configuration, reproduce suspected flaws locally with synthetic data, add supported findings and checks, then update the session summary and generated dashboard.

## Findings this plan fixes

Original audit of 2026-10-15, read-only, against the repo and the live project `fyzdfgxaaowjzbjpwrii`. Counts below are historical unless explicitly refreshed in the October 27 section.

| Ref | Finding | Evidence |
|---|---|---|
| F1 | A `service_role` key with an expiry claim in 2036 was reported committed in public repos `Jayyoo07/CICTrix` and `dehandenver/CICTrix`. An active service-role key bypasses RLS and grants Auth admin access. Its expiry claim alone does not establish that it remains active. | October 27 local scan reconfirmed service-role JWTs in 25 tracked files: `VERCEL_DEPLOYMENT.md`, `.claude/settings.local.json`, 23 under `scratch/`. The leaked credential was not used to test current validity. |
| F2 | October 27 catalog inspection found 80 public base tables with RLS off; 78 have all four anon SELECT/INSERT/UPDATE/DELETE grants. | Includes `employee_education`, `employee_history`, many `ipcr_*` tables, `succession_candidates`, `evaluations`, `supervisor_password_resets`. Original count was 76. `employee_documents` now has RLS enabled but still has open-access policies (F3). See the refreshed baseline for grant exceptions. |
| F3 | Tables that do have RLS on use allow-all policies (`using (true)`) for anon. | `employees`, `employee_portal_accounts`, `applicants`, `applicant_attachments`, `employee_children`, `idp_submissions`. `employees` exposes TIN, SSS, GSIS, PhilHealth, Pag-IBIG, birth date, addresses, emergency contacts. |
| F4 | Portal passwords are stored/compared as plaintext; employee and supervisor credentials are exposed to anon, and office-account passwords to authenticated callers. | Historical counts: `employee_portal_accounts.password` 78 rows, `supervisors.password` 4, `office_role_assignments.account_password` 9; no hashes in that audit. October 27 HEAD verified anonymous access to the employee password column for 130 visible rows without downloading values. Live office-password column grants still allow authenticated SELECT, not anon SELECT. |
| F5 | Login for employees and promotional applicants is checked in the browser by fetching or caching account rows and comparing passwords. | `src/lib/employeePortalData.ts:92–112,326–337,395–425`; `src/modules/applicant/ApplicantWizard.tsx:1185–1188`. See F19 for password-change and stale-cache consequences. |
| F6 | Anon can call `SECURITY DEFINER` RPCs that manage accounts: `demo_set_password(account_id, …)` resets anyone's demo password, `demo_create_account` creates accounts with any role. | Advisor `anon_security_definer_function_executable`. |
| F7 | 10 admin policies trust `user_metadata`, which any signed-in user can edit on themselves. | Advisor `rls_references_user_metadata` (`performance_cycles`, `competencies`, `idp_entries`, `application_activity_log`, `training_course_drafts`, …). |
| F8 | `employee-documents` is public with unrestricted bucket-level insert/update/delete policies. `applicant-attachments` is private but allows public reads of files not hidden by the soft-delete helper, and bucket-wide insert/update/delete. | October 27 `storage.buckets` and `storage.objects` policies. Private bucket status alone is not access control when anon SELECT permits downloads/signing. |
| F9 | FastAPI has unauthenticated data, email and AI routes; privileged handlers use a service-role client. Some routes have since gained authentication. | October 27: 32 router endpoints, 8 without auth dependencies, of which 3 are placeholder auth endpoints. The 5 business endpoints are applicant create/list, email send, competency matching and competency assessment. `evaluations.py` and `weighting.py` now have auth dependencies; do not repeat the old 21-of-32 count. See F17 for authorization holes behind authentication. |
| F10 | Leaked-password protection remains off; the refreshed advisor reports 44 mutable-search-path functions (34 in the original audit). | Advisors `auth_leaked_password_protection`, `function_search_path_mutable`; snapshot timestamp documented below. |

## Approach

Order matters. Retiring the leaked service-role key (Phase 1) stops its use; purging history (Phase 2) cannot recall copies already cloned, forked or cached. F11 requires a separate document-key rotation and migration of existing ciphertext. Neither rotation closes open table or Storage permissions, so restrict exposed data, key retrieval and unsafe RPCs during containment rather than waiting for the full portal migration.

The chosen identity architecture is **Supabase Auth for every person who signs in**, with verified JWTs available to RLS. This is a project choice, not a claim that Postgres only supports one identity provider. A hash-and-RPC login like the current `demo_login` would still leave subsequent requests anonymous unless a supported session/token integration were also implemented.

- **Portal identities.** Employees, supervisors / department heads and office accounts get `auth.users` rows, created by a one-off server-side script. Usernames without an email map to a synthetic address (`<username>@accounts.abyan.internal`), so users keep signing in with their username. Their role and employee link live in `app_metadata` (only writable with the service role) and in `public.user_roles`, never in `user_metadata`.
- **Existing passwords.** Treat exposed passwords as compromised. Provision accounts with fresh, securely generated credentials or one-use recovery/invitation flows; do not carry the exposed passwords into Auth. A first-login UI redirect does not stop someone who already knows a password from taking over its replacement. Enforce any pending-reset restriction server-side and remove plaintext columns and browser caches after cutover.
- **RLS model.** Carefully scoped helpers with a fixed `search_path`: `app_role()` (reads active `user_roles`) and `current_employee_id()`. Policies are written per table group against a role matrix (below), including column restrictions, record assignments, lifecycle state and disabled accounts. Audit `SECURITY DEFINER` function bodies and effective grants separately; enabling table RLS does not constrain a privileged function owner.
- **Rollout.** Each table group is built and tested on a Supabase preview branch (or a local `supabase start` stack loaded from a schema dump), with pgTAP tests in `supabase/tests/`, then applied to live one group at a time. Turning RLS on will break any screen that reads with the anon client, so each group ships with its code changes.

### Role matrix (draft, to confirm in Phase 4.1)

| Data | anon | employee | supervisor / dept head | interviewer | RSP / PM / L&D admin | superadmin |
|---|---|---|---|---|---|---|
| Job postings, salary grades, public reference tables | read | read | read | read | read/write (own module) | all |
| Applicants, attachments | controlled submission; subsequent access only through verified, scoped applicant capability/session | own application through verified applicant flow | none | read assigned; evaluate assigned where authorized | RSP: recruitment workflow | all |
| Employee profile and PDS (`employees`, `employee_*`) | none | own row | own office (read) | none | read; write where module owns it | all |
| IPCR, evaluations | none | own | own office | none | PM: all | all |
| Training, IDP | none | own | own office | none | L&D: all | all |
| Succession | none | none | none | none | assigned modules | all |
| Accounts, roles, password resets, audit logs | none | none | none | none | none (via admin RPCs only) | all |

## Steps

### Phase 0: Decide (before any change)

1. Confirm whether the live database holds **real** personal data or only demo data. Have the Data Protection Officer assess the incident and applicable RA 10173/NPC notification criteria and deadlines, including the 72-hour requirement where applicable. A vulnerability alone does not establish every legal criterion for mandatory notification; preserve evidence and do not wait for remediation to start that assessment.
2. Decide whether to take the site offline during containment and staged cutover. Key rotation alone does not stop anon access to employee data; Phase 1 must also restrict the exposed data paths, with the full role model delivered in Phase 4.
3. Confirm who controls `dehandenver/CICTrix` (upstream). Phase 2 needs a force-push there too.

### Phase 1: Contain (same day)

1. **Rotate keys** (Supabase dashboard, done by you): create new publishable and secret API keys (`sb_publishable_…` / `sb_secret_…`), switch the app to them, then disable the legacy JWT-based `anon` and `service_role` keys. Disabling the legacy keys is what kills the leaked one.
2. Update the keys in Vercel env vars (`VITE_SUPABASE_ANON_KEY`, backend `SUPABASE_SERVICE_ROLE_KEY`), local `.env`, and any teammate's machine. Redeploy.
3. Inventory exact function signatures and revoke unsafe effective `EXECUTE` grants from **PUBLIC as well as `anon` and `authenticated`** on demo account functions and unauthorized mutation RPCs, including `undo_document_validation` and `finalize_ipcr_surfaces`. Regrant only intended callers after authorization exists. The live demo functions and undo RPC inherit PUBLIC execution, so revoking only the named roles is insufficient. `sync_salaries_for_grade` returns `trigger`, not an ordinary callable RPC; protect writes to its source table and audit its body rather than treating it as a directly exploitable HTTP endpoint.
4. Turn on leaked-password protection in Auth settings.
5. Review Supabase logs (API and Auth) since the first leak commit for service-role traffic you don't recognise, and save what you find.
6. Contain F11–F12 immediately: restrict anonymous document access and rater writes; stop distributing the shared private key; remove the browser fallback; generate a replacement key outside source control. Inventory affected ciphertext before retiring the old key. Re-encrypt or rewrap existing files under a versioned key scheme; keep the old key only in a controlled migration/recovery process until verified. Rotation cannot make already copied ciphertext and a leaked key confidential again.
7. Restrict public reads/writes on sensitive tables and disable unnecessary public backend operations while the portal cutover is prepared. Taking the Vercel website offline alone does not close direct Supabase REST, RPC or Storage access.

### Phase 2: Purge history

1. Remove secret values from tracked files: the service-role JWT locations above and the document private key in `src/lib/crypto/_internal/keys.ts` and `supabase/migrations/20261026102622_document_encryption_keys.sql`. Untrack secret-bearing `.env` files only if tracked; keep sanitized examples. Coordinate historical migration sanitization with a new forward migration so fresh environments cannot reseed a compromised key.
2. Rewrite history with `git filter-repo` on a fresh mirror clone, covering all discovered secret values and paths, including non-JWT encryption keys. Inspect the rewrite before publishing it.
3. Coordinate history replacement with each repository owner after explicit approval. Follow this repo's remote restrictions: never push straight to `upstream` or to `Trsha11102004/CICTrix`; the upstream owner handles their repository. All collaborators re-clone; old clones must not be pushed back.
4. Ask GitHub Support to purge cached views and pull-request refs that still hold the old commits. Forks keep their copies; this is why Phase 1 comes first.
5. Enable GitHub secret scanning and push protection on the affected repositories, add a `gitleaks` pre-commit hook and CI scan, and check production bundles for embedded private keys. PEM-only or JWT-only searches miss the bare Base64 PKCS#8 key found in F11.

### Phase 3: Move logins to Supabase Auth and hash passwords

1. Migration: add `auth_user_id uuid references auth.users` to `employee_portal_accounts`, `supervisors`, `office_role_assignments`; extend `user_roles` with `employee_id` and `office`.
2. One-off migration script (run locally with the secret key from `.env`, never committed with it) that creates Auth users with new credentials/recovery flows, fills `user_roles`, and links `auth_user_id`. Use the active role table as the authorization source of truth; any mirrored metadata must never override explicit revocation or lookup failure.
3. Replace the browser password checks (F5) with `supabase.auth.signInWithPassword`, routed through `src/lib/`: employee portal, supervisor / office account, promotional application in `ApplicantWizard`. Change-password uses `supabase.auth.updateUser`.
4. Office account creation (`src/lib/api/officeRoles.ts`, `SystemAdministrationPage`) moves to a server-side endpoint or edge function that creates the Auth user. The generated password is shown once and never stored.
5. Rewrite the 10 `user_metadata` policies (F7) to use `app_role()`.
6. After all portals sign in through Auth: drop `employee_portal_accounts.password`, `supervisors.password`, `office_role_assignments.account_password`.
7. Remove local/demo credential fallbacks from connected mode, clear legacy plaintext account caches, and persist password changes in Auth before showing success. Test old-password rejection from a second browser, not only a same-tab login. Keep any first-change flag durable and enforced beyond route guards (F19).
8. Sign out of Supabase on interviewer logout as well as clearing UI state and decrypted-file caches (F18). Verify session/token behavior and define the remaining access-token lifetime. Remove unused custom-JWT acceptance, or explicitly enforce expiry, issuer/audience, active identity and revocation for every retained token path.
9. Enforce `is_active` in frontend login, backend dependencies and database helpers. Test disabled/deleted roles with stale metadata and already-issued tokens (F16).

### Phase 4: Real RLS

1. Confirm the role matrix above, table by table.
2. Add the scoped helpers and set `search_path` on the current inventory of flagged functions (44 in the refreshed advisor snapshot, not the original 34). A fixed path is not an authorization check; review effective function grants and bodies too.
3. Enable RLS and write policies per group, each a separate migration with pgTAP tests, in this order (most sensitive first): accounts and roles → employee PDS and documents → IPCR and evaluations → succession → training and IDP → applicants → reference tables.
4. Applicant tracking/submission (F13–F14): verify ownership before linking to an existing email identity or revealing its reference/history. Issue a high-entropy, expiring, narrowly scoped capability or authenticated applicant session; reference number plus a typed email is insufficient. Return only needed status fields. Replace arbitrary public table inserts with allowlisted submission/upload operations that derive identity, initial status and audit fields server-side. Preserve legitimate resubmission through the verified flow. Close public reference-registry reads and enumeration oracles.
5. Remove the allow-all policies (`*_open_access`, `Allow public …`, `Enable ALL for anon …`) and revoke blanket `anon` grants.
6. Inventory actual views and use `security_invoker = on` or revoke exposure as appropriate. The live `applicant_tracker_view` already has this setting, so its leak is the underlying permissions, not owner-rights execution. `employee_competency_summaries` is a base table on the inspected project, not a view. The advisor still flags `plantilla_slot_applicant_counts` as an owner-rights view.
7. Storage (F11–F12, F20): make `employee-documents` private; require verified ownership/assignment before issuing short-lived URLs or decrypting each file. A folder named after an applicant ID is not proof of ownership. Use scoped upload grants, server-validated size/type/content and per-applicant quotas. Apply Storage policies through Storage > Policies per repo rules. Do not return a global private key to every interviewer; decrypt only individually authorized objects in a trusted service or use equivalently scoped key access.
8. Backend (F9, F17): require verified identity plus active role, record assignment and valid workflow state on protected routes; explicitly allowlist health and redesigned public applicant operations. Use the caller's JWT wherever RLS can enforce scope. For necessary service-role operations, perform authorization before any database side effect. Reject 401/403 permanently rather than retrying through direct Supabase writes. Remove routes only after confirming they are unused.
9. Realtime: confirm subscriptions still work, since Realtime enforces RLS on the tables it publishes.
10. Document review/auditing (F14–F15): separate public file metadata from staff approval markers. Derive actor ID and timestamps from the verified server context and save the business action and audit event atomically. Prevent clients from fabricating approval/undo events or changing other people's uploads; restrict audit reads and make audit writes server-owned and append-only.
11. Abuse/privacy controls (F20–F21): bound recipient counts, body/request size, upload counts and AI input sizes; add identity-aware rate limits and provider budgets. Remove full applicant payload/response logging and raw database/provider exceptions from public responses; use redacted structured events and correlation IDs.

### Phase 5: Keep it closed

1. Run `get_advisors` (security) after every migration; zero `ERROR` lints is a necessary release gate, not proof of security. Business authorization, leaked browser keys and identity verification also need tests.
2. Add CI checks for RLS/grant/function drift and unsafe migrations, with reviewed public-reference exceptions. Cover PUBLIC grants, permissive policy combinations, `WITH CHECK (true)` inserts, authenticated-but-unscoped access, definer functions and unsafe default privileges; a text search for anon `USING (true)` alone misses these.
3. Write a short `docs/security.md`: the role matrix, which keys live where, and how to add a table safely.

## Risks

- **Phase 1 breaks anything that hardcodes the old keys,** including the local scripts in the repo root and `scratch/`. They need the new keys from `.env`.
- **Phase 4 breaks screens.** Many components read tables directly with the anon client; each table group needs its UI paths tested in every portal before it goes live.
- **Force-push disrupts collaborators** and any open PRs on both repos; it needs coordination with whoever owns upstream.
- **Users without an email** can't use self-service password reset with synthetic addresses; resets stay admin-driven through a server endpoint.
- **Exposed credentials** must be replaced through a trusted provisioning/recovery process. Hashing the same exposed password does not revoke it, and the existing password-change screen does not update the database.
- **Document rotation** needs a verified inventory, recoverable migration and key-version support. Removing the old key before migration can lose access to files; leaving it in a browser keeps them exposed.
- **Public applicant access** now requires an ownership-verification design, including applicants sharing an email and existing aliases. Prevent lockout without making typed email an authentication credential.
- **Scope.** This touches every portal and now includes encryption-key migration and applicant verification. Re-estimate implementation after the role matrix and ownership flow are agreed; the earlier 4–6-session estimate is not validated.

## Checks to run

- After Phase 1: a request with the old service-role key returns 401; the app works with the new keys.
- After Phase 2: secret scanning passes on a fresh clone and built assets; assert the leaked service-role and private-key material is absent, including bare Base64 keys. Public JWT-shaped values alone are not proof of a secret leak.
- After Phase 3: no plaintext password column/cache exists; anonymous password-column access fails; every portal signs in, changes its password durably and signs out of the underlying Auth session. Old passwords fail in a clean second browser; inactive users and stale role metadata cannot restore privileges.
- After Phase 4: Supabase security advisors show 0 `ERROR` lints; pgTAP/API tests prove role, owner, office, interviewer assignment and workflow boundaries for SELECT/INSERT/UPDATE/DELETE and RPCs. Anonymous protected API calls fail before side effects; authenticated wrong-role calls fail too. Explicit public endpoints have separate scoped tests.
- Every phase: `npx tsc --noEmit`, `npm run lint`, `npm test`, and a click-through of each portal.

## October 27 review: evidence and additional findings

### Scope and confidence

Reviewed local source at commit `b1594a2f8ac6853b780d10793bedb63ca05f0451`, tracked-file secret locations, current local `dist`, and read-only configuration on `fyzdfgxaaowjzbjpwrii`. Inspected security/performance advisors, aggregate log-source counts, catalog grants, RLS policies including permissive/restrictive modes, function definitions, triggers, constraints and Storage bucket settings. No production rows, users, permissions or files were changed; no email/AI calls or mutation RPCs were executed. The leaked service-role key was not exercised.

**Live-confirmed** means the relevant server configuration was inspected, with anonymous HTTP checks where specified. **Code-confirmed** means a reachable source path or isolated local reproduction establishes the defect; it does not imply a successful production exploit. Local Python reproductions executed the inspected function bodies with in-memory DB/Auth doubles, not a full deployed FastAPI stack. The documented hostname `https://abyan-hris.vercel.app` returned HTTP 404, so current Vercel deployment, backend environment and deployed bundle contents were not established.

Refreshed baseline:

- The security advisor snapshot was observed at `2026-10-26T22:44:21.724Z`: 79 tables without RLS, 10 metadata-trusting policies, 44 mutable-search-path functions, 18 anon-executable definer-function findings, and leaked-password protection disabled. Direct catalog inspection on October 27 found **80** public base tables with RLS disabled; **78** had all four anon SELECT/INSERT/UPDATE/DELETE grants. The exceptions were `accounts` (no table-level anon SELECT) and `ipcr_audit_log` (no anon UPDATE/DELETE). These are different observation times/scopes, not interchangeable totals.
- Anonymous HTTP **HEAD** requests using only the configured public anon key returned **206** for `applicant_tracker_view` (`select=id`, 31 visible rows), `raters` (`select=id`, 3 rows), and `employee_portal_accounts` (`select=password`, 130 rows). Requests used `limit=0` and `Prefer: count=exact`; no field values were downloaded. This verifies live Data API exposure rather than merely inferring it from migrations.
- Some protections work: `user_roles` has self-read-only RLS; `document_encryption_keys` denies direct anon/authenticated access; the decryption RPC itself denies anonymous execution. The soft-delete policies inspected on applicants, attachments and portal accounts are **restrictive**, so they are not defeated simply by permissive OR composition. The findings below account for these protections.
- Local tracked-file inspection reconfirmed F1's 25 secret-bearing paths. Current public GitHub visibility and whether the leaked JWT has been revoked were not rechecked. Historical plaintext password counts in F4 were not refreshed by reading password values.

### F11 — Critical: document private key is shipped to the browser and permission failures fall back to it

**Evidence:** `src/lib/crypto/_internal/keys.ts:6–10,64–101` embeds both halves of the RSA key pair. Even in connected mode, an unsuccessful `get_document_decryption_key` call falls back to that private key at lines 83–85. `supabase/migrations/20261026102622_document_encryption_keys.sql:25–35` seeds the same pair. Both files are tracked, and the exact private-key string appears in local `dist/assets/index-C7T1lXle.js`.

**Verification/impact:** Live stored key fingerprints matched the source pair (comparison only; private values were not returned by the live query). A local test ran the actual key/cipher modules with mock mode false and an RPC returning `42501`; a synthetic encrypted document still decrypted correctly. Anyone possessing ciphertext encrypted with this pair can decrypt it offline; current F8 permissions also permit downloading active applicant files. This does not prove how many existing files use that key or that the inspected local bundle is deployed.

**Remediation/check:** Phase 1.6 and Phase 2. Rotate and migrate affected encryption, remove every production fallback, and fail closed on key authorization errors. Test unauthenticated/wrong-role decryption denial, scan built assets, and verify the new scheme cannot be decrypted using the leaked key. Preserve controlled access to old ciphertext until migration is verified.

### F12 — High: editable interviewer records authorize retrieval of a global decryption key

**Evidence:** Live `raters` has anon/authenticated INSERT/UPDATE/DELETE grants and permissive `true` policies, including `raters_anon_all`; its only constraints are primary key/unique email, with no user triggers. The live decryption function matches `auth.jwt()->>'email'` to any active rater and returns the single `default` private key, without checking an applicant assignment. This matches `supabase/migrations/20261026102622_document_encryption_keys.sql:59–94`. `src/modules/interviewer/InterviewerLogin.tsx:98–145` also uses these records as the interviewer access list.

**Prerequisite/impact:** A caller with any valid Supabase Auth account/email can make that email an active rater using the public write path, then satisfy the key RPC's interviewer branch. An already-authorized interviewer receives a key shared across applicants, not just assigned applicants. These paths remain unsafe after merely deleting the embedded key in F11. Live policies and function body confirm the chain; no rater was inserted or changed to exercise it.

**Remediation/check:** Restrict access-list writes to authorized administrators, bind raters to immutable Auth user IDs, and enforce assignment for individual document access. After rotating the key, verify an unrelated signed-in user cannot self-enroll and interviewer A cannot obtain/decrypt interviewer B's files.

### F13 — High: unverified email links identities and discloses existing application references

**Evidence:** `src/lib/applicantTracker.ts:36–64` permits email-only lookup. `src/modules/applicant/ApplicantWizard.tsx:850–899,943–991` returns an existing reference for duplicate submissions and returns a new insert's reference. The live `assign_application_reference_no` trigger reuses the primary reference for `NEW.email` without verifying ownership (`supabase/migrations/20261021200000_one_reference_per_applicant.sql:141–189`). The reference registry is readable by every authenticated role through `USING (true)`; the normal reference format has six decimal digits generated with `random()` (lines 98–139).

**Prerequisite/impact:** Knowing another applicant's email is enough for the current tracker. With an eligible open vacancy, submitting under that email can return the victim's shared reference and attach an unrelated application to their identity. The duplicate-submission path is another reference disclosure. Replacing tracker reads with `track_application(reference_no, email)` alone would retain this weakness: both inputs can be obtained without ownership verification. Trigger/policy definitions and call sites were checked; no impersonated application was submitted.

**Remediation/check:** Phase 4.4. Verify email ownership or an equivalent approved identity process before revealing/linking existing records; use scoped unpredictable tokens/session identity, throttling and generic pre-verification responses. Test same-email submissions, duplicate applications, aliases and arbitrary authenticated registry reads. A longer reference alone does not fix identity spoofing.

### F14 — High: public attachment inserts can forge staff document approval

**Evidence:** The live `applicant_attachments` INSERT policy is `WITH CHECK (true)` for anon/authenticated. Catalog inspection found only its primary key and applicant foreign key, with no user triggers or check restricting reserved document types. `src/modules/interviewer/ApplicantDetailsPage.tsx:896–914` treats `document_type='doc_validated'` rows as durable approvals; its approval writer creates those rows at lines 1858–1865. The tracker also consumes them (`src/modules/applicant/ApplicationStatusPage.tsx:689–695`).

**Prerequisite/impact:** Someone knowing an existing applicant ID can insert a marker indistinguishable from staff approval, choosing the document type being marked as verified. This can make documents appear verified without review. Anonymous insert permission is intentionally retained by the original plan, so closing UPDATE/DELETE alone would not fix it. The ID is currently available through public reads. No marker was inserted during this review.

**Remediation/check:** Separate file submission from review state; only authorized staff operations can produce approval/resubmission/undo markers. Validate ownership, allowed file types and server-owned fields on every insert. Test direct anonymous and wrong-role inserts of all reserved marker types and staff-looking event fields, not only normal uploads.

### F15 — High: public mutation RPC and client-controlled audit attribution bypass intended review controls

**Evidence:** Live `undo_document_validation(uuid,text)` is `SECURITY DEFINER`, executable by PUBLIC/anon/authenticated, and checks scheduling state but no caller role. It deletes approval markers and records arbitrary `p_actor_email`; see `supabase/migrations/20261021000008_restore_applicant_document_events.sql:47–84`. `applicant_document_events` independently accepts arbitrary anon inserts, and `src/lib/api/applicantDocumentEvents.ts:39–53` sends actor attribution from the client. Live `finalize_ipcr_surfaces(uuid)` is also anon-executable with workflow-state guards but no caller authorization (`supabase/migrations/20261026023000_finalize_ipcr_surfaces.sql`).

**Prerequisite/impact:** For an unscheduled existing applicant, a public caller can undo validation and attribute it to someone else. The RPC remains privileged even after table policies are tightened. The finalizer is limited to approved/completed target settings, but unauthorized callers can still initiate its writes. Broader audit integrity is also weak: live `access_change_audit` has anon UPDATE/DELETE grants with RLS off, whereas `ipcr_audit_log` allows anon INSERT but not UPDATE/DELETE. Do not claim every audit table is deletable.

**Remediation/check:** Phase 1.3 and Phase 4.10. Revoke PUBLIC inheritance and explicit grants where inappropriate, authorize each remaining function, and derive audit identity from verified context. Check effective `has_function_privilege` for both public roles after revocation. Attempt forged actors, cross-applicant undo and unauthorized finalization in an isolated test database, asserting no side effects.

### F16 — High: disabling a role does not consistently revoke access

**Evidence:** `backend/app/utils/dependencies.py:57–79` filters active `user_roles` rows but falls back to `user.app_metadata` if no active role is found or the lookup errors. `src/modules/admin/LoginPage.tsx:126–169` fetches only `role`, not `is_active`. The live `is_rsp_admin()` checks the role but not `is_active`; `open_vacancy`/`close_vacancy` trust it. In contrast, the live `is_super_admin()` does check active status.

**Verification/impact:** An isolated run of the actual backend authentication function with an inactive RSP row and stale RSP app metadata returned an authorized RSP identity. The backend bypass requires that stale metadata; it is not a claim that every inactive account has it. The live vacancy helper's missing active check is independent of metadata. A database role toggle therefore cannot be relied on as complete revocation.

**Remediation/check:** Phase 3.9. Explicit inactive/missing roles and lookup failures must deny access, never restore authority from stale claims. Apply one active-role rule to helpers, APIs and login. Test disabled/deleted accounts, role removal, failed role lookups, stale tokens/metadata and mid-session changes.

### F17 — High: authenticated callers can reach recruitment actions outside their role or assignment

**Evidence:** `backend/app/routes/applicants.py:219–281` gates status changes on `get_authenticated_user`, then uses the service-role client without a recruitment-role check. `backend/app/routes/employees.py:97–109,163–172,239–249` similarly accepts any resolved role for hiring/promotion and has no authorized workflow-state check before writes. `backend/app/routes/evaluations.py:56–77` requires RATER/INTERVIEWER but leaves assignment validation as a TODO. `src/lib/api/employeesApi.ts:93–117,265–278` falls back from any backend failure, including 401/403, to direct employee/applicant writes.

**Verification/impact:** Isolated handler execution with a PM identity returned by the real authentication function reached an applicant-status write to `Hired`. A RATER identity reached evaluation insertion for an arbitrary synthetic applicant without an assignment lookup. These are business authorization defects, not unauthenticated endpoints. Actual deployed route reachability and successful full hiring transactions were not tested. Direct-write fallback remains a bypass while F2–F3 permissions allow it.

**Remediation/check:** Phase 4.8. Require the specific recruitment role/assignment, validate state transitions and reserve service-role access for authorized operations. Test each action with anon, employee, PM, L&D, assigned/unassigned interviewer and RSP identities. Verify denial occurs before a DB call that changes data and that 401/403 never triggers a fallback mutation.

### F18 — Medium: interviewer logout leaves the underlying Supabase session signed in

**Evidence:** Connected interviewer login calls `supabase.auth.signInWithPassword` (`src/modules/interviewer/InterviewerLogin.tsx:141–145`). Normal `handleInterviewerLogout` clears the UI session/key cache and navigates, but never calls Supabase sign-out (`src/App.tsx:528–533`). The revoked-access handler does sign out at lines 542–550. `src/lib/supabase.ts:21` uses the default persistent Auth client.

**Impact:** A shared-browser user can see the logout screen while the underlying Auth session remains available to the client, including refresh capability. Clearing the in-memory document key alone does not remove that session. Code-confirmed; no real account was logged in or out for this review.

**Remediation/check:** Phase 3.8. Sign out of Auth, clear portal state and dispose decrypted resources together. Test a reload/new tab after logout and require reauthentication for protected operations. Separately document short-lived access-token revocation behavior instead of assuming sign-out instantly invalidates every issued JWT.

### F19 — High: employee password changes are local-only and stale credentials remain a login fallback

**Evidence:** `src/lib/employeePortalData.ts:395–425` changes only the local account list through `saveEmployeePortalAccounts` (lines 210–220). Both the initial password page (`src/modules/employee/SetInitialPasswordPage.tsx:61–73`) and employee settings call it. `src/App.tsx:452–459` tries the database first, then accepts local cached credentials even when the database comparison returns no match. The row mapper/writer (`employeePortalData.ts:21–75`) does not persist/reload `mustChangePassword`.

**Verification/impact:** A local run of the actual password-change function returned `{ok:true}` and changed the browser cache, with a DB mock configured to throw on any access remaining untouched. The database password therefore remains usable; cached credentials can also outlive a later server reset. A fresh browser's database-loaded account loses the local-only first-change flag. These are additional failures beyond plaintext storage in F4–F5.

**Remediation/check:** Phase 3.3/3.7. Make Auth authoritative for password changes and login, eliminate connected-mode cached/demo authentication, and replace compromised passwords rather than preserving them. Verify old passwords fail across browsers and that DB/network denial never falls back to cached credentials.

### F20 — Medium: public uploads and costly backend operations lack application-level abuse bounds

**Evidence:** Both live Storage buckets have `file_size_limit=NULL` and `allowed_mime_types=NULL`, and applicant uploads have bucket-only public INSERT permission. The 10 MB/type checks in `src/modules/applicant/AttachmentsUploadForm.tsx:111–155` run in the browser. `backend/app/routes/email.py:36–56,78–117` has no auth dependency or recipient-list/body cap and accepts arbitrary recipients/content when SMTP is configured. `backend/app/routes/competency_matching.py:130–175` and `competency_assessment.py:49–51,346` lack authentication and invoke AI processing. No application limiter was found in the inspected routers/main middleware.

**Impact/limits:** Clients can bypass the upload form and repeat uploads or email/AI work, consuming storage, provider quotas and service capacity. Null bucket limits mean no bucket-specific override, **not** unlimited files beyond Supabase's global limits. SMTP/AI production configuration and any external gateway limits are unverified; no messages, uploads or paid AI requests were sent.

**Remediation/check:** Phase 4.7/4.11. Use scoped upload permissions, per-applicant quotas, bounded request sizes, rate limits and provider budgets. Test limits through raw API calls in a sandbox, including ciphertext overhead and repeated submissions. Authorization alone does not bound an allowed user's usage.

### F21 — Medium: applicant personal data is copied into backend debug logs

**Evidence:** `backend/app/routes/applicants.py:27,56–61` prints the complete create payload and Supabase response. The request model includes name, email, address, contact number and disability status (`backend/app/models/applicant.py:8–25`). Error paths return raw exception text at lines 86–95 and 128–132.

**Impact/limits:** When this endpoint handles submissions, personal data is copied into application logs with a different access/retention boundary; raw exceptions can also disclose schema/provider details. This is code-confirmed. Whether historical Vercel logs contain submissions was not inspected, and SQL injection or credential leakage through these particular log lines was not demonstrated.

**Remediation/check:** Phase 4.11. Log minimal redacted identifiers/outcomes, restrict log access/retention, and return generic errors with correlation IDs. Exercise successful and failed synthetic submissions locally and assert PII, credentials and raw provider responses are absent from logs and HTTP errors.

### Validation performed and remaining checks

- `npx tsc --noEmit`: passed.
- Targeted Vitest run: **5 files, 51 tests passed** (crypto, document viewing, tracker, document events, rater accounts). Explicitly excluded nested `.worktrees` and `.claude/worktrees`; the initial command also discovered duplicate worktree tests (102 passed). These existing tests establish current behavior, not closure of the security findings.
- Synthetic local reproductions confirmed denied-RPC decryption, local-only password changes, inactive-role metadata fallback, wrong-role status mutation and missing evaluation assignment enforcement. They used source modules/function bodies and in-memory doubles, with no production mutations.
- Read-only catalog/advisor checks and anonymous HEAD responses established the live permissions described above. Aggregate logs were inspected only for available sources; this was **not** a forensic investigation of past access.
- The apparently unsafe credential print template in `QualifiedApplicantsPage.tsx` was not counted as a confirmed deployed XSS finding: the current router uses `QualifiedApplicantsRSPPage`, and the active ranking/shared credential printers escape text. Likewise, missing frontend guards, broad CORS or a function appearing in an advisor were not treated as proof of an independent exploit without tracing the enforcement path.
- Remaining deployment checks: identify the current Vercel production URL/revision, verify the deployed bundle and API authentication behavior, confirm leaked-key retirement through the approved rotation process, inventory encrypted/legacy files, inspect provider/gateway limits and perform an isolated adversarial role matrix. Dependency advisories and historical log/backup exposure were not comprehensively audited in this review.

Useful references: [Supabase API key rotation](https://supabase.com/docs/guides/api/api-keys), [RLS-disabled advisor remediation](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public), [mutable-search-path remediation](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [metadata-policy remediation](https://supabase.com/docs/guides/database/database-linter?lint=0015_rls_references_user_metadata), [PostgreSQL function privileges](https://www.postgresql.org/docs/current/sql-grant.html).
