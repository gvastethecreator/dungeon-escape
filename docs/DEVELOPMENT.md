# Development

## Requirements

- Bun 1.3.14 or later
- A modern WebGL browser

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

## Checks

```bash
bun run test
bun run typecheck
bun run build
bun run lint
bun run fmt:check
```

## Optional authority service

Dungeon Escape starts with local state. To connect a compatible service, add its origin to the URL:

```text
http://127.0.0.1:24211/?authority=https://example.invalid
```

The service must expose `/health` and the `/v0` routes used by `src/authority/client.ts`.
