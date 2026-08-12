import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { hashSeed } from "../src/core/random";
import { generateDungeonFloorSet } from "../src/dungeon/generateDungeonFloors";
import { importDungeonForge } from "../src/dungeon/importDungeonForge";
import type { DungeonData } from "../src/dungeon/types";
import { generateForgeDungeon } from "../src/forge/generateForgeDungeon";
import { getDungeonMood } from "../src/systems/DungeonMood";
import { DYNAMIC_FIRE_LIGHTS_PER_FLOOR, MAX_DYNAMIC_FIRE_LIGHTS } from "../src/systems/LightTuning";
import { SceneTextureRegistry, type SceneTextureSink } from "../src/systems/SceneTextureRegistry";
import type { MinimapFeatures } from "../src/ui/minimapFeatures";
import { DungeonWorld } from "../src/world/DungeonWorld";
import type { HazardSurfaceEffect } from "../src/world/HazardTileSystem";
import type { ResidentFloorRuntime } from "../src/world/ResidentFloorRuntime";

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

function activeRuntime(world: DungeonWorld): ResidentFloorRuntime {
  const runtime = world.getActiveFloorRuntime();
  if (!runtime) throw new Error("Expected an active resident floor runtime.");
  return runtime;
}

function sunkenFloorStack(): DungeonData[] {
  const rootSeed = "RDL14-sunken-resident-stack";
  return Array.from({ length: 4 }, (_, index) => {
    const dungeon = importDungeonForge(
      generateForgeDungeon({
        seed: hashSeed(`${rootSeed}:${index}`),
        roomCount: 9,
        loopChance: 0.28,
        decorDensity: 0.7,
        themeKey: "sunken",
      }),
    );
    return {
      ...dungeon,
      floor: {
        index,
        number: index + 1,
        count: 4,
        rootSeed,
        stairs: [],
        openVerticalCells: [],
      },
    };
  });
}

function scriptedSurfaceEffect(label: string): HazardSurfaceEffect {
  return {
    kind: "fire",
    label,
    damage: 1,
    movementScale: 1,
    traction: 1,
  };
}

const MINIMAP_SINGLETONS = [
  "timeFreeze",
  "luminousWard",
  "annihilationPulse",
  "cullBrand",
  "phoenixEgg",
  "map",
  "mobility",
  "clarity",
  "swarmCurse",
  "slowCurse",
  "frenzyCurse",
  "gloomCurse",
  "mirrorCurse",
  "spinCurse",
] as const;

function rounded(value: number): number {
  const result = Math.round(value * 1_000_000) / 1_000_000;
  return Object.is(result, -0) ? 0 : result;
}

function vectorSignature(vector: THREE.Vector3Like): readonly number[] {
  return [rounded(vector.x), rounded(vector.y), rounded(vector.z)];
}

function quaternionSignature(quaternion: THREE.QuaternionLike): readonly number[] {
  return [
    rounded(quaternion.x),
    rounded(quaternion.y),
    rounded(quaternion.z),
    rounded(quaternion.w),
  ];
}

function objectTransformSignature(object: THREE.Object3D, slabY: number): object {
  object.updateWorldMatrix(true, false);
  const worldPosition = object.getWorldPosition(new THREE.Vector3());
  const worldQuaternion = object.getWorldQuaternion(new THREE.Quaternion());
  const worldScale = object.getWorldScale(new THREE.Vector3());
  return {
    local: {
      position: vectorSignature(object.position),
      quaternion: quaternionSignature(object.quaternion),
      scale: vectorSignature(object.scale),
    },
    world: {
      position: [
        rounded(worldPosition.x),
        rounded(worldPosition.y - slabY),
        rounded(worldPosition.z),
      ],
      quaternion: quaternionSignature(worldQuaternion),
      scale: vectorSignature(worldScale),
    },
  };
}

