import { describe, expect, test } from "bun:test";

import { listDungeonMoodIds } from "../src/systems/DungeonMood";
import {
  BIOME_FLOOR_PROP_FADE_FAR,
  BIOME_FLOOR_PROP_FADE_NEAR,
  BIOME_CORNER_PROP_MAX_TURN,
  BIOME_SPRITE_PROPS,
  clampBiomeSpriteYaw,
  biomeSpriteFloorDistanceFade,
  biomeSpritePropFrame,
  biomeSpriteFloorGroundGap,
  biomeSpritePropTextureUrl,
} from "../src/world/BiomeSpriteDecorKit";
import {
  BIOME_SPRITE_DECOR_ATLAS_SIZE,
  biomeSpriteDecorAtlasFrame,
  validateBiomeSpriteDecorCatalog,
} from "../src/world/BiomeSpriteDecorContract";
import {
  biomeSpriteDecorCatalog,
  biomeSpriteDecorTextureUrl,
} from "../src/world/BiomeSpriteDecorCatalogs.generated";
import {
  balancedBiomeDecorItem,
  selectFairBiomeDecorPlacements,
} from "../src/world/BiomeSpriteDecorDistribution";
import { BIOME_FLOOR_PROP_PLACEMENT_AUDIT } from "../src/world/BiomeSpriteDecorPlacementAudit";
import { BIOME_SURFACE_PALETTES } from "../src/world/BiomeSurfacePalettes.generated";

const staticSceneSource = await Bun.file(
  new URL("../src/world/StaticDungeonScene.ts", import.meta.url),
).text();
const worldSource = await Bun.file(new URL("../src/world/DungeonWorld.ts", import.meta.url)).text();
const residentEnemySource = await Bun.file(
  new URL("../src/world/ResidentEnemyRuntime.ts", import.meta.url),
).text();
const fixedEffectsSource = await Bun.file(
  new URL("../src/world/FixedSceneEffects.ts", import.meta.url),
).text();

