# Plan de rendimiento — multi-piso (revisión anti-error)

- **Repositorio:** `X:\dungeon-escape`
- **Fecha:** 2026-08-02
- **Modo:** ejecución (contrato detallado; **sin implementación hasta aprobación**)
- **Idioma:** español
- **Skills:** improve-codebase-performance, quality-obsessed, simple-english (pragmático), wayfinder, research, improve-ui (HUD/frame)
- **Lote:** 10 mejoras (`PERF-21` … `PERF-30`)
- **Wayfinder:** `.scratch/wayfinder/multi-floor-performance/`

---

## 1. Quality contract

```text
Artifact and user outcome:
  Faster multi-floor map load and frame time without quality loss.

Purpose and enabling outcome:
  Cut collision cardinality, inactive-slab work, and per-frame support cost
  after the walkable multi-slab stack landed.

Mission mode: goal (performance batch)
In scope:
  Multi-floor build, colliders, vertical support, lights/fires by Y band,
  enemy presentation band, architecture batching, stack completeness cost,
  spatial index, load-cover yield between slabs.
Out of scope:
  DPR reduction, removing simultaneous floors, reintroducing fade floor loads,
  dependency upgrades, server/leaderboard, remote deploy.
Baseline:
  Frost 1-floor post batch-B (docs/performance/performance-review-2026-08-01-b.md)
  + new multi-floor estimates (this plan §4).
  CDP multi-floor runtime baseline: NOT YET CAPTURED (gate before tickets).
Acceptance:
  Each PERF has measured median + quality check.
  Multi-floor smoke PASS. Focused tests green.
  No material Frost 1-floor p95/draw regression.
Stop before approval: no tickets, no product code.
```

---

## 2. Destination (wayfinder)

The game keeps **1–3 resident slabs** and **walkable stairs**.  
After this batch, **obsidian/backrooms** load and run with **far fewer colliders and lights** on inactive slabs, and the player still climbs without fade or teleport.

---

## 3. Protected quality (do not break)

### Gameplay

| Rule                                   | Proof                                         |
| -------------------------------------- | --------------------------------------------- |
| Stairs walkable; no interact prompt    | `multi-floor-browser-smoke.mjs` + unit floors |
| No spawn teleport on floor rebind      | Smoke + source assert `bindDungeon`           |
| Floor label follows height             | Smoke floor 1→2→1                             |
| Stones total 4; portal on last slab    | Completeness + placement tests                |
| Collision on active slab matches today | controller-pose + play smoke                  |

### Visual / HUD (improve-ui, game HUD)

| Rule                                                              | Proof                         |
| ----------------------------------------------------------------- | ----------------------------- |
| Active slab looks complete (props, lights)                        | Screenshot spawn + upper slab |
| Shaft remains readable through open ceiling                       | Climb screenshot              |
| Inactive slabs may drop **distant** props/lights only if approved | Visual compare through hole   |
| HUD floor label stays correct after rebind                        | Smoke + `updateReadout` path  |
| No new full-screen floor fade                                     | Code + smoke                  |

### Correctness from multi-floor lessons (must re-check)

| Past failure                           | Guard in this batch                      |
| -------------------------------------- | ---------------------------------------- |
| `setDungeon` on rebind teleports       | Never reintroduce; smoke host assert     |
| `restorePose` snapped Y to eyeHeight   | Keep multi-Y restore; unit test          |
| Deck colliders block restore on treads | Heightfield or stand-on-top filter       |
| HUD not refreshed on rebind            | Keep `updateReadout`/`drawMap` on rebind |
| Same-XZ interact across slabs          | Keep vertical band                       |

---

## 4. Baseline and research evidence

### 4.1 Prior Frost 1-floor (batch B, post-revert)

Source: `docs/performance/performance-review-2026-08-01-b.md` + sample JSON under `.scratch/planning/…/post-revert-1/`.

