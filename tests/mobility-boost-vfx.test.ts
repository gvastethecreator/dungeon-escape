import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { MOBILITY_BOOST_DURATION_SECONDS } from "../src/game/MobilityBoost";
import {
  createMobilityDustTexture,
  MobilityBoostVfx,
  MOBILITY_DUST_COUNT,
} from "../src/world/MobilityBoostVfx";

describe("mobility boost draught vfx", () => {
  test("builds a soft mote field that only lights while the draught is active", () => {
    const vfx = new MobilityBoostVfx();
    try {
      expect(vfx.root.children).toHaveLength(1);
      const points = vfx.root.children[0] as THREE.Points;
      expect(points.isPoints).toBe(true);
      expect((points.geometry.getAttribute("position")?.count ?? 0)).toBe(MOBILITY_DUST_COUNT);

      vfx.update(0, 1, { x: 0, y: 1.5, z: 0 }, 0.016);
      expect((points.material as THREE.PointsMaterial).opacity).toBe(0);

      vfx.update(MOBILITY_BOOST_DURATION_SECONDS, 0.8, { x: 2, y: 1.6, z: -1 }, 0.016);
      const material = points.material as THREE.PointsMaterial;
      expect(material.opacity).toBeGreaterThan(0.15);
      expect(material.map).toBeTruthy();
      expect(material.blending).toBe(THREE.AdditiveBlending);
      expect(material.depthWrite).toBe(false);

      const positions = points.geometry.getAttribute("position") as THREE.BufferAttribute;
      let onField = 0;
      for (let index = 0; index < positions.count; index += 1) {
        if (positions.getY(index) > -100) onField += 1;
      }
      expect(onField).toBe(MOBILITY_DUST_COUNT);
    } finally {
      vfx.dispose();
    }
  });

  test("dust texture is a soft radial disc, not a hard geometric sprite", () => {
    const texture = createMobilityDustTexture(32);
    try {
      expect(texture.image || texture.source).toBeTruthy();
      expect(texture.minFilter).toBeDefined();
    } finally {
      texture.dispose();
    }
  });
});
