---
title: Make npm run lint green on current main
date: 2026-10-26
status: Approved
summary: Restore the missing ESLint config, land the deferred cleanup on current main, and clear the remaining warnings so npm run lint exits 0 with zero warnings.
---

## Goal

`npm run lint` runs against the current `src` tree and exits 0 with `--max-warnings 0`, so lint can gate pull requests again. No intended runtime change.

The config and a first cleanup pass already exist on the local-only branch `chore/eslint-config` (commits `46cfe33` and `a471c79`, plan `docs/plans/2026-10-20-eslint-cleanup.md`). This plan lands them on top of current main rather than the 2026-10-20 base and finishes the warnings that pass deliberately left open.

## Approach

- Branch `chore/lint-green` off `origin/main` (`4a06d9d`). The working branch `fix/modal-close-buttons` is 92 commits behind main, so cleaning that tree would produce an unmergeable pull request.
- Cherry-pick `46cfe33` (config) and `a471c79` (mechanical cleanup), resolving conflicts against current main.
- Keep `@typescript-eslint/no-explicit-any` off and `no-unused-vars` ignoring `_`-prefixed names, as the 2026-10-20 plan decided.
- Turn `react-refresh/only-export-components` off. It is a dev-only Fast Refresh hint, and pages deliberately co-locate helpers and demo fixtures.
- Fix `react-hooks/exhaustive-deps` where adding the missing dependency cannot change effect timing; otherwise add a one-line disable with the reason. Adding dependencies blindly is the one change that can alter behavior, so it is not done wholesale.
- Scope the npm script to `src` and `vite.config.ts`, and ignore `dist`, `coverage`, `scratch`, `.worktrees`, `.claude`, so worktree copies can never be linted twice.

## Steps

1. Restore `.eslintrc.cjs` and the `lint` script; confirm ESLint starts and record the baseline.
2. Cherry-pick the cleanup commit and resolve conflicts.
3. Clear the remaining findings, including the hook-dependency warnings.
4. Run `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npx vite build --minify false --target esnext`.
5. Commit, write the summary, and record the remaining rule decisions.

## Risks

- The cleanup commit was written against the 2026-10-20 tree; deletions may collide with code added since. `tsc` and the test suite catch broken references.
- Hook-dependency disables can hide a stale closure. Each disable names the reason, and the rule stays active for new code.
- Turning off `react-refresh/only-export-components` loses a dev-only warning; it does not affect production.

## Checks to run

- `npx tsc --noEmit`
- `npm run lint`
- `npm test`
- `npx vite build --minify false --target esnext` (Windows workaround for the esbuild temp-file bug)
