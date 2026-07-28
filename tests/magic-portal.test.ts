import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import {
  MAGIC_PORTAL_APERTURE,
  MAGIC_PORTAL_ENTRY_RADIUS,
  MAGIC_PORTAL_NAMES,
  createMagicPortalInterior,
  createPortalApertureGeometry,
  isInsideMagicPortal,
  magicPortalApproachYaw,
  setMagicPortalOpen,
  setMagicPortalWarmupVisible,
  updateMagicPortal,
} from "../src/world/MagicPortalKit";

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
    expect(new Set(meshes.map((mesh) => mesh.material)).size).toBe(4);
    expect(
      meshes.some(
        (mesh) =>
          mesh.geometry instanceof THREE.CircleGeometry ||
          mesh.geometry instanceof THREE.TorusGeometry,
      ),
    ).toBe(false);
    expect(triangles).toBeLessThan(1_100);
    aperture.dispose();

    setMagicPortalOpen(portal, true);
    expect(interior.root.visible).toBe(true);
    const priorRuneOpacity = interior.runeArch.material.opacity;
    updateMagicPortal(portal, 2.5);
    expect(interior.runeArch.material.opacity).not.toBe(priorRuneOpacity);
    expect(interior.vortex.material.uniforms.uTime?.value).toBe(2.5);
    expect(interior.spiral.material.uniforms.uTime?.value).toBe(2.5);

    setMagicPortalOpen(portal, false);
    expect(interior.root.visible).toBe(false);
    setMagicPortalWarmupVisible(portal, true, false);
    expect(interior.root.visible).toBe(true);
    setMagicPortalWarmupVisible(portal, false, false);
    expect(interior.root.visible).toBe(false);
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