| Metric      | Approx. median |
| ----------- | -------------: |
| map load    |        ~438 ms |
| world build |        ~420 ms |
| draw calls  |           ~275 |
| materials   |           ~333 |
| geometries  |           ~389 |
| frame p95   |       ~10.1 ms |
| long task   |        ~831 ms |

**Note:** Frost is **1 floor**. It is the **control**, not the multi-floor stress case.

### 4.2 Generation cost (measured 2026-08-02, Bun, 5 samples)

| Workload  | Floors | Gen median |
| --------- | -----: | ---------: |
| ancient   |      1 |     2.8 ms |
| grim      |      2 |    12.6 ms |
| obsidian  |      3 |    23.8 ms |
| backrooms |      3 |    42.1 ms |

**Conclusion:** generation is **not** the main multi-floor cost versus world build (~400 ms class).

### 4.3 Collision cardinality (estimated from real grids)

Current code: **one AABB per walkable cell on raised slabs** + **20 tread AABBs per shaft**.

| Biome       | Map     | Deck colliders (est.) | Treads | **New colliders** |
| ----------- | ------- | --------------------: | -----: | ----------------: |
| ancient 1   | 51×51   |                     0 |      0 |                 0 |
| grim 2      | 63×63   |                  ~631 |     20 |          **~651** |
| obsidian 3  | 83×83   |                 ~2969 |     40 |         **~3009** |
| backrooms 3 | 121×121 |                 ~4992 |     40 |         **~5032** |

**Hot path:** every frame `refreshVerticalSupport` + vault query the spatial index over this set.

### 4.4 Build path (code)

`StaticDungeonScene.buildStack` for each floor index:

1. `buildFloorContents` → architecture, **cave props**, doors, **lights**, **atmosphere**, markers, stairs, objectives
2. Hazards only when `floorWorldY === 0` (already limited)
3. Completeness/stone work runs per floor

**Inferred cost:** world build scales ~linear with floor count for props/lights/meshes, worse than generation.

### 4.5 Missing baseline (must capture before tickets)

| Metric                                       | Status           |
| -------------------------------------------- | ---------------- |
| `mapLoadMs` / `mapLoadWorldMs` obsidian 3    | **not captured** |
| draw calls / lights / geometries multi-floor | **not captured** |
| frame p95 walk on upper slab                 | **not captured** |

**Gate G0 (before any ticket work):** 3 cold Chrome samples:

```text
BIOME=obsidian MOOD=obsidian seed=MF-PERF-OBSIDIAN-BASE
BIOME=frost MOOD=frost seed=vfx-audit-2026-08-01 (control)
PERF_SECONDS=8 CRT=off perfAudit=1
```

Record median and min/max. Fail the batch plan if multi-floor load is not worse than frost by a clear margin (else reprioritize).

---

## 5. Root-cause map (not symptoms)

```text
User: New Game multi-floor → long black cover / hitch
  └─ buildStack × N full buildFloorContents
       ├─ addArchitecture (OK, needed)
       ├─ addCaveProps / doors / atmosphere × N  ← PERF-22, 28, 29
       ├─ addLightProps × N                       ← PERF-23
       └─ per-cell deck colliders on raised slabs ← PERF-21, 26, 30

User: Walk / climb multi-floor → CPU frame pressure
  └─ refreshVerticalSupport + vault over thousands of colliders ← PERF-21, 26
  └─ FixedSceneEffects / enemies on all slabs                  ← PERF-27, 28
```

---

## 6. Ordered candidates (10)

### PERF-21. Heightfield instead of per-cell deck colliders

**User path:** Play multi-floor walk and climb.

**Files:** `StaticDungeonScene.ts`, `FirstPersonController.ts`, `StoryMetrics.ts`, optional `gridCollision.ts`.

**Observed cost:** ~3000–5000 deck AABBs on 3-floor large biomes (estimate §4.3).

**Mechanism:** Store `slabY` per walkable cell (or one `Uint8Array` floor index + `STORY_HEIGHT`). Support sample = cell slab top + stair tread list only.

