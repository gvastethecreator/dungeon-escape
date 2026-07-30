# ADR 0004: Active-floor campaign and browser profile

## Status

Accepted

## Context

Campaign levels now grow from one to four floors, while ADR 0002 keeps `DungeonWorld` as the Play facade. Ordered biome unlocks and player identity must also survive browser restarts without coupling long-lived progress to a disposable run.

## Decision

- `generateDungeonFloorSet` derives deterministic sibling floors from one campaign root seed and adds reciprocal stair anchors.
- Only one floor is loaded into `DungeonWorld` at a time. A stair transition snapshots the run, swaps the active dungeon, restores quest/vitals/timer, and places the player at the reciprocal stair.
- The local run save stores active floor, root seed, biome, and explored cells per floor. Version 3 still reads v1/v2.
- `PlayerProfile` is a separate validated local-storage record for name, avatar, first-finished-game
  state, ordered biome rank, and clears. Older records infer that state from existing clears.
- Campaign clear unlocks at most the next biome. Custom runs never mutate campaign progress.
- First-run profile submit enters New Game level selection directly. The welcome Hall is loaded and
  shown only after the profile reaches its first game ending.

## Consequences

- Existing world, controller, minimap, and PlayRuntime ownership stays intact.
- A floor transition rebuilds the static world but preserves run-wide state.
- Corrupt profile data falls back to first-run setup; corrupt run data cannot erase profile progress.
- Adding a biome requires an ordered campaign entry, floor count, event, music mapping, and profile-compatible ID.
