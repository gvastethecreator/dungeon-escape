import type { DungeonMoodId } from "../systems/DungeonMood";

export const BIOME_SPRITE_DECOR_SLOT_COUNTS = Object.freeze({
  wall: 10,
  floor: 10,
  ceiling: 8,
});

export const BIOME_SPRITE_DECOR_SLOT_COUNT = 28;
export const BIOME_SPRITE_DECOR_ATLAS_COLUMNS = 7;
export const BIOME_SPRITE_DECOR_ATLAS_ROWS = 4;
export const BIOME_SPRITE_DECOR_CELL_SIZE = 256;
export const BIOME_SPRITE_DECOR_ATLAS_SIZE = [1792, 1024] as const;

export type BiomeSpriteDecorSurface = "wall" | "floor" | "ceiling";
export type BiomeSpriteDecorPlacement =
  | "wall-mounted"
  | "floor-standing"
  | "corner-standing"
  | "ceiling-hanging";
export type BiomeSpriteDecorOrientation = "camera-facing-yaw";
export type BiomeSpriteDecorView = "orthographic-front";

export interface BiomeSpriteDecorAnchor {
  readonly x: number;
  readonly y: number;
  readonly edge: "center" | "bottom" | "top";
}

export interface BiomeSpriteDecorDefinition {
  readonly slot: number;
  readonly id: string;
  readonly label: string;
  readonly surface: BiomeSpriteDecorSurface;
  readonly placement: BiomeSpriteDecorPlacement;
  readonly orientation: BiomeSpriteDecorOrientation;
  readonly view: BiomeSpriteDecorView;
  readonly anchor: BiomeSpriteDecorAnchor;
  readonly worldSize: Readonly<{ width: number; height: number }>;
  readonly scaleClass: "small" | "medium" | "large";
  readonly mount: Readonly<{
    planeOffset: number;
    heightRange?: readonly [number, number];
    minBottomClearance?: number;
  }>;
  /** Maximum camera-facing yaw turn for a prop constrained to a wall corner. */
  readonly maxYawTurn?: number;
  /** Authored taxonomy retained for map variety and runtime diagnostics. */
  readonly function?: string;
  readonly category?: string;
  readonly rarity?: "common" | "secondary" | "rare";
  readonly source?: Readonly<{
    sheet: string;
    quadrant: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  }>;
}

export interface BiomeSpriteDecorCatalog {
  readonly version: 1;
  readonly biome: DungeonMoodId;
  readonly atlas: Readonly<{
    columns: number;
    rows: number;
    cellSize: number;
  }>;
  readonly runtime: Readonly<{
    referenceWallHeight: number;
    culling: Readonly<{
      frustum: true;
      maxDistance: Readonly<Record<BiomeSpriteDecorSurface, number>>;
      hysteresis: number;
      spatialChunkTiles: number;
    }>;
    occlusion: Readonly<{
      mode: "depth-tested";
      depthTest: true;
      depthWrite: false;
      alphaTest: number;
    }>;
  }>;
  readonly props: readonly BiomeSpriteDecorDefinition[];
}

export interface BiomeSpriteDecorAtlasFrame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function biomeSpriteDecorAtlasFrame(slot: number): BiomeSpriteDecorAtlasFrame {
  const safeSlot = Math.min(BIOME_SPRITE_DECOR_SLOT_COUNT - 1, Math.max(0, Math.trunc(slot)));
  return {
    x: (safeSlot % BIOME_SPRITE_DECOR_ATLAS_COLUMNS) * BIOME_SPRITE_DECOR_CELL_SIZE,
    y: Math.floor(safeSlot / BIOME_SPRITE_DECOR_ATLAS_COLUMNS) * BIOME_SPRITE_DECOR_CELL_SIZE,
    w: BIOME_SPRITE_DECOR_CELL_SIZE,
    h: BIOME_SPRITE_DECOR_CELL_SIZE,
  };
}

function expectedPlacement(definition: BiomeSpriteDecorDefinition): boolean {
  if (definition.surface === "wall") {
    return definition.placement === "wall-mounted";
  }
  if (definition.surface === "ceiling") {
    return definition.placement === "ceiling-hanging";
  }
  return definition.placement === "floor-standing" || definition.placement === "corner-standing";
}

