# ADR 0008: Generation engine and editor boundary

Status: accepted

Date: 2026-08-08

## Context

`main.ts` read generation settings from editor controls during Play. Dungeon activation also built the editor projection for every map. Floor rebinding repeated a DOM read.

These calls added editor work to campaign generation, resident-stack activation, and seamless floor traversal.

## Decision

- `DungeonGenerationEngine` owns topology options, single-floor generation, and resident-stack generation.
- The generation engine has no DOM, editor, Three.js, or world dependency.
- The host keeps one `DungeonParams` snapshot. Editor controls update that snapshot through an explicit adapter.
- Campaign, Continue, Play activation, and floor rebinding use the snapshot. They do not read editor controls.
- `DungeonEditorView` loads through `LazyDungeonEditorView` only when Creation or Debug requests the runtime map surface.
- Play activation does not build an editor projection.
- Generation presets live under `src/dungeon/`. The old editor export remains as a compatibility seam.

## Consequences

- New Game does not request editor textures or build the plan-view projection.
- A seamless floor change does not access editor DOM state.
- Creation pays its editor load cost on first use.
- The host still coordinates Play and Creation. Neither subsystem imports the other subsystem's implementation.