function materialSignature(material: THREE.Material): object {
  const textured = material as THREE.Material & {
    map?: THREE.Texture | null;
    emissiveMap?: THREE.Texture | null;
  };
  const textureSignature = (texture: THREE.Texture | null | undefined) =>
    texture
      ? {
          name: texture.name,
          repeat: vectorSignature({ x: texture.repeat.x, y: texture.repeat.y, z: 0 }),
          offset: vectorSignature({ x: texture.offset.x, y: texture.offset.y, z: 0 }),
        }
      : null;
  return {
    kind: material.type,
    name: material.name,
    map: textureSignature(textured.map),
    emissiveMap: textureSignature(textured.emissiveMap),
  };
}

function meshSignature(mesh: THREE.Mesh, slabY: number): object {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return {
    name: mesh.name,
    type: mesh.type,
    instances: mesh instanceof THREE.InstancedMesh ? mesh.count : null,
    positionAttributeCount: mesh.geometry.getAttribute("position")?.count ?? 0,
    sectionCount: mesh.geometry.groups.length,
    transform: objectTransformSignature(mesh, slabY),
    materials: materials.map(materialSignature),
  };
}

function cellSignature(cell: { x: number; y: number } | undefined): string | null {
  return cell ? `${cell.x},${cell.y}` : null;
}

function staticMinimapSignature(features: MinimapFeatures): object {
  // RDL-15 owns the dynamic enemy overlay. This RDL-14 floor contract checks
  // only the cached static projection and intentionally does not read enemies.
  return {
    doors: features.doors.map(cellSignature),
    fires: features.fires.map(cellSignature),
    hazards: (features.hazards ?? []).map(cellSignature),
    stones: features.stones.map((stone) => ({
      cell: cellSignature(stone.cell),
      collected: stone.collected,
      id: stone.id,
    })),
    pickups: features.pickups.map(cellSignature),
    stairs: features.stairs?.map((stair) => ({
      cell: cellSignature(stair.cell),
      direction: stair.direction,
    })),
    relic: cellSignature(features.relic),
    spawn: cellSignature(features.spawn),
    singletons: Object.fromEntries(
      MINIMAP_SINGLETONS.map((key) => [key, cellSignature(features[key])]),
    ),
  };
}

function residentFloorContract(runtime: ResidentFloorRuntime): object {
  const liquid = runtime.liquidKit;
  const hazards = runtime.hazardTileSystem;
  if (!liquid || !hazards || !runtime.minimapProjection) {
    throw new Error(
      "Sunken resident-floor contract requires liquid, hazards, and a minimap projection.",
    );
  }
  runtime.root.updateMatrixWorld(true);
  const slabY = runtime.root.getWorldPosition(new THREE.Vector3()).y;
  const hazardKinds = ["fire", "ice", "toxin", "spikes"] as const;
  return {
    liquid: {
      stats: liquid.stats,
      sectionCounts: {
        surfaces: liquid.surfaces.length,
        rootChildren: liquid.root.children.length,
      },
      surfaces: liquid.surfaces.map((surface) => ({
        kind: surface.kind,
        mesh: meshSignature(surface.mesh, slabY),
        material: materialSignature(surface.material),
      })),
    },
    hazards: {
      cells: [...runtime.hazardCells].sort(),
      placements: hazards.placements.map((placement) => ({
        kind: placement.kind,
        cell: cellSignature(placement.cell),
        phase: rounded(placement.phase),
      })),
      masks: Object.fromEntries(
        hazardKinds.map((kind) => [
          kind,
          hazards.placements
            .filter((placement) => placement.kind === kind)
            .map((placement) => cellSignature(placement.cell)),
        ]),
      ),
      systemStats: {
        rootChildren: hazards.root.children.length,
        batches: hazards.root.children.map((child) =>
          child instanceof THREE.Mesh
            ? meshSignature(child, slabY)
            : {
                name: child.name,
                type: child.type,
                childCount: child.children.length,
                transform: objectTransformSignature(child, slabY),
              },
        ),
      },
    },
    effects: {
      fires: runtime.fires.map((fire) => ({
        root: objectTransformSignature(fire.root, slabY),
        flame: meshSignature(fire.flame, slabY),
        flameDetails: fire.flameDetails.map((detail) => ({
          name: detail.name,
          transform: objectTransformSignature(detail, slabY),
        })),
        // The capped practical light owns its optional halo cards. Those vary
        // by stack allocation and are covered by the separate global cap test.
        base: {
          intensity: rounded(fire.baseIntensity),
          y: rounded(fire.baseY),
          scaleY: rounded(fire.baseFlameScaleY),
          cutoffDistance: rounded(fire.cutoffDistance),
          phase: rounded(fire.phase),
          audio: Boolean(fire.audio),
        },
      })),
      floorSprites: runtime.floorBiomeSprites.map((sprite) => ({
        x: rounded(sprite.x),
        z: rounded(sprite.z),
        yaw: rounded(sprite.baseYaw),
        opacity: rounded(sprite.baseOpacity),
        placement: sprite.placement,
        mesh: meshSignature(sprite.mesh, slabY),
      })),
      ambientBeams: runtime.ambientBeams.map((beam) => meshSignature(beam, slabY)),
      stoneBeams: runtime.stoneBeams.map((beam) => meshSignature(beam, slabY)),
    },
    minimap: staticMinimapSignature(runtime.minimapProjection.features),
  };
}

