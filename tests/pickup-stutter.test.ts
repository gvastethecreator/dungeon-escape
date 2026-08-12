import { describe, expect, test } from "bun:test";
import * as THREE from "three";
import { PointsNodeMaterial } from "three/webgpu";

import {
  createShaderProgramModeRegistry,
  getShaderProgramModeRegistry,
  resetShaderProgramModeRegistryForTests,
  setShaderProgramModeRegistry,
} from "../src/systems/ShaderProgramMode";
import {
  createLuminousWardStone,
  createTimeFreezeRelic,
  preparePickupOpacity,
  setPickupDormant,
  setPickupOpacity,
  PICKUP_DORMANT_SCALE,
} from "../src/world/ItemFactory";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";
import {
  PickupBurstPool,
  PICKUP_BURST_SPARKS_SHADER_FACTORY_ID,
  registerPickupBurstSparksShaderFactory,
} from "../src/world/PickupBurstPool";
import { TimeFreezeVfx } from "../src/world/TimeFreezeVfx";

describe("pickup frame stability", () => {
  test("prepares transparency once and changes opacity without invalidating materials", () => {
    const material = new THREE.MeshStandardMaterial({ opacity: 0.86 });
    const pickup = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), material);
    preparePickupOpacity(pickup);
    const preparedVersion = material.version;

    setPickupOpacity(pickup, 0.6);
    setPickupOpacity(pickup, 0.3);

    expect(material.transparent).toBe(true);
    expect(material.opacity).toBe(0.3);
    expect(material.version).toBe(preparedVersion);
  });

  test("reuses fixed burst geometry and materials across all four stones", () => {
    const pool = new PickupBurstPool(4);
    const children = [...pool.root.children];
    const geometries = children.flatMap((root) =>
      root.children.map((child) => (child as THREE.Mesh).geometry),
    );
    const materials = children.flatMap((root) =>
      root.children.map((child) => (child as THREE.Mesh).material),
    );

    const stoneColors = [0xff5b32, 0xc8c0b0, 0x58b8d0, 0x68a878];
    for (let index = 0; index < 4; index += 1)
      pool.trigger({ x: index, y: 0.4, z: -index }, "stone", stoneColors[index]);
    pool.update(0.2);

    expect(pool.activeCount).toBe(4);
    expect(pool.root.children).toEqual(children);
    expect(
      children.flatMap((root) => root.children.map((child) => (child as THREE.Mesh).geometry)),
    ).toEqual(geometries);
    expect(
      children.flatMap((root) => root.children.map((child) => (child as THREE.Mesh).material)),
    ).toEqual(materials);
    expect(
      children.map((root) =>
        (
          (root.getObjectByName("Pickup expanding ring") as THREE.Mesh)
            .material as THREE.MeshBasicMaterial
        ).color.getHex(),
      ),
    ).toEqual(stoneColors);
    pool.update(1);
    expect(pool.activeCount).toBe(0);
  });

  test("gives power, utility, and curse pickups different pooled choreography", () => {
    const pool = new PickupBurstPool(8);
    const kinds = [
      "time-freeze",
      "luminous-ward",
      "annihilation-pulse",
      "map",
      "swarm-curse",
      "slow-curse",
      "frenzy-curse",
      "gloom-curse",
    ] as const;
    for (let index = 0; index < kinds.length; index += 1) {
      pool.trigger({ x: index * 2, y: 0.4, z: 0 }, kinds[index]);
    }

    const roots = pool.root.children as THREE.Group[];
    const motions = roots.map((root) => root.userData.pickupBurstMotion as string);
    const shapes = roots.map((root) => root.userData.pickupSparkShape as string);
    expect(new Set(motions).size).toBe(kinds.length);
    expect(new Set(shapes).size).toBe(kinds.length);
    expect(
      roots.every(
        (root) => root.getObjectByName("Pickup secondary echo ring") instanceof THREE.Mesh,
      ),
    ).toBe(true);
    expect(
      roots.every((root) => {
        const points = root.getObjectByName("Pickup rising sparks") as THREE.Points<
          THREE.BufferGeometry,
          THREE.ShaderMaterial
        >;
        return (
          points.material.fog === true &&
          points.material.toneMapped === true &&
          points.material.uniforms.uTime.value === 0 &&
          points.material.uniforms.uCoreColor.value instanceof THREE.Color
        );
      }),
    ).toBe(true);

    const meanRadius = (root: THREE.Group): number => {
      const points = root.getObjectByName("Pickup rising sparks") as THREE.Points;
      const positions = points.geometry.getAttribute("position") as THREE.BufferAttribute;
      let total = 0;
      for (let index = 0; index < positions.count; index += 1) {
        total += Math.hypot(positions.getX(index), positions.getZ(index));
      }
      return total / positions.count;
    };
    const annihilationBefore = meanRadius(roots[2]!);
    const gloomBefore = meanRadius(roots[7]!);
    pool.update(0.3);
    expect(
      roots.every((root) => {
        const points = root.getObjectByName("Pickup rising sparks") as THREE.Points<
          THREE.BufferGeometry,
          THREE.ShaderMaterial
        >;
        return points.material.uniforms.uTime.value === 0.3;
      }),
    ).toBe(true);
    expect(meanRadius(roots[2]!)).toBeGreaterThan(annihilationBefore);
    expect(meanRadius(roots[7]!)).toBeLessThan(gloomBefore);

    const shapeIds = roots.map((root) => {
      const points = root.getObjectByName("Pickup rising sparks") as THREE.Points<
        THREE.BufferGeometry,
        THREE.ShaderMaterial
      >;
      return points.material.uniforms.uShape.value as number;
    });
    expect(new Set(shapeIds).size).toBe(kinds.length);
    pool.dispose();
  });

  test("TSL burst pool uses sprite sparks and registers dual-mode factory", () => {
    resetShaderProgramModeRegistryForTests();
    setShaderProgramModeRegistry(createShaderProgramModeRegistry("tsl"));
    registerPickupBurstSparksShaderFactory();

    const pool = new PickupBurstPool(1);
    pool.trigger({ x: 0, y: 0.4, z: 0 }, "annihilation-pulse");
    const sparks = pool.root.children[0]?.getObjectByName("Pickup rising sparks");
    expect(sparks).toBeInstanceOf(THREE.Sprite);
    expect((sparks as THREE.Sprite).count).toBe(36);
    expect((sparks as THREE.Sprite).material).toBeInstanceOf(PointsNodeMaterial);
    expect((sparks as THREE.Sprite).material.userData.sparkPrimitive).toBe("sprite");
    expect(getShaderProgramModeRegistry().supports(PICKUP_BURST_SPARKS_SHADER_FACTORY_ID, "glsl")).toBe(
      true,
    );
    expect(getShaderProgramModeRegistry().supports(PICKUP_BURST_SPARKS_SHADER_FACTORY_ID, "tsl")).toBe(
      true,
    );
    pool.dispose();
    resetShaderProgramModeRegistryForTests();
  });

  test("dormant power pickups hide meshes but keep PointLights in the graph", () => {
    const materials = createDungeonMaterials();
    const freeze = createTimeFreezeRelic(materials);
    const ward = createLuminousWardStone(materials);
    const freezeLight = freeze.getObjectByName("Time freeze pickup light") as THREE.PointLight;
    const wardLight = ward.getObjectByName("Luminous ward pickup light") as THREE.PointLight;
    const freezeMeshes: THREE.Mesh[] = [];
    const wardMeshes: THREE.Mesh[] = [];
    freeze.traverse((child) => {
      if (child instanceof THREE.Mesh) freezeMeshes.push(child);
    });
    ward.traverse((child) => {
      if (child instanceof THREE.Mesh) wardMeshes.push(child);
    });

    setPickupDormant(freeze, true);
    setPickupDormant(ward, true);
    freezeLight.intensity = 0;
    wardLight.intensity = 0;

    expect(freeze.visible).toBe(true);
    expect(ward.visible).toBe(true);
    expect(freeze.scale.x).toBe(PICKUP_DORMANT_SCALE);
    expect(ward.scale.x).toBe(PICKUP_DORMANT_SCALE);
    expect(freezeMeshes.length).toBeGreaterThan(0);
    expect(wardMeshes.length).toBeGreaterThan(0);
    expect(freezeMeshes.every((mesh) => !mesh.visible)).toBe(true);
    expect(wardMeshes.every((mesh) => !mesh.visible)).toBe(true);
    expect(freezeLight.parent).toBe(freeze);
    expect(wardLight.parent).toBe(ward);
    expect(freezeLight.intensity).toBe(0);
    expect(wardLight.intensity).toBe(0);

    // Simulated collect end: still visible, still dormant, lights stay zeroed.
    setPickupDormant(freeze, true);
    setPickupDormant(ward, true);
    expect(freeze.visible).toBe(true);
    expect(ward.visible).toBe(true);

    setPickupDormant(freeze, false);
    setPickupDormant(ward, false);
    expect(freezeMeshes.every((mesh) => mesh.visible)).toBe(true);
    expect(wardMeshes.every((mesh) => mesh.visible)).toBe(true);
    expect(freezeLight.parent).toBe(freeze);
    expect(wardLight.parent).toBe(ward);
  });

  test("time freeze frost points stay in the scene while inactive for shader warmup", () => {
    const vfx = new TimeFreezeVfx(2);
    const motes = vfx.root.children[0] as THREE.Points;
    vfx.update(0, 0, []);
    expect(motes.visible).toBe(true);
    expect((motes.material as THREE.PointsMaterial).opacity).toBe(0);

    vfx.setWarmupVisible(true);
    expect(motes.visible).toBe(true);
    expect((motes.material as THREE.PointsMaterial).opacity).toBeGreaterThan(0);

    vfx.setWarmupVisible(false);
    expect(motes.visible).toBe(true);
    vfx.dispose();
  });
});
