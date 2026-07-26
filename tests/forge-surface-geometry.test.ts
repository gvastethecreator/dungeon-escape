import { describe, expect, test } from "bun:test";
import { BufferGeometry, Float32BufferAttribute, PlaneGeometry } from "three";

import { auditAndRepairForgeSurface } from "../src/forge/SurfaceGeometryAudit";

describe("Forge surface geometry audit", () => {
  test("keeps complete geometry unchanged", () => {
    const geometry = new PlaneGeometry(1, 1);
    const result = auditAndRepairForgeSurface("banner", geometry);

    expect(result.vertexCount).toBeGreaterThanOrEqual(4);
    expect(result.repairedNormals).toBe(false);
    expect(result.repairedUvs).toBe(false);
  });

  test("repairs normals and UVs for raw procedural triangles", () => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 2, 0], 3));

    const result = auditAndRepairForgeSurface("raw-triangle", geometry);
    const uv = geometry.getAttribute("uv");

    expect(result.repairedNormals).toBe(true);
    expect(result.repairedUvs).toBe(true);
    expect(geometry.getAttribute("normal")?.count).toBe(3);
    expect(uv?.count).toBe(3);
    for (let index = 0; index < (uv?.count ?? 0); index += 1) {
      expect(uv.getX(index)).toBeGreaterThanOrEqual(0);
      expect(uv.getX(index)).toBeLessThanOrEqual(1);
      expect(uv.getY(index)).toBeGreaterThanOrEqual(0);
      expect(uv.getY(index)).toBeLessThanOrEqual(1);
    }
  });

  test("rejects empty surfaces before instancing", () => {
    expect(() => auditAndRepairForgeSurface("empty", new BufferGeometry())).toThrow(
      'Forge geometry "empty" has no renderable surface.',
    );
  });
});
