import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import { importDungeonForge } from "../src/dungeon/importDungeonForge";
import { generateForgeDungeon } from "../src/forge/generateForgeDungeon";
import { getDungeonMood } from "../src/systems/DungeonMood";
import type { AssetLibrary } from "../src/world/AssetLibrary";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { createRoomSurfaceMaterials } from "../src/world/RoomSurfaceMaterials";
import { DungeonWorld } from "../src/world/DungeonWorld";
import { StaticDungeonScene } from "../src/world/StaticDungeonScene";
import { MAGIC_PORTAL_NAMES } from "../src/world/MagicPortalKit";
import { STONE_ORDER } from "../src/ui/copy";

function installCanvasDocument(): () => void {
  const previous = globalThis.document;
  const context = {
    createRadialGradient: () => ({ addColorStop() {} }),
    fillRect() {},
    set fillStyle(_value: string) {},
  };
  const image = () => ({
    addEventListener() {},
    removeEventListener() {},
    set src(_value: string) {},
    get src() {
      return "";
    },
  });
  globalThis.document = {
    createElementNS: () => image(),
    createElement: (name: string) =>
      name === "canvas" ? { width: 0, height: 0, getContext: () => context } : image(),
  } as unknown as Document;
  return () => {
    globalThis.document = previous;
  };
}

function createAssets(): AssetLibrary {
  const albedo = new THREE.Texture();
  const data = new THREE.Texture();
  const layer = { albedo, normal: data, rough: data, depth: data };
  const pbr = { albedo, normal: data, rough: data, depth: data };
  return {
    getBiomeSurfaces: () => ({ floor: layer, wall: layer, ceiling: layer }),
    biomeDoor: () => albedo,
    biomeSpriteProp: () => albedo,
    biomeWallDecorPbr: () => pbr,
    wallArtPbr: () => pbr,
  } as unknown as AssetLibrary;
}

function createScene(group: THREE.Group): StaticDungeonScene {
  const texture = new THREE.Texture();
  const materials = createDungeonMaterials();
  const surfaceMaterials = createRoomSurfaceMaterials({
    floor: texture,
    wall: texture,
    ceiling: texture,
    semanticFloors: {
      grave: texture,
      shrine: texture,
      treasure: texture,
      boss: texture,
    },
    semanticWalls: {
      grave: texture,
      shrine: texture,
      treasure: texture,
      elite: texture,
      boss: texture,
    },
  });
  return new StaticDungeonScene({
    group,
    assets: createAssets(),
    materials,
    surfaceMaterials,
    tileSize: 2.4,
    wallHeight: 4.4,
    stoneTextures: new Map(),
  });
}

function addOwnedBuildRoots(staticScene: StaticDungeonScene, ...roots: THREE.Object3D[]): void {
  (
    staticScene as unknown as {
      add(...objects: THREE.Object3D[]): void;
    }
  ).add(...roots);
}

function createSharedDisposalProbe(): {
  roots: [THREE.Group, THREE.Group];
  geometryDisposals: () => number;
  materialDisposals: () => number;
  borrowedMaterialDisposals: () => number;
} {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshBasicMaterial();
  const borrowedMaterial = new THREE.MeshBasicMaterial();
  borrowedMaterial.userData.sharedDungeonMaterial = true;
  let geometryDisposals = 0;
  let materialDisposals = 0;
  let borrowedMaterialDisposals = 0;
  const disposeGeometry = geometry.dispose.bind(geometry);
  const disposeMaterial = material.dispose.bind(material);
  const disposeBorrowedMaterial = borrowedMaterial.dispose.bind(borrowedMaterial);
  geometry.dispose = () => {
    geometryDisposals += 1;
    disposeGeometry();
  };
  material.dispose = () => {
    materialDisposals += 1;
    disposeMaterial();
  };
  borrowedMaterial.dispose = () => {
    borrowedMaterialDisposals += 1;
    disposeBorrowedMaterial();
  };

  const first = new THREE.Group();
  const second = new THREE.Group();
  first.add(new THREE.Mesh(geometry, material));
  second.add(new THREE.Mesh(geometry, material));
  second.add(new THREE.Mesh(geometry, borrowedMaterial));
  return {
    roots: [first, second],
    geometryDisposals: () => geometryDisposals,
    materialDisposals: () => materialDisposals,
    borrowedMaterialDisposals: () => borrowedMaterialDisposals,
  };
}