**Expected value:** Cut solid collider count by ~deck size; lower spatial index build and query cost. Target: **≥70% drop** in multi-floor-added colliders vs current estimate.

**Protected quality:** Same standing height on each slab; same stair treads; restorePose multi-Y still works.

**Measurement:** collider count at end of `populateDungeon`; mapLoadWorldMs; climb smoke.

**Sequence:** First. Unlocks PERF-26.

**Acceptance:** Measured collider drop; smoke climb PASS; controller-pose tests green.

**Anti-error:** Do not remove tread colliders. Do not use heightfield inside open shaft cells (holes).

---

### PERF-22. Light build for inactive slabs

**User path:** Map load multi-floor.

**Files:** `StaticDungeonScene.buildStack` / `buildFloorContents`.

**Observed cost:** Full props+lights+atmosphere per floor (code path §4.4).

**Mechanism (default if approved):** For `index !== 0` at build time, build:

- architecture + open vertical + stairs
- markers (spawn only floor 0; portal only last)
- objectives/stones as today

Defer or skip: cave props, atmosphere props, ambient godrays, wall sprites density, optional doors on far slabs.

**Alternative (if props must stay):** Build all meshes but skip dynamic lights on inactive slabs (overlaps PERF-23).

**Expected value:** Large cut of mapLoadWorldMs and props/lights on N>1.

**Protected quality:** Through-shaft view still shows architecture of upper/lower slab. Active slab after rebind must look full when player arrives — either keep props or **stream props on first rebind** (must be specified; default: keep static architecture only + stream props async under no cover if hitch < 50 ms).

**Recommendation default:** Architecture always; props only for floor 0 at build; **hydrate props for target floor on first rebind** without full scene dispose.

**Measurement:** mapLoadWorldMs, props count, lights; visual through hole.

**Sequence:** After PERF-21 design is frozen (collider ownership).

**Anti-error:** Portal only last floor. Do not drop stair meshes. Do not leave empty collision on raised slab (heightfield covers walk).

---

### PERF-23. Lights and fires by Y band

**User path:** Play frame time multi-floor.

**Files:** `StaticDungeonScene` lights, `FixedSceneEffects`, optional `TorchLod`.

**Observed cost:** `addLightProps` per slab; PointLights are expensive.

**Mechanism:** Create or enable lights only for slabs where `|slabY - playerSupportY| < threshold` (e.g. 0.5 story). Or build lights only for floor 0 + current; enable neighbor on rebind.

**Expected value:** Lower light count and GPU light cost.

**Protected quality:** Active slab lighting matches current density.

**Measurement:** `stats.lights`, frame p95, screenshot active slab.

**Anti-error:** Do not leave total darkness on active slab. Do not keep 3× light budget after player moves.

---

### PERF-24. Yield between slabs under load cover

**User path:** Perceived load hitch.

**Files:** `StaticDungeonScene.buildStack` (async path), `PlayRuntime` / `main` yield.

**Observed cost:** One long main-thread task for full stack.

**Mechanism:** `buildStack` becomes async steps: after each floor, `await yieldToMain()` when cover is up (same pattern as `setDungeonWithYield`).

**Expected value:** Lower longest long-task; smoother cover animation. Total wall time may stay similar.

**Protected quality:** Final scene identical; no flash of empty world (cover stays opaque).

**Measurement:** longTasks / longestTask from perf sample; no visual flash.

**Sequence:** After structural build changes (21–23) so yield points are stable.

**Anti-error:** Never yield without cover (prior multi-floor lesson).

---

### PERF-25. Architecture instances with per-slab Y

**User path:** Draw calls multi-floor.

**Files:** `StaticDungeonScene.addArchitecture`.

**Observed cost:** Separate InstancedMesh groups per floor theme.

**Mechanism:** Where safe, pack floor/ceiling/wall instances across slabs with world Y in the instance matrix (already `worldY()`); reduce group fragmentation and material binds.

