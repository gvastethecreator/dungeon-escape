# Architecture review — Dungeon Escape

Date: 2026-07-27

Status: A1-A6 accepted on 2026-07-27. Implementation is tracked in [`WORKPLAN.md`](WORKPLAN.md).

## Summary

- `src/main.ts`, `src/world/DungeonWorld.ts`, `src/forge/main.js`, and `src/styles.css` hold most change and test risk.
- Forge input checks repeat across three modules. Biome identity repeats across the runtime, editor, and Forge.
- Forge generation sits in the same module as DOM, WebGL, input, and host messages.
- `DungeonWorld` already gives callers a useful deep interface. Its implementation needs smaller owners after the active world work reaches a safe point.
- The first safe work is Forge message parsing and biome identity. The large runtime moves should wait for a clean, proven checkpoint.

## Evidence ledger

| Evidence                                                                                                | Observation                                                                                                  |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/main.ts`                                                                                           | 2,657 lines after the frame-gap fix; 39 imports, 118 DOM bindings, and broad run state ownership.            |
| `src/world/DungeonWorld.ts`                                                                             | 4,881 lines, 47 import paths, about 68 fields, and 1,111 changed lines in the active worktree.               |
| `src/forge/main.js`                                                                                     | 4,535 lines; generation, WebGL, DOM, input, host messages, and the frame loop share one module.              |
| `src/styles.css`                                                                                        | 3,771 lines; editor rules start near line 2,163 and receive later overrides across desktop and narrow rules. |
| `src/dungeon/forgePayload.ts`, `src/dungeon/importDungeonForge.ts`, `src/main.ts`                       | Forge host input is checked, normalized, and checked again before import.                                    |
| `src/systems/DungeonMood.ts`, `src/editor/EditorLightingProfiles.ts`, `src/forge/main.js`, `forge.html` | Biome IDs, labels, order, and support lists have more than one owner.                                        |
| `git diff --stat` on 2026-07-27                                                                         | Active work spans 50 tracked files with 2,875 insertions and 749 deletions.                                  |

## Recommendations

### A1. Deepen Forge message intake

**Recommendation strength**: Strong

**Files**

- `src/main.ts`
- `src/dungeon/forgePayload.ts`
- `src/dungeon/importDungeonForge.ts`
- `tests/forge-payload.test.ts`
- `tests/dungeon-forge-import.test.ts`

**Problem**

The Forge intake modules are shallow. The host calls `isForgeDungeonMessage`, `normalizeForgePayload`, and `prepareDungeonForge` in order. Each step knows part of the same input rules. `normalizeForgePayload` ends with a cast before the full import checks run.

**Solution**

Deepen one intake module behind `parseForgeDungeonMessage(unknown)`. Its interface should own message version, payload shape, dungeon rules, params, and error results. The `message` listener stays as the browser adapter.

**Benefits**

- locality: malformed Forge input rules live in one module
- leverage: one interface returns the checked payload, dungeon, and params
- interface shrinks: the host stops ordering three checks
- tests cross the same seam as browser messages

**Before / After**

Before: the host knows the check order and each error source. After: the host passes unknown input to one interface and handles one result.

**Deletion test**

`normalizeForgePayload` is shallow. Removing it does not force its full implementation into callers because later import checks already own much of the work. The proposed intake module passes the test: deleting it would spread message rules back across the listener and importer.

**Dependencies / sequencing**

- Do first.
- Keep current error copy and valid v1 payload output.
- Add malformed, old-version, missing-field, and valid-message tests before removing old calls.

**Documentation follow-ups**

- Add `Forge message` and `Forge payload` to `CONTEXT.md` if accepted.
- Track the work in `docs/architecture/WORKPLAN.md`.

### A2. Give biome identity one owner

**Recommendation strength**: Strong

**Files**

- `src/systems/DungeonMood.ts`
- `src/editor/EditorLightingProfiles.ts`
- `src/forge/main.js`
- `forge.html`
- `src/world/EnemySpriteAtlas.ts`

**Problem**

Biome IDs, labels, order, and feature support repeat across modules. Forge has a nine-theme list and an eleven-texture list. The runtime and editor hold their own lists. Forge also shows `grim` as `ASH`, and the source does not state whether that copy is a settled rule.

**Solution**

Create one biome identity module with a small interface for ID parsing, stable order, display label, and Forge support. Runtime mood, editor light, and Forge render data remain separate implementations through adapters.

**Benefits**

- locality: ID and label changes have one owner
- leverage: one interface serves runtime, editor, Forge, assets, and tests
- adapters keep light and art values near their own implementations
- seed order becomes a stated invariant

**Before / After**

Before: each surface can accept or label a different set. After: every surface reads the same identity and adds its own data.

**Deletion test**

The module passes. Removing it would restore the same ID, order, and label rules in three or more callers.

**Dependencies / sequencing**

- Do after A1 or in the same batch.
- Decide whether `grim` should display as `ASH` before changing copy.
- Preserve current seed order.

**Documentation follow-ups**

- Add the accepted biome terms and aliases to `CONTEXT.md`.
- Use an ADR only if seed order or public IDs change.

### A3. Extract pure Forge generation

**Recommendation strength**: Very strong

**Files**

- `src/forge/main.js`
- `src/forge/layoutTuning.ts`
- `src/dungeon/forgePayload.ts`
- `tests/forge-room-topology.test.ts`
- `tests/forge-layout-pacing.test.ts`

**Problem**

`tryGenerate` occupies about 1,100 lines inside the module that also owns WebGL, camera, DOM, input, host messages, and the frame loop. `forge()` generates data, builds the scene, posts the result, and paints status.

**Solution**

Move generation behind a pure `generateForgeDungeon(params)` interface. Keep timing outside or pass a clock adapter. `src/forge/main.js` becomes the DOM and WebGL adapter.

**Benefits**

- locality: graph, room, corridor, and placement rules live together
- leverage: browser, tests, and future tools call one generation interface
- tests run without DOM or WebGL
- render work cannot change generation state by accident

**Before / After**

Before: generation needs the Forge host module. After: the host receives a complete result and only renders or posts it.

**Deletion test**

The module passes. Deleting it would return the full algorithm and its state to the visual adapter.

**Dependencies / sequencing**

- Start after A1 fixes the payload contract.
- Capture fixed-seed results before moving code.
- Preserve random call order, typed arrays, clone rules, and `genMs` meaning.

**Documentation follow-ups**

- Add `Forge generation` to `CONTEXT.md`.
- Add an ADR if the source of timing or random state changes.

### A4. Move play state behind a runtime interface

**Recommendation strength**: Very strong, high risk

**Files**

- `src/main.ts`
- `src/game/RunSession.ts`
- `src/game/QuestState.ts`
- `src/domain/bridge.ts`
- `tests/run-session.test.ts`
- `tests/session-persistence.test.ts`

**Problem**

`main.ts` owns DOM, world order, session state, quest state, audio, save, renderer warmup, and the frame loop. `RunSessionState` defines run authority, yet `resolve`, `runMode`, and `exitReached` also exist as local mirrors and need `syncSessionMirrors`.

**Solution**

Create a deep `PlayRuntime` interface with `load`, `step`, `snapshot`, and `dispose`. Put world/session/quest order in its implementation. Keep DOM, audio, and renderer work in adapters. Use a test adapter as the second real adapter at the seam.

**Benefits**

- locality: run rules and state order live in one implementation
- leverage: one interface serves the frame loop, save, tests, and diagnostics
- state mirrors can be removed
- browser code owns browser work

**Before / After**

Before: the entry module coordinates every frame detail. After: it wires adapters and paints each runtime result.

**Deletion test**

The runtime passes. Deleting it would spread order and state rules back into `main.ts`. Thin state pass-through methods should stay out of the interface.

**Dependencies / sequencing**

- Wait until A1-A3 and current save work pass full runtime proof.
- Use expand-contract: add the runtime, move one public path at a time, then remove mirrors.
- Preserve pointer lock, pause, touch, resume, warmup, and effect order.

**Documentation follow-ups**

- Add `Play runtime`, `Run session`, and `Quest state` to `CONTEXT.md`.
- Record seam placement in an ADR because the move is broad and hard to reverse.

### A5. Keep the DungeonWorld interface; split its implementation

**Recommendation strength**: Strong, blocked by active work

**Files**

- `src/world/DungeonWorld.ts`
- `src/world/PropPlacement.ts`
- `src/world/AtmospherePropsKit.ts`
- `src/world/BiomeSpriteDecorKit.ts`
- `tests/professional-world.test.ts`
- `tests/static-prop-batching.test.ts`

**Problem**

`DungeonWorld` has a useful caller interface, but its implementation owns fixed scene build, placement, collision, enemies, game rules, audio frames, minimap data, and disposal. Active work changed 1,111 lines in this file, so a move now would mix ownership and make proof weak.

**Solution**

Keep `DungeonWorld` as the deep facade. Extract `StaticDungeonScene` first with `build`, `clear`, and build results for collision and occupied cells. Leave game, audio, and minimap adapters behind `DungeonWorld` until each next seam has two real uses.

**Benefits**

- locality: fixed scene build and disposal share one implementation
- leverage: `DungeonWorld` callers keep one interface
- current game code does not learn scene assembly details
- static scene tests can use one seam

**Before / After**

Before: one class owns build and play. After: the facade owns play and delegates fixed build to one deep module.

**Deletion test**

`DungeonWorld` passes and should remain. `StaticDungeonScene` passes only if build, reservations, results, and cleanup move together. A set of thin factory calls would fail.

**Dependencies / sequencing**

- Defer until the active world diff has a safe checkpoint.
- Capture render inventory, collider counts, occupied seats, and disposal counts before the move.
- Move one vertical build path and keep the game runnable after each batch.

**Documentation follow-ups**

- Add `Static dungeon scene` only after its duties are settled.
- Add an ADR for facade ownership and build result shape.

### A6. Give editor CSS one module

**Recommendation strength**: Medium

**Files**

- `src/styles.css`
- `src/forge/styles.css`
- `index.html`

**Problem**

Editor rules start near line 2,163, receive a second group near line 3,229, then change again in narrow rules. A single editor change needs broad cascade checks.

**Solution**

Move all selectors owned by the editor surface to `src/styles/editor.css`. Its interface is the current `data-engine-mode`, `data-editor-*`, Forge host state, and named editor classes. Keep import order fixed and state the order in the file header.

**Benefits**

- locality: editor layout and state rules live in one module
- leverage: one selector contract covers desktop, narrow, focus, and motion states
- play HUD and welcome rules stop sharing the same cascade area

**Before / After**

Before: editor rules have more than one section. After: one module owns the full surface and its responsive states.

**Deletion test**

A size-only split fails. A module that owns every editor selector passes because deleting it returns the whole editor cascade to the root sheet.

**Dependencies / sequencing**

- Do after A4 settles the shell structure.
- Preserve selector order and specificity first; simplify only after visual parity.
- Verify desktop, 900 px, 760 px, reduced motion, focus, and the Forge iframe.

**Documentation follow-ups**

- Track selector ownership in `docs/architecture/WORKPLAN.md`.
- An ADR is not needed unless cascade policy changes.

## Suggested execution order

1. A1 — one Forge input seam; small surface and strong test value.
2. A2 — one biome identity owner; fixes repeated rules before more asset work.
3. A3 — pure Forge generation; uses the stable payload and biome terms.
4. A4 — play runtime; broad move after input and generation settle.
5. A5 — static world build; wait for the active world work to land.
6. A6 — editor CSS; move after shell ownership settles.

## Documentation fan-out after acceptance

- `CONTEXT.md`: Forge message, Forge payload, biome identity, Forge generation, Play runtime, Run session, Quest state, Static dungeon scene.
- `docs/adr/`: Play runtime seam; DungeonWorld facade ownership; seed/public-ID changes only if chosen.
- `docs/architecture/WORKPLAN.md`: accepted items, order, proof, blockers, and current owner.

## Residual risks

- Current source counts and dirty-file overlap can change before implementation.
- A4-A6 need browser proof across play, editor, mobile, pause, resume, and reduced motion.
- A5 should remain deferred while `DungeonWorld.ts` carries active work from other tasks.
- The owner must decide whether `grim` displaying as `ASH` is a rule or a copy bug.
