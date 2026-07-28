# Biome screen art v1

This source set contains the prompt contract for the 22 raster backgrounds used
by Dungeon Escape:

- one `main` background for each canonical biome;
- one `ending` background for each canonical biome;
- landscape framing with no baked UI copy, logos, borders, or watermark.

The existing `dungeon-cover-v1.webp` and `dungeon-victory-results-v1.webp`
define the visual anchor: dark pixel-art dungeon key art, hard readable
silhouettes, warm practical lights, and large areas of clean negative space for
the live HTML cards. The new set adds a more caricatured, heroic cover feel:
exaggerated silhouettes, strong action diagonals, richer biome accents, and a
clear chase. Every biome keeps its own material, light, landmark, ambient
signature, and real enemy roster from
`src/systems/DungeonMood.ts`, `src/world/BiomeDecorationProfile.ts`, and
`src/systems/BiomeParticleProfile.ts`.

## Layout contract

- Main: the small faceless, round-headed adventurer in a ragged black cloak
  must be clear and running away from a group of biome enemies; keep the hero,
  chase, and landmark weighted to the right, with the left third dark and
  low-detail for the menu card.
- Ending: the same adventurer must be visible reaching the biome exit while
  the enemies remain behind in shadow; keep the exit and hero weighted to the
  left, with the right third dark and low-detail for the result card.
- Keep the center readable at desktop and mobile crops. No text inside the
  image; the UI owns all labels and results.
- Use the same low-resolution pixel-art finish, dark value range, crisp
  silhouettes, and reusable hero model across all 22 files.
- Vary the enemy trio between the main and ending image of each biome. Every
  enemy must come from a cropped frame of that biome's final `enemies-v8`
  runtime atlas.

## Progress contract

The main screen starts at Ancient. After the player saves a campaign clear,
the image advances to the next canonical biome frontier. The final frontier
stays on Backrooms after the full campaign. The ending screen always uses the
ending asset for the active run biome.

## Generation record

The final images were generated with the built-in `imagegen` tool and then
copied into `public/assets/ui/biome-screens/`. The per-biome prompt data and
final paths live in `biome-screen-art-manifest.json` at the repo root of this
source set.

## Enemy assignments

Each entry names the cropped PNG used as an image reference. The crop comes
from the matching row in `public/assets/sprites/enemies-v8/biomes/`.

| Biome | Main chase | Ending chase |
| --- | --- | --- |
| Ancient | spider, husk, imp | ghost, bone-slime, carrion-stalker |
| Molten | imp, carrion-stalker, spider | goblin, zombie-orc, ghost |
| Frost | ghost, husk, carrion-stalker | ratling, bone-slime, white-eyed-shadow |
| Grim | ghost, husk, bone-slime | carrion, imp, white-eyed-shadow |
| Verdant | carrion-stalker, goblin, bone-slime | ghost, ratling, imp |
| Ash | husk, imp, spider | carrion, zombie-orc, white-eyed-shadow |
| Iron | zombie-orc, ratling, husk | goblin, carrion-stalker, ghost |
| Obsidian | white-eyed-shadow, ghost, spider | imp, bone-slime, carrion |
| Sunken | ghost, carrion-stalker, spider | ratling, zombie-orc, bone-slime |
| Fungal | bone-slime, ghost, spider | goblin, carrion, imp |
| Backrooms | white-eyed-shadow, ratling, spider | ghost, zombie-orc, carrion-stalker |