export function validateBiomeSpriteDecorCatalog(
  catalog: BiomeSpriteDecorCatalog,
): readonly string[] {
  const errors: string[] = [];
  if (catalog.props.length !== BIOME_SPRITE_DECOR_SLOT_COUNT) {
    errors.push(`props must contain ${BIOME_SPRITE_DECOR_SLOT_COUNT} slots`);
  }
  if (
    catalog.atlas.columns !== BIOME_SPRITE_DECOR_ATLAS_COLUMNS ||
    catalog.atlas.rows !== BIOME_SPRITE_DECOR_ATLAS_ROWS ||
    catalog.atlas.cellSize !== BIOME_SPRITE_DECOR_CELL_SIZE
  ) {
    errors.push("atlas must use 7 columns, 4 rows, and 256px cells");
  }
  if (
    !catalog.runtime.culling.frustum ||
    catalog.runtime.culling.hysteresis < 0 ||
    catalog.runtime.culling.spatialChunkTiles < 1
  ) {
    errors.push("culling must use the frustum and positive spatial chunks");
  }
  if (
    catalog.runtime.occlusion.mode !== "depth-tested" ||
    !catalog.runtime.occlusion.depthTest ||
    catalog.runtime.occlusion.depthWrite ||
    catalog.runtime.occlusion.alphaTest <= 0 ||
    catalog.runtime.occlusion.alphaTest >= 1
  ) {
    errors.push("occlusion must use depth testing, bounded alpha test, and no depth writes");
  }

  const ids = new Set<string>();
  const slots = new Set<number>();
  const counts: Record<BiomeSpriteDecorSurface, number> = { wall: 0, floor: 0, ceiling: 0 };
  for (const definition of catalog.props) {
    ids.add(definition.id);
    slots.add(definition.slot);
    counts[definition.surface] += 1;
    if (!expectedPlacement(definition)) {
      errors.push(`${definition.id} has an incompatible surface, placement, or orientation`);
    }
    if (
      definition.orientation !== "camera-facing-yaw" ||
      definition.view !== "orthographic-front"
    ) {
      errors.push(`${definition.id} must use an orthographic front-facing FPS sprite`);
    }
    if (
      definition.anchor.x < 0 ||
      definition.anchor.x > 1 ||
      definition.anchor.y < 0 ||
      definition.anchor.y > 1
    ) {
      errors.push(`${definition.id} has an anchor outside the normalized cell`);
    }
    if (definition.worldSize.width <= 0 || definition.worldSize.height <= 0) {
      errors.push(`${definition.id} has a non-positive world size`);
    }
    if (
      definition.maxYawTurn !== undefined &&
      (definition.maxYawTurn <= 0 || definition.maxYawTurn > Math.PI)
    ) {
      errors.push(`${definition.id} has an invalid corner yaw limit`);
    }
    if (definition.surface === "wall" && !definition.mount.heightRange) {
      errors.push(`${definition.id} needs a wall height range`);
    }
    if (definition.surface === "ceiling") {
      const clearance = definition.mount.minBottomClearance ?? -1;
      const availableHeight = catalog.runtime.referenceWallHeight - definition.mount.planeOffset;
      if (clearance <= 0 || definition.worldSize.height > availableHeight - clearance) {
        errors.push(`${definition.id} exceeds the ceiling clearance`);
      }
    }
  }

  if (ids.size !== catalog.props.length) errors.push("prop ids must be unique");
  if (slots.size !== BIOME_SPRITE_DECOR_SLOT_COUNT) errors.push("slots must be unique");
  for (let slot = 0; slot < BIOME_SPRITE_DECOR_SLOT_COUNT; slot += 1) {
    if (!slots.has(slot)) errors.push(`slot ${slot} is missing`);
  }
  for (const surface of ["wall", "floor", "ceiling"] as const) {
    if (counts[surface] !== BIOME_SPRITE_DECOR_SLOT_COUNTS[surface]) {
      errors.push(`${surface} must contain ${BIOME_SPRITE_DECOR_SLOT_COUNTS[surface]} props`);
    }
    if (catalog.runtime.culling.maxDistance[surface] <= 0) {
      errors.push(`${surface} needs a positive culling distance`);
    }
  }
  return errors;
}
