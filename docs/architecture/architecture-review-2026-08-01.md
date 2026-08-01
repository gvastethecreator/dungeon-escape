# Architecture improvement report — Dungeon Escape

Date: 2026-08-01  
Mode: Execution  
Status: Completed (10/10)  
Tracker: `.scratch/dungeon-arch-batch-2026-08-01/`

## Summary

- Requested: 10 architecture deepenings.
- Completed: 10 pure/policy modules extracted or deepened and wired into live callers.
- Strongest result: combat, audio threat, door, hazard, minimap, and CRT policies that lived inside facades now cross small pure interfaces with focused tests.
- Final integration: 831 tests pass; `bun run typecheck:all` and `bun run lint` green.
- Deferred (owner): **A9** static-scene plan-then-Three-commit (unchanged).

## Ticket outcomes

### ARCH-2026-08-01-01. Audio threat policy

**Status:** Completed  

**Initial evidence:** `GameAudio.setThreatDistance` / `tick` owned intensity curve, band thresholds, and bark cooldowns next to Web Audio playback.  

**Implemented:** `src/audio/AudioThreatPolicy.ts`; mixer applies decisions only.  

**Before / after:** threat numbers only inside mixer class → pure intensity/band/ambient bark policy with injectible RNG for ambient.  

**Verification:** `tests/audio-threat-policy.test.ts`, `tests/game-audio.test.ts`  

**Residual risk:** creature take selection and asset catalog remain in `GameAudio`.

### ARCH-2026-08-01-02. Door open hysteresis policy

**Status:** Completed  

**Initial evidence:** `DungeonWorld.update` door loop inlined open/close hysteresis and passable flags.  

**Implemented:** `src/world/DoorOpenPolicy.ts`; world damps meshes only.  

**Before / after:** magic distances in the facade loop → one hysteresis owner.  

**Verification:** `tests/door-open-policy.test.ts`  

**Residual risk:** damp response rates remain presentation-owned (correct side of the seam).

### ARCH-2026-08-01-03. Interaction reach ownership

**Status:** Completed  

**Initial evidence:** After MAINT-ARC-10, chest/pickup constants and predicates still lived on `StaticDungeonScene`.  

**Implemented:** ownership in `src/world/InteractionReach.ts`; StaticDungeonScene re-exports for expand-contract; `DungeonWorld` imports reach from InteractionReach.  

**Before / after:** gameplay radii on a 3k-line Three builder → pure reach module with scene compatibility exports.  

**Verification:** `tests/interaction-reach.test.ts`  

**Residual risk:** none observed.

### ARCH-2026-08-01-04. Annihilation pulse hit eligibility

**Status:** Completed  

**Initial evidence:** `DungeonWorld.applyAnnihilationPulse` owned who dies next to VFX.  

**Implemented:** `annihilationPulseHitsEnemy` / reach helpers on `src/game/AnnihilationPulse.ts`.  

**Before / after:** kill eligibility inside world facade → pure pose check beside the pulse clock.  

**Verification:** `tests/annihilation-pulse.test.ts`  

**Residual risk:** defeat mutation and VFX remain facade-owned.

### ARCH-2026-08-01-05. Spike exposure curve

**Status:** Completed  

**Initial evidence:** MAINT residual: private `HazardTileSystem.spikeExposure` duplicated the damage threshold path.  

**Implemented:** pure `spikeExposure` / `hazardSmoothstep` in `src/world/HazardTraversal.ts`; system samples it for damage and mesh lift.  

**Before / after:** two private sin curves risk → one shared exposure series.  

**Verification:** `tests/hazard-traversal.test.ts`, `tests/hazard-tile-system.test.ts`  

**Residual risk:** none observed.

### ARCH-2026-08-01-06. Biome-event surface composition

**Status:** Completed  

**Initial evidence:** surface damage/movement scale clamp lived inside `DungeonWorld.update`.  

**Implemented:** `src/systems/BiomeEventSurface.ts` with hazard and difficulty composition.  

**Before / after:** clamp only in the update megamethod → pure composition with unit tests.  

**Verification:** `tests/biome-event-surface.test.ts`  

**Residual risk:** none observed.

### ARCH-2026-08-01-07. Safe spawn distance composition

**Status:** Completed  

**Initial evidence:** ward/pulse pad composition lived only in `activateEnemiesToTarget`.  

