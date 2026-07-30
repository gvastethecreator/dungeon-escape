import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import type { DungeonData, DungeonRoom } from "../src/dungeon/types";
import { gridToWorld } from "../src/dungeon/gridCollision";
import { getDungeonMood } from "../src/systems/DungeonMood";
import {
  createForgedIronTextureSet,
  createForgedSpikeGeometry,
  createImageSculptedSpikePlate,
  createSpikePlateBaseGeometry,
  createSpikePlateFrameGeometry,
  createSpikePlateRivetGeometry,
  FORGED_IRON_PBR_PATHS,
  HazardTileSystem,
  hazardKindsForMood,
  planHazardTiles,
} from "../src/world/HazardTileSystem";

function dungeonFixture(): DungeonData {
  const rooms: DungeonRoom[] = Array.from({ length: 10 }, (_, id) => ({
    id,
    x: id * 10,
    y: 2,
    width: 8,
    height: 8,
    center: { x: id * 10 + 4, y: 6 },
    role: id === 0 ? "entrance" : id === 9 ? "exit" : "room",
  }));
  return {
    seed: "HAZARD-MAP",
    seedHash: 1,
    options: {
      width: 110,
      height: 14,
      roomTarget: 10,
      minRoomSize: 8,
      maxRoomSize: 8,
      roomPadding: 2,
      corridorRadius: 1,
      extraConnectionRate: 0,
      placementAttemptsPerRoom: 1,
    },
    grid: Array.from({ length: 14 }, () => new Uint8Array(110)),
    width: 110,
    height: 14,
    rooms,
    edges: [],
    spawn: rooms[0]!.center,
    exit: rooms[9]!.center,
    entranceRoomId: 0,
    exitRoomId: 9,
    distances: new Int32Array(110 * 14),
    topologySignature: "hazard-fixture",
    stats: {
      roomCount: 10,
      floorCount: 640,
      reachableFloorCount: 640,
      edgeCount: 9,
      loopCount: 0,
      exitDistance: 90,
    },
  };
}

