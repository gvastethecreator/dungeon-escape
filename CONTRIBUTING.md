# Contributing

Thank you for helping improve Dungeon Escape.

## Local setup

```bash
bun install --frozen-lockfile
bun run dev
```

The default renderer must remain WebGL2. WebGPU is an explicit opt-in path through `?renderer=webgpu` until its human parity gates are complete.

## Before opening a pull request

```bash
bun run check
bun run build
git diff --check
```

- Keep changes focused and preserve campaign saves, input methods, and public runtime asset rules.
- Add or extend the nearest test when behavior changes.
- Include browser evidence for rendering, input, responsive UI, or game-flow changes.
- Do not hand-edit generated asset catalogs; update their source and generator together.
- Document third-party asset provenance and licensing.

Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
