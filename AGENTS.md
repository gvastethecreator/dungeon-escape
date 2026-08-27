# Dungeon Escape

## Runtime

Bun 1.3.14 owns install, scripts, and tests. Match CI: `bun-version: 1.3.14`.

`bun run check` is the local integration gate: types, lint, format, tests, runtime-asset audit, and `build:code`.

WebGL2 is the automatic renderer default. WebGPU is opt-in only through `?renderer=webgpu`. See `docs/adr/0009-webgpu-renderer-and-tsl.md`.

`public/` is the deploy runtime package. `assets-source/` is local and untracked.

Production play URL is `https://dungeon.gvaste.dev`. `bun run cloudflare:deploy` publishes it. A push to `main` runs the same command in GitHub Actions.

Generated logs belong under `logs/` (gitignored). Do not leave `*.log` files in source trees.

The code map under `docs/codemap/` is generated local output and is gitignored. Refresh it with the maintain-code-map skill. Do not hand-edit those artifacts.

## Agent skills

### Issue tracker

GitHub Issues and the linked GitHub Project hold live state. `.scratch/` holds synchronized local mirrors. See `docs/agents/issue-tracker.md`.

Never write tickets under tracked `docs/`.

### Triage labels

Use `bug` and `enhancement` with `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context layout at `CONTEXT.md` with decisions under `docs/adr/` when those documents exist. See `docs/agents/domain.md`.
