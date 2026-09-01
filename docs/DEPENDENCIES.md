# Dependencies

Bun 1.3.14 is the committed contract (`packageManager` and CI `bun-version`). Tests use `bun:test`. Operational scripts use Bun APIs such as `Bun.spawn`. `@types/bun` 1.3.14 is part of the checked TypeScript graph.

Use the committed `bun.lock` and verify it with:

```bash
bun run install:check
bun run deps:outdated
bun run deps:audit
```

Current runtime and toolchain pins live in `package.json`. `three` is the only production dependency.