describe("StaticDungeonScene", () => {
  test("owns fixed classic and Forge/Backrooms builds, then expires borrowed handles", () => {
    const restoreDocument = installCanvasDocument();
    try {
      const group = new THREE.Group();
      const sentinel = new THREE.Group();
      sentinel.name = "Facade-owned dynamic sentinel";
      group.add(sentinel);
      const staticScene = createScene(group);

      const classic = staticScene.build(
        generateDungeon("a5-static-classic", { roomTarget: 8 }),
        getDungeonMood("ash"),
        0.6,
      );
      expect(staticScene.stats).toMatchObject({
        floorTiles: 564,
        wallTiles: 474,
        ceilingTiles: 564,
        hazardTiles: 4,
        pickups: 9,
        beams: 5,
        lights: 12,
        props: 185,
      });
      expect(classic.solidCells.size).toBe(19);
      expect(classic.solidColliders).toHaveLength(19);
      expect(group.getObjectByName("Escape portal gate")).toBeDefined();
      expect(group.getObjectByName("Portal aperture trim")).toBeDefined();
      expect(group.getObjectByName(MAGIC_PORTAL_NAMES.vortex)).toBeDefined();
      expect(group.getObjectByName(MAGIC_PORTAL_NAMES.spiral)).toBeDefined();
      expect(group.getObjectByName("Torch floor light pool")).toBeDefined();
      expect(classic.stonePlacements.map((placement) => placement.stoneId)).toEqual([
        ...STONE_ORDER,
      ]);
      expect(new Set(classic.stonePlacements.map(({ cell }) => `${cell.x},${cell.y}`)).size).toBe(
        4,
      );

      staticScene.clear();
      expect(classic.doors).toHaveLength(0);
      expect(classic.pickups).toHaveLength(0);
      expect(classic.solidCells.size).toBe(0);
      expect(classic.solidColliders).toHaveLength(0);
      expect(classic.hazardTiles).toBeNull();
      expect(classic.liquidKit).toBeNull();
      expect(group.children).toEqual([sentinel]);
      staticScene.clear();
      expect(group.children).toEqual([sentinel]);

      const forge = importDungeonForge(
        generateForgeDungeon({
          seed: 424242,
          roomCount: 9,
          loopChance: 0.28,
          decorDensity: 0.7,
          themeKey: "backrooms",
        }),
      );
      const backrooms = staticScene.build(forge, getDungeonMood("backrooms"), 0.6);
      expect(backrooms).not.toBe(classic);
      expect(staticScene.stats).toMatchObject({
        floorTiles: 584,
        wallTiles: 239,
        ceilingTiles: 584,
        hazardTiles: 4,
        pickups: 10,
        beams: 5,
        lights: 13,
        props: 169,
      });
      expect(backrooms.solidCells.size).toBe(39);
      expect(backrooms.solidColliders).toHaveLength(39);
      expect(backrooms.stonePlacements.map((placement) => placement.stoneId)).toEqual([
        ...STONE_ORDER,
      ]);
      expect(new Set(backrooms.stonePlacements.map(({ cell }) => `${cell.x},${cell.y}`)).size).toBe(
        4,
      );
      expect(group.getObjectByName("Backrooms fluorescent ceiling fixture")).toBeDefined();
      expect(group.getObjectByName("Forge static material batch 1")).toBeDefined();

      staticScene.dispose();
      staticScene.dispose();
      expect(group.children).toEqual([sentinel]);
      expect(() => staticScene.build(forge, getDungeonMood("backrooms"), 0.6)).toThrow(
        "StaticDungeonScene has been disposed.",
      );
    } finally {
      restoreDocument();
    }
  });

  test("disposes each owned shared resource once per clear lifecycle", () => {
    const restoreDocument = installCanvasDocument();
    try {
      const staticScene = createScene(new THREE.Group());
      const firstClear = createSharedDisposalProbe();
      addOwnedBuildRoots(staticScene, ...firstClear.roots);
      staticScene.clear();
      staticScene.clear();
      expect(firstClear.geometryDisposals()).toBe(1);
      expect(firstClear.materialDisposals()).toBe(1);
      expect(firstClear.borrowedMaterialDisposals()).toBe(0);

      const rebuild = createSharedDisposalProbe();
      addOwnedBuildRoots(staticScene, ...rebuild.roots);
      staticScene.build(
        generateDungeon("a5-disposal-rebuild", { roomTarget: 4 }),
        getDungeonMood("ash"),
        0.6,
      );
      expect(rebuild.geometryDisposals()).toBe(1);
      expect(rebuild.materialDisposals()).toBe(1);
      expect(rebuild.borrowedMaterialDisposals()).toBe(0);

      const dispose = createSharedDisposalProbe();
      addOwnedBuildRoots(staticScene, ...dispose.roots);
      staticScene.dispose();
      staticScene.dispose();
      expect(dispose.geometryDisposals()).toBe(1);
      expect(dispose.materialDisposals()).toBe(1);
      expect(dispose.borrowedMaterialDisposals()).toBe(0);
    } finally {
      restoreDocument();
    }
  });

  test("leaves DungeonWorld as the public facade for a fixed build", () => {
    const restoreDocument = installCanvasDocument();
    const scene = new THREE.Scene();
    const world = new DungeonWorld(scene);
    try {
      world.setDungeon(
        generateDungeon("a5-static-classic", { roomTarget: 8 }),
        getDungeonMood("ash"),
      );

      expect(world.stats).toMatchObject({
        floorTiles: 564,
        wallTiles: 474,
        ceilingTiles: 564,
        enemies: 8,
        hazardTiles: 4,
        pickups: 9,
        beams: 5,
        lights: 13,
        props: 185,
      });
      expect(world.getSolidCells()).toHaveLength(19);
      expect(world.getSolidColliders()).toHaveLength(19);
    } finally {
      world.dispose();
      restoreDocument();
    }
  });
});
