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

const staticSceneSource = await Bun.file(
  new URL("../src/world/StaticDungeonScene.ts", import.meta.url),
).text();
const worldSource = await Bun.file(new URL("../src/world/DungeonWorld.ts", import.meta.url)).text();

describe("biome sprite decor atlas", () => {
  test("ships six distinct wall and floor props for every biome", () => {
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

  test("keeps generated props muted and outside distance/frustum culling", () => {
    expect(staticSceneSource).toContain('"biome-prop-wall-decal-muted-v3"');
    expect(staticSceneSource).toContain("biome-prop-floor-${placement}-muted-v3");
    expect(staticSceneSource).toContain("diffuseColor.rgb = mix(vec3(biomePropLuma)");
    expect(staticSceneSource).toContain("opacity: 0.76");
    expect(staticSceneSource).toContain('mapBlend = isFloorDecal ? "floor-contact-alpha"');
    expect(staticSceneSource).toContain("sprite.frustumCulled = false");
    expect(staticSceneSource).toContain('distanceLod: "disabled"');
  });

  test("anchors wall props as fixed decals instead of camera sprites", () => {
    expect(staticSceneSource).toContain("new THREE.PlaneGeometry(1, 1)");
    expect(staticSceneSource).toContain("wallBatches");
    expect(staticSceneSource).toContain("facingRotation(seat.intoDx, seat.intoDy)");
    expect(staticSceneSource).toContain("BIOME_WALL_DECAL_OFFSET");
    expect(staticSceneSource).toContain("polygonOffset: true");
    expect(staticSceneSource).toContain('billboard: "wall-normal"');
    expect(staticSceneSource).toContain('"yaw-to-player"');
  });

  test("anchors floor cards from the measured transparent bottom margin", () => {
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
    expect(staticSceneSource).toContain("0.02 - groundGap * scale");
    expect(worldSource).toContain("const targetYaw = Math.atan2(deltaX, deltaZ)");
    expect(staticSceneSource).toContain("sprite.position.set(p.x, 0.045, p.z)");
    expect(staticSceneSource).toContain("sprite.rotation.x = -Math.PI / 2");
  });

  test("keeps corner cards inside the open wall sector", () => {
    expect(clampBiomeSpriteYaw(0, Math.PI)).toBeCloseTo(BIOME_CORNER_PROP_MAX_TURN);
    expect(clampBiomeSpriteYaw(0, -Math.PI)).toBeCloseTo(-BIOME_CORNER_PROP_MAX_TURN);
    expect(staticSceneSource).toContain("collectRoomCornerSeats");
    expect(staticSceneSource).toContain("cornerHugWorldOffset");
    expect(worldSource).toContain("clampBiomeSpriteYaw(prop.baseYaw, targetYaw)");
    expect(staticSceneSource).toContain('"yaw-to-player-constrained"');
    expect(staticSceneSource).toContain("maxWallTurn: BIOME_CORNER_PROP_MAX_TURN");
  });

  test("fades floor cards smoothly in the near-player band", () => {
    expect(biomeSpriteFloorDistanceFade(BIOME_FLOOR_PROP_FADE_NEAR)).toBe(0);
    expect(biomeSpriteFloorDistanceFade(BIOME_FLOOR_PROP_FADE_FAR)).toBe(1);
    expect(biomeSpriteFloorDistanceFade(1.625)).toBeCloseTo(0.5, 5);
    expect(worldSource).toContain("prop.material.opacity = prop.baseOpacity * fade");
    expect(worldSource).toContain("this.updateBiomeFloorSprites(viewerPosition)");
  });

  test("reserves wall seats across artwork and generated wall props", () => {
    expect(staticSceneSource).toContain("function pickSeparatedWallSeats");
    expect(staticSceneSource).toContain("this.reserveWallObjectCell");
    expect(staticSceneSource).toContain("seat.cell.x - seat.intoDx === wall.cell.x");
    expect(staticSceneSource).toContain(
      'customProgramCacheKey = () => "environment-sprite-muted-v2"',
    );
  });

  test("shares object reservations across props, chests and enemy seats", () => {
    expect(staticSceneSource).toContain("private handles = createHandles();");
    expect(staticSceneSource).toContain("isObjectOccupiedCell(cell: GridCell): boolean");
    expect(staticSceneSource).toContain("this.reserveObjectCell(cell)");
    expect(staticSceneSource).toContain("...this.objectOccupiedCells,");
    expect(worldSource).toContain("!this.isObjectOccupiedCell(spawn)");
    expect(staticSceneSource).toContain(
      "Place the classic bonus chests (health flasks) before enemy seats are",
    );
    expect(staticSceneSource).toContain(".slice(0, 5)");
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
});