describe("biome hazard tiles", () => {
  test("assigns distinct hazards to representative biomes", () => {
    expect(hazardKindsForMood("molten")).toEqual(["fire", "spikes"]);
    expect(hazardKindsForMood("frost")).toEqual(["ice", "spikes"]);
    expect(hazardKindsForMood("sunken")).toEqual(["toxin", "ice"]);
    expect(hazardKindsForMood("fungal")).toEqual(["toxin", "fire"]);
  });

  test("plans a deterministic spread and respects reserved cells", () => {
    const dungeon = dungeonFixture();
    const first = planHazardTiles(dungeon, "molten");
    const excluded = new Set([`${first[0]!.cell.x},${first[0]!.cell.y}`]);
    expect(planHazardTiles(dungeon, "molten")).toEqual(first);
    expect(new Set(first.map((tile) => `${tile.cell.x},${tile.cell.y}`)).size).toBe(first.length);
    expect(planHazardTiles(dungeon, "molten", excluded)).not.toContainEqual(first[0]);
    expect(first.every((tile) => tile.kind === "fire" || tile.kind === "spikes")).toBe(true);
  });

  test("lets a jump clear floor triggers and mobility immunity suppresses them", () => {
    const dungeon = dungeonFixture();
    const system = new HazardTileSystem(dungeon, getDungeonMood("molten"), 2, new Set());
    try {
      const placement = system.placements[0]!;
      const position = gridToWorld(dungeon, placement.cell, 2);
      const player = new THREE.Vector3(position.x, 1.62, position.z);

      const airborne = system.sample(1 / 60, player, { airborne: true });
      expect(airborne).toEqual({
        kind: null,
        label: "",
        damage: 0,
        movementScale: 1,
        traction: 1,
      });

      const immune = system.sample(1 / 60, player, { immune: true });
      expect(immune).toEqual({
        kind: null,
        label: "",
        damage: 0,
        movementScale: 1,
        traction: 1,
      });

      expect(system.sample(1 / 60, player).kind).toBe(placement.kind);
    } finally {
      system.dispose();
    }
  });

  test("uses the imagegen atlas, instanced forged spikes and status effects", async () => {
    const source = await Bun.file(
      new URL("../src/world/HazardTileSystem.ts", import.meta.url),
    ).text();
    expect(source).toContain("hazard-tiles-pixel-v1.webp");
    expect(source).not.toContain("CanvasRenderingContext2D");
    expect(source).toContain("HAZARD_ANIMATION_FRAMES");
    expect(source).toContain("new THREE.InstancedMesh");
    expect(source).toContain("createForgedSpikeGeometry");
    expect(source).toContain("createSpikePlateBaseGeometry");
    expect(source).not.toContain("new THREE.ConeGeometry");
    expect(source).toContain("spike-plate-three-view.png");
    expect(source).toContain("roughnessMap: textures.roughness");
    expect(source).toContain("normalMap: textures.normal");
    expect(source).toContain("aoMap: textures.ao");
    expect(source).toContain("new THREE.TextureLoader(THREE.DefaultLoadingManager)");
    expect(source).toContain('movementScale: kind === "ice" ? 0.82 : 1');
    expect(source).toContain("this.toxinRemaining = 3.2");
    const atlas = Bun.file(
      new URL("../public/assets/textures/hazards/hazard-tiles-pixel-v1.webp", import.meta.url),
    );
    expect(await atlas.exists()).toBe(true);
    expect(atlas.size).toBeLessThan(200_000);
  });

  test("builds an asymmetric tapered spike without placeholder cone geometry", () => {
    const geometry = createForgedSpikeGeometry();
    expect(geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(geometry).not.toBeInstanceOf(THREE.ConeGeometry);
    expect(geometry.name).toContain("forged hazard spike");
    const bounds = geometry.boundingBox!;
    expect(bounds.min.y).toBeCloseTo(0, 4);
    expect(bounds.max.y - bounds.min.y).toBeCloseTo(0.24, 4);
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(0.18);
    expect(Math.abs(bounds.max.x + bounds.min.x)).toBeGreaterThan(0.005);
    expect(geometry.getAttribute("normal")).toBeDefined();
    expect(geometry.getAttribute("uv")).toBeDefined();
    const positions = geometry.getAttribute("position");
    const colors = geometry.getAttribute("color");
    expect(colors).toBeDefined();
    let lowerGain = 0;
    let upperGain = Number.POSITIVE_INFINITY;
    for (let index = 0; index < positions.count; index += 1) {
      const gain = (colors.getX(index) + colors.getY(index) + colors.getZ(index)) / 3;
      if (positions.getY(index) <= 0.045) lowerGain = Math.max(lowerGain, gain);
      if (positions.getY(index) >= 0.205) upperGain = Math.min(upperGain, gain);
    }
    expect(upperGain).toBeGreaterThan(lowerGain + 0.35);
    expect(geometry.userData.apexWearGradient.purpose).toBe("top-view spike silhouette");
    geometry.dispose();
  });

  test("builds a separate inset iron plate, raised frame and visible underside mechanism", () => {
    const geometry = createSpikePlateBaseGeometry(2);
    expect(geometry.name).toContain("layered forged spike plate base");
    expect(geometry.boundingBox).not.toBeNull();
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(1.56, 3);
    expect(size.z).toBeCloseTo(1.56, 3);
    expect(size.y).toBeGreaterThan(0.2);
    const triangles = geometry.index
      ? geometry.index.count / 3
      : geometry.getAttribute("position").count / 3;
    expect(triangles).toBeLessThan(500);
    geometry.dispose();
    const frame = createSpikePlateFrameGeometry(2);
    expect(frame.name).toContain("raised forged spike plate frame");
    const frameWidth = frame.boundingBox!.getSize(new THREE.Vector3()).x;
    expect(frameWidth).toBeGreaterThan(1.55);
    expect(frameWidth).toBeLessThan(1.58);
    expect(frame.boundingBox!.getSize(new THREE.Vector3()).y).toBeGreaterThan(0.07);
    frame.dispose();
    const rivet = createSpikePlateRivetGeometry(2);
    expect(rivet.name).toContain("forged corner rivet");
    expect(rivet.boundingBox!.getSize(new THREE.Vector3()).y).toBeGreaterThan(0.07);
    rivet.dispose();
  });

  test("routes browser forged iron through the ImageGen PBR set", async () => {
    expect(FORGED_IRON_PBR_PATHS).toEqual({
      albedo: "/assets/textures/model-materials-v2/black-iron/black-iron_albedo.png",
      normal: "/assets/textures/model-materials-v2/black-iron/black-iron_normal.png",
      roughness: "/assets/textures/model-materials-v2/black-iron/black-iron_roughness.png",
      ao: "/assets/textures/model-materials-v2/black-iron/black-iron_ao.png",
    });
    for (const path of Object.values(FORGED_IRON_PBR_PATHS)) {
      const asset = Bun.file(new URL(`../public${path}`, import.meta.url));
      expect(await asset.exists()).toBe(true);
      expect(asset.size).toBeGreaterThan(1_000);
    }
  });

  test("uses independent non-directional PBR channels during SSR", async () => {
    const textures = createForgedIronTextureSet(8);
    expect(new Set(Object.values(textures)).size).toBe(4);
    Object.values(textures).forEach((texture) => expect(texture).toBeInstanceOf(THREE.DataTexture));
    expect(textures.albedo.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(textures.roughness.colorSpace).toBe(THREE.NoColorSpace);
    expect(textures.normal.colorSpace).toBe(THREE.NoColorSpace);
    expect(textures.ao.colorSpace).toBe(THREE.NoColorSpace);
    expect(textures.ao.channel).toBe(0);
    expect(textures.albedo.image.data).not.toBe(textures.roughness.image.data);
    expect(textures.albedo.image.data).not.toBe(textures.normal.image.data);
    expect(textures.albedo.image.data).not.toBe(textures.ao.image.data);
    const source = await Bun.file(
      new URL("../src/world/HazardTileSystem.ts", import.meta.url),
    ).text();
    expect(source).not.toContain("Math.sin((x / size)");
    Object.values(textures).forEach((texture) => texture.dispose());
  });

  test("exposes the complete five-spike plate as a named action-ready model", () => {
    const plate = createImageSculptedSpikePlate(2);
    const runtime = plate.userData.sculptRuntime;
    expect(runtime.family).toBe("spike-plate");
    expect(runtime.sourceImage).toContain("spike-plate-three-view.png");
    expect(runtime.geometry.triangles).toBeLessThanOrEqual(1_200);
    expect(runtime.geometry.materialBatches).toBe(3);
    const shell = plate.getObjectByName("Inset blackened forged plate shell") as THREE.Mesh;
    const frame = plate.getObjectByName("Separate raised forged perimeter frame") as THREE.Mesh;
    expect(shell).toBeDefined();
    expect(frame).toBeDefined();
    const material = shell.material as THREE.MeshStandardMaterial;
    const frameMaterial = frame.material as THREE.MeshStandardMaterial;
    expect(material.map).toBeDefined();
    expect(material.normalMap).toBeDefined();
    expect(material.roughnessMap).toBeDefined();
    expect(material.aoMap).toBeDefined();
    expect(material.metalness).toBeCloseTo(0.72);
    expect(material.envMapIntensity).toBeCloseTo(1.65);
    expect(material.roughness).toBeCloseTo(0.5);
    expect(material.emissive.getHex()).toBe(0xffffff);
    expect(material.emissiveMap).toBe(material.map);
    expect(material.emissiveIntensity).toBeCloseTo(0.32);
    expect(material.userData.materialRole).toBe("readable-blackened-forged-iron");
    expect(frameMaterial).not.toBe(material);
    expect(frameMaterial.map).toBe(material.map);
    expect(frameMaterial.metalness).toBeCloseTo(0.78);
    expect(frameMaterial.roughness).toBeCloseTo(0.48);
    expect(frameMaterial.emissiveIntensity).toBeCloseTo(0.24);
    expect(frameMaterial.userData.materialRole).toBe("raised-blackened-forged-frame");
    expect(runtime.materialTextures).toEqual(FORGED_IRON_PBR_PATHS);
    expect(plate.getObjectByName("Five-spike lift mechanism pivot")).toBeDefined();
    const spikes = plate.getObjectByName("Five short forged spike instances");
    const collars = plate.getObjectByName("Five forged socket collar instances");
    const rivets = plate.getObjectByName("Four broad forged corner rivet instances");
    expect(spikes).toBeInstanceOf(THREE.InstancedMesh);
    expect((spikes as THREE.InstancedMesh).count).toBe(5);
    expect(collars).toBeInstanceOf(THREE.InstancedMesh);
    expect((collars as THREE.InstancedMesh).count).toBe(5);
    expect(rivets).toBeInstanceOf(THREE.InstancedMesh);
    expect((rivets as THREE.InstancedMesh).count).toBe(4);
    expect(runtime.nodes["spike-mechanism"]).toBe("Five-spike lift mechanism pivot");
    expect(runtime.nodes["socket-plinths"]).toBe("Five forged socket collar instances");
    expect(runtime.nodes["corner-rivets"]).toBe("Four broad forged corner rivet instances");

    const spikeInstances = spikes as THREE.InstancedMesh;
    const spikeMaterial = spikeInstances.material as THREE.MeshStandardMaterial;
    expect(spikeMaterial).not.toBe(material);
    expect(spikeMaterial.metalness).toBeCloseTo(0.74);
    expect(spikeMaterial.envMapIntensity).toBeCloseTo(1.95);
    expect(spikeMaterial.roughness).toBeCloseTo(0.34);
    expect(spikeMaterial.vertexColors).toBe(true);
    expect(spikeMaterial.flatShading).toBe(true);
    expect(spikeMaterial.emissive.getHex()).toBe(0xffffff);
    expect(spikeMaterial.emissiveMap).toBe(spikeMaterial.map);
    expect(spikeMaterial.emissiveIntensity).toBeCloseTo(0.14);
    const spikeGeometry = spikeInstances.geometry;
    expect(spikeGeometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(spikeGeometry).not.toBeInstanceOf(THREE.ConeGeometry);
    const nominalHeight = spikeInstances.userData.nominalHeight as number;
    expect(nominalHeight).toBeCloseTo(0.24);
    const heights: number[] = [];
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    for (let index = 0; index < spikeInstances.count; index += 1) {
      spikeInstances.getMatrixAt(index, matrix);
      matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
      heights.push(nominalHeight * scale.y);
    }
    expect(new Set(heights.map((height) => height.toFixed(3))).size).toBe(5);
    expect(Math.max(...heights)).toBeLessThan(0.27);
    expect(Math.min(...heights)).toBeGreaterThan(0.18);

    const plateSize = new THREE.Box3().setFromObject(shell).getSize(new THREE.Vector3());
    const collarSize = (collars as THREE.InstancedMesh).geometry.boundingBox?.getSize(
      new THREE.Vector3(),
    );
    expect(plateSize.x).toBeGreaterThan(1.4);
    expect(plateSize.y).toBeGreaterThan(0.2);
    expect(plateSize.z).toBeGreaterThan(1.4);
    expect(collarSize?.y).toBeGreaterThan(0.09);
    expect((collars as THREE.InstancedMesh).userData.includesVisiblePlinth).toBe(true);
    expect(runtime.nodes["raised-frame"]).toBe("Separate raised forged perimeter frame");
  });

  test("keeps the playable spike trap short, socketed and grounded through animation", () => {
    const system = new HazardTileSystem(dungeonFixture(), getDungeonMood("molten"), 2, new Set());
    try {
      const spikes = system.root.getObjectByName(
        "Image-sculpted forged spike batch",
      ) as THREE.InstancedMesh;
      const collars = system.root.getObjectByName(
        "Forged spike socket collar batch",
      ) as THREE.InstancedMesh;
      const plates = system.root.getObjectByName(
        "Image-sculpted layered spike plate base batch",
      ) as THREE.InstancedMesh;
      const frames = system.root.getObjectByName(
        "Separate raised forged spike plate frame batch",
      ) as THREE.InstancedMesh;
      const rivets = system.root.getObjectByName(
        "Four forged corner rivet batch",
      ) as THREE.InstancedMesh;
      expect(spikes).toBeInstanceOf(THREE.InstancedMesh);
      expect(collars).toBeInstanceOf(THREE.InstancedMesh);
      expect(plates).toBeInstanceOf(THREE.InstancedMesh);
      expect(frames).toBeInstanceOf(THREE.InstancedMesh);
      expect(rivets).toBeInstanceOf(THREE.InstancedMesh);
      const runtimeIron = plates.material as THREE.MeshStandardMaterial;
      const runtimeFrame = frames.material as THREE.MeshStandardMaterial;
      const runtimeSpikes = spikes.material as THREE.MeshStandardMaterial;
      expect(runtimeIron.metalness).toBeCloseTo(0.72);
      expect(runtimeIron.envMapIntensity).toBeCloseTo(1.65);
      expect(runtimeIron.roughness).toBeCloseTo(0.5);
      expect(runtimeIron.emissive.getHex()).toBe(0xffffff);
      expect(runtimeIron.emissiveMap).toBe(runtimeIron.map);
      expect(runtimeIron.emissiveIntensity).toBeCloseTo(0.32);
      expect(runtimeFrame).not.toBe(runtimeIron);
      expect(runtimeFrame.metalness).toBeCloseTo(0.78);
      expect(runtimeFrame.roughness).toBeCloseTo(0.48);
      expect(runtimeFrame.emissiveIntensity).toBeCloseTo(0.24);
      expect(runtimeSpikes).not.toBe(runtimeIron);
      expect(runtimeSpikes.metalness).toBeCloseTo(0.74);
      expect(runtimeSpikes.envMapIntensity).toBeCloseTo(1.95);
      expect(runtimeSpikes.roughness).toBeCloseTo(0.34);
      expect(runtimeSpikes.vertexColors).toBe(true);
      expect(runtimeSpikes.flatShading).toBe(true);
      expect(runtimeSpikes.emissive.getHex()).toBe(0xffffff);
      expect(runtimeSpikes.emissiveMap).toBe(runtimeSpikes.map);
      expect(runtimeSpikes.emissiveIntensity).toBeCloseTo(0.14);
      expect(system.root.userData.sculptRuntime.materialTextures).toEqual(FORGED_IRON_PBR_PATHS);
      expect(spikes.count).toBeGreaterThanOrEqual(5);
      expect(collars.count).toBe(spikes.count);
      expect(rivets.count).toBe((spikes.count / 5) * 4);
      expect(spikes.geometry.boundingBox?.getSize(new THREE.Vector3()).y).toBeCloseTo(0.24, 4);
      expect(collars.geometry.boundingBox?.getSize(new THREE.Vector3()).y).toBeGreaterThan(0.09);
      expect(collars.userData.includesVisiblePlinth).toBe(true);

      const matrix = new THREE.Matrix4();
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      spikes.getMatrixAt(0, matrix);
      matrix.decompose(position, quaternion, scale);
      expect(position.y).toBeCloseTo(0.189, 4);
      expect(scale.y).toBeCloseTo(0.05, 4);
      collars.getMatrixAt(0, matrix);
      matrix.decompose(position, quaternion, scale);
      expect(position.y).toBeCloseTo(0.16, 4);

      let observedMaxScale = 0;
      let observedMaxTip = 0;
      for (let frame = 0; frame < 180; frame += 1) {
        system.update(0.05);
        for (let instance = 0; instance < spikes.count; instance += 1) {
          spikes.getMatrixAt(instance, matrix);
          matrix.decompose(position, quaternion, scale);
          expect(position.y).toBeCloseTo(0.189, 4);
          expect(scale.y).toBeGreaterThan(0.049);
          expect(scale.y).toBeLessThan(1.081);
          observedMaxScale = Math.max(observedMaxScale, scale.y);
          observedMaxTip = Math.max(observedMaxTip, position.y + 0.24 * scale.y);
        }
      }
      expect(observedMaxScale).toBeGreaterThan(1);
      expect(observedMaxTip).toBeLessThan(0.45);
      expect(system.root.userData.sculptRuntime.geometry.nominalSpikeHeight).toBeCloseTo(0.24);
      expect(system.root.userData.sculptRuntime.nodes["socket-plinths"]).toBe(
        "Forged spike socket collar batch",
      );
      expect(system.root.userData.sculptRuntime.nodes["corner-rivets"]).toBe(
        "Four forged corner rivet batch",
      );
    } finally {
      system.dispose();
    }
  });
});
