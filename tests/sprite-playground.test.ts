import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { ENEMY_ROSTER } from "../src/world/EnemySpriteAtlas";
import { biomeSpriteDecorCatalog } from "../src/world/BiomeSpriteDecorCatalogs.generated";
import { uncannyWallAnimations } from "../src/world/UncannyWallCatalog.generated";
import {
  DEFAULT_SPRITE_PLAYGROUND_ID,
  DEFAULT_SPRITE_PLAYGROUND_MOOD,
  flattenSpritePlaygroundEntries,
  listSpritePlaygroundGroups,
  parseSpritePlaygroundQuery,
  spritePlaygroundAtlasUv,
  spritePlaygroundEnemyLabel,
  spritePlaygroundSearch,
  retainSpritePlaygroundOrbit,
  SPRITE_PLAYGROUND_ITEM_ENTRIES,
  uncannyWallFrameRect,
} from "../src/sprite-playground";

describe("sprite playground", () => {
  test("exposes an interactive page with animation controls and a catalog", async () => {
    const html = await Bun.file(new URL("../sprite-playground.html", import.meta.url)).text();
    const css = await Bun.file(new URL("../src/sprite-playground.css", import.meta.url)).text();
    const vite = await Bun.file(new URL("../vite.config.ts", import.meta.url)).text();
    const audit = await Bun.file(
      new URL("../scripts/audit-runtime-assets.ts", import.meta.url),
    ).text();

    expect(html).toContain('id="sprite-playground-canvas"');
    expect(html).toContain('id="sprite-playground-catalog"');
    expect(html).toContain('id="sprite-playground-clip-attack"');
    expect(html).toContain("space play");
    expect(css).toContain("#sprite-playground-canvas:focus-visible");
    expect(css).toContain("touch-action: none");
    expect(vite).toContain("sprite-playground.html");
    expect(audit).toContain("sprite-playground.html");
  });

  test("groups the runtime enemy, prop, uncanny, and item catalogs", () => {
    const groups = listSpritePlaygroundGroups("ancient");
    const byId = Object.fromEntries(groups.map((group) => [group.id, group]));

    expect(DEFAULT_SPRITE_PLAYGROUND_ID).toBe("goblin");
    expect(byId.enemy?.entries.map((entry) => entry.key)).toEqual([...ENEMY_ROSTER]);
    expect(byId.prop?.entries).toHaveLength(biomeSpriteDecorCatalog("ancient").props.length);
    expect(byId.uncanny?.entries).toHaveLength(uncannyWallAnimations("ancient").length);
    expect(byId.item?.entries).toHaveLength(SPRITE_PLAYGROUND_ITEM_ENTRIES.length);
    expect(spritePlaygroundEnemyLabel("white-eyed-shadow")).toBe("White Eyed Shadow");
  });

  test("filters catalog entries by id, label, or group name", () => {
    const groups = listSpritePlaygroundGroups("ash");
    const goblins = flattenSpritePlaygroundEntries(groups, "goblin");
    const walls = flattenSpritePlaygroundEntries(groups, "uncanny");

    expect(goblins.some((entry) => entry.key === "goblin")).toBe(true);
    expect(walls.length).toBe(uncannyWallAnimations("ash").length);
  });

  test("parses and serializes sprite, mood, and clip query state", () => {
    expect(parseSpritePlaygroundQuery("")).toMatchObject({
      id: DEFAULT_SPRITE_PLAYGROUND_ID,
      family: "enemy",
      key: "goblin",
      mood: DEFAULT_SPRITE_PLAYGROUND_MOOD,
      clip: "movement",
      errors: [],
    });
    expect(parseSpritePlaygroundQuery("?sprite=phoenix-egg")).toMatchObject({
      id: "goblin",
      family: "enemy",
    });
    expect(parseSpritePlaygroundQuery("?sprite=phoenix-egg").errors.length).toBeGreaterThan(0);
    expect(parseSpritePlaygroundQuery("?sprite=ghost&mood=frost&clip=attack")).toEqual({
      id: "ghost",
      family: "enemy",
      key: "ghost",
      mood: "frost",
      clip: "attack",
      errors: [],
    });
    expect(spritePlaygroundSearch({ id: "goblin" })).toBe("?sprite=goblin");
    expect(spritePlaygroundSearch({ id: "ghost", mood: "frost", clip: "attack" })).toBe(
      "?sprite=ghost&mood=frost&clip=attack",
    );
  });

  test("maps atlas frames into Three.js offset/repeat UVs", () => {
    expect(spritePlaygroundAtlasUv({ x: 160, y: 320, w: 160, h: 160 }, [640, 3520])).toEqual({
      offsetX: 0.25,
      offsetY: 1 - 480 / 3520,
      repeatX: 0.25,
      repeatY: 160 / 3520,
    });
    expect(uncannyWallFrameRect(0, 1)).toEqual({ x: 720, y: 0, w: 720, h: 720 });
    expect(uncannyWallFrameRect(3, 0)).toEqual({ x: 0, y: 2160, w: 720, h: 720 });
  });

  test("keeps the camera orbit offset when the sprite origin changes", () => {
    const camera = new THREE.PerspectiveCamera(35, 1, 0.05, 80);
    camera.position.set(2, 1.4, 3);
    retainSpritePlaygroundOrbit(camera, { x: 0, y: 0.5, z: 0 }, { x: 0, y: 1.2, z: 0 });
    expect(camera.position.x).toBeCloseTo(2);
    expect(camera.position.y).toBeCloseTo(2.1);
    expect(camera.position.z).toBeCloseTo(3);
  });
});
