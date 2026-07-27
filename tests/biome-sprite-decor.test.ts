import { describe, expect, test } from "bun:test";

import { listDungeonMoodIds } from "../src/systems/DungeonMood";
import {
  BIOME_FLOOR_PROP_FADE_FAR,
  BIOME_FLOOR_PROP_FADE_NEAR,
  BIOME_SPRITE_PROPS,
  biomeSpriteFloorDistanceFade,
  biomeSpritePropFrame,
  biomeSpriteFloorGroundGap,
  biomeSpritePropTextureUrl,
} from "../src/world/BiomeSpriteDecorKit";

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
      expect(biomeSpritePropTextureUrl(mood)).toBe(`/assets/sprites/biome-props/${mood}-props.png`);
    }
  });

  test("maps six crops to the 3x2 512px atlas without overlap", () => {
    const frames = [0, 1, 2, 3, 4, 5].map(biomeSpritePropFrame);
    expect(frames).toEqual([
      { x: 0, y: 0, w: 512, h: 512 },
      { x: 512, y: 0, w: 512, h: 512 },
      { x: 1024, y: 0, w: 512, h: 512 },
      { x: 0, y: 512, w: 512, h: 512 },
      { x: 512, y: 512, w: 512, h: 512 },
      { x: 1024, y: 512, w: 512, h: 512 },
    ]);
  });

  test("uses a scenery altar in Frost instead of a chest prop", () => {
    expect(BIOME_SPRITE_PROPS.frost[4]).toMatchObject({
      id: "frozen-altar",
      label: "Frozen floor altar",
      surface: "floor",
      frame: 4,
    });
    expect(JSON.stringify(BIOME_SPRITE_PROPS.frost)).not.toContain("chest");
  });

  test("keeps generated props muted and outside distance/frustum culling", () => {
    expect(worldSource).toContain('"biome-prop-wall-decal-muted-v3"');
    expect(worldSource).toContain('"biome-prop-floor-muted-v2"');
    expect(worldSource).toContain("diffuseColor.rgb = mix(vec3(biomePropLuma)");
    expect(worldSource).toContain("opacity: 0.88");
    expect(worldSource).toContain("sprite.frustumCulled = false");
    expect(worldSource).toContain('distanceLod: "disabled"');
  });

  test("anchors wall props as fixed decals instead of camera sprites", () => {
    expect(worldSource).toContain("new THREE.PlaneGeometry(1, 1)");
    expect(worldSource).toContain("wallDecal.rotation.y = facingRotation(into.x, into.y)");
    expect(worldSource).toContain("offsetFromWall: BIOME_WALL_DECAL_OFFSET");
    expect(worldSource).toContain("polygonOffset: true");
    expect(worldSource).toContain(
      'billboard: surface === "wall" ? "wall-normal" : "yaw-to-player"',
    );
  });

  test("anchors floor cards from the measured transparent bottom margin", () => {
    for (const mood of listDungeonMoodIds()) {
      for (const frame of [3, 4, 5]) {
        expect(biomeSpriteFloorGroundGap(mood, frame)).toBeGreaterThan(0);
        expect(biomeSpriteFloorGroundGap(mood, frame)).toBeLessThan(0.25);
      }
    }
    expect(worldSource).toContain("0.02 - groundGap * scale");
    expect(worldSource).toContain("prop.mesh.rotation.y = Math.atan2(deltaX, deltaZ)");
  });

  test("fades floor cards smoothly in the near-player band", () => {
    expect(biomeSpriteFloorDistanceFade(BIOME_FLOOR_PROP_FADE_NEAR)).toBe(0);
    expect(biomeSpriteFloorDistanceFade(BIOME_FLOOR_PROP_FADE_FAR)).toBe(1);
    expect(biomeSpriteFloorDistanceFade(1.625)).toBeCloseTo(0.5, 5);
    expect(worldSource).toContain("prop.material.opacity = prop.baseOpacity * fade");
    expect(worldSource).toContain("this.updateBiomeFloorSprites(viewerPosition)");
  });

  test("reserves wall seats across artwork and generated wall props", () => {
    expect(worldSource).toContain("function pickSeparatedWallSeats");
    expect(worldSource).toContain("this.wallSpriteOccupiedCells.add(key)");
    expect(worldSource).toContain("seat.cell.x - seat.intoDx === wall.cell.x");
    expect(worldSource).toContain('customProgramCacheKey = () => "environment-sprite-muted-v2"');
  });

  test("ships every processed atlas and a complete alpha manifest", async () => {
    const root = new URL("../public/assets/sprites/biome-props/", import.meta.url);
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
      const file = Bun.file(new URL(`${sheet.biome}-props.png`, root));
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
