---
title: Security remediation plan review and expansion
date: 2026-10-27
status: Done
summary: Added 11 evidence-backed security findings, refreshed live permission evidence, corrected outdated remediation advice, and expanded containment and regression checks. Investigation complete; remediation remains Draft.
---

# Security remediation plan review and expansion

## What shipped vs. planned

Updated [the existing remediation plan](../plans/2026-10-16-security-remediation.md) following the approved read-only review approach. Added F11–F21 with evidence, prerequisites/impact, remediation and verification criteria: one Critical, seven High and three Medium findings. Extended the existing phases to address them rather than creating a second remediation plan.

The most urgent addition is the document private key embedded in tracked frontend source and a migration. Its fingerprints match the live stored pair, it appears in the local production bundle, and a synthetic local check decrypted a document after the key-access RPC returned a permission error. Further findings cover editable interviewer authorization, email-based applicant identity spoofing, forged document approvals/audit actors, unguarded mutation RPCs, ineffective role revocation, missing API role/assignment checks, interviewer logout, local-only password changes, abuse limits and PII logging.

Corrected the backend route count, distinguished table grants from effective RLS access, accounted for working restrictive soft-delete policies, removed the recommendation to preserve compromised passwords, required PUBLIC privilege revocation, and separated trigger functions from callable RPCs. Qualified the prior blanket breach-notification assertion and removed instructions to push directly to upstream. Remediation status remains Draft: this session approved investigation/documentation, not implementation or deployment.

Regenerated `docs/plans/index.html` using the existing dashboard generator.

## Evidence and checks run

- Source baseline: `b1594a2f8ac6853b780d10793bedb63ca05f0451`.
- Supabase read-only review: confirmed project identity; fetched security/performance advisors and aggregate log-source counts; inspected current table/function grants, policy modes, function definitions/owners, triggers/constraints and Storage bucket settings. Live catalog: 80 public base tables with RLS disabled, 78 with all four anon CRUD grants. The older advisor snapshot reports 79; the plan records both scopes/times.
- Anonymous HEAD-only Data API checks returned 206 for tracker IDs (31 visible rows), rater IDs (3) and the employee-password column (130). Used `limit=0` and exact counts; no field values were downloaded.
- Compared live key fingerprints to source, and scanned local `dist` for exact private-key inclusion without printing the key. Redacted tracked-file scan reconfirmed service-role JWTs in 25 files; did not use the leaked credential.
- Node/TypeScript isolated source-module checks: denied-RPC decryption succeeded in connected mode; employee password change succeeded locally without a DB write.
- Python isolated source-function checks with in-memory Auth/DB doubles: inactive RSP row fell back to RSP metadata; a PM identity reached a hiring-status update; an evaluator reached insert without assignment lookup. These were not deployed HTTP tests.
- `npx tsc --noEmit`: passed.
- `npx vitest run src/lib/crypto/documentEncryption.test.ts src/lib/documentViewing.test.ts src/lib/applicantTracker.test.ts src/lib/api/applicantDocumentEvents.test.ts src/lib/api/raterAccounts.test.ts --exclude "**/.worktrees/**" --exclude "**/.claude/worktrees/**"`: 5 files, 51 tests passed. Initial `npm test -- ...` also discovered nested worktree copies (14 files, 102 passed); reran with exclusions to establish the current workspace result.
- `powershell -NoProfile -ExecutionPolicy Bypass -File docs/plans/build-plans-index.ps1`: passed; verified the generated dashboard links to the expanded plan and this summary.
- Documentation checks: all referenced source paths exist; F11–F21 are present; neither edited Markdown file contains long embedded secret values.

## Deviations and limits

The hostname shown in the employee login source, `https://abyan-hris.vercel.app`, returned HTTP 404. Deployed Vercel revision/bundle, API reachability and provider/gateway settings remain unverified; this does not invalidate inspected live Supabase permissions or locally reproduced defects. No production mutations, email sends, paid AI calls or real-account sign-ins were performed. No claim of historical exploitation is made. Dependency advisories and historical log/backup exposure were not comprehensively audited.

Only planning documentation and its generated dashboard were changed. Application/security fixes, production key rotation and migration execution are future work. Existing functional tests passing is not evidence that the security holes are closed.