**Expected value:** Modest draw/geometry reduction; smaller than 21–22.

**Protected quality:** Same UVs, themes, open-cell holes.

**Measurement:** geometries, draw calls.

**Anti-error:** Open vertical cells still omit floor/ceiling correctly per slab.

---

### PERF-26. Cheap vertical support sample

**User path:** Every Play frame.

**Files:** `FirstPersonController.refreshVerticalSupport`.

**Observed cost:** Spatial query + loop over nearby colliders every frame; worse with thousands of decks.

**Mechanism:** After PERF-21, sample heightfield under feet (+ small neighborhood for step-up). Keep a **short list** of stair tread colliders only (e.g. ≤40).

**Expected value:** Stable lower CPU per frame on multi-floor.

**Protected quality:** Same step-up and fall-off-ledge behavior (unit vertical-motion tests).

**Measurement:** frame p50/p95 multi-floor walk; unit tests.

**Depends on:** PERF-21.

---

### PERF-27. Enemy presentation by Y band

**User path:** Frame time with multi-floor enemies.

**Files:** `DungeonWorld`, `EnemyPresentation`, enemy sim gate.

**Observed cost:** Presentation can update enemies not on the active slab.

**Mechanism:** Skip billboard/trail updates when enemy Y (or floor index) is outside active±margin. Keep sim policy explicit: **sim only active floor** (default).

**Expected value:** Lower presentation CPU when many seats exist across floors.

**Protected quality:** Combat on active floor unchanged; no ghost damage from other slabs.

**Measurement:** frame p95; enemy contact tests still pass.

**Anti-error:** Floor rebind must re-enable presentation for the new active floor.

---

### PERF-28. Fixed scene effects only on active slab

**User path:** Frame time.

**Files:** `FixedSceneEffects`, fire effect lists, biome sprites.

**Observed cost:** Fire/liquid/sprite updates scale with all built effects.

**Mechanism:** Tag effects with `floorIndex`; update only active (+ optional neighbor).

**Expected value:** Less per-frame work on multi-floor.

**Protected quality:** Active slab VFX density unchanged.

**Measurement:** frame p95; visual fires on active floor.

---

### PERF-29. One stack objective plan

**User path:** Map load CPU.

**Files:** `StaticDungeonScene.buildFloorContents`, stone/loot placement.

**Observed cost:** Completeness and stone selection logic run in ways that can repeat work per floor.

**Mechanism:** Plan stones/portal once for the stack; each slab only places its subset. Avoid redundant `selectMagicStonePlacements` full contracts where safe.

**Expected value:** Lower load CPU; clearer stone distribution.

**Protected quality:** Exactly four stones reachable across stack; portal last floor only.

**Measurement:** load CPU; dungeon-floors / completeness tests.

**Anti-error:** Do not place stones on shaft cells; keep total four.

---

### PERF-30. Spatial index fit for multi-floor colliders

**User path:** Load + move.

**Files:** `DungeonWorld.populateDungeon`, `WorldColliderSpatialIndex`.

**Observed cost:** Index build and queries grow with collider count.

**Mechanism:** After PERF-21, rebuild index once with remaining colliders (props + treads + walls). Tune bucket size if profiles show too many candidates per query. Optional: separate **support index** vs **solid block index**.

**Expected value:** Faster queries; cleaner ownership after deck removal.

**Protected quality:** Same solid collision for props and walls.

**Depends on:** PERF-21.

**Measurement:** mapLoad; move-with-collision feel; no stuck player smoke.

---

## 7. Sequence graph

```text
G0 baseline CDP capture (obsidian×3 + frost×3)
  → PERF-21 heightfield (collider root cause)
      → PERF-26 support sample
      → PERF-30 spatial index
  → PERF-22 light slab build / prop hydrate
      → PERF-23 lights Y band
      → PERF-28 fixed effects Y band
      → PERF-27 enemy Y band
  → PERF-29 stack objectives
  → PERF-25 architecture batch
  → PERF-24 yield between slabs
  → G1 full gate + smoke + frost control
```

