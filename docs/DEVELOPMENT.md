# Development

## Requirements

- Bun 1.3.14 or later
- TypeScript 7 (installed through the project manifest)
- A current Chrome, Edge, or Firefox browser (Safari untested). The default renderer is WebGL2; WebGPU is opt-in with `?renderer=webgpu`. See `docs/adr/0009-webgpu-renderer-and-tsl.md`. Firefox uses a safer render path and a legacy Web Audio listener pose. See `RenderCapabilities` and `GameAudio.applyAudioListenerPose`.

## Run locally

```bash
bun install
bun run dev
```

Open `http://127.0.0.1:24211/`.

Available entries:

- `/` — editor, debug tools, and play mode.
- `/forge.html` — procedural map Forge.
- `/reliquary.html` — reliquary preview.
- `/model-lab.html` — deterministic model QA captures (`?model=` and `?view=`).
- `/model-playground.html` — interactive orbit viewer for the same runtime models.
- `/sprite-playground.html` — interactive viewer for sprites and animated enemies.

## Checks

```bash
bun run install:check
bun run check
```

The combined check covers types, lint, formatting, tests, the runtime asset boundary, and the code-only build. Individual commands remain available:

```bash
bun run test
bun run typecheck:all
bun run build:code
bun run lint
bun run fmt:check
bun run audit:runtime-assets
bun run smoke:mobile
bun run smoke:multi-floor
```

Use `bun run clean` to remove generated build and test output. It intentionally keeps authored work and review evidence under `.scratch/`.

`build:code` checks browser, server, and worker types and builds every HTML entry into
`.scratch/build/code` without copying the large runtime asset catalog. Use it for normal code
iteration. `bun run build` remains the production check and copies all files under `public/` into
`dist/`; deployments always use that full build.

## Runtime assets

`public/` is deploy-only. Raw generations, source sheets, provenance, and production manifests live under `assets-source/`. That tree is local and is not in git.

```bash
bun run optimize:runtime-assets
bun run audit:runtime-assets
```

The optimizer converts runtime rasters to WebP and writes each image at `floor(source / 2)` on both axes. Pixel-art families use nearest-neighbor sampling; continuous art uses Lanczos. Published animation atlases and generated pickup or stone icons keep their authored runtime dimensions. The generated manifest is `assets-source/runtime-optimization-manifest.json`. Re-running the command is idempotent when the published files match that manifest. `bun run optimize:runtime-assets` needs that local tree. `bun run audit:runtime-assets` always audits the tracked runtime package and adds manifest hash and dimension verification when the local manifest is available.

The audit rejects source-only folders, orphan enemy atlases, PNG/JPEG runtime files, broken concrete URLs, and any output whose dimensions, byte size, or SHA-256 differ from the manifest. `cloudflare:deploy` runs this audit before the production build.

## Optional authority service

Dungeon Escape starts with local state. To connect a compatible service, add its origin to the URL:

```text
http://127.0.0.1:24211/?authority=https://example.invalid
```

The service must expose `/health` and the `/v0` routes used by `src/authority/client.ts`.
