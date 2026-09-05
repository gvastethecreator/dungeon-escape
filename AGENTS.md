# Dungeon Escape

## Runtime

Bun 1.3.14 owns install, scripts, and tests (`bun:test`, not Vitest). Match CI: `bun-version: 1.3.14`.

`bun run check` is the local integration gate: types, lint, format, tests, runtime-asset audit, and `build:code`.

WebGL2 is the automatic renderer default. WebGPU is opt-in only through `?renderer=webgpu`.

`public/` is the deploy runtime package. `assets-source/` is local and untracked.

Production play URL is `https://dungeon.gvaste.dev`. `bun run cloudflare:deploy` publishes it. A push to `main` runs the same command in GitHub Actions.

Generated logs belong under `logs/` (gitignored). Do not leave `*.log` files in source trees.

The code map under `docs/codemap/` is generated local output and is gitignored. Do not hand-edit those artifacts.

Never write tickets under tracked `docs/`.