describe("biome sprite decor atlas", () => {
  test("keeps the legacy six-frame catalog as compatibility data", () => {
    for (const mood of listDungeonMoodIds()) {
      const props = BIOME_SPRITE_PROPS[mood];
      expect(props).toHaveLength(6);
      expect(new Set(props.map((prop) => prop.id)).size).toBe(6);
      expect(props.map((prop) => prop.frame)).toEqual([0, 1, 2, 3, 4, 5]);
      expect(props.slice(0, 3).every((prop) => prop.surface === "wall")).toBe(true);
      expect(props.slice(3).every((prop) => prop.surface === "floor")).toBe(true);
      expect(props.slice(0, 3).every((prop) => prop.placement === "wall-decal")).toBe(true);
      expect(
        props
          .slice(3)
          .every((prop) =>
            ["floor-decal", "floor-standing", "corner-standing"].includes(prop.placement),
          ),
      ).toBe(true);
      expect(biomeSpritePropTextureUrl(mood)).toBe(
        `/assets/sprites/biome-props/${mood}-props.webp`,
      );
    }
  });

  test("ships the active 28-slot wall, floor, corner, and ceiling catalog", () => {
    expect(BIOME_SPRITE_DECOR_ATLAS_SIZE).toEqual([1792, 1024]);
    expect(biomeSpriteDecorAtlasFrame(27)).toEqual({ x: 1536, y: 768, w: 256, h: 256 });
    for (const mood of listDungeonMoodIds()) {
      const catalog = biomeSpriteDecorCatalog(mood);
      expect(catalog.props).toHaveLength(28);
      expect(catalog.props.filter((prop) => prop.surface === "wall")).toHaveLength(10);
      expect(catalog.props.filter((prop) => prop.surface === "floor")).toHaveLength(10);
      expect(catalog.props.filter((prop) => prop.surface === "ceiling")).toHaveLength(8);
      expect(
        catalog.props
          .filter((prop) => prop.surface === "floor")
          .every((prop) => prop.placement === "corner-standing"),
      ).toBe(true);
      expect(BIOME_FLOOR_PROP_PLACEMENT_AUDIT[mood]).toHaveLength(10);
      expect(new Set(catalog.props.map((prop) => prop.id)).size).toBe(28);
      expect(validateBiomeSpriteDecorCatalog(catalog)).toEqual([]);
      expect(biomeSpriteDecorTextureUrl(mood)).toBe(
        `/assets/sprites/biome-props-v2/${mood}-props.webp`,
      );
    }
    expect(
      biomeSpriteDecorCatalog("ancient").props.every(
        (prop) => prop.surface !== "floor" || prop.placement === "corner-standing",
      ),
    ).toBe(true);
    expect(staticSceneSource).toContain("wall: 5, floor: 3, ceiling: 4");
    expect(staticSceneSource).toContain("balancedBiomeDecorItem(floorDefinitions");
    expect(staticSceneSource).toContain("integrateBiomeDecorShader");
    expect(staticSceneSource).toContain("biomeDecorSurfaceTone");
    expect(staticSceneSource).toContain("biomeDecorRelativeLuma");
    expect(staticSceneSource).toContain("diffuseColor.rgb, 0.28");
  });

  test("distributes candidates and atlas slots deterministically without early repeats", () => {
    const slots = Array.from({ length: 10 }, (_, slot) => slot);
    const sequence = Array.from({ length: 27 }, (_, index) =>
      balancedBiomeDecorItem(slots, index, 417),
    );
    expect(new Set(sequence.slice(0, 10)).size).toBe(10);
    const usage = slots.map((slot) => sequence.filter((candidate) => candidate === slot).length);
    expect(Math.max(...usage) - Math.min(...usage)).toBe(1);
    const candidates = [
      { roomId: 1, id: "1a" },
      { roomId: 1, id: "1b" },
      { roomId: 2, id: "2a" },
      { roomId: 2, id: "2b" },
      { roomId: 3, id: "3a" },
      { roomId: 3, id: "3b" },
    ];
    const selected = selectFairBiomeDecorPlacements(candidates, 4, 99);
    expect(new Set(selected.slice(0, 3).map(({ roomId }) => roomId))).toEqual(new Set([1, 2, 3]));
    expect(selectFairBiomeDecorPlacements(candidates, 4, 99)).toEqual(selected);
  });

  test("maps six crops to the optimized 3x2 256px atlas without overlap", () => {
    const frames = [0, 1, 2, 3, 4, 5].map(biomeSpritePropFrame);
    expect(frames).toEqual([
      { x: 0, y: 0, w: 256, h: 256 },
      { x: 256, y: 0, w: 256, h: 256 },
      { x: 512, y: 0, w: 256, h: 256 },
      { x: 0, y: 256, w: 256, h: 256 },
      { x: 256, y: 256, w: 256, h: 256 },
      { x: 512, y: 256, w: 256, h: 256 },
    ]);
  });

  test("uses a scenery altar in Frost instead of a chest prop", () => {
    expect(BIOME_SPRITE_PROPS.frost[4]).toMatchObject({
      id: "frozen-altar",
      label: "Frozen floor altar",
      surface: "floor",
      frame: 4,
      placement: "floor-decal",
    });
    expect(JSON.stringify(BIOME_SPRITE_PROPS.frost)).not.toContain("chest");
  });

  test("renders active v2 props at authored opacity and with bounded culling", () => {
    expect(staticSceneSource).toContain('"biome-prop-v2-wall-integrated-v6"');
    expect(staticSceneSource).toContain("biome-prop-v2-${placement}-integrated-v6");
    expect(staticSceneSource).toContain("opacity: 1");
    expect(staticSceneSource).toContain("emissiveIntensity: 0.045");
    expect(staticSceneSource).toContain(
      'material.userData.mapBlend = "authored-v2-biome-surface-tone-v6"',
    );
    expect(staticSceneSource).toContain("color: biomeDecorTint(mood, paletteRole)");
    expect(staticSceneSource).toContain("biomeSurfacePalette(mood.id, paletteRole)");
    expect(staticSceneSource).toContain("batch.frustumCulled = catalog.runtime.culling.frustum");
    expect(staticSceneSource).toContain(
      "sprite.name = `${this.activeMood.label} ${definition.label} ceiling hanging`",
    );
    expect(staticSceneSource).toContain("sprite.frustumCulled = catalog.runtime.culling.frustum");
    expect(staticSceneSource).toContain("material.userData.biomeSpriteBillboard =");
    expect(fixedEffectsSource).toContain(
      "const maxDistance = prop.maxDistance ?? BIOME_FLOOR_PROP_FADE_FAR",
    );
    expect(fixedEffectsSource).toContain("private updateCeilingSprites(");
    expect(staticSceneSource).toContain("fog: true");
    expect(staticSceneSource).toContain("1.0 - smoothstep(0.24, 0.62, fogFactor)");
    expect(staticSceneSource).not.toContain("float biomePropFogPull = 1.0 - fogFactor");
  });

  test("derives floor, wall, and ceiling palettes from every shipped biome texture", () => {
    for (const mood of listDungeonMoodIds()) {
      const palette = BIOME_SURFACE_PALETTES[mood];
      for (const surface of ["floor", "wall", "ceiling"] as const) {
        expect(palette[surface].shadow).toBeGreaterThan(0);
        expect(palette[surface].base).toBeGreaterThan(0);
        expect(palette[surface].highlight).toBeGreaterThan(0);
        expect(palette[surface].propTint).toBeGreaterThan(0);
      }
      expect(
        new Set([palette.floor.base, palette.wall.base, palette.ceiling.base]).size,
      ).toBeGreaterThan(1);
    }
  });

  test("anchors wall props as fixed decals instead of camera sprites", () => {
    expect(staticSceneSource).toContain("applyBiomeDecorAtlasUv(geometry, definition.slot)");
    expect(staticSceneSource).toContain("wallBatches");
    expect(staticSceneSource).toContain("facingRotation(seat.intoDx, seat.intoDy)");
    expect(staticSceneSource).toContain("BIOME_WALL_DECAL_OFFSET");
    expect(staticSceneSource).toContain("polygonOffset: true");
    expect(staticSceneSource).toContain("placement: definition.placement");
    expect(staticSceneSource).toContain('surface: "wall"');
  });

  test("keeps legacy floor measurements and anchors active ceiling instances", () => {
    for (const mood of listDungeonMoodIds()) {
      for (const frame of [3, 4, 5]) {
        const definition = BIOME_SPRITE_PROPS[mood][frame]!;
        if (definition.placement === "floor-decal") {
          expect(biomeSpriteFloorGroundGap(mood, frame)).toBeGreaterThan(0);
          continue;
        }
        expect(biomeSpriteFloorGroundGap(mood, frame)).toBeGreaterThan(0);
        expect(biomeSpriteFloorGroundGap(mood, frame)).toBeLessThan(0.25);
      }
    }
    expect(staticSceneSource).toContain("(definition.anchor.y - 0.5) * height");
    expect(fixedEffectsSource).toContain("const targetYaw = Math.atan2(deltaX, deltaZ)");
    expect(staticSceneSource).toContain("definition.mount.planeOffset");
    expect(staticSceneSource).toContain("this.wallHeight - definition.mount.planeOffset");
  });

  test("keeps legacy corner math while excluding floor cards from the active scene", () => {
    expect(BIOME_CORNER_PROP_MAX_TURN).toBeLessThan(Math.PI / 6);
    expect(clampBiomeSpriteYaw(0, Math.PI)).toBeCloseTo(BIOME_CORNER_PROP_MAX_TURN);
    expect(clampBiomeSpriteYaw(0, -Math.PI)).toBeCloseTo(-BIOME_CORNER_PROP_MAX_TURN);
    expect(staticSceneSource).toContain("collectRoomCornerSeats");
    expect(staticSceneSource).toContain("cornerHugWorldOffset");
    expect(fixedEffectsSource).toContain(
      "clampBiomeSpriteYaw(prop.baseYaw, targetYaw, prop.maxWallTurn)",
    );
    expect(staticSceneSource).toContain("definition.maxYawTurn ?? BIOME_CORNER_PROP_MAX_TURN");
    expect(staticSceneSource).toContain("registerFloorBiomeSprite({");
  });

  test("fades floor cards smoothly in the near-player band", () => {
    expect(biomeSpriteFloorDistanceFade(BIOME_FLOOR_PROP_FADE_NEAR)).toBe(0);
    expect(biomeSpriteFloorDistanceFade(BIOME_FLOOR_PROP_FADE_FAR)).toBe(1);
    expect(biomeSpriteFloorDistanceFade(1.625)).toBeCloseTo(0.5, 5);
    expect(fixedEffectsSource).toContain("prop.material.opacity = prop.baseOpacity * fade");
    expect(worldSource).toContain("runtime.fixedSceneEffects.update({");
  });

  test("reserves wall seats across artwork and generated wall props", () => {
    expect(staticSceneSource).toContain("function pickSeparatedWallSeats");
    expect(staticSceneSource).toContain("this.reserveWallObjectCell");
    expect(staticSceneSource).toContain("seat.cell.x - seat.intoDx === wall.cell.x");
    expect(staticSceneSource).toContain(
      'customProgramCacheKey = () => "environment-sprite-muted-fog-v4"',
    );
  });

  test("keeps the retired wall atlas out while restoring batched 3D atmosphere props", () => {
    const atmosphereBody = staticSceneSource.slice(
      staticSceneSource.indexOf("private addAtmosphereProps("),
      staticSceneSource.indexOf("private getAtmosphereTemplate("),
    );
    expect(atmosphereBody).toContain("this.scatterCobwebs(dungeon, random)");
    expect(atmosphereBody).not.toContain("this.scatterWallDecor(");
    expect(atmosphereBody).toContain("this.scatterRoomAtmosphereProps(dungeon, random)");
    expect(staticSceneSource).toContain("collectDecorCorridorCells(dungeon)");
    expect(staticSceneSource).toContain('surface: "floor" | "ceiling" = "floor"');
  });

  test("shares object reservations across props, chests and enemy seats", () => {
    expect(staticSceneSource).toContain("private handles = createHandles();");
    expect(staticSceneSource).toContain(
      "isObjectOccupiedCell(cell: GridCell, floorIndex?: number): boolean",
    );
    expect(staticSceneSource).toContain("this.reserveObjectCell(cell)");
    expect(staticSceneSource).toContain(
      "FloorOccupancyBit.Object | FloorOccupancyBit.Solid | FloorOccupancyBit.WallDecoration",
    );
    expect(worldSource).toContain("ResidentEnemyRuntime");
    expect(residentEnemySource).toContain(
      "explicitExclusions.mark(dungeon.spawn.x, dungeon.spawn.y, FloorOccupancyBit.Object)",
    );
    expect(staticSceneSource).toContain("const pickupExcluded: CellOccupancyQuery");
    expect(staticSceneSource).toContain("FloorOccupancyBit.Hazard");
    expect(staticSceneSource).toContain("expired.objectOccupiedCells.clear()");
    expect(staticSceneSource).toContain("!this.isObjectOccupiedCell(cell)");
  });

  test("ships every processed atlas and a complete alpha manifest", async () => {
    const root = new URL("../assets-source/runtime-metadata/sprites/biome-props/", import.meta.url);
    const manifest = (await Bun.file(new URL("manifest.json", root)).json()) as {
      sheets: Array<{
        biome: string;
        size: [number, number];
        grid: { columns: number; rows: number; cell: number; border: number };
        model: string;
        frames: Array<{ bbox: number[]; edge_nonzero: number }>;
      }>;
    };
    expect(manifest.sheets).toHaveLength(listDungeonMoodIds().length);
    expect(manifest.sheets.map((sheet) => sheet.biome)).toEqual([...listDungeonMoodIds()]);
    for (const sheet of manifest.sheets) {
      const file = Bun.file(
        new URL(`../public/assets/sprites/biome-props/${sheet.biome}-props.webp`, import.meta.url),
      );
      expect(await file.exists()).toBe(true);
      expect(file.size).toBeGreaterThan(4_000);
      expect(sheet.size).toEqual([1536, 1024]);
      expect(sheet.grid).toEqual({ columns: 3, rows: 2, cell: 512, border: 4 });
      expect(sheet.model).toBe("ZhengPeng7/BiRefNet");
      expect(sheet.frames).toHaveLength(6);
      expect(sheet.frames.every((frame) => frame.bbox.length === 4)).toBe(true);
      expect(sheet.frames.every((frame) => frame.edge_nonzero === 0)).toBe(true);
    }
  });

  test("ships every active v2 runtime atlas with 28 authored frame records", async () => {
    const root = new URL(
      "../assets-source/runtime-metadata/sprites/biome-props-v2/",
      import.meta.url,
    );
    const manifest = (await Bun.file(new URL("manifest.json", root)).json()) as {
      atlas: { runtime_size: [number, number] };
      biomes: Array<{ biome: string; runtime_size: [number, number]; frames: unknown[] }>;
    };
    expect(manifest.atlas.runtime_size).toEqual([1792, 1024]);
    expect(manifest.biomes.map(({ biome }) => biome)).toEqual([...listDungeonMoodIds()]);
    for (const biome of manifest.biomes) {
      expect(biome.runtime_size).toEqual([1792, 1024]);
      expect(biome.frames).toHaveLength(28);
      const file = Bun.file(
        new URL(
          `../public/assets/sprites/biome-props-v2/${biome.biome}-props.webp`,
          import.meta.url,
        ),
      );
      expect(await file.exists()).toBe(true);
      expect(file.size).toBeGreaterThan(10_000);
    }
  });
});
