# Dependencies

Last reviewed: 2026-08-15.

## Package manager

Bun 1.3.14 is intentional in this repository. The test suite uses `bun:test`, operational scripts use Bun APIs such as `Bun.spawn`, and `@types/bun` is part of the checked TypeScript graph. This is an explicit Bun runtime exception; migrating only the installer to pnpm would create two package-manager contracts without removing the Bun dependency.

Use the committed `bun.lock` and verify it with:

```bash
bun run install:check
bun run deps:outdated
bun run deps:audit
```

## 2026-08-15 update

| Package                     | From         | To           | Project impact                                                                         |
| --------------------------- | ------------ | ------------ | -------------------------------------------------------------------------------------- |
| `@cloudflare/workers-types` | 5.20260809.1 | 5.20260815.1 | Refreshes the Worker runtime declarations used by the checked server and Worker graph. |
| `oxfmt`                     | 0.62.0       | 0.63.0       | Applies the current formatter contract and closes the remote CI formatting failure.    |
| `oxlint`                    | 1.77.0       | 1.78.0       | Refreshes diagnostics without changing the repository lint policy.                     |
| `sharp`                     | 0.35.2       | 0.35.3       | Keeps image audits and asset optimization on the current patch.                        |
| `wrangler`                  | 4.120.0      | 4.123.0      | Updates the local Worker and D1 toolchain without changing deployment configuration.   |

`three`, Vite, Playwright, TypeScript, `@types/three`, and `@types/bun` were already current. The frozen install succeeds, `bun outdated` is empty, and `bun audit` reports no known vulnerabilities after this update.

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

This historical update remains documented for traceability; the current status is recorded above.
