# Dungeon Escape

A first-person procedural dungeon game built with Three.js. Forge a seeded map, inspect it in the editor, then explore it in a local WebGL run.

The project includes a deterministic map generator, first-person controls, a local run save, touch controls, audio, a Forge map editor, and a reliquary preview.

## Quick start

Requires Bun 1.3.14 or later and a modern WebGL browser.

```bash
bun install
bun run dev
```

Open `http://127.0.0.1:24211/`.

Use **New Game** to open the Forge editor. The main entry also supports `?mode=editor`, `?mode=debug`, and `?mode=play`.

## What is included

- Deterministic dungeon layouts with seeded replay.
- Forge map editing and a matching in-game map preview.
- First-person exploration with keyboard, mouse, and touch input.
- Eleven visual moods, enemy sprites, spatial audio, and local run persistence.

## Documentation

- [Development](docs/DEVELOPMENT.md)
- [Standalone architecture](docs/STANDALONE.md)
- [Editor, world signals, and jump](docs/DUNGEON-EDITOR-WORLD-JUMP.md)
- [Performance and topology](docs/DUNGEON-PERFORMANCE-TOPOLOGY.md)
- [Audio runtime](docs/AUDIO.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

## Attribution

The map generator is a modified version of [Majid Manzarpour's threejs-procedural-dungeon](https://github.com/majidmanzarpour/threejs-procedural-dungeon). Thank you to Majid Manzarpour for the original procedural-dungeon work. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the upstream MIT notice.

## Status

Dungeon Escape is a standalone local application with a verified build and test suite. The optional authority client expects a compatible `/health` and `/v0` HTTP API when `authority` is supplied in the URL.

## License

No project-wide license has been selected yet. Confirm the licensing of the included audio pack before distributing release assets.
