# IPCR reload hydration

## Shipped

- Draft recovery recognizes MFO titles without requiring success indicators; submission rules are unchanged.
- Latest-setting fallback now recognizes partial drafts rather than skipping them as empty.
- Cache recovery uses the fallback cycle resolved during this load instead of stale React state.
- Draft caching waits for initial hydration, and Phase 2 waits for the parent to resolve its cycle before querying approved records.
- Existing phase tabs and styling are unchanged. No live database writes or schema changes.

## Evidence and limits

- Five relevant Vitest files: 39 tests passed, including two new partial-draft regressions.
- TypeScript, ESLint and git diff check passed.
- The earlier period-versus-cycle explanation was incomplete: the current per-indicator Phase 2 component receives the parent's cycle ID.
- No connected browser or Supabase read connector was available. The user's specific record and end-to-end browser reload have not been verified.
- Design checklist: no style, token, layout, input or navigation changes; responsive and rendered checks unavailable without a browser session.

## Manual check

Save Phase 1, reload, and inspect its targets. Return to Phase 2 and confirm saved accomplishments belong to the same cycle. Repeat with a partial draft containing an MFO title only. Previously missing server data cannot be reconstructed by this code fix alone.
