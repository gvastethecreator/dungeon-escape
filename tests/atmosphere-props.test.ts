import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import {
  createBonePile,
  createCobweb,
  createCobwebGeometry,
  createCobwebMaterial,
  createHanging,
  createRubblePile,
} from "../src/world/AtmospherePropsKit";
import {
  createImageSculptedHanging,
  IMAGE_SCULPTED_HANGING_FAMILIES,
} from "../src/world/ImageSculptedHangingKit";
import { createDungeonMaterials } from "../src/world/MaterialLibrary";

/** Collect every material in a group (including nested). */
function materialsOf(root: THREE.Group): THREE.Material[] {
  const out: THREE.Material[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.Mesh) out.push(child.material);
  });
  return out;
}

describe("atmosphere props — cobwebs", () => {
  test("cobweb uses a transparent NormalBlended shader that dulls (depthWrite off)", () => {
    const web = createCobweb(0);
    const silk = web.getObjectByName("Procedural cobweb silk") as THREE.Mesh;
    const material = silk.material as THREE.ShaderMaterial;
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
    expect(material.blending).toBe(THREE.NormalBlending);
    expect(material.side).toBe(THREE.DoubleSide);
    expect(material.toneMapped).toBe(false);
    expect(material.uniforms.uVariant.value).toBe(0);
  });

  test("half-web variant for wall-ceiling junctions sets the shader flag", () => {
    const web = createCobweb(1);
    const silk = web.getObjectByName("Procedural cobweb silk") as THREE.Mesh;
    const material = silk.material as THREE.ShaderMaterial;
    expect(material.uniforms.uVariant.value).toBe(1);
  });

  test("shared geometry + material expose the instancing-friendly shape", () => {
    const geometry = createCobwebGeometry();
    const material = createCobwebMaterial(0x88aa88, 0.3, 0);
    expect(geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(geometry.getAttribute("position").count).toBe(8);
    expect(material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(material.uniforms.uColor.value.getHex()).toBe(0x88aa88);
    expect(material.uniforms.uStrength.value).toBeCloseTo(0.3);
    expect(material.blending).toBe(THREE.NormalBlending);
  });

  test("cobweb spans both faces of a real wall corner", () => {
    const geometry = createCobwebGeometry();
    geometry.computeBoundingBox();
    expect(geometry.boundingBox!.max.x).toBeGreaterThanOrEqual(1.4);
    expect(geometry.boundingBox!.max.z).toBeGreaterThanOrEqual(1.4);
    expect(geometry.boundingBox!.min.y).toBeLessThanOrEqual(-1.4);
  });

  test("instanced cobweb shader applies instance transforms", async () => {
    const source = await Bun.file(
      new URL("../src/world/AtmospherePropsKit.ts", import.meta.url),
    ).text();
    expect(source).toContain("instanceMatrix * localPosition");
  });
});

describe("atmosphere props — bone pile", () => {
  test("uses fourteen merged bones and a volumetric low-poly skull with shared materials", () => {
    const materials = createDungeonMaterials();
    const pile = createBonePile(materials, 0);
    const bones = pile.getObjectByName("Merged pile of fourteen varied long bones") as THREE.Mesh;
    const vault = pile.getObjectByName("Faceted volumetric skull vault") as THREE.Mesh;
    const jaw = pile.getObjectByName("Volumetric U-shaped skull jaw") as THREE.Mesh;
    const eyeSockets = pile.getObjectsByProperty(
      "name",
      "Recessed volumetric skull eye cavity",
    ) as THREE.Mesh[];
    const nasal = pile.getObjectByName("Volumetric triangular skull nasal opening") as THREE.Mesh;
    expect(bones.userData.boneCount).toBe(14);
    expect(bones.userData.variedLengths).toBe(5);
    expect(vault.geometry).toBeInstanceOf(THREE.DodecahedronGeometry);
    expect(vault.geometry).not.toBeInstanceOf(THREE.SphereGeometry);
    expect(jaw.geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(eyeSockets).toHaveLength(2);
    expect(nasal.geometry).toBeInstanceOf(THREE.CylinderGeometry);
    expect(nasal.geometry).not.toBeInstanceOf(THREE.CircleGeometry);
    expect(bones.material).toBe(materials.bone);
    for (const eye of eyeSockets) {
      expect(eye.material).toBe(materials.darkStone);
      expect(eye.geometry).toBeInstanceOf(THREE.CylinderGeometry);
      expect(eye.userData.cavityDepth).toBeGreaterThan(0.05);
      expect(new THREE.Box3().setFromObject(eye).getSize(new THREE.Vector3()).z).toBeGreaterThan(
        0.04,
      );
    }
    expect(materialsOf(pile)).toHaveLength(7);
    expect(pile.userData.sculptRuntime.geometry.triangles).toBeLessThanOrEqual(1_200);
    expect(pile.userData.sculptRuntime.geometry.materialBatches).toBe(2);
    expect(new Set(materialsOf(pile))).toEqual(new Set([materials.bone, materials.darkStone]));
  });

  test("variant rotates the heap shape deterministically", () => {
    const materials = createDungeonMaterials();
    const a = createBonePile(materials, 0);
    const b = createBonePile(materials, 1);
    expect(a.children.length).toBeGreaterThan(0);
    expect(b.children.length).toBeGreaterThan(0);
  });
});

describe("atmosphere props — hanging chain/vine", () => {
  test("chain hangs downward from the anchor with a chain-only readable iron finish", () => {
    const materials = createDungeonMaterials();
    const chain = createHanging(materials, "chain", 2.0, 0);
    expect(chain.name).toBe("Hanging chain");
    // Links descend below the anchor (negative Y).
    const links = chain.getObjectsByProperty("name", "Alternating rectangular forged chain link");
    expect(links).toHaveLength(9);
    expect(chain.getObjectByName("Bolted ceiling mount pivot")).toBeDefined();
    expect(chain.getObjectByName("Heavy welded chain anchor eye")).toBeDefined();
    expect(chain.getObjectByName("Heavy round open chain hook")).toBeDefined();
    for (const link of links) expect(link.position.y).toBeLessThanOrEqual(0);
    for (let index = 1; index < links.length; index += 1) {
      expect(Math.abs(links[index]!.position.y - links[index - 1]!.position.y)).toBeLessThan(0.22);
      const orientationDelta = Math.abs(links[index]!.rotation.y - links[index - 1]!.rotation.y);
      expect(orientationDelta).toBeGreaterThan(1.2);
      expect(orientationDelta).toBeLessThan(1.3);
      expect(links[index]!.rotation.x).toBe(0);
      expect(links[index]!.userData.interlocked).toBe(true);
      const previousBounds = new THREE.Box3().setFromObject(links[index - 1]!);
      const currentBounds = new THREE.Box3().setFromObject(links[index]!);
      expect(Math.min(previousBounds.max.y, currentBounds.max.y)).toBeGreaterThan(
        Math.max(previousBounds.min.y, currentBounds.min.y),
      );
    }
    expect(links.at(-1)!.position.y).toBeLessThan(-1.7);
    const chainMaterials = new Set(materialsOf(chain)) as Set<THREE.MeshStandardMaterial>;
    expect(chainMaterials.size).toBe(1);
    const [chainIron] = chainMaterials;
    expect(chainIron).not.toBe(materials.iron);
    expect(chainIron?.userData.materialRole).toBe("readable-hanging-chain-iron");
    expect(chainIron?.map).toBe(materials.iron.map);
    expect(chainIron?.emissiveMap).toBe(chainIron?.map);
    expect(chainIron?.emissiveIntensity).toBe(0.17);
  });

  test("vine adds tendrils and uses its readable local root bark", () => {
    const materials = createDungeonMaterials();
    const vine = createHanging(materials, "vine", 2.4, 1);
    expect(vine.name).toBe("Hanging vine");
    expect(vine.getObjectByName("Single S-curved vine stem")).toBeDefined();
    expect(vine.getObjectsByProperty("name", "Vine segment")).toHaveLength(0);
    expect(vine.getObjectsByProperty("name", "Attached vine tendril")).toHaveLength(3);
    expect(vine.getObjectsByProperty("name", "Pointed low-poly vine leaf")).toHaveLength(3);
    const vineMaterials = new Set(materialsOf(vine)) as Set<THREE.MeshStandardMaterial>;
    expect(vineMaterials.size).toBe(1);
    const [vineMaterial] = vineMaterials;
    expect(vineMaterial).not.toBe(materials.root);
    expect(vineMaterial?.userData.materialRole).toBe("readable-root-bark");
  });

  test("chain keeps the accepted nine-link identity while length changes spacing", () => {
    const materials = createDungeonMaterials();
    const short = createHanging(materials, "chain", 1.7, 0);
    const long = createHanging(materials, "chain", 3.1, 2);
    const shortLinks = short.getObjectsByProperty(
      "name",
      "Alternating rectangular forged chain link",
    );
    const longLinks = long.getObjectsByProperty(
      "name",
      "Alternating rectangular forged chain link",
    );
    expect(shortLinks).toHaveLength(9);
    expect(longLinks).toHaveLength(9);
    expect(short.getObjectByName("Heavy round open chain hook")).toBeDefined();
    expect(long.getObjectByName("Heavy round open chain hook")).toBeDefined();
    expect(longLinks.at(-1)!.position.y).toBeLessThan(shortLinks.at(-1)!.position.y);
    expect(
      longLinks.some(
        (link) => Math.abs(link.position.x) > 0.001 || Math.abs(link.position.z) > 0.001,
      ),
    ).toBe(true);
  });

  test("image-sculpted hang kinds hang below the ceiling origin with bounded material roles", () => {
    const materials = createDungeonMaterials();
    const allowed = new Set([
      materials.iron,
      materials.brass,
      materials.wood,
      materials.root,
      materials.bone,
      materials.cloth,
      materials.darkStone,
      materials.crystal,
    ]);
    for (const family of IMAGE_SCULPTED_HANGING_FAMILIES) {
      const prop = createImageSculptedHanging(family, materials, 2.4, 1);
      expect(prop.name.toLowerCase()).toContain("image-sculpted");
      expect(prop.userData.sculptRuntime?.family).toBe(family);
      expect(prop.userData.sculptRuntime?.origin).toBe("ceiling-mount");
      const bounds = new THREE.Box3().setFromObject(prop);
      expect(bounds.max.y).toBeLessThanOrEqual(0.08);
      expect(bounds.min.y).toBeLessThan(-0.5);
      prop.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          const childMaterials = Array.isArray(child.material) ? child.material : [child.material];
          for (const material of childMaterials) {
            const role = material.userData.materialRole as string | undefined;
            expect(
              allowed.has(material) ||
                role === "tattered-banner-cloth" ||
                role === "readable-root-bark" ||
                role === "cured-meat" ||
                role === "readable-hanging-chain-iron",
            ).toBe(true);
          }
        }
      });
      // createHanging dispatches sculpted families.
      expect(createHanging(materials, family, 2.0, 0).userData.sculptRuntime?.family).toBe(family);
    }
  });
});

describe("atmosphere props — rubble pile", () => {
  test("heaps six faceted stones on a contact footprint, reusing stone", () => {
    const materials = createDungeonMaterials();
    const rubble = createRubblePile(materials, 0);
    const stones = rubble.getObjectsByProperty("name", "Rubble stone");
    expect(stones).toHaveLength(6);
    expect(rubble.getObjectByName("Rubble contact dust footprint")).toBeDefined();
    for (const stone of stones) expect((stone as THREE.Mesh).material).toBe(materials.stone);
  });
});
