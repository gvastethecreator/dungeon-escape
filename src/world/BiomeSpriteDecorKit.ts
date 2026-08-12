import type { DungeonMoodId } from "../systems/DungeonMood";

export type BiomeSpriteSurface = "wall" | "floor";
export type BiomeSpritePlacement =
  | "wall-decal"
  | "floor-decal"
  | "floor-standing"
  | "corner-standing";

export interface BiomeSpritePropDefinition {
  id: string;
  label: string;
  surface: BiomeSpriteSurface;
  frame: number;
  placement: BiomeSpritePlacement;
}

/**
 * Six authored props per biome. Placement is explicit because a low rubble
 * silhouette, a vertical floor prop, and a corner prop need different planes
 * and update rules even when they share one atlas.
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
    {
      id: "temple-relief",
      label: "Temple relief",
      surface: "wall",
      frame: 0,
      placement: "wall-decal",
    },
    {
      id: "sun-disk",
      label: "Bronze sun disk",
      surface: "wall",
      frame: 1,
      placement: "wall-decal",
    },
    {
      id: "stone-sconce",
      label: "Stone sconce",
      surface: "wall",
      frame: 2,
      placement: "wall-decal",
    },
    {
      id: "column-segment",
      label: "Broken column",
      surface: "floor",
      frame: 3,
      placement: "floor-standing",
    },
    {
      id: "rune-tablet",
      label: "Rune tablet",
      surface: "floor",
      frame: 4,
      placement: "corner-standing",
    },
    {
      id: "funerary-urns",
      label: "Funerary urns",
      surface: "floor",
      frame: 5,
      placement: "floor-standing",
    },
  ],
  molten: [
    { id: "lava-sigil", label: "Lava sigil", surface: "wall", frame: 0, placement: "wall-decal" },
    {
      id: "ember-brazier",
      label: "Ember brazier",
      surface: "wall",
      frame: 1,
      placement: "wall-decal",
    },
    {
      id: "volcanic-hook",
      label: "Volcanic wall hook",
      surface: "wall",
      frame: 2,
      placement: "wall-decal",
    },
    {
      id: "magma-rocks",
      label: "Cooling magma rocks",
      surface: "floor",
      frame: 3,
      placement: "floor-decal",
    },
    {
      id: "forge-anvil",
      label: "Scorched anvil",
      surface: "floor",
      frame: 4,
      placement: "corner-standing",
    },
    {
      id: "slag-bowl",
      label: "Copper slag bowl",
      surface: "floor",
      frame: 5,
      placement: "floor-standing",
    },
  ],
  frost: [
    {
      id: "ice-wall-cluster",
      label: "Frozen wall cluster",
      surface: "wall",
      frame: 0,
      placement: "wall-decal",
    },
    {
      id: "ice-rune-plaque",
      label: "Ice rune plaque",
      surface: "wall",
      frame: 1,
      placement: "wall-decal",
    },
    { id: "ice-antlers", label: "Ice antlers", surface: "wall", frame: 2, placement: "wall-decal" },
    {
      id: "ice-shards",
      label: "Ice shard pile",
      surface: "floor",
      frame: 3,
      placement: "floor-standing",
    },
    {
      id: "frozen-altar",
      label: "Frozen floor altar",
      surface: "floor",
      frame: 4,
      placement: "floor-decal",
    },
    {
      id: "snow-rune-stone",
      label: "Snow rune stone",
      surface: "floor",
      frame: 5,
      placement: "corner-standing",
    },
  ],
  grim: [
    {
      id: "iron-cage-plaque",
      label: "Iron cage plaque",
      surface: "wall",
      frame: 0,
      placement: "wall-decal",
    },
    {
      id: "funeral-banner",
      label: "Funeral banner",
      surface: "wall",
      frame: 1,
      placement: "wall-decal",
    },
    { id: "ritual-seal", label: "Ritual seal", surface: "wall", frame: 2, placement: "wall-decal" },
    {
      id: "bone-heap",
      label: "Bone heap",
      surface: "floor",
      frame: 3,
      placement: "floor-standing",
    },
    {
      id: "gravestone-fragment",
      label: "Gravestone fragment",
      surface: "floor",
      frame: 4,
      placement: "corner-standing",
    },
    {
      id: "chain-coil",
      label: "Rusted chain coil",
      surface: "floor",
      frame: 5,
      placement: "floor-decal",
    },
  ],
  verdant: [
    {
      id: "vine-trellis",
      label: "Vine trellis",
      surface: "wall",
      frame: 0,
      placement: "wall-decal",
    },
    { id: "druid-mask", label: "Druid mask", surface: "wall", frame: 1, placement: "wall-decal" },
    { id: "fern-basket", label: "Fern basket", surface: "wall", frame: 2, placement: "wall-decal" },
    {
      id: "root-cluster",
      label: "Root cluster",
      surface: "floor",
      frame: 3,
      placement: "corner-standing",
    },
    {
      id: "mossy-stone",
      label: "Mossy standing stone",
      surface: "floor",
      frame: 4,
      placement: "floor-standing",
    },
    {
      id: "seed-pods",
      label: "Seed pods",
      surface: "floor",
      frame: 5,
      placement: "floor-standing",
    },
  ],
  ash: [
    {
      id: "ash-portrait",
      label: "Ash portrait slab",
      surface: "wall",
      frame: 0,
      placement: "wall-decal",
    },
    {
      id: "soot-shield",
      label: "Soot-stained shield",
      surface: "wall",
      frame: 1,
      placement: "wall-decal",
    },
    {
      id: "iron-lantern",
      label: "Iron lantern",
      surface: "wall",
      frame: 2,
      placement: "wall-decal",
    },
    {
      id: "cinder-rubble",
      label: "Cinder rubble",
      surface: "floor",
      frame: 3,
      placement: "floor-decal",
    },
    {
      id: "charred-crate",
      label: "Charred crate",
      surface: "floor",
      frame: 4,
      placement: "corner-standing",
    },
    { id: "ash-urn", label: "Ash urn", surface: "floor", frame: 5, placement: "floor-standing" },
  ],
  iron: [
    {
      id: "pipe-junction",
      label: "Pipe junction",
      surface: "wall",
      frame: 0,
      placement: "wall-decal",
    },
    {
      id: "gear-plate",
      label: "Gear wall plate",
      surface: "wall",
      frame: 1,
      placement: "wall-decal",
    },
    { id: "chain-hook", label: "Chain hook", surface: "wall", frame: 2, placement: "wall-decal" },
    {
      id: "gear-scraps",
      label: "Gear scraps",
      surface: "floor",
      frame: 3,
      placement: "floor-decal",
    },
    {
      id: "iron-crate",
      label: "Iron storage crate",
      surface: "floor",
      frame: 4,
      placement: "corner-standing",
    },
    {
      id: "pressure-valve",
      label: "Pressure valve",
      surface: "floor",
      frame: 5,
      placement: "floor-standing",
    },
  ],
  obsidian: [
    {
      id: "violet-sigil",
      label: "Violet sigil",
      surface: "wall",
      frame: 0,
      placement: "wall-decal",
    },
    {
      id: "obsidian-shrine",
      label: "Obsidian shrine",
      surface: "wall",
      frame: 1,
      placement: "wall-decal",
    },
    {
      id: "black-arch",
      label: "Black arch fragment",
      surface: "wall",
      frame: 2,
      placement: "wall-decal",
    },
    {
      id: "purple-crystals",
      label: "Purple crystals",
      surface: "floor",
      frame: 3,
      placement: "floor-standing",
    },
    {
      id: "obsidian-rock",
      label: "Obsidian rock",
      surface: "floor",
      frame: 4,
      placement: "corner-standing",
    },
    {
      id: "ritual-prism",
      label: "Ritual prism",
      surface: "floor",
      frame: 5,
      placement: "floor-standing",
    },
  ],
  sunken: [
    {
      id: "anchor-plate",
      label: "Anchor plate",
      surface: "wall",
      frame: 0,
      placement: "wall-decal",
    },
    {
      id: "coral-relief",
      label: "Coral relief",
      surface: "wall",
      frame: 1,
      placement: "wall-decal",
    },
    {
      id: "waterlogged-chain",
      label: "Waterlogged chain",
      surface: "wall",
      frame: 2,
      placement: "wall-decal",
    },
    {
      id: "coral-rubble",
      label: "Coral rubble",
      surface: "floor",
      frame: 3,
      placement: "floor-decal",
    },
    {
      id: "barnacle-pot",
      label: "Barnacle pot",
      surface: "floor",
      frame: 4,
      placement: "floor-standing",
    },
    {
      id: "waterlogged-crate",
      label: "Waterlogged crate",
      surface: "floor",
      frame: 5,
      placement: "corner-standing",
    },
  ],
  fungal: [
    {
      id: "fungus-shelf",
      label: "Fungus shelf",
      surface: "wall",
      frame: 0,
      placement: "wall-decal",
    },
    {
      id: "mushroom-plaque",
      label: "Mushroom plaque",
      surface: "wall",
      frame: 1,
      placement: "wall-decal",
    },
    {
      id: "root-tendrils",
      label: "Root tendrils",
      surface: "wall",
      frame: 2,
      placement: "wall-decal",
    },
    {
      id: "mushroom-cluster",
      label: "Mushroom cluster",
      surface: "floor",
      frame: 3,
      placement: "floor-standing",
    },
    {
      id: "spore-pod",
      label: "Spore pod",
      surface: "floor",
      frame: 4,
      placement: "floor-standing",
    },
    {
      id: "mycelium-stone",
      label: "Mycelium stone",
      surface: "floor",
      frame: 5,
      placement: "corner-standing",
    },
  ],
  backrooms: [
    {
      id: "fluorescent-fixture",
      label: "Fluorescent fixture",
      surface: "wall",
      frame: 0,
      placement: "wall-decal",
    },
    {
      id: "service-panel",
      label: "Service panel",
      surface: "wall",
      frame: 1,
      placement: "wall-decal",
    },
    {
      id: "security-camera",
      label: "Security camera",
      surface: "wall",
      frame: 2,
      placement: "wall-decal",
    },
    {
      id: "carpet-debris",
      label: "Carpet debris",
      surface: "floor",
      frame: 3,
      placement: "floor-decal",
    },
    {
      id: "cable-bundle",
      label: "Cable bundle",
      surface: "floor",
      frame: 4,
      placement: "floor-decal",
    },
    {
      id: "office-phone",
      label: "Office phone",
      surface: "floor",
      frame: 5,
      placement: "corner-standing",
    },
  ],
};

export const BIOME_SPRITE_ATLAS_SIZE = [768, 512] as const;
export const BIOME_SPRITE_CELL_SIZE = 256;
export const BIOME_FLOOR_PROP_FADE_NEAR = 0.9;
export const BIOME_FLOOR_PROP_FADE_FAR = 2.35;
/** Keep a corner card inside the 90° open sector with a small masonry margin. */
export const BIOME_CORNER_PROP_MAX_TURN = Math.PI / 4 - 0.08;
/** Wall-edge floor cards stay grounded — enough turn to read, not full billboards. */
export const BIOME_EDGE_PROP_MAX_TURN = Math.PI / 8 - 0.02;
/** Corridor ceiling hangers may face along the hall, not into masonry. */
export const BIOME_CORRIDOR_HANGER_MAX_TURN = Math.PI / 6;

export function clampBiomeSpriteYaw(
  baseYaw: number,
  targetYaw: number,
  maxTurn = BIOME_CORNER_PROP_MAX_TURN,
): number {
  const safeTurn = Math.max(0, Math.min(Math.PI, maxTurn));
  const delta = Math.atan2(Math.sin(targetYaw - baseYaw), Math.cos(targetYaw - baseYaw));
  return baseYaw + Math.max(-safeTurn, Math.min(safeTurn, delta));
}

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
  return `/assets/sprites/biome-props/${mood}-props.webp`;
}