---

## 8. Workloads and measurement recipe

### W1 — Multi-floor stress (primary)

```text
Biome: obsidian (3 floors)
Seed: MF-PERF-OBSIDIAN-BASE
CRT=off, perfAudit=1, PERF_SECONDS=8
Samples: 3 cold Chrome profiles
```

Metrics: `mapLoadMs`, `mapLoadWorldMs`, lights, props, geometries, draw calls, frameGaps p50/p95/p99, longTasks.

### W2 — Control (no multi-floor)

```text
Biome: frost
Seed: vfx-audit-2026-08-01
Same CRT/perf settings
```

### W3 — Functional smoke

```text
BIOME=obsidian bun run scripts/multi-floor-browser-smoke.mjs
```

### Quality equivalence

| Check         | Command / artifact                                                          |
| ------------- | --------------------------------------------------------------------------- |
| Climb/descend | browser smoke PASS                                                          |
| Units         | `multi-floor-smoke`, `vertical-motion`, `controller-pose`, `dungeon-floors` |
| Typecheck     | `bun run typecheck`                                                         |
| Visual        | screenshots spawn, stair, upper, descend                                    |
| HUD           | floor N/M updates on rebind                                                 |

---

## 9. Anti-error checklist (read before each PERF)

1. Do not call `controller.setDungeon` on height rebind.
2. Do not snap restore Y to single-floor eye only.
3. Do not yield build without load cover.
4. Do not remove stair tread colliders when removing deck AABBs.
5. Do not leave open shaft cells with solid floor support.
6. Do not apply inactive-slab darkening that hides the active slab.
7. Do not skip portal on last floor or duplicate four stones per floor.
8. Do not claim frame gains from load-only changes (or the reverse).
9. Do not use Frost-only metrics to claim multi-floor wins.
10. Revert a PERF if quality fails or gain is noise (document negative experiment).
11. Dirty tree: touch only listed files; leave unrelated WIP alone.
12. After collider layout changes, re-run climb smoke before the next PERF.

---

## 10. Wayfinder frontier

| Ticket | Type     | Question                                                     | Default          |
| ------ | -------- | ------------------------------------------------------------ | ---------------- |
| W1     | grilling | Capture G0 CDP multi-floor before tickets?                   | **Yes**          |
| W2     | grilling | Inactive slabs: architecture-only + hydrate props on rebind? | **Yes**          |
| W3     | grilling | Heightfield OK instead of per-cell deck AABBs?               | **Yes**          |
| W4     | research | Exact prop/light counts on obsidian stack after G0           | After G0 capture |
| W5     | task     | Frost control must stay within noise of batch-B medians      | Enforce at G1    |

Details: `.scratch/wayfinder/multi-floor-performance/`.

---

## 11. Rejected ideas (do not implement)

| Idea                               | Why                             |
| ---------------------------------- | ------------------------------- |
| Drop to one resident floor + fade  | Breaks product goal             |
| Lower DPR / kill CRT always        | Quality cut                     |
| Classic prop material bake global  | Failed PERF-14 (worse world ms) |
| Pad batch with gen-only micro-opts | Gen already cheap vs build      |
| Hide inactive slabs entirely       | Breaks shaft depth read         |

---

## 12. Defaults if you approve without answers

1. Workloads: **obsidian 3** primary + **frost 1** control.
2. Inactive slabs: **architecture + stairs + objectives**; props hydrate on first enter.
3. Heightfield: **yes** for deck support.
4. G0 CDP capture before coding tickets.

---

## 13. Decision request

Reply with one of:

- `aprobado` — use all defaults; run G0 then tickets
- `aprobado + sin hydrate` — keep all props at build; still do lights/Y and heightfield
- `aprobado + solo grim` — stress on 2 floors only
- Or list PERF IDs to drop/keep

**No product code and no tickets until that reply.**
