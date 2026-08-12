import { afterEach, beforeAll, describe, expect, test } from "bun:test";
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import {
  createShaderProgramModeRegistry,
  getShaderProgramModeRegistry,
  resetShaderProgramModeRegistryForTests,
  setShaderProgramModeRegistry,
} from "../src/systems/ShaderProgramMode";
import { loadTslMaterialModules } from "../src/systems/TslMaterialModules";
import {
  MAGIC_PORTAL_APERTURE,
  MAGIC_PORTAL_ENTRY_RADIUS,
  MAGIC_PORTAL_NAMES,
  MAGIC_PORTAL_SHADER_FACTORY_ID,
  createMagicPortalInterior,
  createPortalApertureGeometry,
  isInsideMagicPortal,
  magicPortalApproachYaw,
  registerMagicPortalShaderFactory,
  setMagicPortalOpen,
  setMagicPortalWarmupVisible,
  updateMagicPortal,
  type MagicPortalUniformHandles,
} from "../src/world/MagicPortalKit";

// The shader program mode registry is process-global; leaking `tsl` mode
// into later test files would build node materials where GLSL is expected.
afterEach(() => {
  resetShaderProgramModeRegistryForTests();
});

// TSL builders live in lazily imported `*.tsl` siblings so the WebGL bundle
// never pulls in `three/webgpu`; tests must preload them like Play boot does.
beforeAll(async () => {
  await loadTslMaterialModules();
});

