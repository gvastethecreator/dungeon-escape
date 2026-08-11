import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import { generateDungeonFloorSet } from "../src/dungeon/generateDungeonFloors";
import { importDungeonForge } from "../src/dungeon/importDungeonForge";
import type { DungeonData, DungeonFloorMetadata } from "../src/dungeon/types";
import { generateForgeDungeon } from "../src/forge/generateForgeDungeon";
import { getDungeonMood, listDungeonMoodIds } from "../src/systems/DungeonMood";
import { MAX_DYNAMIC_FIRE_LIGHTS } from "../src/systems/LightTuning";
import type { AssetLibrary } from "../src/world/AssetLibrary";
import { createDungeonProp } from "../src/world/DungeonPropKit";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import { createRoomSurfaceMaterials } from "../src/world/RoomSurfaceMaterials";
import type { ResidentFloorRuntimeOwner } from "../src/world/ResidentFloorRuntime";
import { DungeonWorld } from "../src/world/DungeonWorld";
import {
  clearStaticPropTemplateBatchCache,
  StaticDungeonScene,
} from "../src/world/StaticDungeonScene";
import { MAGIC_PORTAL_NAMES } from "../src/world/MagicPortalKit";
import { STONE_ORDER } from "../src/ui/copy";
import { floorSlabY, STORY_STEP_COUNT } from "../src/world/StoryMetrics";
import { setPickupOpacity } from "../src/world/ItemFactory";
import { updateIdlePickupMotion } from "../src/world/PickupMotionPresentation";

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
    biomeSpriteDecorAtlas: () => albedo,
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

function withFloorMetadata(
  dungeon: DungeonData,
  patch: Partial<DungeonFloorMetadata>,
): DungeonData {
  return { ...dungeon, floor: { ...dungeon.floor!, ...patch } };
}

function addOwnedBuildRoots(staticScene: StaticDungeonScene, ...roots: THREE.Object3D[]): void {
  (
    staticScene as unknown as {
      add(...objects: THREE.Object3D[]): void;
    }
  ).add(...roots);
}

function collectWeaponRackBatches(root: THREE.Object3D): THREE.InstancedMesh[] {
  const batches: THREE.InstancedMesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh && object.name.startsWith("Classic weapon-rack:")) {
      batches.push(object);
    }
  });
  return batches.sort((left, right) => left.name.localeCompare(right.name));
}

function instanceMatrices(batch: THREE.InstancedMesh): number[][] {
  return Array.from({ length: batch.count }, (_, index) => {
    const matrix = new THREE.Matrix4();
    batch.getMatrixAt(index, matrix);
    return matrix.toArray();
  });
}

function rounded3(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

function instancedWorldFingerprint(root: THREE.Object3D): string {
  const rows: string[] = [];
  const local = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    for (let index = 0; index < object.count; index += 1) {
      object.getMatrixAt(index, local);
      const world = new THREE.Matrix4().multiplyMatrices(object.matrixWorld, local);
      rows.push(`i|${object.name}|${index}|${world.elements.map(rounded3).join(",")}`);
    }
  });
  return fnv1a(rows.join("\n"));
}

function colliderFingerprint(
  colliders: readonly {
    minX: number;
    maxX: number;
    minY?: number;
    maxY?: number;
    minZ: number;
    maxZ: number;
  }[],
): string {
  return fnv1a(
    colliders
      .map((collider) =>
        [
          collider.minX,
          collider.maxX,
          collider.minY ?? 0,
          collider.maxY ?? 0,
          collider.minZ,
          collider.maxZ,
        ]
          .map(rounded3)
          .join(","),
      )
      .join("|"),
  );
}

function residentFloorIndex(
  object: THREE.Object3D,
  runtimes: readonly { floorIndex: number; root: THREE.Group }[],
): number | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    const runtime = runtimes.find((candidate) => candidate.root === current);
    if (runtime) return runtime.floorIndex;
    current = current.parent;
  }
  return null;
}

