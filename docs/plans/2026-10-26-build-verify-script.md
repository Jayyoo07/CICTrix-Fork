---
title: Add a Windows-safe local build check
date: 2026-10-26
status: Done
summary: Add a build:verify script that type-checks and builds without esbuild minification, so a Windows dev machine can verify a change without changing the production build.
---

## Goal

Give Windows a local command that type-checks and bundles the app successfully. `npm run build` stays as it is, because production builds on Linux/Vercel and the failure is a Windows-only esbuild issue.

## Approach

- `npm run build` is `tsc && vite build`: production targeting, minification by esbuild. On this Windows host, esbuild fails while removing its temp file (`remove %TEMP%\esbuild-<hash>: Access is denied`, esbuild issue #4559). Retries, a different temp directory, and esbuild upgrades did not fix it. It is not a repo code problem.
- Vite skips the failing chunk transform when `build.target === 'esnext'` and `build.minify !== 'esbuild'`. A non-minified esnext build succeeds on this host and still type-checks the code and validates imports, routes, CSS, and asset resolution.
- Add `"build:verify": "tsc --noEmit && vite build --minify false --target esnext"`. Do not change `build.target`, `build.minify`, or `npm run build`.
- Keep the workaround local. Vercel and Linux CI keep using the normal `npm run build`.

## Steps

1. Add the `build:verify` script to `package.json`.
2. Run it on this host and confirm it exits 0.
3. Record the limitations: no minification and no esbuild-target lowering, so bundle size and downlevel syntax are not validated by this command.

## Risks

- A minifier-only failure (for example, a name collision after mangling) would not be caught locally. Production builds still exercise esbuild.
- `--target esnext` does not check that the output runs on older browsers. The repo's browser support comes from the production build's default target.

## Checks to run

- `npm run build:verify`
- Confirm `npm run build` and `vite.config.ts` are unchanged.

## Outcome

- `npm run build:verify` exits 0 on Windows: 3,110 modules transformed, `dist/assets/index-*.js` 6,035.48 kB.
- `npm run build` and `vite.config.ts` are unchanged.