describe("magic portal", () => {
  test("fills the whole door arch with animated currents and runes", () => {
    const portal = new THREE.Group();
    const interior = createMagicPortalInterior();
    portal.add(interior.root);

    expect(interior.root.visible).toBe(false);
    expect(portal.getObjectByName(MAGIC_PORTAL_NAMES.vortex)).toBe(interior.vortex);
    expect(portal.getObjectByName(MAGIC_PORTAL_NAMES.spiral)).toBe(interior.spiral);
    expect(portal.getObjectByName(MAGIC_PORTAL_NAMES.runeArch)).toBe(interior.runeArch);
    expect(portal.getObjectByName(MAGIC_PORTAL_NAMES.runes)).toBe(interior.runes);
    expect(interior.runes.count).toBe(14);

    const aperture = createPortalApertureGeometry();
    const bounds = aperture.boundingBox!;
    expect(bounds.min.x).toBeCloseTo(-MAGIC_PORTAL_APERTURE.halfWidth);
    expect(bounds.max.x).toBeCloseTo(MAGIC_PORTAL_APERTURE.halfWidth);
    expect(bounds.min.y).toBeCloseTo(MAGIC_PORTAL_APERTURE.baseY);
    expect(bounds.max.y).toBeCloseTo(MAGIC_PORTAL_APERTURE.apexY);
    expect(bounds.max.y - bounds.min.y).toBeGreaterThan((bounds.max.x - bounds.min.x) * 2);
    expect(interior.veil.geometry).toBe(interior.vortex.geometry);
    expect(interior.vortex.geometry).toBe(interior.spiral.geometry);
    expect(interior.veil.geometry).toBeInstanceOf(THREE.ShapeGeometry);
    expect(interior.root.children).toHaveLength(5);
    const meshes: THREE.Mesh[] = [];
    interior.root.traverse((child) => {
      if (child instanceof THREE.Mesh) meshes.push(child);
    });
    const triangles = meshes.reduce((total, mesh) => {
      const vertices = mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position").count;
      const instances = mesh instanceof THREE.InstancedMesh ? mesh.count : 1;
      return total + (vertices / 3) * instances;
    }, 0);
    expect(new Set(meshes.map((mesh) => mesh.geometry)).size).toBe(3);
    expect(new Set(meshes.map((mesh) => mesh.material)).size).toBe(3);
    expect(
      meshes.some(
        (mesh) =>
          mesh.geometry instanceof THREE.CircleGeometry ||
          mesh.geometry instanceof THREE.TorusGeometry,
      ),
    ).toBe(false);
    expect(triangles).toBeLessThan(1_100);
    aperture.dispose();

    expect(interior.vortex.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(interior.spiral.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(interior.vortex.material.userData.shaderProgramMode).toBe("glsl");
    expect(interior.vortex.material.userData.magicPortalVariant).toBe("field");
    expect(interior.spiral.material.userData.magicPortalVariant).toBe("spiral");

    setMagicPortalOpen(portal, true);
    expect(interior.root.visible).toBe(true);
    const priorRuneOpacity = interior.runeArch.material.opacity;
    updateMagicPortal(portal, 2.5);
    expect(interior.runeArch.material.opacity).not.toBe(priorRuneOpacity);
    const vortexHandles = interior.vortex.material.userData
      .magicPortalHandles as MagicPortalUniformHandles;
    const spiralHandles = interior.spiral.material.userData
      .magicPortalHandles as MagicPortalUniformHandles;
    expect(vortexHandles.uTime.value).toBe(2.5);
    expect(spiralHandles.uTime.value).toBe(2.5);

    setMagicPortalOpen(portal, false);
    expect(interior.root.visible).toBe(false);
    setMagicPortalWarmupVisible(portal, true, false);
    expect(interior.root.visible).toBe(true);
    setMagicPortalWarmupVisible(portal, false, false);
    expect(interior.root.visible).toBe(false);
  });

  test("TSL mode builds field and spiral MeshBasicNodeMaterial graphs with shared handles", () => {
    resetShaderProgramModeRegistryForTests();
    setShaderProgramModeRegistry(createShaderProgramModeRegistry("tsl"));
    registerMagicPortalShaderFactory();

    const interior = createMagicPortalInterior(undefined, undefined, "tsl");
    const vortexMat = interior.vortex.material as MeshBasicNodeMaterial;
    const spiralMat = interior.spiral.material as MeshBasicNodeMaterial;

    expect(vortexMat).toBeInstanceOf(MeshBasicNodeMaterial);
    expect(spiralMat).toBeInstanceOf(MeshBasicNodeMaterial);
    expect(vortexMat.userData.shaderProgramMode).toBe("tsl");
    expect(spiralMat.userData.shaderProgramMode).toBe("tsl");
    expect(vortexMat.userData.magicPortalVariant).toBe("field");
    expect(spiralMat.userData.magicPortalVariant).toBe("spiral");
    expect(vortexMat.colorNode).toBeTruthy();
    expect(spiralMat.opacityNode).toBeTruthy();
    expect((vortexMat as unknown as THREE.ShaderMaterial).defines).toBeUndefined();

    const portal = new THREE.Group();
    portal.add(interior.root);
    setMagicPortalOpen(portal, true);
    updateMagicPortal(portal, 4.25);
    const vortexHandles = vortexMat.userData.magicPortalHandles as MagicPortalUniformHandles;
    const spiralHandles = spiralMat.userData.magicPortalHandles as MagicPortalUniformHandles;
    expect(vortexHandles.uTime.value).toBe(4.25);
    expect(spiralHandles.uTime.value).toBe(4.25);

    resetShaderProgramModeRegistryForTests();
  });

  test("factory id is registered for both modes", () => {
    resetShaderProgramModeRegistryForTests();
    registerMagicPortalShaderFactory();
    expect(getShaderProgramModeRegistry().supports(MAGIC_PORTAL_SHADER_FACTORY_ID, "glsl")).toBe(
      true,
    );
    expect(getShaderProgramModeRegistry().supports(MAGIC_PORTAL_SHADER_FACTORY_ID, "tsl")).toBe(
      true,
    );
    resetShaderProgramModeRegistryForTests();
  });

  test("wins only through the portal center", () => {
    const center = { x: 10, z: -4 };
    expect(isInsideMagicPortal({ x: 10, z: -4 }, center, true)).toBe(true);
    expect(
      isInsideMagicPortal({ x: 10 + MAGIC_PORTAL_ENTRY_RADIUS + 0.01, z: -4 }, center, true),
    ).toBe(false);
    expect(isInsideMagicPortal({ x: 10, z: -4 }, center, false)).toBe(false);
  });

  test("faces the portal toward a reachable approach cell", () => {
    for (const seed of ["PORTAL-FACE-1", "PORTAL-FACE-2", "PORTAL-FACE-3"]) {
      expect(Number.isFinite(magicPortalApproachYaw(generateDungeon(seed)))).toBe(true);
    }
  });
});
