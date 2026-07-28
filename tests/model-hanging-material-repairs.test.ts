import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { createImageSculptedAmbient } from "../src/world/AtmospherePropsKit";
import { createImageSculptedHanging } from "../src/world/ImageSculptedHangingKit";
import {
  getAttachedLocalModelMaterialVariants,
  getCuredMeatMaterial,
} from "../src/world/LocalModelMaterials";
import { getDungeonMood } from "../src/systems/DungeonMood";
import {
  applyMoodToDungeonMaterials,
  createDungeonMaterials,
  disposeDungeonMaterials,
} from "../src/world/MaterialLibrary";

function worldBounds(object: THREE.Object3D): THREE.Box3 {
  object.updateWorldMatrix(true, false);
  return new THREE.Box3().setFromObject(object);
}

function mesh(root: THREE.Object3D, name: string): THREE.Mesh {
  return root.getObjectByName(name) as THREE.Mesh;
}

function displayColor(color: THREE.Color): THREE.Color {
  return color.clone().convertLinearToSRGB();
}

describe("final hanging and ambient material repairs", () => {
  test("lifts and relights only the tattered banner cloth for dark-biome contrast", () => {
    const materials = createDungeonMaterials({ compact: true });
    const base = displayColor(materials.cloth.color);
    const banner = createImageSculptedHanging("tattered-banner", materials, 2.4, 0);
    const bannerCloth = mesh(banner, "Tattered oxblood cloth panel")
      .material as THREE.MeshStandardMaterial;

    expect(bannerCloth).not.toBe(materials.cloth);
    expect(bannerCloth.map).toBe(materials.cloth.map);
    expect(bannerCloth.userData.materialRole).toBe("tattered-banner-cloth");
    expect(bannerCloth.userData.localAlbedoValueScale).toBe(1.2);
    expect(bannerCloth.userData.localNormalScale).toBe(1.45);
    const lifted = displayColor(bannerCloth.color);
    expect(lifted.r / base.r).toBeCloseTo(1.2, 4);
    expect(lifted.g / base.g).toBeCloseTo(1.2, 4);
    expect(lifted.b / base.b).toBeCloseTo(1.2, 4);
    expect(bannerCloth.emissiveMap).toBe(bannerCloth.map);
    expect(bannerCloth.emissiveIntensity).toBe(0.1);
    expect(bannerCloth.normalScale.toArray()).toEqual(
      materials.cloth.normalScale.clone().multiplyScalar(1.45).toArray(),
    );
    expect(materials.cloth.emissiveIntensity).not.toBe(0.1);

    disposeDungeonMaterials(materials);
  });

  test("raises only banner cloth fill when frost and obsidian lower its local value", () => {
    for (const moodId of ["frost", "obsidian"] as const) {
      const materials = createDungeonMaterials({ compact: true });
      const mood = getDungeonMood(moodId);
      applyMoodToDungeonMaterials(materials, mood.surfaceTint, 0.9 + mood.surfaceStrength * 0.25);
      const banner = createImageSculptedHanging("tattered-banner", materials, 2.4, 0);
      const bannerCloth = mesh(banner, "Tattered oxblood cloth panel")
        .material as THREE.MeshStandardMaterial;

      expect(bannerCloth.userData.darkBiomeCompensation).toBeGreaterThan(0.8);
      expect(bannerCloth.userData.localAlbedoValueScale).toBeGreaterThan(1.5);
      expect(bannerCloth.emissiveIntensity).toBeGreaterThan(0.27);
      expect(materials.cloth.userData.darkBiomeCompensation).toBeUndefined();

      disposeDungeonMaterials(materials);
    }
  });

  test("shares one readable local root clone across vine and ground tangle", () => {
    const materials = createDungeonMaterials({ compact: true });
    const base = displayColor(materials.root.color);
    const vine = createImageSculptedHanging("hanging-vine", materials, 2.4, 0);
    const tangle = createImageSculptedAmbient("ground-root-tangle", materials, 0);
    const vineMaterial = mesh(vine, "Single S-curved vine stem")
      .material as THREE.MeshStandardMaterial;
    const tangleMaterial = mesh(tangle, "Long irregular crossing ground root")
      .material as THREE.MeshStandardMaterial;

    expect(vineMaterial).toBe(tangleMaterial);
    expect(vineMaterial).not.toBe(materials.root);
    expect(vineMaterial.userData.materialRole).toBe("readable-root-bark");
    expect(vineMaterial.userData.localAlbedoValueScale).toBe(1.15);
    const lifted = displayColor(vineMaterial.color);
    expect(lifted.r / base.r).toBeCloseTo(1.15, 4);
    expect(lifted.g / base.g).toBeCloseTo(1.15, 4);
    expect(lifted.b / base.b).toBeCloseTo(1.15, 4);
    expect(vineMaterial.emissiveMap).toBe(vineMaterial.map);
    expect(vineMaterial.emissiveIntensity).toBe(0.245);
    vine.traverse((object) => {
      if (object instanceof THREE.Mesh) expect(object.material).toBe(vineMaterial);
    });
    for (const groundRoot of tangle.getObjectsByProperty(
      "name",
      "Long irregular crossing ground root",
    ) as THREE.Mesh[]) {
      expect(groundRoot.material).toBe(vineMaterial);
    }
    expect(mesh(tangle, "Dry stump cut face").material).toBe(materials.wood);

    disposeDungeonMaterials(materials);
  });

  test("uses the lazy organic PBR material on meat and keeps its runtime channels bounded", () => {
    const materials = createDungeonMaterials({ compact: true });
    const hooks = createImageSculptedHanging("meat-hooks", materials, 2.4, 0);
    const meat = mesh(hooks, "Low-poly cured meat haunch");
    const material = meat.material as THREE.MeshStandardMaterial;

    expect(material).toBe(getCuredMeatMaterial(materials));
    expect(material).not.toBe(materials.cloth);
    expect(material.userData.materialRole).toBe("cured-meat");
    expect(material.userData.organicSurface).toBe(true);
    expect(material.userData.effectiveRoughnessRange).toEqual([0.75, 0.81]);
    expect(material.metalness).toBe(0);
    expect(material.metalnessMap).toBeNull();
    expect(material.normalMap).not.toBeNull();
    expect(material.roughnessMap).not.toBeNull();
    expect(material.aoMap).not.toBeNull();
    expect(material.aoMap?.channel).toBe(0);
    for (const texture of [
      material.map,
      material.normalMap,
      material.roughnessMap,
      material.aoMap,
    ]) {
      expect(texture?.wrapS).toBe(THREE.ClampToEdgeWrapping);
      expect(texture?.wrapT).toBe(THREE.ClampToEdgeWrapping);
      expect(texture?.repeat.toArray()).toEqual([1, 1]);
      expect(texture?.userData.seamTreatment).toBe("source-image");
      expect(texture?.userData.uvStrategy).toBe("single-rear-longitudinal-seam-clamp");
    }
    expect(material.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(material.normalMap?.colorSpace).toBe(THREE.NoColorSpace);
    expect(hooks.userData.sculptRuntime.geometry.materialBatches).toBe(2);
    const band = mesh(hooks, "Haunch retaining iron band");
    const loadHook = hooks.getObjectsByProperty("name", "Round curved forged meat hook")[0]!;
    expect(band.material).toBe(materials.iron);
    expect(worldBounds(band).intersectsBox(worldBounds(meat))).toBe(true);
    expect(worldBounds(band).intersectsBox(worldBounds(loadHook))).toBe(true);
    expect(getAttachedLocalModelMaterialVariants(materials.cloth)).toContain(material);

    disposeDungeonMaterials(materials);
  });

  test("joins two four-link chains from the ceiling plate to the hook rack bar", () => {
    const materials = createDungeonMaterials({ compact: true });
    const hooks = createImageSculptedHanging("meat-hooks", materials, 2.4, 0);
    hooks.updateWorldMatrix(true, true);
    const plate = mesh(hooks, "Blackened iron ceiling plate");
    const bar = mesh(hooks, "Forged hook rack bar");
    const topEyes = hooks.getObjectsByProperty(
      "name",
      "Hook rack plate suspension eye",
    ) as THREE.Mesh[];
    const bottomEyes = hooks.getObjectsByProperty(
      "name",
      "Hook rack bar suspension eye",
    ) as THREE.Mesh[];
    const links = hooks.getObjectsByProperty(
      "name",
      "Hook rack support chain link",
    ) as THREE.Mesh[];

    expect(topEyes).toHaveLength(2);
    expect(bottomEyes).toHaveLength(2);
    expect(links).toHaveLength(8);
    for (const side of ["left", "right"] as const) {
      const top = topEyes.find((eye) => eye.userData.chainSide === side)!;
      const bottom = bottomEyes.find((eye) => eye.userData.chainSide === side)!;
      const sideLinks = links
        .filter((link) => link.userData.chainSide === side)
        .sort((a, b) => b.position.y - a.position.y);
      expect(sideLinks).toHaveLength(4);
      expect(worldBounds(top).intersectsBox(worldBounds(plate))).toBe(true);
      expect(worldBounds(sideLinks[0]!).intersectsBox(worldBounds(top))).toBe(true);
      for (let index = 1; index < sideLinks.length; index += 1) {
        expect(
          worldBounds(sideLinks[index]!).intersectsBox(worldBounds(sideLinks[index - 1]!)),
        ).toBe(true);
      }
      expect(worldBounds(sideLinks.at(-1)!).intersectsBox(worldBounds(bottom))).toBe(true);
      expect(worldBounds(bottom).intersectsBox(worldBounds(bar))).toBe(true);
    }
    expect(hooks.userData.sculptRuntime.geometry.triangles).toBeLessThanOrEqual(3_000);

    disposeDungeonMaterials(materials);
  });
});
