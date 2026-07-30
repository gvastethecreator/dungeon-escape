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
  material: THREE.MeshBasicMaterial;
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
    material,
    geometryDisposals: () => geometryDisposals,
    materialDisposals: () => materialDisposals,
    borrowedMaterialDisposals: () => borrowedMaterialDisposals,
  };
}

describe("StaticDungeonScene", () => {
  test("uses the sculpted brazier base and its authored flame socket in the live scene", () => {
    const restoreDocument = installCanvasDocument();
    try {
      const group = new THREE.Group();
      const staticScene = createScene(group);
      (
        staticScene as unknown as {
          addFireProp(
            kind: "brazier",
            position: THREE.Vector3,
            lit: boolean,
            phase: number,
            facing?: THREE.Vector3,
            dynamicLight?: boolean,
          ): void;
        }
      ).addFireProp("brazier", new THREE.Vector3(3, 0, 4), true, 2.4, undefined, false);

      const root = group.getObjectByName("brazier fire prop") as THREE.Group;
      const socket = root.getObjectByName("Brazier flame socket")!;
      const flame = root.getObjectByName("Brazier runtime outer flame") as THREE.Mesh;
      const core = root.getObjectByName("Brazier runtime flame core") as THREE.Mesh;
      const lean = root.getObjectByName("Brazier runtime leaning flame tongue") as THREE.Mesh;
      const halo = root.getObjectByName("Brazier restrained flame halo") as THREE.Mesh;
      expect(root.userData.propFamily).toBe("brazier");
      expect(root.getObjectByName("Brazier broad octagonal lower foot")).toBeDefined();
      expect(root.getObjectByName("Brazier shallow octagonal iron bowl")).toBeDefined();
      expect(root.getObjectByName("Brazier recessed charcoal bed")).toBeDefined();
      expect(root.getObjectByName("Brazier restrained ember nodes")).toBeDefined();
      expect(flame.position.y).toBeCloseTo(socket.position.y + 0.004);
      expect(
        Math.hypot(flame.position.x - socket.position.x, flame.position.z - socket.position.z),
      ).toBeLessThan(0.07);
      expect(flame.geometry.name).toBe("Curved three-dimensional low-poly brazier flame tongue");
      expect(flame.geometry.userData.sourceGeometry).toBe("createFlameTongueGeometry");
      expect(flame.geometry.userData.curvedSilhouette).toBe(true);
      expect(flame.geometry.getAttribute("color")).toBeDefined();
      expect(flame.geometry).not.toBeInstanceOf(THREE.OctahedronGeometry);
      expect((flame.material as THREE.MeshBasicMaterial).blending).toBe(THREE.NormalBlending);
      expect((flame.material as THREE.MeshBasicMaterial).vertexColors).toBe(true);
      expect((flame.material as THREE.MeshBasicMaterial).opacity).toBeLessThanOrEqual(0.42);
      expect(flame.rotation.y).not.toBe(core.rotation.y);
      expect(core.rotation.y).not.toBe(lean.rotation.y);
      const flameHeight = new THREE.Box3().setFromObject(flame).getSize(new THREE.Vector3()).y;
      const coreHeight = new THREE.Box3().setFromObject(core).getSize(new THREE.Vector3()).y;
      const leanHeight = new THREE.Box3().setFromObject(lean).getSize(new THREE.Vector3()).y;
      expect(flameHeight).toBeLessThan(0.29);
      expect(coreHeight).toBeLessThan(0.2);
      expect(leanHeight).toBeLessThan(0.25);
      const effect = staticScene.currentHandles.fireEffects[0]!;
      expect(effect.baseY).toBe(socket.position.y);
      expect(effect.baseIntensity).toBe(18);
      expect(effect.cutoffDistance).toBe(8);
      expect(effect.flameDetails).toEqual([core, lean]);
      expect(effect.halos).toEqual([halo]);
      expect((halo.material as THREE.MeshBasicMaterial).opacity).toBeLessThanOrEqual(0.035);
      expect(root.position.toArray()).toEqual([3, 0, 4]);
      staticScene.dispose();
    } finally {
      restoreDocument();
    }
  });

  test("keeps the Frost brazier blue and below clipping light and opacity limits", () => {
    const restoreDocument = installCanvasDocument();
    try {
      const group = new THREE.Group();
      const staticScene = createScene(group);
      const sceneInternals = staticScene as unknown as {
        activeMood: ReturnType<typeof getDungeonMood>;
        addFireProp(
          kind: "brazier",
          position: THREE.Vector3,
          lit: boolean,
          phase: number,
          facing?: THREE.Vector3,
          dynamicLight?: boolean,
        ): void;
      };
      sceneInternals.activeMood = getDungeonMood("frost");
      sceneInternals.addFireProp("brazier", new THREE.Vector3(), true, 0.6, undefined, true);

      const effect = staticScene.currentHandles.fireEffects[0]!;
      const material = effect.flame.material as THREE.MeshBasicMaterial;
      expect(material.color.getHex()).toBe(0x75a6bf);
      expect(material.opacity).toBe(0.27);
      expect(material.blending).toBe(THREE.NormalBlending);
      expect(effect.baseIntensity).toBe(6.5);
      expect(effect.cutoffDistance).toBe(5.5);
      expect(effect.light?.intensity).toBe(6.5);
      expect(effect.light?.distance).toBe(5.5);
      expect(effect.flameDetails).toHaveLength(2);
      expect(
        ((effect.flameDetails[0] as THREE.Mesh).material as THREE.MeshBasicMaterial).color.getHex(),
      ).toBe(0xf2ac65);
      expect(effect.flameDetails[0]?.userData.preserveWarmCore).toBe(true);
      expect(effect.halos).toHaveLength(1);
      const emberNodes = effect.root.getObjectByName(
        "Brazier restrained ember nodes",
      ) as THREE.InstancedMesh;
      const emberMaterial = emberNodes.material as THREE.MeshStandardMaterial;
      expect(emberMaterial.emissiveIntensity).toBe(0.18);
      expect(emberMaterial.userData.biomeAdjustedEmber).toBe(true);
      staticScene.dispose();
    } finally {
      restoreDocument();
    }
  });

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
        wallTiles: 459,
        ceilingTiles: 564,
        hazardTiles: 4,
        pickups: 12,
        beams: 7,
        lights: 12,
        props: 188,
      });
      expect(classic.ambientBeams).toHaveLength(2);
      expect(group.getObjectByName("Ambient godray 1")).toBeDefined();
      const ambientMaterial = classic.ambientBeams[0]!.material as THREE.ShaderMaterial;
      expect(ambientMaterial.blending).toBe(THREE.NormalBlending);
      expect(ambientMaterial.fog).toBe(true);
      expect(ambientMaterial.toneMapped).toBe(true);
      expect(classic.ambientBeams[0]!.userData.screenSpace).toBe(false);
      expect(classic.ambientBeams[0]!.userData.profile).toBe("retro-faceted");
      expect(classic.ambientBeams[0]!.geometry.userData.triangles).toBe(64);
      expect(ambientMaterial.fragmentShader).toContain("#include <tonemapping_fragment>");
      expect(ambientMaterial.fragmentShader).toContain("#include <colorspace_fragment>");
      expect(classic.portalBeam?.userData.profile).toBe("signal-smooth");
      expect(classic.stoneBeams.every((beam) => beam.userData.profile === "signal-smooth")).toBe(
        true,
      );
      expect(classic.solidCells.size).toBe(22);
      expect(classic.solidColliders).toHaveLength(22);
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
      expect(classic.ambientBeams).toHaveLength(0);
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
        pickups: 13,
        beams: 7,
        lights: 13,
        props: 172,
      });
      expect(backrooms.solidCells.size).toBe(42);
      expect(backrooms.solidColliders).toHaveLength(42);
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
      firstClear.material.userData.sharedDungeonMaterial = true;
      addOwnedBuildRoots(staticScene, ...firstClear.roots);
      (
        staticScene as unknown as {
          biomeWallDecalMaterials: Map<string, THREE.Material>;
        }
      ).biomeWallDecalMaterials.set("cached-and-mounted", firstClear.material);
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
        wallTiles: 459,
        ceilingTiles: 564,
        enemies: 8,
        hazardTiles: 4,
        pickups: 12,
        beams: 7,
        lights: 14,
        props: 188,
        reserveEnemies: 18,
      });
      expect(world.getSolidCells()).toHaveLength(22);
      expect(world.getSolidColliders()).toHaveLength(22);
    } finally {
      world.dispose();
      restoreDocument();
    }
  });
});