function residentContractCounts(contract: ReturnType<typeof residentFloorContract>): object {
  const value = contract as {
    liquid: { stats: object; sectionCounts: object };
    hazards: { cells: unknown[]; placements: unknown[]; systemStats: { rootChildren: number } };
    effects: {
      fires: unknown[];
      floorSprites: unknown[];
      ambientBeams: unknown[];
      stoneBeams: unknown[];
    };
    minimap: {
      doors: unknown[];
      fires: unknown[];
      hazards: unknown[];
      stones: unknown[];
      pickups: unknown[];
    };
  };
  return {
    liquid: {
      stats: value.liquid.stats,
      sectionCounts: value.liquid.sectionCounts,
    },
    hazards: {
      cells: value.hazards.cells.length,
      placements: value.hazards.placements.length,
      batches: value.hazards.systemStats.rootChildren,
    },
    effects: {
      fires: value.effects.fires.length,
      floorSprites: value.effects.floorSprites.length,
      ambientBeams: value.effects.ambientBeams.length,
      stoneBeams: value.effects.stoneBeams.length,
    },
    minimap: {
      doors: value.minimap.doors.length,
      fires: value.minimap.fires.length,
      hazards: value.minimap.hazards.length,
      stones: value.minimap.stones.length,
      pickups: value.minimap.pickups.length,
    },
  };
}

