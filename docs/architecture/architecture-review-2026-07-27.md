# Architecture review — Dungeon Escape

Date: 2026-07-27; dependency follow-up 2026-07-30

Status: A1-A6 accepted and implemented. A7-A9 await owner acceptance in the 2026-07-30 follow-up.

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

---

## Dependency and performance follow-up — 2026-07-30

The A1-A6 work succeeded: `DungeonWorld` fell from 4,881 to 1,926 physical lines, Forge generation
now has a pure module, and editor CSS has one owner. New campaign, profile, multi-floor, effects,
and editor work moved pressure into the browser host and static scene builder. The dependency update
also made the runtime asset boundary measurable.

### Measured baseline and completed compatibility work

| Evidence                                      | Observation                                                                                                                                                                                                           |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript 7.0.2 vs 5.9.3, five warm CLI runs | Median root check: 726 ms vs 5,412 ms; TS7 is 7.45x faster on this checkout.                                                                                                                                          |
| Direct TS7 audit                              | No compiler API consumer, embedded-language compiler, or language-service plugin. Direct migration is the correct route.                                                                                              |
| Three 0.185.1 baseline                        | Three texture generics broke three type seams; singular matrix decomposition changed five VFX assertions; one chair exceeded its metric envelope.                                                                     |
| Vite 8.2 baseline                             | `build.rollupOptions` is deprecated; the future native config loader rejected `__dirname` and extensionless imports in the local leaderboard chain.                                                                   |
| Production asset tree                         | `public/` contains 1,169 files and 408.26 MiB. Legacy enemy v3-v6 plus `enemies-v8/_src` account for 200.50 MiB and are not runtime references.                                                                       |
| Full production build                         | The baseline build spent 118.67 s; the final isolated build passed in 90.29 s. Both were dominated by preparing and copying `public/`; the observed delta is cache-sensitive, not a claimed code speedup.             |
| Code-only build                               | The new `bun run build:code` completes typechecks plus all four Vite entries in 3.37 s; bundle work itself took 1.55 s.                                                                                               |
| Current entry graph                           | `/` eagerly preloads the 417.33 kB engine, 592.58 kB Three/common chunk, 257.48 kB biome chunk, and three smaller world chunks before the player leaves the welcome screen.                                           |
| Current ownership                             | `src/main.ts` is 4,377 lines with 55 imports. `StaticDungeonScene.ts` is 3,973 lines and performs architecture, hazards, props, lighting, atmosphere, stairs, objectives, and cleanup in one synchronous transaction. |

Completed now, without creating a new architecture seam:

- made TS7 intent explicit with isolated modules, verbatim module syntax, checked side-effect imports,
  explicit ambient types, and `.ts` imports where the Vite native loader needs them;
- restored strict Three texture typing and adapted singular-matrix assertions to Three 0.185 behavior;
- restored the chair's 0.75 m gameplay footprint;
- moved Vite configuration to `rolldownOptions`, `import.meta.dirname`, and native-loadable server imports;
- added `build:code`, isolated under `.scratch/build/code`, while keeping production and deploy builds complete.

### A7. Make `public/` a runtime-only asset boundary

**Recommendation strength**: Very strong

**Problem**

At least 200.50 MiB of legacy atlases and source strips live in Vite's public directory. Vite must
walk, delete, and recopy them on every production build even though runtime source only references
enemy v8 outputs. Source concepts and published runtime assets also share one namespace.

**Design considered twice**

1. Add a custom production copy plugin with an allowlist. This improves build time but creates two
   meanings for `public/`, adds a deploy-only failure path, and makes local dev unable to prove the
   shipped tree.
2. Make directory ownership honest: move legacy/source inputs to `assets-source/`, keep only runtime
   outputs in `public/`, and make generator publish steps explicit and audited.

**Preferred solution**

Choose option 2. Add a checked runtime asset manifest that owns dynamic families (biomes, enemy v8,
music, UI) and a missing/orphan audit. Generator scripts read immutable inputs from `assets-source/`
and publish only reviewed outputs to `public/`.

