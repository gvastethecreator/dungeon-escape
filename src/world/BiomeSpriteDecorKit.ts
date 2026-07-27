import type { DungeonMoodId } from "../systems/DungeonMood";

export type BiomeSpriteSurface = "wall" | "floor";

export interface BiomeSpritePropDefinition {
  id: string;
  label: string;
  surface: BiomeSpriteSurface;
  frame: number;
}

/**
 * Six authored billboard props per biome: three wall anchors and three floor
 * accents. The frame order matches the 3x2 BiRefNet atlas in public/assets.
 */
export const BIOME_SPRITE_PROPS: Record<
  DungeonMoodId,
  readonly [
    BiomeSpritePropDefinition,
    BiomeSpritePropDefinition,
    BiomeSpritePropDefinition,
    BiomeSpritePropDefinition,
    BiomeSpritePropDefinition,
    BiomeSpritePropDefinition,
  ]
> = {
  ancient: [
    { id: "temple-relief", label: "Temple relief", surface: "wall", frame: 0 },
    { id: "sun-disk", label: "Bronze sun disk", surface: "wall", frame: 1 },
    { id: "stone-sconce", label: "Stone sconce", surface: "wall", frame: 2 },
    { id: "column-segment", label: "Broken column", surface: "floor", frame: 3 },
    { id: "rune-tablet", label: "Rune tablet", surface: "floor", frame: 4 },
    { id: "funerary-urns", label: "Funerary urns", surface: "floor", frame: 5 },
  ],
  molten: [
    { id: "lava-sigil", label: "Lava sigil", surface: "wall", frame: 0 },
    { id: "ember-brazier", label: "Ember brazier", surface: "wall", frame: 1 },
    { id: "volcanic-hook", label: "Volcanic wall hook", surface: "wall", frame: 2 },
    { id: "magma-rocks", label: "Cooling magma rocks", surface: "floor", frame: 3 },
    { id: "forge-anvil", label: "Scorched anvil", surface: "floor", frame: 4 },
    { id: "slag-bowl", label: "Copper slag bowl", surface: "floor", frame: 5 },
  ],
  frost: [
    { id: "ice-wall-cluster", label: "Frozen wall cluster", surface: "wall", frame: 0 },
    { id: "ice-rune-plaque", label: "Ice rune plaque", surface: "wall", frame: 1 },
    { id: "ice-antlers", label: "Ice antlers", surface: "wall", frame: 2 },
    { id: "ice-shards", label: "Ice shard pile", surface: "floor", frame: 3 },
    { id: "frozen-altar", label: "Frozen floor altar", surface: "floor", frame: 4 },
    { id: "snow-rune-stone", label: "Snow rune stone", surface: "floor", frame: 5 },
  ],
  grim: [
    { id: "iron-cage-plaque", label: "Iron cage plaque", surface: "wall", frame: 0 },
    { id: "funeral-banner", label: "Funeral banner", surface: "wall", frame: 1 },
    { id: "ritual-seal", label: "Ritual seal", surface: "wall", frame: 2 },
    { id: "bone-heap", label: "Bone heap", surface: "floor", frame: 3 },
    { id: "gravestone-fragment", label: "Gravestone fragment", surface: "floor", frame: 4 },
    { id: "chain-coil", label: "Rusted chain coil", surface: "floor", frame: 5 },
  ],
  verdant: [
    { id: "vine-trellis", label: "Vine trellis", surface: "wall", frame: 0 },
    { id: "druid-mask", label: "Druid mask", surface: "wall", frame: 1 },
    { id: "fern-basket", label: "Fern basket", surface: "wall", frame: 2 },
    { id: "root-cluster", label: "Root cluster", surface: "floor", frame: 3 },
    { id: "mossy-stone", label: "Mossy standing stone", surface: "floor", frame: 4 },
    { id: "seed-pods", label: "Seed pods", surface: "floor", frame: 5 },
  ],
  ash: [
    { id: "ash-portrait", label: "Ash portrait slab", surface: "wall", frame: 0 },
    { id: "soot-shield", label: "Soot-stained shield", surface: "wall", frame: 1 },
    { id: "iron-lantern", label: "Iron lantern", surface: "wall", frame: 2 },
    { id: "cinder-rubble", label: "Cinder rubble", surface: "floor", frame: 3 },
    { id: "charred-crate", label: "Charred crate", surface: "floor", frame: 4 },
    { id: "ash-urn", label: "Ash urn", surface: "floor", frame: 5 },
  ],
  iron: [
    { id: "pipe-junction", label: "Pipe junction", surface: "wall", frame: 0 },
    { id: "gear-plate", label: "Gear wall plate", surface: "wall", frame: 1 },
    { id: "chain-hook", label: "Chain hook", surface: "wall", frame: 2 },
    { id: "gear-scraps", label: "Gear scraps", surface: "floor", frame: 3 },
    { id: "iron-crate", label: "Iron storage crate", surface: "floor", frame: 4 },
    { id: "pressure-valve", label: "Pressure valve", surface: "floor", frame: 5 },
  ],
  obsidian: [
    { id: "violet-sigil", label: "Violet sigil", surface: "wall", frame: 0 },
    { id: "obsidian-shrine", label: "Obsidian shrine", surface: "wall", frame: 1 },
    { id: "black-arch", label: "Black arch fragment", surface: "wall", frame: 2 },
    { id: "purple-crystals", label: "Purple crystals", surface: "floor", frame: 3 },
    { id: "obsidian-rock", label: "Obsidian rock", surface: "floor", frame: 4 },
    { id: "ritual-prism", label: "Ritual prism", surface: "floor", frame: 5 },
  ],
  sunken: [
    { id: "anchor-plate", label: "Anchor plate", surface: "wall", frame: 0 },
    { id: "coral-relief", label: "Coral relief", surface: "wall", frame: 1 },
    { id: "waterlogged-chain", label: "Waterlogged chain", surface: "wall", frame: 2 },
    { id: "coral-rubble", label: "Coral rubble", surface: "floor", frame: 3 },
    { id: "barnacle-pot", label: "Barnacle pot", surface: "floor", frame: 4 },
    { id: "waterlogged-crate", label: "Waterlogged crate", surface: "floor", frame: 5 },
  ],
  fungal: [
    { id: "fungus-shelf", label: "Fungus shelf", surface: "wall", frame: 0 },
    { id: "mushroom-plaque", label: "Mushroom plaque", surface: "wall", frame: 1 },
    { id: "root-tendrils", label: "Root tendrils", surface: "wall", frame: 2 },
    { id: "mushroom-cluster", label: "Mushroom cluster", surface: "floor", frame: 3 },
    { id: "spore-pod", label: "Spore pod", surface: "floor", frame: 4 },
    { id: "mycelium-stone", label: "Mycelium stone", surface: "floor", frame: 5 },
  ],
  backrooms: [
    { id: "fluorescent-fixture", label: "Fluorescent fixture", surface: "wall", frame: 0 },
    { id: "service-panel", label: "Service panel", surface: "wall", frame: 1 },
    { id: "security-camera", label: "Security camera", surface: "wall", frame: 2 },
    { id: "carpet-debris", label: "Carpet debris", surface: "floor", frame: 3 },
    { id: "cable-bundle", label: "Cable bundle", surface: "floor", frame: 4 },
    { id: "office-phone", label: "Office phone", surface: "floor", frame: 5 },
  ],
};

