---
title: Add succession access controls to security remediation
date: 2026-10-27
status: Done
summary: Documented the focused security prerequisite for reviewed succession scoring, without executing remediation or changing live permissions.
plan: 2026-10-16-security-remediation.md
---

# Succession security planning update

## What changed

At the user's request, expanded the existing [security remediation plan](../plans/2026-10-16-security-remediation.md) with Phase 4A, the succession scoring trust boundary. Linked the dependency from the [succession V2 plan](../plans/2026-10-27-succession-scoring-v2.md).

The addition covers verified signed-in identity, active own-office authorization, protected qualification evidence and position requirements, server-attributed atomic review/audit writes, stale-review invalidation, negative and positive access tests, and coordinated client/policy release. It preserves legitimate employee PDS, HR/RSP, L&D and Office Account workflows and does not add an HR approval queue.

## Evidence and limits

Read-only catalog queries found RLS disabled and anon SELECT/INSERT/UPDATE grants on critical positions, succession candidates, work experience, training and eligibility. Office role assignments had RLS and lacked those anon grants; no Auth-user linking column appeared in the inspected column list. No row mutation or impersonation was attempted. These findings establish configuration exposure, not exploitation.

This was a documentation-only extension. The security plan remains Draft; no permissions, schema, Auth accounts, live data, scoring runtime or deployment changed. The independently developed pure V2 evaluator remains separate work; adding this security scope does not mark the succession integration complete.

## Checks

- Cross-checked Phase 4A against the agreed succession workflow and observed catalog results.
- Checked consistency with Phase 3 identity work, Phase 4 table-group rollout and the draft role matrix.
- Regenerated `docs/plans/index.html` using the existing generator (93 plans, 76 summaries); documentation whitespace checks passed.

## Remaining work

Execution of the security remediation requires separate approval. Succession review persistence and V2 activation remain gated on the tested controls; local pure scoring development can continue without altering current results.
