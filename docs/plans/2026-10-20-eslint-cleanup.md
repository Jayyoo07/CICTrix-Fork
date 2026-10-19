---
title: ESLint config and safe lint cleanup
date: 2026-10-20
status: Done
summary: Add the missing ESLint config, turn off no-explicit-any for now, and fix the mechanical findings that cannot change runtime behavior. Hook-dependency warnings are left for a separate reviewed pass.
---

## Goal

Make `npm run lint` meaningful again without changing how the app runs.

## Approach

| # | Decision |
|---|---|
| D1 | `.eslintrc.cjs` from the Vite React-TS template, matching the installed plugins. |
| D2 | `@typescript-eslint/no-explicit-any` is off. Typing the Supabase rows is a separate project. |
| D3 | Fix only behavior-neutral findings: unused imports/variables, `prefer-const`, useless escapes, redundant `Boolean()`, `prefer-as-const`, empty `catch` blocks (comment, never rethrow), constant conditions (keep the emitted email text identical), and unused disable directives. |
| D4 | Leave the 30 `react-hooks/exhaustive-deps` warnings untouched, because fixing them can change effect timing. |
| D5 | Unused local declarations whose initializer has side effects (calls, awaits) keep the call and drop only the binding. |

## Steps

1. Config change (D1, D2) and `eslint --fix` for auto-fixable rules.
2. Remove unused imports with TypeScript's own codefix.
3. Fix the remaining findings by hand.
4. Run `npx tsc --noEmit`, `npm test`, and lint, and record the remaining tally.

## Risks

- Deleting dead components loses work in progress if someone meant to wire it up later. It stays in git history.
- `react-refresh/only-export-components` warnings may remain where fixing them means moving exports between files. These are dev-only.

## Checks to run

- `npx tsc --noEmit`
- `npm test`
- `npm run lint` (expected to still report the 30 hook-dependency warnings)
