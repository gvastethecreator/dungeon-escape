# Leaderboard storage

## Runtime contract

- Browser API: `GET /api/leaderboard?limit=8` and `POST /api/leaderboard`.
- Local development: Vite middleware writes `.data/dungeon-escape.sqlite` through the native SQLite adapter for the active Bun or Node runtime.
- Cloudflare: the Worker uses `LEADERBOARD_DB`, a D1 binding with the same SQLite migration.
- Score version: `1`. Server code validates the run and calculates the score. `runId` prevents duplicate submissions.
- Only completed four-stone escapes enter the ranking.

## Local use

```powershell
bun run dev
```

The DB is created on the first request. Override its path with `DUNGEON_LEADERBOARD_DB` when a test or packaged build needs another data directory.

## Cloudflare local proof

```powershell
bun run build
bun run db:migrate:local
bun run cloudflare:dev
```

Wrangler serves `dist/`, runs `/api/*` through the Worker and keeps its local D1 state under `.wrangler/`.

## First remote deployment

1. Authenticate Wrangler: `bunx wrangler login`.
2. Create the DB: `bunx wrangler d1 create dungeon-escape-leaderboard`.
3. Copy the returned `database_id` into the `LEADERBOARD_DB` entry in `wrangler.jsonc`.
4. Apply schema: `bun run db:migrate:remote`.
5. Deploy: `bun run cloudflare:deploy`.

Remote migration and deployment require Cloudflare account access. Keep `wrangler.jsonc` as the binding source of truth.

## Public launch checks

- Add Turnstile or an API rate-limit rule before opening anonymous writes.
- Add a server-issued run ticket if the ranking must resist modified clients. The current server owns validation and the score formula, but run metrics still originate in the game client.
- Back up D1 before score-schema migrations and keep prior `score_version` rows readable.