function fingerprint(value: object): string {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function residentRuntimeTextures(runtime: ResidentFloorRuntime): Set<THREE.Texture> {
  const textures = new Set<THREE.Texture>();
  for (const surface of runtime.liquidKit?.surfaces ?? []) {
    if (surface.material.map) textures.add(surface.material.map);
  }
  runtime.hazardTileSystem?.root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  return textures;
}

interface TextureLifecycleRecord {
  register: number;
  unregister: number;
  dispose: number;
}

class TrackingTextureSink implements SceneTextureSink {
  readonly registry = new SceneTextureRegistry(true);
  private readonly records = new Map<THREE.Texture, TextureLifecycleRecord>();

  register<T extends THREE.Texture>(texture: T): T {
    this.record(texture).register += 1;
    this.registry.register(texture);
    return texture;
  }

  registerClone<T extends THREE.Texture>(source: THREE.Texture, texture: T): T {
    this.record(source).register += 1;
    this.record(texture).register += 1;
    this.registry.registerClone(source, texture);
    return texture;
  }

  markRenderable(texture: THREE.Texture): boolean {
    return this.registry.markRenderable(texture);
  }

  unregister(texture: THREE.Texture): boolean {
    this.record(texture).unregister += 1;
    return this.registry.unregister(texture);
  }

  lifecycle(texture: THREE.Texture): Readonly<TextureLifecycleRecord> {
    return this.record(texture);
  }

  private record(texture: THREE.Texture): TextureLifecycleRecord {
    const existing = this.records.get(texture);
    if (existing) return existing;
    const next = { register: 0, unregister: 0, dispose: 0 };
    texture.addEventListener("dispose", () => {
      next.dispose += 1;
    });
    this.records.set(texture, next);
    return next;
  }
}

interface DungeonWorldInternals {
  clear(): void;
  assets: {
    wall: THREE.Texture;
    floor: THREE.Texture;
    ceiling: THREE.Texture;
  };
  staticScene: {
    cacheResidentMinimapProjection(dungeon: DungeonData, runtime: ResidentFloorRuntime): void;
  };
}

function internalsOf(world: DungeonWorld): DungeonWorldInternals {
  return world as unknown as DungeonWorldInternals;
}

const SUNKEN_ISOLATED_COUNTS: readonly object[] = [
  {
    liquid: {
      stats: { sections: 27, cells: 27, boundaryEdges: 108 },
      sectionCounts: { surfaces: 27, rootChildren: 28 },
    },
    hazards: { cells: 4, placements: 4, batches: 2 },
    effects: { fires: 40, floorSprites: 0, ambientBeams: 2, stoneBeams: 1 },
    minimap: { doors: 4, fires: 40, hazards: 4, stones: 1, pickups: 0 },
  },
  {
    liquid: {
      stats: { sections: 30, cells: 123, boundaryEdges: 168 },
      sectionCounts: { surfaces: 30, rootChildren: 32 },
    },
    hazards: { cells: 4, placements: 4, batches: 2 },
    effects: { fires: 45, floorSprites: 0, ambientBeams: 2, stoneBeams: 1 },
    minimap: { doors: 4, fires: 45, hazards: 4, stones: 1, pickups: 0 },
  },
  {
    liquid: {
      stats: { sections: 26, cells: 88, boundaryEdges: 132 },
      sectionCounts: { surfaces: 26, rootChildren: 28 },
    },
    hazards: { cells: 4, placements: 4, batches: 2 },
    effects: { fires: 39, floorSprites: 0, ambientBeams: 2, stoneBeams: 1 },
    minimap: { doors: 5, fires: 39, hazards: 4, stones: 1, pickups: 0 },
  },
  {
    liquid: {
      stats: { sections: 25, cells: 101, boundaryEdges: 136 },
      sectionCounts: { surfaces: 25, rootChildren: 27 },
    },
    hazards: { cells: 4, placements: 4, batches: 2 },
    effects: { fires: 41, floorSprites: 0, ambientBeams: 2, stoneBeams: 1 },
    minimap: { doors: 4, fires: 41, hazards: 4, stones: 1, pickups: 0 },
  },
];
const SUNKEN_ISOLATED_FINGERPRINTS: readonly string[] = [
  "4eed0362",
  "b07c6654",
  "23a3ae5b",
  "46da6a8c",
];

describe("resident floor effects, hazards, and minimap projections", () => {
  test("updates only the active slab and swaps its cached minimap layer without rebuilding", () => {
    const restoreDocument = installCanvasDocument();
    const world = new DungeonWorld(new THREE.Scene());
    try {
      const floorSet = generateDungeonFloorSet("RDL14-effects-active-only", { roomTarget: 8 }, 4);
      world.setDungeon(floorSet.floors[0]!, getDungeonMood("ash"), { stack: floorSet.floors });

      const runtimes = floorSet.floors.map((floor) => {
        world.rebindActiveDungeon(floor);
        return activeRuntime(world);
      });
      expect(new Set(runtimes).size).toBe(4);
      expect(runtimes.every((runtime) => runtime.hazardTileSystem !== null)).toBe(true);
      expect(runtimes.every((runtime) => runtime.minimapProjection !== null)).toBe(true);
      expect(runtimes.every((runtime) => runtime.uncannyWallRuntime !== null)).toBe(true);
      expect(
        runtimes.every((runtime) => runtime.hazardTileSystem?.root.parent === runtime.detailRoot),
      ).toBe(true);

      world.rebindActiveDungeon(floorSet.floors[0]!);
      const features0 = world.getMinimapFeatures();
      const stable0 = {
        doors: features0.doors,
        fires: features0.fires,
        hazards: features0.hazards,
        stones: features0.stones,
      };
      expect(features0).toBe(runtimes[0]!.minimapProjection!.features);

      const systems = runtimes.map((runtime) => runtime.hazardTileSystem!);
      const originalSamples = systems.map((system) => system.sample.bind(system));
      const originalUpdates = systems.map((system) => system.update.bind(system));
      const sampleCalls = [0, 0, 0, 0];
      const updateCalls = [0, 0, 0, 0];
      systems.forEach((system, index) => {
        system.sample = () => {
          sampleCalls[index] += 1;
          return scriptedSurfaceEffect(`FLOOR ${index + 1}`);
        };
        system.update = (delta) => {
          updateCalls[index] += 1;
          originalUpdates[index]!(delta);
        };
      });

      try {
        const sameXZ = new THREE.Vector3(0, 1.5, 0);
        expect(world.update(0.016, sameXZ, false).surfaceEffect.label).toBe("FLOOR 1");
        world.updateEffects(0.016, sameXZ);

        world.rebindActiveDungeon(floorSet.floors[2]!);
        const features2 = world.getMinimapFeatures();
        expect(features2).toBe(runtimes[2]!.minimapProjection!.features);
        expect(features2).not.toBe(features0);
        expect(world.update(0.016, sameXZ, false).surfaceEffect.label).toBe("FLOOR 3");
        world.updateEffects(0.016, sameXZ);

        expect(sampleCalls).toEqual([1, 0, 1, 0]);
        expect(updateCalls).toEqual([1, 0, 1, 0]);
        expect(
          runtimes.map((runtime) => runtime.fixedSceneEffects.diagnostics.updateCalls),
        ).toEqual([1, 0, 1, 0]);
        expect(
          runtimes.map((runtime) => runtime.fixedSceneEffects.diagnostics.lastUncannyWallInstances),
        ).toEqual([
          runtimes[0]!.uncannyWallRuntime!.mesh.count,
          0,
          runtimes[2]!.uncannyWallRuntime!.mesh.count,
          0,
        ]);
        expect(
          runtimes.reduce(
            (total, runtime) => total + runtime.fixedSceneEffects.diagnostics.portalBeamUpdates,
            0,
          ),
        ).toBe(2);

        world.rebindActiveDungeon(floorSet.floors[0]!);
        expect(world.getMinimapFeatures()).toBe(features0);
        expect(features0.doors).toBe(stable0.doors);
        expect(features0.fires).toBe(stable0.fires);
        expect(features0.hazards).toBe(stable0.hazards);
        expect(features0.stones).toBe(stable0.stones);
      } finally {
        systems.forEach((system, index) => {
          system.sample = originalSamples[index]!;
          system.update = originalUpdates[index]!;
        });
      }
    } finally {
      world.dispose();
      restoreDocument();
    }
  });

  test("keeps all four Sunken resident layers equivalent to isolated floor builds", () => {
    const restoreDocument = installCanvasDocument();
    const floors = sunkenFloorStack();
    const mood = getDungeonMood("sunken");
    const stackWorld = new DungeonWorld(new THREE.Scene());
    try {
      stackWorld.setDungeon(floors[0]!, mood, { stack: floors });
      const stacked = floors.map((floor) => {
        stackWorld.rebindActiveDungeon(floor);
        return residentFloorContract(activeRuntime(stackWorld));
      });
      const isolated = floors.map((floor) => {
        const isolatedWorld = new DungeonWorld(new THREE.Scene());
        try {
          isolatedWorld.setDungeon(floor, mood);
          return residentFloorContract(activeRuntime(isolatedWorld));
        } finally {
          isolatedWorld.dispose();
        }
      });

      // These are independently frozen values for the deterministic fixture;
      // a stack-versus-isolated equality alone would miss a shared regression.
      expect(isolated.map(residentContractCounts)).toEqual([...SUNKEN_ISOLATED_COUNTS]);
      expect(isolated.map(fingerprint)).toEqual([...SUNKEN_ISOLATED_FINGERPRINTS]);
      expect(stacked).toEqual(isolated);
    } finally {
      stackWorld.dispose();
      restoreDocument();
    }
  });

  test("releases each resident Sunken texture once across clear and double dispose", () => {
    const restoreDocument = installCanvasDocument();
    const textureSink = new TrackingTextureSink();
    const world = new DungeonWorld(new THREE.Scene(), { textureRegistry: textureSink });
    try {
      const floors = sunkenFloorStack();
      const internals = internalsOf(world);
      const sharedTextures = [
        internals.assets.wall,
        internals.assets.floor,
        internals.assets.ceiling,
      ];
      world.setDungeon(floors[0]!, getDungeonMood("sunken"), { stack: floors });

      const runtimes = floors.map((floor) => {
        world.rebindActiveDungeon(floor);
        return activeRuntime(world);
      });
      expect(runtimes.every((runtime) => runtime.liquidKit !== null)).toBe(true);
      expect(runtimes.every((runtime) => runtime.hazardTileSystem !== null)).toBe(true);
      expect(
        runtimes.every((runtime) => runtime.liquidKit!.root.parent === runtime.detailRoot),
      ).toBe(true);
      expect(runtimes.every((runtime) => runtime.liquidKit!.surfaces.length > 0)).toBe(true);
      const residentTextures = new Set(
        runtimes.flatMap((runtime) => [...residentRuntimeTextures(runtime)]),
      );
      const sharedLifecyclesAfterBuild = sharedTextures.map((texture) => ({
        ...textureSink.lifecycle(texture),
      }));
      // This fixture has one liquid material on floor one and two on the
      // remaining slabs, plus two visible hazard maps on every floor.
      expect(runtimes.map((runtime) => residentRuntimeTextures(runtime).size)).toEqual([
        3, 4, 4, 4,
      ]);
      expect(textureSink.registry.diagnostics().registered).toBeGreaterThan(0);

      internals.clear();
      for (const texture of residentTextures) {
        expect(textureSink.lifecycle(texture)).toEqual({ register: 1, unregister: 1, dispose: 1 });
      }
      for (const [index, texture] of sharedTextures.entries()) {
        expect(textureSink.registry.has(texture)).toBe(true);
        expect(textureSink.lifecycle(texture)).toEqual(sharedLifecyclesAfterBuild[index]);
      }

      world.dispose();
      world.dispose();
      for (const texture of residentTextures) {
        expect(textureSink.lifecycle(texture)).toEqual({ register: 1, unregister: 1, dispose: 1 });
      }
      for (const [index, texture] of sharedTextures.entries()) {
        expect(textureSink.lifecycle(texture)).toEqual({
          ...sharedLifecyclesAfterBuild[index],
          unregister: 1,
          dispose: 1,
        });
      }
      expect(textureSink.registry.diagnostics().registered).toBe(0);
    } finally {
      world.dispose();
      restoreDocument();
    }
  });

  test("preserves a floor-three build failure while fully releasing partial Sunken textures", () => {
    const restoreDocument = installCanvasDocument();
    const textureSink = new TrackingTextureSink();
    const world = new DungeonWorld(new THREE.Scene(), { textureRegistry: textureSink });
    try {
      const floors = sunkenFloorStack();
      const mood = getDungeonMood("sunken");
      const internals = internalsOf(world);
      // Warm the long-lived world-owned assets first. The partial stack must
      // return exactly to this registry baseline, not merely to an empty scene.
      world.setDungeon(floors[0]!, mood);
      internals.clear();
      const registryBaseline = textureSink.registry.diagnostics().registered;
      const staticScene = internals.staticScene;
      const originalCacheProjection = staticScene.cacheResidentMinimapProjection;
      const buildFailure = new Error("RDL14 synthetic floor-three build failure");
      const cleanupFailure = new Error("RDL14 synthetic liquid texture dispose failure");
      const partialTextures = new Set<THREE.Texture>();
      let injected = false;
      staticScene.cacheResidentMinimapProjection = (dungeon, runtime) => {
        originalCacheProjection.call(staticScene, dungeon, runtime);
        for (const texture of residentRuntimeTextures(runtime)) partialTextures.add(texture);
        if (runtime.floorIndex !== 2) return;
        const target = [...residentRuntimeTextures(runtime)][0];
        if (!target)
          throw new Error("Expected a floor-three runtime texture to inject cleanup failure.");
        let throwOnce = true;
        target.addEventListener("dispose", () => {
          if (!throwOnce) return;
          throwOnce = false;
          throw cleanupFailure;
        });
        injected = true;
        throw buildFailure;
      };

      let thrown: unknown;
      try {
        world.setDungeon(floors[0]!, mood, { stack: floors });
      } catch (error) {
        thrown = error;
      } finally {
        staticScene.cacheResidentMinimapProjection = originalCacheProjection;
      }

      expect(injected).toBe(true);
      expect(thrown).toBe(buildFailure);
      // The failure occurs while floor index 2 is resident; all three partial
      // runtime texture sets must be released, including the throwing map.
      expect(partialTextures.size).toBe(11);
      for (const texture of partialTextures) {
        expect(textureSink.lifecycle(texture)).toEqual({ register: 1, unregister: 1, dispose: 1 });
      }
      expect(textureSink.registry.diagnostics().registered).toBe(registryBaseline);

      world.setDungeon(floors[0]!, mood, { stack: floors });
      const rebuilt = floors.map((floor) => {
        world.rebindActiveDungeon(floor);
        return activeRuntime(world);
      });
      expect(rebuilt).toHaveLength(4);
      expect(new Set(rebuilt).size).toBe(4);

      world.dispose();
      expect(textureSink.registry.diagnostics().registered).toBe(0);
    } finally {
      world.dispose();
      restoreDocument();
    }
  });

  test("keeps a fixed practical-light budget per floor and exposes only the active slab", () => {
    const restoreDocument = installCanvasDocument();
    const world = new DungeonWorld(new THREE.Scene());
    try {
      const floorSet = generateDungeonFloorSet(
        "RDL14-backrooms-light-budget",
        { roomTarget: 8 },
        4,
      );
      world.setDungeon(floorSet.floors[0]!, getDungeonMood("backrooms"), {
        stack: floorSet.floors,
      });

      const runtimes = floorSet.floors.map((floor) => {
        world.rebindActiveDungeon(floor);
        return activeRuntime(world);
      });
      expect(runtimes.map((runtime) => runtime.dynamicFireLights.length)).toEqual(
        Array.from({ length: 4 }, () => DYNAMIC_FIRE_LIGHTS_PER_FLOOR),
      );
      expect(runtimes.flatMap((runtime) => runtime.dynamicFireLights)).toHaveLength(
        MAX_DYNAMIC_FIRE_LIGHTS,
      );
      expect(
        runtimes
          .flatMap((runtime) => runtime.dynamicFireLights)
          .every((light) => runtimes.some((runtime) => light.parent === runtime.root)),
      ).toBe(true);
      // Neighbor slabs (±1) stay mounted for shaft continuity; only farther
      // floors drop out of the practical-light graph.
      expect(
        runtimes.map((runtime) =>
          runtime.root.visible ? runtime.dynamicFireLights.length : 0,
        ),
      ).toEqual([0, 0, DYNAMIC_FIRE_LIGHTS_PER_FLOOR, DYNAMIC_FIRE_LIGHTS_PER_FLOOR]);

      world.rebindActiveDungeon(floorSet.floors[1]!);
      expect(
        runtimes.map((runtime) =>
          runtime.root.visible ? runtime.dynamicFireLights.length : 0,
        ),
      ).toEqual([
        DYNAMIC_FIRE_LIGHTS_PER_FLOOR,
        DYNAMIC_FIRE_LIGHTS_PER_FLOOR,
        DYNAMIC_FIRE_LIGHTS_PER_FLOOR,
        0,
      ]);
    } finally {
      world.dispose();
      restoreDocument();
    }
  });
});
