import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import { createDungeonArch, createDungeonDoor, doorwayPlacement } from "../src/world/DoorFactory";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { createReliquaryAltar } from "../src/world/ReliquaryAltar";
import { roomTheme } from "../src/world/RoomArtDirection";
import {
  ENEMY_ANIMATIONS,
  ENEMY_ROSTER,
  enemyAnimationsForMood,
  enemyAtlasSrcForMood,
} from "../src/world/EnemySpriteAtlas";
import { listDungeonMoodIds } from "../src/systems/DungeonMood";
import { createForgeProp } from "../src/world/ForgePropFactory";
import { createResolveFlask, createSkullSeal } from "../src/world/ItemFactory";
import { createRoomSurfaceMaterials } from "../src/world/RoomSurfaceMaterials";
import { createDungeonProp } from "../src/world/DungeonPropKit";
import { getForgePropScale } from "../src/world/ForgePropFactory";
import { createImageSculptedProp } from "../src/world/ImageSculptedPropKit";
import { createImageSculptedClutter } from "../src/world/ImageSculptedClutterKit";
import { registerTextureSource } from "../src/world/TextureTreatment";
import { findNearestPropCell, isProtectedTraversalCell } from "../src/world/PropPlacement";
import { dressingPropScale } from "../src/world/DungeonWorld";

