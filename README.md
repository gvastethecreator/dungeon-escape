# Dungeon Escape

A first-person run through a generated dungeon.

Play a seeded campaign in the browser. Forge a custom map, then walk it with keyboard, mouse, or touch.

Live play: [https://dungeon.gvaste.ar](https://dungeon.gvaste.ar)

## Quick start

Requires Bun 1.3.14 or later and a current Chrome, Edge, or Firefox browser.

```bash
bun install
bun run dev
```

Open `http://127.0.0.1:24211/`.

Use **New Game** for a campaign run. Use **Custom Run** to open the Forge editor.

## What is included

- Seeded dungeon layouts you can replay
- First-person play with keyboard, mouse, and touch
- Eleven biomes, enemies, spatial audio, and a local run save
- Forge map editing and an in-game map preview

## Documentation

- [Development](docs/DEVELOPMENT.md)
- [Standalone architecture](docs/STANDALONE.md)
- [Audio runtime](docs/AUDIO.md)
- [Hall of Escapes](docs/LEADERBOARD.md)
- [Dependencies](docs/DEPENDENCIES.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Attribution

The map generator is a modified version of [Majid Manzarpour's threejs-procedural-dungeon](https://github.com/majidmanzarpour/threejs-procedural-dungeon). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the upstream MIT notice.

## Status

- The default renderer is WebGL. WebGPU is an optional path. See `docs/adr/0009-webgpu-renderer-and-tsl.md`.
- Public deploys hide Map tools so players cannot rewrite seeds into the Hall path.

## License

MIT. See [LICENSE](LICENSE). Upstream map-generator portions keep their own MIT notice in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
