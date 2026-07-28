# ADR 0003: Enemy biome and difficulty mods

## Status

Accepted

## Context

Enemy combat stats and pursuit behaviors lived only on the static `ENEMY_ARCHETYPES` table. Biomes already changed presentation (sprites, mood, SFX) and difficulty already changed counts and unlocks, but a frost spider still pursued like a molten one.

## Decision

Resolve a live `EnemyArchetype` per kind through `applyBiomeEnemyMods(kind, moodId, difficulty)` before sim use.

- Every `BiomeId` owns a full `EnemyBiomeProfile` (stat multipliers + optional behavior map).
- Difficulty scales those multipliers toward more pressure (speed, damage, detection up; cooldown down).
- Soft biome behavior defaults never strip spectral `phase`; per-kind maps may still set phase or erratic explicitly.
- `tickEnemySim` and `getEnemyMotion` consume the resolved archetype; `DungeonWorld` passes `activeMood.id` and run difficulty.

Base archetypes remain the authored presentation and zero-difficulty ash baseline.

## Consequences

- Play reads biome and difficulty in contact damage, cooldowns, and pursuit patterns.
- Adding a biome requires a profile entry.
- Danger-tier unlock tables still use base archetypes so roster ordering stays stable.