export const BIOME_SPRITE_ATLAS_SIZE = [1536, 1024] as const;
export const BIOME_SPRITE_CELL_SIZE = 512;
export const BIOME_FLOOR_PROP_FADE_NEAR = 0.9;
export const BIOME_FLOOR_PROP_FADE_FAR = 2.35;

/** Transparent margin below each floor frame, measured from manifest bboxes. */
const BIOME_SPRITE_FLOOR_GAPS: Record<DungeonMoodId, readonly [number, number, number]> = {
  ancient: [67 / 512, 64 / 512, 63 / 512],
  molten: [95 / 512, 88 / 512, 84 / 512],
  frost: [107 / 512, 106 / 512, 105 / 512],
  grim: [67 / 512, 69 / 512, 62 / 512],
  verdant: [75 / 512, 64 / 512, 62 / 512],
  ash: [88 / 512, 81 / 512, 64 / 512],
  iron: [76 / 512, 70 / 512, 65 / 512],
  obsidian: [50 / 512, 55 / 512, 41 / 512],
  sunken: [86 / 512, 65 / 512, 57 / 512],
  fungal: [66 / 512, 66 / 512, 63 / 512],
  backrooms: [118 / 512, 113 / 512, 103 / 512],
};

export function biomeSpritePropFrame(index: number): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  const frame = Math.abs(Math.trunc(index)) % 6;
  return {
    x: (frame % 3) * BIOME_SPRITE_CELL_SIZE,
    y: Math.floor(frame / 3) * BIOME_SPRITE_CELL_SIZE,
    w: BIOME_SPRITE_CELL_SIZE,
    h: BIOME_SPRITE_CELL_SIZE,
  };
}

export function biomeSpriteFloorGroundGap(mood: DungeonMoodId, frame: number): number {
  if (frame < 3) return 0;
  return BIOME_SPRITE_FLOOR_GAPS[mood][Math.min(2, Math.max(0, Math.trunc(frame) - 3))]!;
}

/** Smoothly hides floor cards while the player enters their readable space. */
export function biomeSpriteFloorDistanceFade(distance: number): number {
  const progress = Math.max(
    0,
    Math.min(
      1,
      (distance - BIOME_FLOOR_PROP_FADE_NEAR) /
        (BIOME_FLOOR_PROP_FADE_FAR - BIOME_FLOOR_PROP_FADE_NEAR),
    ),
  );
  return progress * progress * (3 - 2 * progress);
}

export function biomeSpritePropTextureUrl(mood: DungeonMoodId): string {
  return `/assets/sprites/biome-props/${mood}-props.png`;
}
