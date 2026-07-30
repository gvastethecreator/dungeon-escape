# Annihilation pulse relic

The annihilation pulse relic is a power pickup placed in a route chest. After collection it creates a 13-second field around the player.

## Gameplay contract

- A pulse fires every 2.8 seconds.
- Each ring expands to 7.2 world units.
- Enemies inside the ring die at once and keep their instanced seat at zero scale. The seat stays reserved, so the difficulty director cannot respawn the same enemy during the run.
- The active field keeps enemies 11.5 units away.
- Flee motion uses a 1.85 speed multiplier, which gives the relic a stronger escape response than the luminous ward.
- Pulse timing, pickup state, and remaining time use the same world update and resume save path as the other power items.

The rules live in `src/game/AnnihilationPulse.ts`. `DungeonWorld` owns the clock, enemy removal, pickup activation, and update events.

## Model

`createAnnihilationPulseRelic` in `src/world/ItemFactory.ts` builds the pickup from the shared dungeon material palette. It includes:

- a dark stone pedestal;
- three crossed iron rings;
- a faceted red crystal with a hot inner core;
- a red pickup halo and point light;
- pickup and glow sockets;
- a trigger collider in `userData.sculptRuntime`.

The model appears in the model lab as `annihilation-pulse` and uses the same factory as the game chest.

## Pulse and death effects

`src/world/AnnihilationPulseVfx.ts` keeps a fixed pool of four ring slots and 288 particle slots. Rings use the active player position. Enemy death particles select a material profile from the active biome:

| Biome                     | Burst material  |
| ------------------------- | --------------- |
| ancient, grim, ash, iron  | blood           |
| molten                    | slag            |
| frost                     | ice             |
| verdant                   | sap             |
| sunken                    | water           |
| fungal                    | spore           |
| obsidian                  | obsidian shards |
| backrooms and unknown IDs | dust            |

The mapping is centralized in `getAnnihilationBurstProfile`, so a new biome can add a profile without changing the enemy kill path.

## Presentation and audio

The play HUD shows the remaining field time, urgent state, pickup feedback, event flash, and camera trauma when a pulse removes enemies. The minimap marks the uncollected relic with a pink ring and core.

The pickup reuses the local ward pickup take. Pulse rings reuse `portal-open.opus` as a wide spatial swell. These mappings keep the feature inside the reviewed local dungeon audio library until a dedicated pulse take is approved.

## Verification

Focused checks:

```text
bun test tests/annihilation-pulse.test.ts tests/enemy-sim.test.ts tests/run-session.test.ts tests/model-lab.test.ts tests/play-hud.test.ts
bun run typecheck
```

The model lab route remains the visual check for the pickup silhouette. The game route should cover chest reveal, auto-collection, active field, at least one pulse with a live enemy, a biome particle profile, and resume with an active timer.
