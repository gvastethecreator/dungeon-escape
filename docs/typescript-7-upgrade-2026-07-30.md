# TypeScript 7 and dependency upgrade

Date: 2026-07-30

Status: direct TypeScript 7 route implemented and locally verified.

## Route

Dungeon Escape uses `typescript@7.0.2` directly. It does not import the compiler API and does not use
an embedded-language compiler or TypeScript language-service plugin, so a side-by-side TypeScript 6
compatibility package would add cost without a consumer.

The three project checks remain separate:

- `tsconfig.json` — browser source and Bun tests;
- `tsconfig.server.json` — Vite config and local Bun leaderboard service;
- `tsconfig.worker.json` — Cloudflare Worker and shared leaderboard domain code.

All three are `noEmit`, inherit strict ES2022/ESNext/Bundler settings, and list ambient type packages
explicitly. The root config also states the bundler contract through `isolatedModules`,
`verbatimModuleSyntax`, `noUncheckedSideEffectImports`, and `allowImportingTsExtensions`.

## Compatibility fixes

- Three 0.185 texture images are generic. Nullable browser texture loops now narrow the concrete
  image type, and tests prove DataTexture/CanvasTexture before reading image data.
- Three 0.185 returns unit scale when `Matrix4.decompose()` receives a singular matrix. Motion-trail
  tests now inspect matrix basis vectors, which preserves the actual zero-matrix visibility contract.
- Updated rounded geometry exposed a chair variant outside the 0.75 m gameplay footprint; all three
  variants now remain inside the existing metric contract.
- Vite 8 uses `build.rolldownOptions`. The config now uses that owner, `import.meta.dirname`, and
  native-loadable `.ts` imports for the local leaderboard chain.

## Performance evidence

Five warm root checks on the same checkout:

| Compiler         |   Median |          Range |
| ---------------- | -------: | -------------: |
| TypeScript 7.0.2 |   726 ms |     679-759 ms |
| TypeScript 5.9.3 | 5,412 ms | 5,066-6,130 ms |

TypeScript 7 is 7.45x faster for this project (86.6% less wall time at the median).

The production asset tree is 408.26 MiB, so full Vite builds are dominated by file I/O rather than
the compiler. `bun run build:code` keeps the production build intact but verifies all three configs
and all four HTML entries in `.scratch/build/code` without copying public assets. Measured total:
3.37 s, including a 1.55 s Vite bundle.

## Commands

```bash
bun run typecheck:all
bun run build:code
bun run test
bun run lint
bun run build
```

`bun run build` is still required before deploy. `cloudflare:deploy` continues to call it.

## Rollback boundary

If a future tool requires the legacy compiler API, add `@typescript/typescript6` only for that named
consumer and keep `tsc` on TypeScript 7. Do not replace the project compiler pre-emptively.
