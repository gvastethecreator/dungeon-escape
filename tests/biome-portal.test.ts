import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { listBiomeIds, type BiomeId } from "../src/systems/BiomeIdentity";
import { getBiomePortalProfile } from "../src/world/BiomePortalProfile";
import {
  MAGIC_PORTAL_APERTURE,
  MAGIC_PORTAL_NAMES,
  createBiomeMagicPortal,
  setMagicPortalOpen,
  type BiomeMagicPortal,
} from "../src/world/MagicPortalKit";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";

const BIOME_IDS = [
  "ancient",
  "molten",
  "frost",
  "grim",
  "verdant",
  "ash",
  "iron",
  "obsidian",
  "sunken",
  "fungal",
  "backrooms",
] as const satisfies readonly BiomeId[];

const EXPECTED_SEAL_GEOMETRIES = {
  bars: ["BoxGeometry", "ConeGeometry", "CylinderGeometry"],
  crossed: ["BoxGeometry"],
  organic: ["TubeGeometry"],
  bulkhead: ["BoxGeometry", "SphereGeometry"],
} as const;

function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) meshes.push(child);
  });
  return meshes;
}

function collectStandardMaterials(root: THREE.Object3D): THREE.MeshStandardMaterial[] {
  const materials = new Set<THREE.MeshStandardMaterial>();
  for (const mesh of collectMeshes(root)) {
    const meshMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of meshMaterials) {
      if (material instanceof THREE.MeshStandardMaterial) materials.add(material);
    }
  }
  return [...materials];
}

function applyDungeonWorldPortalState(portal: BiomeMagicPortal, open: boolean): void {
  portal.seal.visible = !open;
  setMagicPortalOpen(portal.root, open);
}