function primeWeaponRackSource(
  staticScene: StaticDungeonScene,
  groupKey = "weapon-rack:1",
  variant = 1,
): { geometries: THREE.BufferGeometry[]; disposalCounts: () => number[] } {
  const internals = staticScene as unknown as {
    materials: ReturnType<typeof createDungeonMaterials>;
    runtimeClassicPropTemplates: Map<
      string,
      {
        family: "weapon-rack";
        variant: number;
        template: THREE.Group | null;
        bounds: THREE.Box3;
      }
    >;
  };
  const template = createDungeonProp("weapon-rack", internals.materials, variant);
  template.updateMatrixWorld(true);
  const geometries = new Set<THREE.BufferGeometry>();
  template.traverse((object) => {
    if (object instanceof THREE.Mesh) geometries.add(object.geometry);
  });
  const counts = new Map<THREE.BufferGeometry, number>(
    [...geometries].map((geometry) => [geometry, 0]),
  );
  for (const geometry of geometries) {
    geometry.addEventListener("dispose", () => {
      counts.set(geometry, (counts.get(geometry) ?? 0) + 1);
    });
  }
  internals.runtimeClassicPropTemplates.set(groupKey, {
    family: "weapon-rack",
    variant,
    template,
    bounds: new THREE.Box3().setFromObject(template),
  });
  return {
    geometries: [...geometries],
    disposalCounts: () => [...geometries].map((geometry) => counts.get(geometry) ?? 0),
  };
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
  test("places generated biome atlas props for every supported mood", () => {
    const restoreDocument = installCanvasDocument();
    const group = new THREE.Group();
    const staticScene = createScene(group);
    try {
      for (const moodId of listDungeonMoodIds()) {
        const handles = staticScene.build(
          generateDungeon(`RDL18-biome-atlas-${moodId}`, { roomTarget: 8 }),
          getDungeonMood(moodId),
          0.6,
        );
        const biomeSpriteNodes: THREE.Object3D[] = [];
        group.traverse((object) => {
          if (object.userData.biomeSpriteDecor) biomeSpriteNodes.push(object);
        });
        expect(handles.floorBiomeSprites.length).toBeGreaterThan(0);
        expect(handles.ceilingBiomeSprites.length).toBeGreaterThan(0);
        expect(biomeSpriteNodes.length).toBeGreaterThan(0);
        const distribution = handles.residentFloors[0]!.root.userData
          .biomeSpriteDecorDistribution as {
          copiesPerDefinition: { wall: number; floor: number; ceiling: number };
          requestedTotal: number;
          placements: Array<{
            id: string;
            surface: string;
            corridor: boolean;
            placement?: string;
            nearWall?: boolean;
          }>;
        };
        expect(distribution.copiesPerDefinition).toEqual({ wall: 5, floor: 3, ceiling: 4 });
        expect(distribution.requestedTotal).toBe(112);
        expect(distribution.placements).toHaveLength(112);
        const propUsage = new Map<string, number>();
        for (const placement of distribution.placements) {
          propUsage.set(placement.id, (propUsage.get(placement.id) ?? 0) + 1);
        }
        expect(propUsage.size).toBe(28);
        expect(
          new Set(
            distribution.placements
              .filter((placement) => placement.surface === "wall")
              .map((placement) => propUsage.get(placement.id)),
          ),
        ).toEqual(new Set([5]));
        expect(
          new Set(
            distribution.placements
              .filter((placement) => placement.surface === "floor")
              .map((placement) => propUsage.get(placement.id)),
          ),
        ).toEqual(new Set([3]));
        expect(
          new Set(
            distribution.placements
              .filter((placement) => placement.surface === "ceiling")
              .map((placement) => propUsage.get(placement.id)),
          ),
        ).toEqual(new Set([4]));
        expect(distribution.placements.some((placement) => placement.corridor)).toBe(true);
        expect(
          distribution.placements
            .filter((placement) => placement.corridor)
            .every((placement) => placement.surface === "wall" || placement.surface === "ceiling"),
        ).toBe(true);
        expect(
          distribution.placements
            .filter((placement) => placement.surface === "floor")
            .every((placement) => placement.placement === "corner-standing"),
        ).toBe(true);
        expect(handles.floorBiomeSprites.every((sprite) => sprite.sharedMaterial)).toBe(true);
        expect(handles.ceilingBiomeSprites.every((sprite) => sprite.sharedMaterial)).toBe(true);
        expect(handles.ceilingBiomeSprites.every((sprite) => sprite.swayAmplitude > 0)).toBe(true);
        expect(
          new Set(
            [...handles.floorBiomeSprites, ...handles.ceilingBiomeSprites].map(
              (sprite) => sprite.material,
            ),
          ).size,
        ).toBeLessThanOrEqual(4);
        expect(
          handles.residentFloors[0]!.root.children.some((child) =>
            child.name.startsWith("Atmosphere "),
          ),
        ).toBe(true);
        expect(
          new Set(biomeSpriteNodes.map((object) => object.userData.biomeSpriteDecor.surface)),
        ).toEqual(new Set(["wall", "floor", "ceiling"]));
        expect(
          biomeSpriteNodes.some(
            (object) => object.userData.biomeSpriteDecor.placement === "corner-standing",
          ),
        ).toBe(true);
        for (const object of biomeSpriteNodes) {
          if (!(object instanceof THREE.Mesh)) continue;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            if (material instanceof THREE.MeshStandardMaterial) expect(material.opacity).toBe(1);
          }
        }
      }
    } finally {
      staticScene.dispose();
      restoreDocument();
    }
  });

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
      const flame = root.getObjectByName("Brazier runtime procedural noise flame") as THREE.Mesh;
      const halo = root.getObjectByName("Brazier restrained flame halo") as THREE.Mesh;
      expect(root.userData.propFamily).toBe("brazier");
      expect(root.getObjectByName("Brazier broad octagonal lower foot")).toBeDefined();
      expect(root.getObjectByName("Brazier shallow octagonal iron bowl")).toBeDefined();
      expect(root.getObjectByName("Brazier recessed charcoal bed")).toBeDefined();
      expect(root.getObjectByName("Brazier restrained ember nodes")).toBeDefined();
      expect(flame.position.y).toBeCloseTo(socket.position.y);
      expect(
        Math.hypot(flame.position.x - socket.position.x, flame.position.z - socket.position.z),
      ).toBeLessThan(0.07);
      expect(flame.geometry.name).toBe("Procedural teardrop noise flame card");
      expect(flame.geometry.userData.sourceGeometry).toBe("createNoiseFlameGeometry");
      expect(flame.geometry.userData.referenceTechnique).toBe(
        "teardrop-noise-offset-threshold-palette",
      );
      expect(flame.geometry.getAttribute("position").count).toBe(4);
      expect(flame.material).toBeInstanceOf(THREE.ShaderMaterial);
      expect((flame.material as THREE.ShaderMaterial).blending).toBe(THREE.NormalBlending);
      expect((flame.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBeLessThanOrEqual(
        0.98,
      );
      const flameHeight = new THREE.Box3().setFromObject(flame).getSize(new THREE.Vector3()).y;
      expect(flameHeight).toBeCloseTo(0.76);
      const effect = staticScene.currentHandles.fireEffects[0]!;
      expect(effect.baseY).toBe(socket.position.y);
      expect(effect.baseIntensity).toBe(18);
      expect(effect.cutoffDistance).toBe(8);
      expect(effect.flameDetails).toHaveLength(1);
      expect(effect.flameDetails[0]).toBeInstanceOf(THREE.Points);
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
      const material = effect.flame.material as THREE.ShaderMaterial;
      expect((material.uniforms.uOuterColor.value as THREE.Color).getHex()).toBe(0x287ed8);
      expect(material.uniforms.uOpacity.value).toBe(0.92);
      expect(material.blending).toBe(THREE.NormalBlending);
      expect(effect.baseIntensity).toBe(6.5);
      expect(effect.cutoffDistance).toBe(5.5);
      expect(effect.light?.intensity).toBe(6.5);
      expect(effect.light?.distance).toBe(5.5);
      expect(effect.flameDetails).toHaveLength(1);
      expect(effect.flameDetails[0]).toBeInstanceOf(THREE.Points);
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

  test("builds every physical flight of a four-floor stack in the initial scene", async () => {
    const restoreDocument = installCanvasDocument();
    try {
      const group = new THREE.Group();
      const staticScene = createScene(group);
      const stack = generateDungeonFloorSet("resident-four-floor-scene", { roomTarget: 8 }, 4);
      let floorYields = 0;
      const handles = await staticScene.buildStackWithYield(
        stack.floors,
        getDungeonMood("ash"),
        0.35,
        async () => {
          floorYields += 1;
        },
      );

      expect(floorYields).toBe(4);
      expect(staticScene.residentPlan?.floorCount).toBe(4);
      expect(staticScene.residentPlan?.shafts).toHaveLength(3);
      expect(staticScene.residentRenderReceipt?.planHash).toBe(staticScene.residentPlan?.hash);
      expect(staticScene.residentRenderReceipt?.shaftCount).toBe(3);
      expect(handles.staircases).toHaveLength(3);
      const residentFloors = group.children.filter((child) =>
        child.name.startsWith("Dungeon resident floor "),
      );
      expect(residentFloors).toHaveLength(4);
      expect(residentFloors.every((floor) => floor.children.length > 0)).toBe(true);
      expect(residentFloors.map((floor) => floor.visible)).toEqual([true, true, false, false]);
      staticScene.setActiveFloor(2);
      expect(residentFloors.map((floor) => floor.visible)).toEqual([false, true, true, true]);
      expect(group.getObjectByName("Runtime door frame global batches")).toBeUndefined();
      expect(group.getObjectByName("Runtime chest global batches")).toBeUndefined();
      expect(handles.residentFloors.map((runtime) => runtime.doorBatchRoots)).toHaveLength(4);
      expect(handles.residentFloors.map((runtime) => runtime.chestBatchRoots)).toHaveLength(4);
      handles.residentFloors.forEach((runtime) => {
        expect(runtime.doorBatchRoots).toHaveLength(1);
        expect(runtime.chestBatchRoots).toHaveLength(1);
        expect(runtime.doorBatchRoots[0]!.parent).toBe(runtime.root);
        expect(runtime.chestBatchRoots[0]!.parent).toBe(runtime.root);
      });
      expect(handles.chests.length).toBeGreaterThan(0);
      expect(handles.chests.every((chest) => chest.runtimeBatch !== null)).toBe(true);
      stack.floors.forEach((floor, floorIndex) => {
        const expectedDoorways = new Set(
          floor.topology?.doorways.map((doorway) => `${doorway.edgeIndex}:${doorway.roomId}`),
        );
        const actualDoors = new Set(
          handles.residentFloors[floorIndex]!.doors.map(
            (door) => `${String(door.root.userData.edgeIndex)}:${String(door.root.userData.roomId)}`,
          ),
        );
        expect(actualDoors).toEqual(expectedDoorways);
      });
      const wallCores: THREE.InstancedMesh[] = [];
      group.traverse((object) => {
        if (object instanceof THREE.InstancedMesh && object.name === "Wall core fill") {
          wallCores.push(object);
        }
      });
      expect(wallCores).toHaveLength(4);
      wallCores.forEach((core) => {
        core.geometry.computeBoundingBox();
        const size = core.geometry.boundingBox!.getSize(new THREE.Vector3());
        expect(size.x).toBeGreaterThanOrEqual(2.4);
        expect(size.z).toBeGreaterThanOrEqual(2.4);
      });
      const resolveRewards = handles.pickups.filter((pickup) => pickup.kind === "resolve");
      expect(resolveRewards.length).toBeGreaterThan(1);
      const chestRewards = new Set(handles.chests.map((chest) => chest.reward));
      const loosePickups = handles.pickups.filter((pickup) => !chestRewards.has(pickup));
      expect(loosePickups.length).toBeGreaterThan(0);
      expect(loosePickups.every((pickup) => pickup.autoCollect === false)).toBe(true);
      const rewardMeshes = resolveRewards.slice(0, 2).map((pickup) => {
        let found: THREE.Mesh | null = null;
        pickup.object.traverse((object) => {
          if (!found && object instanceof THREE.Mesh) found = object;
        });
        return found!;
      });
      expect(rewardMeshes[0]!.geometry).toBe(rewardMeshes[1]!.geometry);
      expect(rewardMeshes[0]!.material).toBe(rewardMeshes[1]!.material);
      setPickupOpacity(resolveRewards[0]!.object, 0.25);
      expect(rewardMeshes[0]!.material).not.toBe(rewardMeshes[1]!.material);
      expect((rewardMeshes[0]!.material as THREE.Material).opacity).toBe(0.25);
      expect((rewardMeshes[1]!.material as THREE.Material).opacity).not.toBe(0.25);
      expect(
        handles.doors.every(
          (door) => door.root.getObjectByName("Joined stone door frame") === undefined,
        ),
      ).toBe(true);
      handles.staircases.forEach((stair, floorIndex) => {
        expect(stair.direction).toBe("up");
        expect(stair.targetFloor).toBe(floorIndex + 1);
        expect(stair.root.position.y).toBe(0);
        expect(stair.root.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(
          floorSlabY(floorIndex),
          5,
        );
        expect(stair.root.userData.stepCount).toBe(STORY_STEP_COUNT);
        expect(stair.root.userData.walkable).toBe(true);
        expect(
          stair.root.children.filter((child) => child.name.includes("stair tread")),
        ).toHaveLength(1);
        expect(
          (
            stair.root.children.find((child) => child.name.includes("stair tread")) as
              | THREE.InstancedMesh
              | undefined
          )?.count,
        ).toBe(STORY_STEP_COUNT);
      });
      const firstTreadGeometry = handles.staircases[0]!.root.children.find((child) =>
        child.name.includes("stair tread"),
      ) as THREE.InstancedMesh;
      expect(
        handles.staircases
          .slice(1)
          .map(
            (stair) =>
              (
                stair.root.children.find((child) =>
                  child.name.includes("stair tread"),
                ) as THREE.InstancedMesh
              ).geometry,
          ),
      ).toEqual([firstTreadGeometry.geometry, firstTreadGeometry.geometry]);

      const sceneInternals = staticScene as unknown as {
        runtimeRewardTemplates: Map<string, THREE.Object3D>;
      };
      const templateMaterials = new Set<THREE.Material>();
      for (const template of sceneInternals.runtimeRewardTemplates.values()) {
        template.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => templateMaterials.add(material));
        });
      }
      expect(templateMaterials.size).toBeLessThanOrEqual(150);
      const luminousRewards = handles.pickups.filter((pickup) => pickup.kind === "luminous-ward");
      expect(luminousRewards.length).toBeGreaterThan(1);
      const luminousGlow = (pickup: (typeof luminousRewards)[number]) =>
        pickup.object.getObjectByName("Luminous ward pickup halo") as THREE.Mesh;
      const firstGlow = luminousGlow(luminousRewards[0]!);
      const secondGlow = luminousGlow(luminousRewards[1]!);
      expect(firstGlow.material).toBe(secondGlow.material);
      updateIdlePickupMotion(luminousRewards[0]!, {
        player: { x: 0, y: 1.5, z: 0 },
        elapsed: 1,
        delta: 0.016,
      });
      expect(firstGlow.material).not.toBe(secondGlow.material);

      staticScene.dispose();
    } finally {
      restoreDocument();
    }
  });

  test("owns canonical resident runtimes while aggregate handles keep the same references", () => {
    const restoreDocument = installCanvasDocument();
    const group = new THREE.Group();
    const staticScene = createScene(group);
    try {
      const floors = generateDungeonFloorSet(
        "RDL12-runtime-map-fixture",
        { roomTarget: 8 },
        4,
      ).floors;
      const handles = staticScene.buildStack(floors, getDungeonMood("ash"), 0.55);
      const runtimes = handles.residentFloors;
      const runtimeOwners = runtimes as unknown as readonly ResidentFloorRuntimeOwner[];
      const internals = staticScene as unknown as { floorRenderGroups: THREE.Group[] };
      expect(runtimes.map((runtime) => runtime.floorIndex)).toEqual([0, 1, 2, 3]);
      expect(new Set(runtimes).size).toBe(4);
      runtimes.forEach((runtime) => {
        expect(runtime.root.position.y).toBeCloseTo(floorSlabY(runtime.floorIndex), 5);
      });
      expect(runtimes.map((runtime) => runtime.root.children.length)).toEqual([225, 223, 210, 231]);
      expect(runtimes.map((runtime) => runtime.occupancy.diagnostics().occupiedCells)).toEqual([
        248, 259, 237, 266,
      ]);
      expect(runtimes.map((runtime) => runtime.occupancy.memoryBytes)).toEqual([
        5329, 5329, 5329, 5329,
      ]);
      expect(runtimes.map((runtime) => runtime.colliders.length)).toEqual([47, 178, 154, 216]);
      expect({
        doors: handles.doors.length,
        pickups: handles.pickups.length,
        chests: handles.chests.length,
        staircases: handles.staircases.length,
        fireEffects: handles.fireEffects.length,
        floorBiomeSprites: handles.floorBiomeSprites.length,
        ceilingBiomeSprites: handles.ceilingBiomeSprites.length,
        solidColliders: handles.solidColliders.length,
        stoneBeams: handles.stoneBeams.length,
        ambientBeams: handles.ambientBeams.length,
      }).toEqual({
        doors: 74,
        pickups: 96,
        chests: 56,
        staircases: 3,
        fireEffects: 35,
        floorBiomeSprites: 120,
        ceilingBiomeSprites: 128,
        solidColliders: 595,
        stoneBeams: 4,
        ambientBeams: 8,
      });
      expect(runtimes.map((runtime) => runtime.doors.length)).toEqual([20, 18, 14, 22]);
      expect(runtimes.map((runtime) => runtime.chests.length)).toEqual([13, 15, 14, 14]);
      expect(runtimes.map((runtime) => runtime.pickups.length)).toEqual([23, 25, 24, 24]);
      expect(runtimes.map((runtime) => runtime.staircases.length)).toEqual([1, 1, 1, 0]);
      expect(
        runtimes.every((runtime) =>
          runtime.pickups.every((pickup) => pickup.floorIndex === runtime.floorIndex),
        ),
      ).toBe(true);
      const pickupIds = handles.pickups.map((pickup) => pickup.id);
      expect(pickupIds.every((id) => typeof id === "string" && id.startsWith("floor:"))).toBe(true);
      expect(new Set(pickupIds).size).toBe(pickupIds.length);
      expect(
        new Set(runtimes.flatMap((runtime) => runtime.chests.map((chest) => chest.id))).size,
      ).toBe(handles.chests.length);
      expect(runtimes.map((runtime) => runtime.fires.length)).toEqual([8, 9, 9, 9]);
      expect(runtimes.map((runtime) => runtime.floorBiomeSprites.length)).toEqual([30, 30, 30, 30]);
      expect(runtimes.map((runtime) => runtime.ceilingBiomeSprites.length)).toEqual([
        32, 32, 32, 32,
      ]);
      expect(runtimes.map((runtime) => runtime.stoneBeams.length)).toEqual([1, 1, 1, 1]);
      expect(runtimes.map((runtime) => runtime.ambientBeams.length)).toEqual([2, 2, 2, 2]);
      expect(runtimes.map((runtime) => runtime.hazardCells.size)).toEqual([4, 4, 4, 4]);
      expect(runtimes.every((runtime) => runtime.hazardTileSystem !== null)).toBe(true);
      expect(runtimes.flatMap((runtime) => runtime.dynamicFireLights)).toHaveLength(
        MAX_DYNAMIC_FIRE_LIGHTS,
      );
      expect(handles.hazardTiles).not.toBeNull();
      expect(handles.liquidKit).toBeNull();

      const assertAggregateActorOwnership = <T>(
        aggregate: readonly T[],
        readRuntime: (runtime: (typeof runtimes)[number]) => readonly T[],
      ): void => {
        const seen = new Set<T>();
        let aggregateIndex = 0;
        for (const runtime of runtimes) {
          for (const actor of readRuntime(runtime)) {
            expect(aggregate[aggregateIndex]).toBe(actor);
            expect(seen.has(actor)).toBe(false);
            seen.add(actor);
            aggregateIndex += 1;
          }
        }
        expect(aggregateIndex).toBe(aggregate.length);
      };
      assertAggregateActorOwnership(handles.doors, (runtime) => runtime.doors);
      assertAggregateActorOwnership(handles.chests, (runtime) => runtime.chests);
      assertAggregateActorOwnership(handles.pickups, (runtime) => runtime.pickups);
      assertAggregateActorOwnership(handles.staircases, (runtime) => runtime.staircases);
      assertAggregateActorOwnership(handles.fireEffects, (runtime) => runtime.fires);
      assertAggregateActorOwnership(
        handles.floorBiomeSprites,
        (runtime) => runtime.floorBiomeSprites,
      );
      assertAggregateActorOwnership(
        handles.ceilingBiomeSprites,
        (runtime) => runtime.ceilingBiomeSprites,
      );
      assertAggregateActorOwnership(handles.stoneBeams, (runtime) => runtime.stoneBeams);
      assertAggregateActorOwnership(handles.ambientBeams, (runtime) => runtime.ambientBeams);
      runtimes.forEach((runtime) => {
        runtime.chests.forEach((chest) => {
          expect(runtime.pickups.includes(chest.reward)).toBe(true);
          expect(chest.runtimeBatch?.root).toBe(runtime.chestBatchRoots[0]);
        });
        runtime.doors.forEach((door) => {
          expect(door.runtimeBatch?.root).toBe(runtime.doorBatchRoots[0]);
        });
        for (const root of [...runtime.doorBatchRoots, ...runtime.chestBatchRoots]) {
          expect(root.userData.floorIndex).toBe(runtime.floorIndex);
          expect(root.position.toArray()).toEqual([0, 0, 0]);
          expect(root.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(
            floorSlabY(runtime.floorIndex),
            5,
          );
        }
        expect(runtime.wallFireBatchRoots).toHaveLength(1);
        for (const root of runtime.wallFireBatchRoots) {
          expect(root.parent).toBe(runtime.root);
          expect(root.userData.floorIndex).toBe(runtime.floorIndex);
          expect(root.position.toArray()).toEqual([0, 0, 0]);
          expect(root.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(
            floorSlabY(runtime.floorIndex),
            5,
          );
        }
        runtime.dynamicFireLights.forEach((light) => expect(light.parent).toBe(runtime.root));
      });

      group.updateMatrixWorld(true);
      const upperFloor = runtimes[1]!;
      const upperDoor = handles.doors.find(
        (door) => residentFloorIndex(door.root, runtimes) === upperFloor.floorIndex,
      )!;
      const upperChest = handles.chests.find(
        (chest) => residentFloorIndex(chest.root, runtimes) === upperFloor.floorIndex,
      )!;
      const upperStone = handles.pickups.find(
        (pickup) =>
          pickup.kind === "stone" &&
          residentFloorIndex(pickup.object, runtimes) === upperFloor.floorIndex,
      )!;
      const upperFire = handles.fireEffects.find(
        (fire) => residentFloorIndex(fire.root, runtimes) === upperFloor.floorIndex,
      )!;
      const upperFloorBatch = upperFloor.root.children.find(
        (child) => child instanceof THREE.InstancedMesh && child.name === "corridor room floor",
      ) as THREE.InstancedMesh;
      const upperStair = handles.staircases.find(
        (stair) => residentFloorIndex(stair.root, runtimes) === upperFloor.floorIndex,
      )!;
      const upperWorldY = floorSlabY(upperFloor.floorIndex);

      // Every representative actor stays authored in resident-local coordinates.
      expect(upperDoor.root.position.y).toBe(0);
      expect(upperChest.root.position.y).toBe(0);
      expect(upperChest.reward.object.position.y).toBeCloseTo(upperChest.reward.baseY - 0.34, 5);
      expect(upperStone.object.position.y).toBe(0);
      expect(upperFire.root.position.y).toBeCloseTo(1.42, 5);
      expect(upperStair.root.position.y).toBe(0);
      const localFloorMatrix = new THREE.Matrix4();
      upperFloorBatch.getMatrixAt(0, localFloorMatrix);
      expect(localFloorMatrix.elements[13]).toBeCloseTo(-0.05, 5);

      // Their renderer-facing world transforms apply exactly one resident slab.
      expect(upperDoor.root.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(upperWorldY, 5);
      expect(upperChest.root.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(upperWorldY, 5);
      expect(upperStone.object.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(upperWorldY, 5);
      expect(upperFire.root.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(
        upperWorldY + 1.42,
        5,
      );
      expect(upperChest.reward.object.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(
        upperWorldY + upperChest.reward.baseY - 0.34,
        5,
      );
      expect(upperStair.root.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(upperWorldY, 5);

      const upperFloorWorldMatrix = new THREE.Matrix4().multiplyMatrices(
        upperFloorBatch.matrixWorld,
        localFloorMatrix,
      );
      expect(upperFloorWorldMatrix.elements[13]).toBeCloseTo(upperWorldY - 0.05, 5);
      expect(
        fnv1a(
          JSON.stringify(
            [
              upperDoor.root.matrixWorld,
              upperChest.root.matrixWorld,
              upperChest.reward.object.matrixWorld,
              upperStone.object.matrixWorld,
              upperFire.root.matrixWorld,
              upperFloorWorldMatrix,
              upperStair.root.matrixWorld,
            ].map((matrix) => matrix.elements.map(rounded3)),
          ),
        ),
      ).toBe("a10d8d4a");
      expect(colliderFingerprint(handles.solidColliders)).toBe("6ce51b43");
      expect(
        runtimes.map((runtime) => instancedWorldFingerprint(runtime.doorBatchRoots[0]!)),
      ).toEqual(["a52de80e", "70235d79", "14193e10", "3d075624"]);
      expect(
        runtimes.map((runtime) => instancedWorldFingerprint(runtime.chestBatchRoots[0]!)),
      ).toEqual(["e90ecee7", "16060f91", "f46929cc", "cfeeb5a1"]);
      expect(
        runtimes.map((runtime) => runtime.doorBatchRoots[0]!.userData.runtimeBatching),
      ).toEqual([
        { doors: 20, sourceMeshes: 100, batches: 5 },
        { doors: 18, sourceMeshes: 90, batches: 5 },
        { doors: 14, sourceMeshes: 70, batches: 5 },
        { doors: 22, sourceMeshes: 110, batches: 5 },
      ]);
      expect(
        runtimes.map((runtime) => runtime.chestBatchRoots[0]!.userData.runtimeBatching),
      ).toEqual([
        { instances: 13, sourceMeshes: 65, bodyBatches: 3, lidBatches: 2 },
        { instances: 15, sourceMeshes: 75, bodyBatches: 3, lidBatches: 2 },
        { instances: 14, sourceMeshes: 70, bodyBatches: 3, lidBatches: 2 },
        { instances: 14, sourceMeshes: 70, bodyBatches: 3, lidBatches: 2 },
      ]);
      let residentInteractiveDrawCalls = 0;
      runtimes.forEach((runtime) => {
        runtime.doorBatchRoots.forEach((root) => {
          root.traverse((object) => {
            if (!(object instanceof THREE.InstancedMesh)) return;
            residentInteractiveDrawCalls += 1;
            expect(object.count).toBe(runtime.doors.length);
          });
        });
        runtime.chestBatchRoots.forEach((root) => {
          root.traverse((object) => {
            if (!(object instanceof THREE.InstancedMesh)) return;
            residentInteractiveDrawCalls += 1;
            expect(object.count).toBe(runtime.chests.length);
          });
        });
      });
      // Each floor owns five dynamic/static door batches and five chest batches.
      expect(residentInteractiveDrawCalls).toBe(40);
      expect(residentInteractiveDrawCalls).toBeLessThanOrEqual(40);
      const upperChestLidBatch = upperFloor.chestBatchRoots[0]!.getObjectByName(
        "Runtime chest lid batch 1",
      ) as THREE.InstancedMesh;
      const upperChestIndex = upperFloor.chests.indexOf(upperChest);
      const closedLidMatrix = new THREE.Matrix4();
      const openLidMatrix = new THREE.Matrix4();
      upperChestLidBatch.getMatrixAt(upperChestIndex, closedLidMatrix);
      upperChest.lid.rotation.x = -1.18;
      upperChest.runtimeBatch?.updateLidMatrix();
      upperChestLidBatch.getMatrixAt(upperChestIndex, openLidMatrix);
      expect(openLidMatrix.equals(closedLidMatrix)).toBe(false);
      expect(upperChest.root.getObjectByName("Chest loot socket")).toBeDefined();
      expect(upperDoor.left.parent).toBe(upperDoor.root);
      expect(group.getObjectByName("Runtime wall-fire global batches")).toBeUndefined();
      expect(
        handles.fireEffects
          .filter((fire) => fire.runtimeFixture)
          .every((fire) => residentFloorIndex(fire.root, runtimes) !== null),
      ).toBe(true);

      runtimes.forEach((runtime, index) => {
        expect(staticScene.getResidentFloorRuntime(runtime.floorIndex)).toBe(runtime);
        expect(internals.floorRenderGroups[index]).toBe(runtime.root);
        expect(handles.floorOccupancyGrids[index]).toBe(runtime.occupancy);
      });
      let aggregateIndex = 0;
      for (const runtime of runtimes) {
        for (const collider of runtime.colliders) {
          expect(handles.solidColliders[aggregateIndex]).toBe(collider);
          aggregateIndex += 1;
        }
      }
      expect(aggregateIndex).toBe(handles.solidColliders.length);

      const beforeSwitch: THREE.Object3D[] = [];
      group.traverse((object) => beforeSwitch.push(object));
      const beforeSwitchLength = beforeSwitch.length;
      expect(beforeSwitchLength).toBeGreaterThan(0);
      const objectPrototype = THREE.Object3D.prototype;
      const matrixPrototype = THREE.Matrix4.prototype;
      const originalAdd = objectPrototype.add;
      const originalRemove = objectPrototype.remove;
      const originalUpdateMatrix = objectPrototype.updateMatrix;
      const originalCompose = matrixPrototype.compose;
      let addCalls = 0;
      let removeCalls = 0;
      let updateMatrixCalls = 0;
      let composeCalls = 0;
      objectPrototype.add = function (
        this: THREE.Object3D,
        ...objects: THREE.Object3D[]
      ): THREE.Object3D {
        addCalls += 1;
        return originalAdd.apply(this, objects);
      };
      objectPrototype.remove = function (
        this: THREE.Object3D,
        ...objects: THREE.Object3D[]
      ): THREE.Object3D {
        removeCalls += 1;
        return originalRemove.apply(this, objects);
      };
      objectPrototype.updateMatrix = function (this: THREE.Object3D): void {
        updateMatrixCalls += 1;
        originalUpdateMatrix.call(this);
      };
      matrixPrototype.compose = function (
        this: THREE.Matrix4,
        position: THREE.Vector3,
        quaternion: THREE.Quaternion,
        scale: THREE.Vector3,
      ): THREE.Matrix4 {
        composeCalls += 1;
        return originalCompose.call(this, position, quaternion, scale);
      };
      try {
        staticScene.setActiveFloor(2);
      } finally {
        objectPrototype.add = originalAdd;
        objectPrototype.remove = originalRemove;
        objectPrototype.updateMatrix = originalUpdateMatrix;
        matrixPrototype.compose = originalCompose;
      }
      expect(runtimes.map((runtime) => runtime.root.visible)).toEqual([false, true, true, true]);
      expect({ addCalls, removeCalls, updateMatrixCalls, composeCalls }).toEqual({
        addCalls: 0,
        removeCalls: 0,
        updateMatrixCalls: 0,
        composeCalls: 0,
      });
      const afterSwitch: THREE.Object3D[] = [];
      group.traverse((object) => afterSwitch.push(object));
      expect(afterSwitch).toHaveLength(beforeSwitchLength);
      afterSwitch.forEach((object, index) => expect(object).toBe(beforeSwitch[index]));

      const disposeCalls = new Map(runtimeOwners.map((runtime) => [runtime, 0]));
      runtimeOwners.forEach((runtime) => {
        const dispose = runtime.dispose.bind(runtime);
        runtime.dispose = (resourceDisposer) => {
          disposeCalls.set(runtime, (disposeCalls.get(runtime) ?? 0) + 1);
          dispose(resourceDisposer);
        };
      });
      staticScene.clear();
      expect(staticScene.residentPlan).toBeNull();
      expect(staticScene.residentRenderReceipt).toBeNull();
      expect([...disposeCalls.values()]).toEqual([1, 1, 1, 1]);
      expect(handles.residentFloors).toHaveLength(0);
      expect(handles.floorOccupancyGrids).toHaveLength(0);
      expect(handles.solidColliders).toHaveLength(0);
      runtimeOwners.forEach((runtime) => {
        expect(runtime.doors).toHaveLength(0);
        expect(runtime.chests).toHaveLength(0);
        expect(runtime.pickups).toHaveLength(0);
        expect(runtime.staircases).toHaveLength(0);
        expect(runtime.doorBatchRoots).toHaveLength(0);
        expect(runtime.chestBatchRoots).toHaveLength(0);
      });
      staticScene.dispose();
      expect([...disposeCalls.values()]).toEqual([1, 1, 1, 1]);
    } finally {
      staticScene.dispose();
      restoreDocument();
    }
  });

  test("keeps a metadata-bearing isolated build at local Y zero", () => {
    const restoreDocument = installCanvasDocument();
    const group = new THREE.Group();
    const staticScene = createScene(group);
    try {
      const floor = generateDungeonFloorSet("RDL12-isolated-floor-parity", { roomTarget: 8 }, 4)
        .floors[2]!;
      const handles = staticScene.build(floor, getDungeonMood("ash"), 0.55);

      expect(handles.residentFloors).toHaveLength(1);
      expect(handles.residentFloors[0]!.floorIndex).toBe(2);
      expect(handles.residentFloors[0]!.root.position.y).toBe(0);
      expect(handles.residentFloors[0]!.root.getWorldPosition(new THREE.Vector3()).y).toBe(0);
    } finally {
      staticScene.dispose();
      restoreDocument();
    }
  });

  test("rejects noncanonical resident stacks before it clears a valid scene", () => {
    const restoreDocument = installCanvasDocument();
    const group = new THREE.Group();
    const staticScene = createScene(group);
    try {
      const floors = generateDungeonFloorSet(
        "RDL12-canonical-validation",
        { roomTarget: 8 },
        4,
      ).floors;
      const handles = staticScene.buildStack(floors, getDungeonMood("ash"), 0.55);
      const roots = [...group.children];
      const invalidStacks: Array<{ floors: readonly DungeonData[]; message: string }> = [
        {
          floors: floors.map((floor, index) =>
            index === 2 ? withFloorMetadata(floor, { index: 1, number: 2 }) : floor,
          ),
          message: "ordered contiguous floor indices 0..3; received [0, 1, 1, 3]",
        },
        {
          floors: floors.map((floor, index) =>
            index === 2
              ? withFloorMetadata(floor, { index: 3, number: 4 })
              : index === 3
                ? withFloorMetadata(floor, { index: 4, number: 5 })
                : floor,
          ),
          message: "ordered contiguous floor indices 0..3; received [0, 1, 3, 4]",
        },
        {
          floors: [floors[0]!, floors[2]!, floors[1]!, floors[3]!],
          message: "ordered contiguous floor indices 0..3; received [0, 2, 1, 3]",
        },
        {
          floors: floors.map((floor, index) =>
            index === 1 ? withFloorMetadata(floor, { number: 9 }) : floor,
          ),
          message: "requires floor number 2 for floor index 1",
        },
      ];

      for (const invalid of invalidStacks) {
        expect(() => staticScene.buildStack(invalid.floors, getDungeonMood("ash"), 0.55)).toThrow(
          invalid.message,
        );
        expect(staticScene.currentHandles).toBe(handles);
        expect(group.children).toHaveLength(roots.length);
        group.children.forEach((root, index) => expect(root).toBe(roots[index]));
        handles.residentFloors.forEach((runtime, index) => {
          expect(staticScene.getResidentFloorRuntime(index)).toBe(runtime);
        });
      }
    } finally {
      staticScene.dispose();
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
      const biomeSpriteNodes: THREE.Object3D[] = [];
      group.traverse((object) => {
        if (object.userData.biomeSpriteProp) biomeSpriteNodes.push(object);
      });
      expect(classic.floorBiomeSprites.length).toBeGreaterThan(0);
      expect(biomeSpriteNodes.length).toBeGreaterThan(0);
      expect(biomeSpriteNodes.some((object) => object.name.includes("wall-mounted batch"))).toBe(
        true,
      );
      expect(staticScene.stats).toMatchObject({
        floorTiles: 564,
        wallTiles: 459,
        ceilingTiles: 564,
        hazardTiles: 4,
        pickups: 26,
        beams: 7,
        lights: 12,
        props: 320,
      });
      expect(classic.ambientBeams).toHaveLength(2);
      expect(group.getObjectByName("Ambient godray 1")).toBeDefined();
      const ambientMaterial = classic.ambientBeams[0]!.material as THREE.ShaderMaterial;
      expect(ambientMaterial.blending).toBe(THREE.NormalBlending);
      expect(ambientMaterial.fog).toBe(true);
      expect(ambientMaterial.toneMapped).toBe(true);
      expect(classic.ambientBeams[0]!.userData.screenSpace).toBe(false);
      expect(classic.ambientBeams[0]!.userData.profile).toBe("retro-crossed-strata");
      expect(classic.ambientBeams[0]!.geometry.userData.closedVolume).toBe(false);
      expect(classic.ambientBeams[0]!.geometry.userData.triangles).toBe(36);
      expect(ambientMaterial.fragmentShader).toContain("#include <tonemapping_fragment>");
      expect(ambientMaterial.fragmentShader).toContain("#include <colorspace_fragment>");
      expect(classic.portalBeam?.userData.profile).toBe("signal-smooth");
      expect(classic.stoneBeams.every((beam) => beam.userData.profile === "objective-strata")).toBe(
        true,
      );
      expect(classic.solidCells.size).toBe(27);
      expect(classic.solidColliders).toHaveLength(27);
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
        pickups: 14,
        beams: 7,
        lights: 12,
        props: 259,
      });
      expect(backrooms.solidCells.size).toBe(43);
      expect(backrooms.solidColliders).toHaveLength(43);
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

  test("releases a pending classic source after a partial build failure", () => {
    const restoreDocument = installCanvasDocument();
    const staticScene = createScene(new THREE.Group());
    const source = primeWeaponRackSource(staticScene);
    const dungeon = generateDungeon("a5-static-classic", { roomTarget: 8 });
    const invalid = { ...dungeon, exit: { x: -1, y: -1 } };
    try {
      expect(() => staticScene.build(invalid, getDungeonMood("ash"), 0.6)).toThrow(
        "reachable exit portal seat",
      );
      expect(source.disposalCounts()).toEqual(source.geometries.map(() => 0));
      staticScene.dispose();
      staticScene.dispose();
      expect(source.disposalCounts()).toEqual(source.geometries.map(() => 1));
    } finally {
      staticScene.dispose();
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
        pickups: 26,
        beams: 7,
        lights: 12,
        props: 320,
        reserveEnemies: 20,
      });
      expect(world.getSolidCells()).toHaveLength(27);
      expect(world.getSolidColliders()).toHaveLength(27);
    } finally {
      world.dispose();
      restoreDocument();
    }
  });

  test("keeps weapon-rack geometry resident across rebuilds and releases it with the world", () => {
    const restoreDocument = installCanvasDocument();
    const scene = new THREE.Scene();
    const world = new DungeonWorld(scene);
    const dungeon = generateDungeon("a5-static-classic", { roomTarget: 8 });
    const staticScene = (world as unknown as { staticScene: StaticDungeonScene }).staticScene;
    const source = primeWeaponRackSource(staticScene);
    try {
      world.setDungeon(dungeon, getDungeonMood("ash"));
      expect(source.geometries.length).toBeGreaterThan(0);
      expect(source.disposalCounts()).toEqual(source.geometries.map(() => 1));
      const first = collectWeaponRackBatches(scene);
      expect(first.length).toBeGreaterThan(0);
      const firstColliders = world.getSolidColliders();
      const firstSnapshots = first.map((batch) => ({
        name: batch.name,
        geometry: batch.geometry,
        material: batch.material,
        count: batch.count,
        castShadow: batch.castShadow,
        receiveShadow: batch.receiveShadow,
        matrices: instanceMatrices(batch),
        bounds: batch.boundingBox?.clone(),
        sphere: batch.boundingSphere?.clone(),
      }));
      const geometryDisposals = new Map<THREE.BufferGeometry, number>();
      for (const { geometry } of firstSnapshots) {
        geometryDisposals.set(geometry, 0);
        geometry.addEventListener("dispose", () => {
          geometryDisposals.set(geometry, (geometryDisposals.get(geometry) ?? 0) + 1);
        });
      }
      expect(firstSnapshots.every(({ bounds, sphere }) => bounds && sphere)).toBe(true);
      clearStaticPropTemplateBatchCache();
      expect([...geometryDisposals.values()]).toEqual(first.map(() => 0));

      world.setDungeon(dungeon, getDungeonMood("ash"));
      expect(source.disposalCounts()).toEqual(source.geometries.map(() => 1));
      const second = collectWeaponRackBatches(scene);
      expect(second.map((batch) => batch.name)).toEqual(firstSnapshots.map(({ name }) => name));
      expect(world.getSolidColliders()).toEqual(firstColliders);
      second.forEach((batch, index) => {
        const before = firstSnapshots[index]!;
        expect(batch.geometry).toBe(before.geometry);
        expect(batch.material).toBe(before.material);
        expect(batch.count).toBe(before.count);
        expect(batch.castShadow).toBe(before.castShadow);
        expect(batch.receiveShadow).toBe(before.receiveShadow);
        expect(instanceMatrices(batch)).toEqual(before.matrices);
        expect(batch.boundingBox?.min.toArray()).toEqual(before.bounds?.min.toArray());
        expect(batch.boundingBox?.max.toArray()).toEqual(before.bounds?.max.toArray());
        expect(batch.boundingSphere?.center.toArray()).toEqual(before.sphere?.center.toArray());
        expect(batch.boundingSphere?.radius).toBe(before.sphere?.radius);
      });
      expect([...geometryDisposals.values()]).toEqual(first.map(() => 0));
      (world as unknown as { clear(): void }).clear();
      expect(source.disposalCounts()).toEqual(source.geometries.map(() => 1));
      expect([...geometryDisposals.values()]).toEqual(first.map(() => 0));

      world.dispose();
      world.dispose();
      expect(source.disposalCounts()).toEqual(source.geometries.map(() => 1));
      expect([...geometryDisposals.values()]).toEqual(first.map(() => 1));
    } finally {
      world.dispose();
      restoreDocument();
    }
  });
});