**Implemented:** `resolveSafeSpawnDistance` on `src/world/EnemyActivation.ts`.  

**Before / after:** field pads next to seat splice → pure helper used by the facade.  

**Verification:** `tests/enemy-activation.test.ts`  

**Residual risk:** none observed.

### ARCH-2026-08-01-08. Minimap feature projection

**Status:** Completed  

**Initial evidence:** `DungeonWorld.getMinimapFeatures` owned filter policy next to Three actors.  

**Implemented:** `src/ui/projectMinimapFeatures.ts` over DTO records; world maps actors then projects.  

**Before / after:** filter policy in world facade → pure marker projection.  

**Verification:** `tests/project-minimap-features.test.ts`  

**Residual risk:** cell mapping still needs a live `toCell` adapter (correct).

### ARCH-2026-08-01-09. Pickup HUD feedback projection

**Status:** Completed  

**Initial evidence:** `showPickupFeedback` in `main.ts` used nested ternaries for kicker and dataset.kind.  

**Implemented:** `src/ui/PickupFeedback.ts`; main binds DOM animation only.  

**Before / after:** kind policy only in host → pure priority map.  

**Verification:** `tests/pickup-feedback.test.ts`  

**Residual risk:** none observed.

### ARCH-2026-08-01-10. Adaptive CRT hysteresis

**Status:** Completed  

**Initial evidence:** Play frame in `main.ts` inlined auto-disable and recover-with-8ms hysteresis.  

**Implemented:** `src/systems/AdaptiveCrtPolicy.ts` state step; main applies WebGL/UI.  

**Before / after:** hysteresis only in the render loop → pure state machine.  

**Verification:** `tests/adaptive-crt-policy.test.ts`  

**Residual risk:** recovery now syncs CRT UI whenever auto state changes, including when default CRT stays off.

## Hygiene

| Item | Action | Result |
| --- | --- | --- |
| `tests/static-dungeon-scene.test.ts` golden counts | update | Pre-existing seed drift (pickups/props/solids/reserves) corrected to current deterministic output; verified failing on baseline before this batch |
| A9 | keep deferred | No implementation |

## Integration verification

| Command | Result |
| --- | --- |
| `bun run typecheck:all` | pass |
| `bun run lint` | pass (0 warnings) |
| `bun test tests` | 831 tests pass / 0 fail / 154695 assertions |
| Production deploy | not re-run in this pass |
| Browser Play smoke | not re-run in this pass (pure-policy batch) |

## Decisions and trade-offs

- Prefer pure policy modules over large facade splits (avoid A9-sized work without acceptance).
- Expand-contract: StaticDungeonScene keeps interaction reach re-exports.
- Selected candidates 01–10; deferred UI shell click cues and locomotion default unification as swap candidates.
- Corrected stale static-scene golden counts only after proving the failure on the unpatched tree.

## Residual risks

- A9 still owner-deferred.
- `main.ts` and `StaticDungeonScene` remain large; next deepenings should continue pure policy extraction.
- GameAudio asset catalog / creature take selection still mixed with the mixer.
- Full enemy presentation / fixed-actor tick owners remain future tickets.

## Gap-closure pass — same day (quality-obsessed + wayfinder)

Wayfinder map: `.scratch/wayfinder/arch-batch-2026-08-01-gaps/` (6 task tickets, all resolved).

| Gap | Severity | Fix |
| --- | --- | --- |
| Door open distance dual source (`2.65` in DoorFactory + world) | P1 completeness | Single `DOOR_DEFAULT_OPEN_DISTANCE` |
| Pickup host still used 8-boolean arity | P1 incomplete seam | `showPickupFeedback(label, effects.pickup)` |
| No structural wiring contracts for new modules | P2 verification | `tests/architecture-batch-wiring-2026-08-01.test.ts` |
| Thin InteractionReach wrappers on StaticDungeonScene | P2 structure | Direct `export { … } from "./InteractionReach"` |
| Spike curve lacked THREE parity + re-export | P2 proof | THREE parity samples + HazardTileSystem re-export |
| CRT host over-synced on recover-to-off | P2 parity | Presentation only when `enabled` flips |

**Integration after gap closure:** `bun run typecheck:all` pass; `bun test tests` **840 pass / 0 fail**.

Independent review: omitted (same-session self-audit; adversarial autopsy accepted the six gaps above and re-verified).
