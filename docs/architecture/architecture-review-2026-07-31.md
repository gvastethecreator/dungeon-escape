# Architecture improvement report — Dungeon Escape

Date: 2026-07-31  
Mode: Execution  
Status: Completed (10/10) + project-maintenance hygiene  
Tracker: `.scratch/dungeon-maint-architecture-batch/`

## Summary

- Requested: 10 architecture deepenings + project-maintenance pass.
- Completed: 10 pure/policy modules extracted and wired; stale docs reconciled; disposable scratch noise and `scripts/__pycache__` removed.
- Strongest result: combat/hazard/HUD policies that lived as copy-paste or facade private methods now cross small pure interfaces with focused tests.
- Final integration: full `bun test tests` green after wiring-test updates; `bun run typecheck:all` and `bun run lint` green.
- Deferred (owner): **A9** static-scene plan-then-Three-commit (unchanged).

## Ticket outcomes

### MAINT-ARC-01. Timed status chip owner

**Ticket:** `.scratch/dungeon-maint-architecture-batch/tickets.md`  
**Status:** Completed

**Initial evidence:** `main.ts` triplicated time-freeze / ward / pulse HUD sync (~50 lines ×3).

**Implemented:** `src/ui/TimedStatusChip.ts` owns format, latch, urgent threshold, shell dataset; three chips in main.

**Verification:** `bun test tests/timed-status-chip.test.ts tests/play-hud.test.ts`

**Residual risk:** None observed.

### MAINT-ARC-02. Enemy contact vertical module

**Ticket:** tracker  
**Status:** Completed

**Initial evidence:** Vertical vault rules lived inside `EnemySim.ts` after the jump-over fix.

**Implemented:** `src/world/EnemyContact.ts`; `EnemySim` re-exports and uses `enemyStrikesPlayerVertically`.

**Verification:** `bun test tests/enemy-sim.test.ts`

**Residual risk:** None observed.

### MAINT-ARC-03. Player combat pose constants

**Ticket:** tracker  
**Status:** Completed

**Initial evidence:** Eye height / airborne jump threshold duplicated between combat and hazard clearance.

**Implemented:** `src/player/CombatPose.ts`; `DungeonWorld.setPlayerTraversalState` uses `isPlayerAirborneFromJumpHeight`.

**Verification:** `bun test tests/combat-pose.test.ts tests/hazard-tile-system.test.ts`

**Residual risk:** Controller still owns its own `eyeHeight` option; default must stay aligned with `PLAYER_COMBAT_EYE_HEIGHT`.

### MAINT-ARC-04. Audio music track policy

**Ticket:** tracker  
**Status:** Completed

**Initial evidence:** Biome/portal track resolution lived inside the Web Audio mixer module.

**Implemented:** `src/audio/AudioMusicPolicy.ts`; `GameAudio` re-exports `musicTrackForBiome`.

**Verification:** `bun test tests/audio-music-policy.test.ts tests/game-audio.test.ts`

**Residual risk:** Asset catalog tables still live in `GameAudio` (mixer + catalog remaining depth).

### MAINT-ARC-05. Creature voice mapping seam

**Ticket:** tracker  
**Status:** Completed

**Initial evidence:** `creatureVoiceForEnemy` was a world re-export identity map.

**Implemented:** Lives in `src/world/DungeonAudioFrame.ts`; world re-exports for compatibility.

**Verification:** `bun test tests/dungeon-audio-frame.test.ts`

**Residual risk:** None observed.

### MAINT-ARC-06. Hazard traversal damage policy

**Ticket:** tracker  
**Status:** Completed

**Initial evidence:** Fire/toxin/spike clocks and damage numbers lived inside `HazardTileSystem.sample` next to Three presentation.

**Implemented:** `src/world/HazardTraversal.ts` pure `tickHazardTraversal`; system samples contact then applies policy.

**Verification:** `bun test tests/hazard-traversal.test.ts tests/hazard-tile-system.test.ts`

**Residual risk:** Spike exposure curve remains presentation-owned (`spikeExposure` private method).

### MAINT-ARC-07. Enemy activation candidate filter

**Ticket:** tracker  
**Status:** Completed

**Initial evidence:** Opening/play/resume candidacy and spread preference were private loops in `DungeonWorld`.

**Implemented:** `src/world/EnemyActivation.ts` pure filters; facade mutates seats from the pool.

**Verification:** `bun test tests/enemy-activation.test.ts`

**Residual risk:** Seat splice/reveal still facade-owned (correct side of the seam).

### MAINT-ARC-08. Dungeon audio frame projection

**Ticket:** tracker  
**Status:** Completed

**Initial evidence:** Fire/stone/enemy/portal anchor fill lived in `DungeonWorld.getAudioFrame`.

**Implemented:** `projectDungeonAudioFrame` pure fill of pooled frame.

**Verification:** `bun test tests/dungeon-audio-frame.test.ts tests/game-audio.test.ts`

**Residual risk:** None observed.

### MAINT-ARC-09. Play step damage-wash projection

**Ticket:** tracker  
**Status:** Completed

**Initial evidence:** Host frame called `resolveDamageWashKind` and branched attacker audio inline.

**Implemented:** `src/systems/PlayStepEffects.ts` `projectPlayStepDamage`; main executes intent.

**Verification:** `bun test tests/play-step-effects.test.ts tests/damage-feedback.test.ts tests/hazard-feel.test.ts`

**Residual risk:** None observed.

### MAINT-ARC-10. Interactive reach helpers

**Ticket:** tracker  
**Status:** Completed

**Initial evidence:** Distance limits for chests/pickups lacked a shared range owner for point-form checks.

**Implemented:** `src/world/InteractionReach.ts`; `canInteractWithChestAt` / `canCollectPickupAt` on static scene.

**Verification:** `bun test tests/interaction-reach.test.ts`

**Residual risk:** Live world update still uses distance-first `canCollectPickup` (point helpers available for next caller migration).

## Project maintenance

| Item                                                       | Action        | Result                                                                                              |
| ---------------------------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------- |
| Architecture residual docs (A7/A8 accepted)                | update        | Banner on 2026-07-27 review, postscript on 2026-07-30 review, quality residual note, WORKPLAN entry |
| `scripts/__pycache__`                                      | remove        | Deleted                                                                                             |
| Disposable `.scratch` root logs/screenshots/verify scripts | remove        | Cleared owned noise under `.scratch/` (gitignored)                                                  |
| A9                                                         | keep deferred | No implementation                                                                                   |
| Broad Oxfmt baseline                                       | manual-review | Not mixed into this batch                                                                           |

## Integration verification

| Command                 | Result                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `bun run typecheck:all` | pass                                                                                                                |
| `bun run lint`          | pass (0 warnings)                                                                                                   |
| `bun test tests`        | 807 tests pass after wiring-test updates (one structural main-source assertion updated for `projectPlayStepDamage`) |
| Production deploy       | not re-run in this pass                                                                                             |

## Decisions and trade-offs

- Prefer pure policy modules over large facade splits (avoid A9-sized work without acceptance).
- Expand-contract: keep compatibility re-exports (`creatureVoiceForEnemy`, `musicTrackForBiome`, EnemySim vertical contact exports).
- Hygiene deletes limited to proven disposable scratch artifacts and bytecode; durable planning/issue trees kept.

## Residual risks

- A9 still owner-deferred.
- `main.ts` and `StaticDungeonScene` remain large; next deepenings should continue pure policy extraction, not big-bang rewrites.
- Full enemy presentation / fixed-actor tick owners from the explore ledger remain future tickets (not padded into this batch).