describe("biome portal profiles", () => {
  test("cover every biome with a unique architecture, signature, and palette", () => {
    expect([...listBiomeIds()]).toEqual([...BIOME_IDS]);

    const profiles = BIOME_IDS.map((id) => getBiomePortalProfile(id));
    expect(profiles.map((profile) => profile.biomeId)).toEqual([...BIOME_IDS]);
    expect(new Set(profiles.map((profile) => profile.architecture)).size).toBe(BIOME_IDS.length);
    expect(new Set(profiles.map((profile) => profile.signature)).size).toBe(BIOME_IDS.length);

    expect(new Set(profiles.map((profile) => profile.material)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(profiles.map((profile) => profile.sealKind))).toEqual(
      new Set(["bars", "crossed", "organic", "bulkhead"]),
    );
    expect(new Set(profiles.map((profile) => profile.frameColor)).size).toBe(BIOME_IDS.length);
    expect(new Set(profiles.map((profile) => profile.sealColor)).size).toBe(BIOME_IDS.length);
    expect(new Set(profiles.map((profile) => profile.accentColor)).size).toBe(BIOME_IDS.length);
    expect(new Set(profiles.map((profile) => profile.magicColor)).size).toBe(BIOME_IDS.length);

    const paletteFingerprints = profiles.map((profile) =>
      [
        profile.frameColor,
        profile.frameEmissive,
        profile.accentColor,
        profile.sealColor,
        profile.deepColor,
        profile.magicColor,
        profile.brightColor,
      ].join(":"),
    );
    expect(new Set(paletteFingerprints).size).toBe(BIOME_IDS.length);
  });
});

describe("biome magic portal assemblies", () => {
  for (const biomeId of BIOME_IDS) {
    test(`${biomeId} builds its full arch, seal, and shader field`, () => {
      const portal = createBiomeMagicPortal(biomeId, createDungeonMaterials({ compact: true }));
      const profile = getBiomePortalProfile(biomeId);

      expect(portal.profile).toBe(profile);
      expect(portal.root.name).toBe(MAGIC_PORTAL_NAMES.gate);
      expect(portal.root.children).toContain(portal.frame);
      expect(portal.root.children).toContain(portal.seal);
      expect(portal.root.children).toContain(portal.trim);
      expect(portal.root.children).toContain(portal.interior.root);
      expect(portal.root.getObjectByName(MAGIC_PORTAL_NAMES.frame)).toBe(portal.frame);
      expect(portal.root.getObjectByName(MAGIC_PORTAL_NAMES.seal)).toBe(portal.seal);
      expect(portal.root.getObjectByName(MAGIC_PORTAL_NAMES.trim)).toBe(portal.trim);
      expect(portal.root.getObjectByName(MAGIC_PORTAL_NAMES.interior)).toBe(portal.interior.root);

      expect(portal.root.userData).toMatchObject({
        biomeId,
        architecture: profile.architecture,
        signature: profile.signature,
        portalOpen: false,
      });
      expect(portal.frame.userData).toMatchObject({
        biomeId,
        architecture: profile.architecture,
      });
      expect(portal.seal.userData).toMatchObject({ biomeId, kind: profile.sealKind });
      expect(portal.interior.root.userData).toMatchObject({
        biomeId,
        architecture: profile.architecture,
      });

      const signature = portal.root.getObjectByName(
        `${MAGIC_PORTAL_NAMES.signature}: ${profile.signature}`,
      );
      expect(signature?.userData).toMatchObject({
        biomeId,
        architecture: profile.architecture,
        signature: profile.signature,
      });

      const apertureLayers = [portal.interior.veil, portal.interior.vortex, portal.interior.spiral];
      expect(new Set(apertureLayers.map((layer) => layer.geometry)).size).toBe(1);
      for (const layer of apertureLayers) {
        expect(layer.geometry).toBeInstanceOf(THREE.ShapeGeometry);
        expect(layer.geometry).not.toBeInstanceOf(THREE.CircleGeometry);
      }
      expect(
        collectMeshes(portal.interior.root).some(
          (mesh) => mesh.geometry instanceof THREE.CircleGeometry,
        ),
      ).toBe(false);

      const bounds = portal.interior.vortex.geometry.boundingBox;
      expect(bounds).not.toBeNull();
      expect(bounds!.min.x).toBeCloseTo(-MAGIC_PORTAL_APERTURE.halfWidth);
      expect(bounds!.max.x).toBeCloseTo(MAGIC_PORTAL_APERTURE.halfWidth);
      expect(bounds!.min.y).toBeCloseTo(MAGIC_PORTAL_APERTURE.baseY);
      expect(bounds!.max.y).toBeCloseTo(MAGIC_PORTAL_APERTURE.apexY);
      expect(bounds!.max.y - bounds!.min.y).toBeGreaterThan((bounds!.max.x - bounds!.min.x) * 2);

      for (const material of [portal.interior.vortex.material, portal.interior.spiral.material]) {
        expect(material.uniforms.uTime?.value).toBe(0);
        const deepColor = material.uniforms.uDeepColor?.value;
        const magicColor = material.uniforms.uMagicColor?.value;
        const brightColor = material.uniforms.uBrightColor?.value;
        expect(deepColor).toBeInstanceOf(THREE.Color);
        expect(magicColor).toBeInstanceOf(THREE.Color);
        expect(brightColor).toBeInstanceOf(THREE.Color);
        expect((deepColor as THREE.Color).getHex()).toBe(profile.deepColor);
        expect((magicColor as THREE.Color).getHex()).toBe(profile.magicColor);
        expect((brightColor as THREE.Color).getHex()).toBe(profile.brightColor);
        expect(material.uniforms.uPrimaryArms?.value).toBe(profile.primaryArms);
        expect(material.uniforms.uSecondaryArms?.value).toBe(profile.secondaryArms);
        expect(material.uniforms.uRadialFrequency?.value).toBe(profile.radialFrequency);
        expect(material.uniforms.uFlowSpeed?.value).toBe(profile.flowSpeed);
        expect(material.uniforms.uCounterSpeed?.value).toBe(profile.counterSpeed);
        expect(material.uniforms.uSpiralSharpness?.value).toBe(profile.spiralSharpness);
      }

      const frameMaterials = collectStandardMaterials(portal.frame);
      const frameMaterial = frameMaterials.find(
        (material) => material.name === `${biomeId} portal frame material`,
      );
      expect(frameMaterial?.color.getHex()).toBe(profile.frameColor);
      expect(frameMaterial?.emissive.getHex()).toBe(profile.frameEmissive);
      expect(frameMaterial?.emissiveIntensity).toBe(profile.frameEmissiveIntensity);
      expect(frameMaterial?.metalness).toBe(profile.frameMetalness);
      expect(frameMaterial?.roughness).toBe(profile.frameRoughness);

      const sealMaterials = collectStandardMaterials(portal.seal);
      const sealMaterial = sealMaterials.find(
        (material) => material.name === `${biomeId} portal seal material`,
      );
      const sealAccent = sealMaterials.find(
        (material) => material.name === `${biomeId} portal accent material`,
      );
      expect(sealMaterial?.color.getHex()).toBe(
        new THREE.Color(profile.sealColor).multiplyScalar(0.62).getHex(),
      );
      if (profile.sealKind === "bars") {
        expect(sealAccent).toBeUndefined();
        expect(sealMaterials).toHaveLength(1);
      } else {
        expect(sealAccent?.color.getHex()).toBe(profile.accentColor);
        expect(sealMaterials).toHaveLength(2);
      }
      expect(portal.seal.userData.runtimeBatching.sourceGeometryTypes).toEqual(
        [...EXPECTED_SEAL_GEOMETRIES[profile.sealKind]].sort(),
      );
      expect(portal.seal.userData.runtimeBatching.drawCalls).toBeLessThanOrEqual(2);

      expect(portal.trim.material.color.getHex()).toBe(profile.accentColor);
      expect(portal.trim.material.emissive.getHex()).toBe(profile.accentColor);

      expect(portal.seal.visible).toBe(true);
      expect(portal.interior.root.visible).toBe(false);
      applyDungeonWorldPortalState(portal, true);
      expect(portal.root.userData.portalOpen).toBe(true);
      expect(portal.seal.visible).toBe(false);
      expect(portal.interior.root.visible).toBe(true);
      applyDungeonWorldPortalState(portal, false);
      expect(portal.root.userData.portalOpen).toBe(false);
      expect(portal.seal.visible).toBe(true);
      expect(portal.interior.root.visible).toBe(false);
    });
  }
});
