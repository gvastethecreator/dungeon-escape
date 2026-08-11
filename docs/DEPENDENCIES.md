# Dependencies

Last reviewed: 2026-08-09.

## Package manager

Bun 1.3.14 is intentional in this repository. The test suite uses `bun:test`, operational scripts use Bun APIs such as `Bun.spawn`, and `@types/bun` is part of the checked TypeScript graph. This is an explicit Bun runtime exception; migrating only the installer to pnpm would create two package-manager contracts without removing the Bun dependency.

Use the committed `bun.lock` and verify it with:

```bash
bun run install:check
bun run deps:outdated
bun run deps:audit
```

## 2026-08-09 update

| Package                     | From         | To           | Relevant release note                                                                                                                                            | Project impact                                                                          |
| --------------------------- | ------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `wrangler`                  | 4.115.0      | 4.120.0      | [4.120.0](https://github.com/cloudflare/workers-sdk/releases/tag/wrangler%404.120.0) updates Undici to 7.29 and batches local observability writes.              | Removes the reported transitive audit findings and reduces local Worker trace overhead. |
| `vite`                      | 8.2.0        | 8.2.1        | [8.2.1](https://github.com/vitejs/vite/blob/v8.2.1/packages/vite/CHANGELOG.md#821-2026-08-06) fixes build, bundled-dev, CSS-minify, and config mutation defects. | No config migration was required; all four HTML entries build.                          |
| `playwright`                | 1.62.0       | 1.62.1       | [1.62.1](https://github.com/microsoft/playwright/releases/tag/v1.62.1) fixes TypeScript project resolution and accessibility snapshot regressions.               | Browser scripts and accessibility inspection keep the existing API.                     |
| `oxlint`                    | 1.76.0       | 1.77.0       | [1.77.0](https://github.com/oxc-project/oxc/releases/tag/apps_v1.77.0) improves diagnostics, token-bound rules, and import-cycle performance.                    | Existing lint configuration remains compatible.                                         |
| `oxfmt`                     | 0.61.0       | 0.62.0       | [0.62.0](https://github.com/oxc-project/oxc/releases/tag/oxfmt_v0.62.0) changes YAML formatting and fixes `.gitignore` handling.                                 | The repository was reformatted once with the new formatter; the check is clean.         |
| `@cloudflare/workers-types` | 5.20260730.1 | 5.20260809.1 | Date-pinned Cloudflare runtime type refresh.                                                                                                                     | Server and Worker type checks pass without source migration.                            |
| `@types/three`              | 0.185.1      | 0.185.4      | Patch-level type corrections for Three.js r185.                                                                                                                  | The browser type check passes without source migration.                                 |

`three`, `@types/bun`, and TypeScript were already current. `bun outdated` is empty and `bun audit` reports no vulnerabilities after the update.
