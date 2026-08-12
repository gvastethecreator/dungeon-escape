# Standalone architecture

Dungeon Escape is a self-contained Bun and Vite application. It keeps the game runtime, assets, tests, and development scripts in one repository.

## Repository layout

| Area                        | Local owner                  | Purpose                                      |
| --------------------------- | ---------------------------- | -------------------------------------------- |
| `src/domain/core.ts`        | Parameter and base contracts | Generation validation and defaults           |
| `src/domain/runtime.ts`     | Dungeon command state        | Local state, projection, and synchronization |
| `src/authority/client.ts`   | Optional HTTP client         | Remote authority integration on demand       |
| `src/world/`, `src/player/` | Three.js presentation        | Scene construction and controls              |
| `public/assets/`            | Runtime assets               | Visual, audio, and sprite resources          |

## Runtime boundary

The game starts with local state. Map Tools and Server Runs are **local developer chrome only** (`vite` dev or localhost): see `src/game/LocalDevTools.ts`. Public deploys hide that panel and ignore `?authority=` so players cannot rewrite seeds into the leaderboard path.

When local tools are on, the optional `authority` URL parameter enables a compatible HTTP service. The client boundary stays in `src/authority/client.ts`; Three.js presentation code does not own game-state rules.

## Generated and local directories

Git ignores `node_modules`, `dist`, `assets-source`, `docs/codemap`, `.scratch`, `.proof-*` capture trees, `.venv-pbr`, coverage output, and local environment files. Development plans and local issue records live under `.scratch/`; broader private notes and reports live under `.local/`.