**Deletion test**

The boundary passes: deleting the manifest/audit would spread dynamic path knowledge back across
runtime modules, scripts, and deploy checks. A copy-only Vite plugin fails because deleting it merely
restores the current ambiguous directory.

**Acceptance proof**

- every biome, enemy, music track, item, and editor preview loads without a 404;
- legacy/source atlases remain recoverable under `assets-source/`;
- production asset bytes fall by at least 190 MiB;
- clean production build and Wrangler dry-run use only the audited runtime tree.

### A8. Split the welcome shell from Play and Creation boot

**Recommendation strength**: Very strong, high risk

**Problem**

`src/main.ts` imports and constructs the renderer, world, lighting, controller, editor view, and Play
runtime before the player chooses a run. Vite therefore preloads roughly 391 kB gzip of engine and
shared world code for the welcome screen and creates WebGL resources immediately.

**Design considered twice**

1. Manually split the Three vendor chunk. This changes file shape and caching but does not remove
   Three or world code from the welcome screen's static dependency graph.
2. Keep a small welcome/profile shell and dynamically load a deep Play or Creation experience only
   when that surface is requested.

**Preferred solution**

Choose option 2. The shell owns profile, campaign choice, leaderboard summary, and transitions. A
loaded experience owns renderer/world/controller/editor resources behind start, resize, suspend, and
dispose lifecycle operations. Do not expose individual subsystems through the shell.

**Deletion test**

The lifecycle boundary passes only if removing it puts WebGL construction, surface switching, and
cleanup back into the shell. A thin dynamic-import helper fails.

**Acceptance proof**

- welcome/profile works with WebGL creation deliberately blocked;
- no Play/Creation chunks are requested before a run or Custom Run is chosen;
- Play, Creation, Debug, intro theater, resume, and home transitions dispose/reuse resources once;
- browser timing records first usable welcome and first playable frame separately.

### A9. Plan static scene data before committing Three objects

**Recommendation strength**: Strong, high risk

**Problem**

`StaticDungeonScene.build` is a synchronous 3,973-line implementation that interleaves deterministic
placement, occupancy/collision rules, completeness checks, Three object construction, and resource
ownership. Larger multi-floor maps increase main-thread work and make placement rules difficult to
test without rendering dependencies.

**Design considered twice**

1. Split methods into architecture, props, lights, and effects files while retaining shared mutable
   sets. This reduces file size but leaves ordering and invariants distributed.
2. Produce an immutable deterministic scene plan first, validate it, then commit that plan to Three
   objects in one renderer-owned transaction.

**Preferred solution**

Choose option 2. The plan owns placements, variants, reservations, hazard exclusions, objectives,
doors, stairs, light budgets, and completeness evidence. `StaticDungeonScene` remains the facade and
owns instantiated objects and disposal. The pure planner becomes the test and future worker seam.

**Deletion test**

The plan passes if deleting it would return deterministic placement and completeness rules to the
renderer. Concern-only helper files fail.

**Acceptance proof**

- fixed seeds preserve topology, object seats, hazards, doors, stairs, and objective positions;
- planning runs without DOM or WebGL and reports stage timings;
- commit/clear preserve collider, render inventory, and disposal counts;
- worst-case campaign floors meet an agreed build-frame budget.

### Follow-up order and decision gate

1. A7 — runtime asset boundary; highest measured build/deploy return and independent of game state.
2. A8 — lazy experience lifecycle; highest initial-load return, broad browser risk.
3. A9 — static plan/commit seam; enables larger floors after lifecycle ownership is stable.

No A7-A9 interface should be implemented until the owner accepts, rejects, or defers each item. On
acceptance, update `CONTEXT.md`, add ADRs for the accepted asset/lifecycle/plan boundaries, and extend
`WORKPLAN.md` with vertical slices and proof gates.
