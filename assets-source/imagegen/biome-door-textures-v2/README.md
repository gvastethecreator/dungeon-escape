# Biome door textures v2

ImageGen supplied one square front albedo for each biome. Every image shows one closed double door, with the leaf split on the exact image center. The runtime maps the left leaf to U `0..0.5` and the right leaf to U `0.5..1`.

The shared prompt contract asked for:

- full-bleed albedo only;
- orthographic front view;
- two equal solid leaves;
- a clean vertical split at 50%;
- low-poly, hand-painted dungeon detail;
- no frame, handles, text, perspective, lighting, cast shadows, glow, or empty border.

Biome direction:

| Biome     | Surface direction                             |
| --------- | --------------------------------------------- |
| ancient   | aged oak, worn rune bands, dull iron          |
| molten    | charred timber, basalt bands, ember-red inlay |
| frost     | pale ice-touched timber, cold blue metal      |
| grim      | dark weathered timber, gray iron              |
| verdant   | mossed olive timber, vine-carved bands        |
| ash       | ash-gray timber, worn copper marks            |
| iron      | charcoal iron plates and riveted bands        |
| obsidian  | dark violet-black plates and carved seams     |
| sunken    | teal water-worn timber and tarnished bronze   |
| fungal    | purple-stained timber and muted fungal marks  |
| backrooms | worn ochre painted steel panels               |

## Visual review

The 2026-07-28 contact-sheet review kept ancient, molten, frost, verdant, iron, and backrooms.
It replaced five weak sources:

| Biome    | Rejection                                    | Replacement cue                                  |
| -------- | -------------------------------------------- | ------------------------------------------------ |
| fungal   | read as purple timber with no clear fungus   | shelf mushrooms and branching mycelium           |
| ash      | read as plain gray timber                    | carbonized grain and pale ash in cracks          |
| obsidian | read as opaque purple stone                  | near-black volcanic glass with thin purple edges |
| sunken   | read as teal timber with weak water damage   | swollen wet wood, algae, and tarnished bronze    |
| grim     | dark values hid the plank and iron structure | dark oak with clear gray iron and worn edges     |

All eleven sources passed a visual check for a centered split, a full-bleed plate, and no cast
shadow or directional light. `imagegen-provenance.json` records the built-in ImageGen source IDs.
`manifest.json` records the stable source and output SHA-256 hashes after each bake.

Run `python scripts/build-biome-door-textures.py` to rebuild the 512 px albedo, normal, and roughness maps plus `manifest.json`.
