# Leaderboard storage

## Runtime contract

- Browser API: `GET /api/leaderboard?limit=8` and `POST /api/leaderboard`.
- Local development: Vite middleware writes `.data/dungeon-escape.sqlite` through the native SQLite adapter for the active Bun or Node runtime.
- Cloudflare: the Worker uses `LEADERBOARD_DB`, a D1 binding with the same SQLite migration.
- Score version: `1`. Server code validates the run and calculates the score. `runId` prevents duplicate submissions.
- Only completed four-stone **campaign** escapes enter the ranking (New Game biome runs and Hall seed replays).
- Map size must be 8–80 rooms (Ancient campaign builds 10 rooms; the previous 12-room floor rejected those wins).
- **Custom runs** (Custom Run, Forge maps, Map Tools) stay playable and still show a local score on victory, but never open the Hall submit form. The API rejects `runSource: "custom"`.
- Biome stars: each saved escape awards one star for that biome under the player name. `GET /api/leaderboard` returns `playerBiomeStars` aggregated from all rows (not only the ranked page).
- First-run welcome does not request or show the Hall. After the player's first finished game, the
  browser profile reveals it on the centered main menu; profile editing and level selection keep it
  out of the active decision surface.

## Hall faces (portraits)

- Each player name hashes to one of **72** grotesque pixel portraits (`src/leaderboard/portraits.ts`).
- Seed prefix: `portrait-v4:` + lowercased trimmed name, FNV-1a via `hashSeed`, then modulo roster size.
- Art pack: intentionally crude / acid-humor busts (sources under `assets-source/imagegen/portraits-v2-grotesque/`).
- Same name always gets the same face across clients and reloads. Assets live under `public/assets/ui/portraits/`.
- Frame overlays:
  - rank **1** gold
  - rank **2** silver
  - rank **3** bronze
  - rank **4+** wood
- Frames: `public/assets/ui/portraits/frames/frame-{wood,gold,silver,bronze}.png` (transparent center).
- Rebuild processed assets: `python scripts/process-leaderboard-portraits.py` after adding sources under `assets-source/imagegen/portraits-v1/` and `portrait-frames-v1/`.
- Roster order is a public contract: append only, never reorder existing slugs.

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