describe("professional world kit", () => {
  test("reliquary exposes action pivots, sockets and collider metadata", () => {
    const altar = createReliquaryAltar(createDungeonMaterials());
    expect(altar.userData.collider.type).toBe("box");
    expect(altar.getObjectByName("Left reliquary door hinge")?.userData.socket.type).toBe("hinge");
    expect(altar.getObjectByName("Candle socket left")?.userData.socket.accepts).toBe("candle");
    expect(altar.getObjectByName("Iron rivet repetition system")?.children.length).toBe(6);
  });

  test("doors start closed, grounded and expose both animation hinges", () => {
    const door = createDungeonDoor(createDungeonMaterials(), 2.4, 4.4);
    expect(door.userData.passable).toBe(false);
    expect(door.userData.closed).toBe(true);
    expect(door.userData.leafBottom).toBeLessThan(0.06);
    expect(door.userData.wallHeight).toBeCloseTo(4.4);
    expect(door.userData.openingHeight).toBeLessThan(door.userData.wallHeight - 0.4);
    expect(door.getObjectByName("Door leaf hinge")?.userData.socket.type).toBe("hinge");
    expect(door.getObjectByName("Right door leaf hinge")?.userData.socket.type).toBe("hinge");
    expect(door.getObjectByName("Left closed iron-bound door leaf")).toBeDefined();
    const bounds = new THREE.Box3().setFromObject(door);
    expect(bounds.max.y).toBeGreaterThan(4.2);
    expect(bounds.max.y).toBeLessThanOrEqual(4.5);
  });

  test("Forge arches keep a real player-width opening", () => {
    const arch = createDungeonArch(createDungeonMaterials(), { width: 2.4, wallHeight: 4.4 });
    expect(arch.userData.passable).toBe(true);
    expect(arch.userData.clearance).toBeGreaterThanOrEqual(1.2);
    expect(arch.getObjectByName("Door leaf hinge")).toBeUndefined();
    const bounds = new THREE.Box3().setFromObject(arch);
    expect(bounds.max.y).toBeGreaterThan(4.2);
    expect(arch.userData.curvedArch).toBe(true);
  });

  test("Backrooms office doors use square frames and push bars", () => {
    const door = createDungeonDoor(createDungeonMaterials(), 2.4, 4.4, {
      style: "office",
      curvedArch: false,
    });
    expect(door.userData.doorStyle).toBe("office");
    expect(door.userData.curvedArch).toBe(false);
    expect(door.getObjectByName("Left office push bar")).toBeDefined();
    expect(door.getObjectByName("Left door iron straps")).toBeUndefined();
  });

  test("doorway placement sits on the wall plane and faces into the room", () => {
    const north = doorwayPlacement({ x: 0, z: 0 }, 0, -1, 2.4);
    expect(north.z).toBeCloseTo(-1.2);
    expect(north.rotation).toBeCloseTo(0);
    const east = doorwayPlacement({ x: 0, z: 0 }, 1, 0, 2.4);
    expect(east.x).toBeCloseTo(1.2);
    expect(east.rotation).toBeCloseTo(-Math.PI / 2);
  });

  test("room direction is deterministic and the eleven enemy silhouettes exist", () => {
    const dungeon = generateDungeon("professional-room-test", { roomTarget: 8 });
    const room = dungeon.rooms.find((candidate) => candidate.role === "room");
    expect(room).toBeDefined();
    expect(roomTheme(dungeon, room!)).toBe(roomTheme(dungeon, room!));
    expect(Object.keys(ENEMY_ANIMATIONS)).toEqual([...ENEMY_ROSTER]);
  });

  test("enemy atlas uses four 320px frames for each measured silhouette", () => {
    for (const [row, kind] of ENEMY_ROSTER.entries()) {
      const animation = ENEMY_ANIMATIONS[kind];
      expect(animation.src).toBe("/assets/sprites/enemies-v6/iron-ash-enemies-v6.png");
      expect(animation.size).toEqual([1280, 3520]);
      expect(animation.frames).toHaveLength(4);
      expect(animation.frames).toEqual([
        { x: 0, y: row * 320, w: 320, h: 320 },
        { x: 320, y: row * 320, w: 320, h: 320 },
        { x: 640, y: row * 320, w: 320, h: 320 },
        { x: 960, y: row * 320, w: 320, h: 320 },
      ]);
    }
  });

  test("every biome resolves a dedicated enemy atlas with shared frame layout", () => {
    for (const moodId of listDungeonMoodIds()) {
      const animations = enemyAnimationsForMood(moodId);
      expect(animations.goblin.src).toBe(enemyAtlasSrcForMood(moodId));
      for (const kind of ENEMY_ROSTER) {
        expect(animations[kind].frames).toEqual(ENEMY_ANIMATIONS[kind].frames);
        expect(animations[kind].size).toEqual(ENEMY_ANIMATIONS[kind].size);
      }
    }
  });

  test("spawn, exit, Forge corridors and doorways reject solid dressing", () => {
    const dungeon = generateDungeon("protected-prop-cells", { roomTarget: 6 });
    expect(isProtectedTraversalCell(dungeon, dungeon.spawn)).toBe(true);
    expect(isProtectedTraversalCell(dungeon, dungeon.exit)).toBe(true);
    const floor = dungeon.rooms.find((room) => room.role === "room")!.center;
    expect(isProtectedTraversalCell(dungeon, floor)).toBe(false);
    dungeon.forge = {
      name: "test",
      themeKey: "crypt",
      roomTypes: {},
      source: "dungeon-forge",
      seed: 1,
      decorDensity: 1,
      maxBfs: 0,
      maxDepth: 0,
      roomIds: new Int16Array(dungeon.width * dungeon.height),
      corridors: new Uint8Array(dungeon.width * dungeon.height),
      doorways: new Uint8Array(dungeon.width * dungeon.height),
      bfs: new Int32Array(dungeon.width * dungeon.height),
      pools: new Uint8Array(dungeon.width * dungeon.height),
      lakeMask: new Uint8Array(dungeon.width * dungeon.height),
      rooms: [],
      props: [],
      spawns: [],
      torches: [],
      arches: [],
    };
    dungeon.forge.corridors[floor.y * dungeon.width + floor.x] = 1;
    expect(isProtectedTraversalCell(dungeon, floor)).toBe(true);
    const enemySpawn = { x: floor.x + 1, y: floor.y, tier: 1, roomId: 0 };
    dungeon.forge.spawns.push(enemySpawn);
    expect(isProtectedTraversalCell(dungeon, enemySpawn)).toBe(true);
    const relocated = findNearestPropCell(dungeon, enemySpawn, new Set());
    expect(relocated).not.toBeNull();
    expect(isProtectedTraversalCell(dungeon, relocated!)).toBe(false);
  });

  test("Forge props and pickups use authored 3D assemblies", () => {
    const materials = createDungeonMaterials();
    const chest = createForgeProp({ kind: "chest", x: 1, y: 1 }, materials);
    expect(chest?.getObjectByName("Chest arched lid")).toBeDefined();
    expect(chest?.getObjectByName("Chest lock")).toBeDefined();
    expect(createSkullSeal(materials).getObjectByName("Relic carved skull")).toBeDefined();
    expect(createResolveFlask(materials).getObjectByName("Resolve flask liquid")).toBeDefined();
    expect(materials.crystal.map?.name).toContain("prop-crystal");
    expect(materials.ice.map?.name).toContain("prop-ice");
  });

  test("furniture variants keep metric bounds and distinct silhouettes", () => {
    const materials = createDungeonMaterials();
    const chairs = [0, 1, 2].map((variant) => createDungeonProp("chair", materials, variant));
    const sizes = chairs.map((chair) =>
      new THREE.Box3().setFromObject(chair).getSize(new THREE.Vector3()),
    );
    expect(sizes.every((size) => size.x >= 0.55 && size.x <= 0.75)).toBe(true);
    expect(sizes.every((size) => size.y >= 0.95 && size.y <= 1.7)).toBe(true);
    expect(new Set(sizes.map((size) => size.y.toFixed(2))).size).toBe(3);
    expect(getForgePropScale({ kind: "chair", x: 0, y: 0, scale: 0.4 })).toBe(0.95);
    expect(getForgePropScale({ kind: "chair", x: 0, y: 0, scale: 1.8 })).toBe(1.18);
    const tables = [0, 1, 2].map((variant) => createDungeonProp("table", materials, variant));
    const tableSizes = tables.map((table) =>
      new THREE.Box3().setFromObject(table).getSize(new THREE.Vector3()),
    );
    expect(tableSizes.every((size) => size.x >= 2.05 && size.x <= 3.1)).toBe(true);
    expect(tableSizes.every((size) => size.z >= 1.05 && size.z <= 1.4)).toBe(true);
    expect(tableSizes.every((size) => size.y >= 0.9 && size.y <= 1.15)).toBe(true);
    // Tables stay full size in small rooms; tall props may shrink slightly.
    expect(dressingPropScale("table", 4)).toBe(1);
    expect(dressingPropScale("bookshelf", 4)).toBeCloseTo(0.95);
    expect(dressingPropScale("reliquary", 8)).toBe(0.78);
  });

  test("common props use joined, beveled geometry instead of plain block silhouettes", () => {
    const materials = createDungeonMaterials();
    const chair = createDungeonProp("chair", materials, 2);
    const coffin = createDungeonProp("coffin", materials, 1);
    const lectern = createDungeonProp("lectern", materials, 1);
    expect(chair.userData.detailInventory).toContain("Chair open back slat");
    expect(chair.userData.detailInventory).toContain("Chair carved crest rail");
    expect(coffin.userData.detailInventory).toContain("Faceted stone sarcophagus hull");
    expect(coffin.userData.detailInventory).toContain("Raised coffin cross sigil");
    expect(lectern.userData.detailInventory).toContain("Angled lectern desk");
    const grave = createForgeProp({ kind: "grave", x: 0, y: 0 }, materials);
    const pillar = createForgeProp({ kind: "pillar", x: 0, y: 0 }, materials);
    expect(grave?.getObjectByName("Beveled arched grave slab")).toBeDefined();
    expect(grave?.getObjectByName("Grave grounded stone plinth")).toBeDefined();
    expect(pillar?.getObjectByName("Pillar carved collar")).toBeDefined();
    expect(pillar?.getObjectByName("Pillar recessed vertical flute")).toBeDefined();
  });

  test("semantic rooms receive distinct pixel surface maps", () => {
    const texture = new THREE.Texture();
    texture.name = "generated-quality-texture";
    const shrineFloor = new THREE.Texture();
    shrineFloor.name = "generated-shrine-floor";
    const shrineWall = new THREE.Texture();
    shrineWall.name = "generated-shrine-wall";
    registerTextureSource(shrineWall, "/assets/textures/generated/generated-shrine-wall.png", true);
    const surfaces = createRoomSurfaceMaterials({
      floor: texture,
      wall: texture,
      ceiling: texture,
      semanticFloors: { shrine: shrineFloor },
      semanticWalls: { shrine: shrineWall },
    });
    expect(surfaces.treasure.wall.map?.name).toContain("treasure-wall");
    expect(surfaces.shrine.wall.map?.name).toContain("shrine-wall");
    expect(surfaces.boss.wall.map).not.toBe(surfaces.combat.wall.map);
    expect(surfaces.shrine.floor.map?.name).toContain("generated-shrine-floor");
    expect(surfaces.combat.floor.map?.name).toContain("generated-quality-texture");
    expect(surfaces.shrine.wall.map?.name).toContain("generated-shrine-wall");
    expect(surfaces.combat.wall.map?.name).toContain("generated-quality-texture");
    expect(surfaces.shrine.wall.map?.userData.seamTreatment).toBe("mirrored-2x2");
    // PBR stacks stay 1:1 UV so albedo/normal/rough remain locked.
    expect(surfaces.shrine.wall.map?.repeat.y).toBeCloseTo(1, 5);
  });

  test("image-sculpted kit has metric bounds, pivots, sockets and source metadata", () => {
    const materials = createDungeonMaterials();
    const families = ["high-chair", "ritual-table", "wall-lantern", "ossuary-cabinet"] as const;
    const props = families.map((family) => createImageSculptedProp(family, materials));
    const sizes = props.map((prop) =>
      new THREE.Box3().setFromObject(prop).getSize(new THREE.Vector3()),
    );
    expect(sizes.every((size) => size.y >= 0.75 && size.y <= 2)).toBe(true);
    expect(
      props.every((prop) =>
        prop.userData.sculptRuntime.sourceImage.endsWith("dungeon-prop-kit-v1.png"),
      ),
    ).toBe(true);
    expect(props[0]!.getObjectByName("High chair seat socket")?.userData.socket.type).toBe(
      "seated-actor",
    );
    expect(props[2]!.getObjectByName("Lantern cage door hinge")?.userData.socket.type).toBe(
      "hinge",
    );
    expect(props[3]!.getObjectByName("Ossuary left door hinge")?.userData.socket.type).toBe(
      "hinge",
    );
  });

  test("second image-sculpted clutter kit replaces primitive prop families", () => {
    const materials = createDungeonMaterials();
    const families = ["barrels", "crates", "urns", "weapon-rack"] as const;
    const props = families.map((family) => createImageSculptedClutter(family, materials, 1));
    const sizes = props.map((prop) =>
      new THREE.Box3().setFromObject(prop).getSize(new THREE.Vector3()),
    );
    expect(
      props.every((prop) =>
        prop.userData.sculptRuntime.sourceImage.endsWith("dungeon-clutter-kit-v1.png"),
      ),
    ).toBe(true);
    expect(sizes[0]!.y).toBeGreaterThan(0.9);
    expect(sizes[1]!.x).toBeGreaterThan(1.1);
    expect(sizes[2]!.y).toBeGreaterThan(0.8);
    expect(sizes[3]!.y).toBeGreaterThan(1.8);
    expect(props[0]!.getObjectByName("Barrel stave repetition system")?.children.length).toBe(12);
    expect(props[1]!.getObjectByName("Crate nail repetition system")?.children.length).toBe(8);
    expect(props[2]!.getObjectByName("Urn removable lid pivot")?.userData.socket.type).toBe(
      "hinge",
    );
    expect(props[3]!.getObjectByName("Weapon rack slot 1")?.userData.socket.type).toBe("weapon");
    props.forEach((prop, index) => {
      const collider = prop.userData.sculptRuntime.collider as { size: number[]; offset: number[] };
      const colliderSize = new THREE.Vector3().fromArray(collider.size);
      const colliderCenter = new THREE.Vector3().fromArray(collider.offset);
      const visualBounds = new THREE.Box3().setFromObject(prop);
      expect(colliderSize.distanceTo(sizes[index]!)).toBeLessThan(0.00001);
      expect(colliderCenter.distanceTo(visualBounds.getCenter(new THREE.Vector3()))).toBeLessThan(
        0.00001,
      );
    });
  });
});
