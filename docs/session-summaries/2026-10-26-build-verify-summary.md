---
title: Windows-safe local build check (summary)
date: 2026-10-26
plan: docs/plans/2026-10-26-build-verify-script.md
---

## What shipped

- `package.json` gains `"build:verify": "tsc --noEmit && vite build --minify false --target esnext"`.
- `npm run build` and `vite.config.ts` are untouched, so Linux/Vercel keep the production target and esbuild minification.

## Why it exists

On this Windows host, `npm run build` fails inside esbuild while removing its temp file (`Access is denied`, esbuild issue #4559). The failure is not in repo code. Vite skips that chunk transform when the target is `esnext` and the minifier is not esbuild, so `build:verify` validates types, imports, routes, CSS, and assets without the broken step. It does not validate minification or downlevel browser output; the production build still does that on Linux.

## Checks run

- `npm run build:verify`: exit 0; 3,110 modules transformed; `dist/assets/index-*.js` 6,035.48 kB.
- `git diff` confirms `build` and `vite.config.ts` are unchanged.
