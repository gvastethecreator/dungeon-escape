import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { generateDungeon } from "../src/dungeon/generateDungeon";
import {
  MAGIC_PORTAL_ENTRY_RADIUS,
  MAGIC_PORTAL_NAMES,
  createMagicPortalInterior,
  isInsideMagicPortal,
  magicPortalApproachYaw,
  setMagicPortalOpen,
  setMagicPortalWarmupVisible,
  updateMagicPortal,
} from "../src/world/MagicPortalKit";

describe("magic portal", () => {
  test("builds a hidden animated vortex with a visible spiral", () => {
    const portal = new THREE.Group();
    const interior = createMagicPortalInterior();
    portal.add(interior.root);

    expect(interior.root.visible).toBe(false);
    expect(portal.getObjectByName(MAGIC_PORTAL_NAMES.vortex)).toBe(interior.vortex);
    expect(portal.getObjectByName(MAGIC_PORTAL_NAMES.spiral)).toBe(interior.spiral);

    setMagicPortalOpen(portal, true);
    expect(interior.root.visible).toBe(true);
    const priorRotation = interior.spiral.rotation.z;
    updateMagicPortal(portal, 2.5);
    expect(interior.spiral.rotation.z).not.toBe(priorRotation);
    expect(interior.vortex.material.uniforms.uTime?.value).toBe(2.5);

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
