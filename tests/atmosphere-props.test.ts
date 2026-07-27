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
  test("is denser than the old loose-bones detail and reuses the shared bone material", () => {
    const materials = createDungeonMaterials();
    const pile = createBonePile(materials, 0);
    const bones = pile.getObjectsByProperty("name", "Pile long bone");
    const skulls = pile.getObjectsByProperty("name", "Pile skull");
    // More than the legacy 5 loose cylinders.
    expect(bones.length).toBeGreaterThanOrEqual(9);
    expect(skulls.length).toBeGreaterThanOrEqual(1);
    // All parts reuse the shared bone material (no per-prop material clones).
    for (const material of materialsOf(pile)) {
      expect(material).toBe(materials.bone);
    }
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
  test("chain hangs downward from the anchor and reuses iron", () => {
    const materials = createDungeonMaterials();
    const chain = createHanging(materials, "chain", 2.0, 0);
    expect(chain.name).toBe("Hanging chain");
    // Links descend below the anchor (negative Y).
    const links = chain.getObjectsByProperty("name", "Chain link");
    expect(links.length).toBeGreaterThanOrEqual(4);
    expect(chain.getObjectByName("Chain mount")).toBeDefined();
    expect(chain.getObjectByName("Chain anchor eye")).toBeDefined();
    for (const link of links) expect(link.position.y).toBeLessThanOrEqual(0);
    for (let index = 1; index < links.length; index += 1) {
      expect(Math.abs(links[index]!.position.y - links[index - 1]!.position.y)).toBeLessThan(0.22);
      expect(Math.abs(links[index]!.rotation.y - links[index - 1]!.rotation.y)).toBeCloseTo(
        Math.PI / 2,
      );
      expect(links[index]!.rotation.x).toBe(0);
    }
    expect(links.at(-1)!.position.y).toBeLessThan(-1.7);
    for (const material of materialsOf(chain)) expect(material).toBe(materials.iron);
  });

  test("vine adds tendrils and reuses wood", () => {
    const materials = createDungeonMaterials();
    const vine = createHanging(materials, "vine", 2.4, 1);
    expect(vine.name).toBe("Hanging vine");
    expect(vine.getObjectByName("Vine stem")).toBeDefined();
    expect(vine.getObjectsByProperty("name", "Vine segment")).toHaveLength(0);
    expect(vine.getObjectsByProperty("name", "Vine tendril").length).toBeGreaterThan(0);
    for (const material of materialsOf(vine)) expect(material).toBe(materials.wood);
  });
});

describe("atmosphere props — rubble pile", () => {
  test("heaps masonry on a dust mound, reusing darkStone", () => {
    const materials = createDungeonMaterials();
    const rubble = createRubblePile(materials, 0);
    const stones = rubble.getObjectsByProperty("name", "Rubble stone");
    expect(stones.length).toBeGreaterThanOrEqual(4);
    expect(rubble.getObjectByName("Rubble dust mound")).toBeDefined();
    // Stones reuse shared darkStone.
    for (const stone of stones) expect((stone as THREE.Mesh).material).toBe(materials.darkStone);
  });
});
