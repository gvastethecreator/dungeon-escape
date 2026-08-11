# Maintenance status

Last reviewed: 2026-08-09.

## Current contract

- Bun 1.3.14 owns install, scripts, and tests because the repository uses Bun directly.
- `bun run check` is the local integration gate.
- `bun run build` is the production build; `bun run build:code` is the faster code-only build.
- Runtime files live in `public/`; raw assets, provenance, and optimization metadata live in `assets-source/`.
- Remote D1 migration and Cloudflare deployment remain explicit manual operations.

## Repository hygiene

- `.gitignore` covers package, build, browser-test, Python, Wrangler, local-report, cache, OS, and log residue.
- Generated code-map and runtime-optimization manifests are excluded from Oxfmt so their canonical generators remain idempotent.
- `bun run clean` removes only reproducible build and test output.
- Active enemy animation candidates, decisions, and visual evidence under `.scratch/` are retained because their manifests still reference them and human art approval is open.
- Generated logs, Python bytecode, stale build output, and obsolete local tool caches may be removed without changing authored assets.

The 2026-08-09 pass removed stale code-review databases, old local reports, obsolete HUD proof, Wrangler temporary files, root scratch logs, Python bytecode, and reproducible build output. Referenced model evidence and enemy animation work were preserved.

## Runtime asset boundary

`bun run optimize:runtime-assets` now distinguishes optimized source rasters from WebP files authored directly at runtime size. Animated biome atlases and generated HUD icons keep their intended dimensions while still receiving byte, hash, and dimension records. `bun run audit:runtime-assets` rejects drift, missing records, source leaks, and orphan enemy atlases.
