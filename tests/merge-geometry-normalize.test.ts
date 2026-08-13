import { describe, expect, test } from "bun:test";
import * as THREE from "three";

import { normalizeGeometryForMerge } from "../src/world/MergeGeometryNormalize";

describe("normalizeGeometryForMerge", () => {
  test("bakes the matrix, fills uv, and strips extras", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.setAttribute(
      "skinIndex",
      new THREE.BufferAttribute(new Float32Array(geometry.getAttribute("position").count), 1),
    );
    const matrix = new THREE.Matrix4().makeTranslation(2, 0, 0);
    const normalized = normalizeGeometryForMerge(geometry, matrix);
    expect(normalized.getAttribute("uv")).toBeDefined();
    expect(normalized.getAttribute("normal")).toBeDefined();
    expect(normalized.getAttribute("skinIndex")).toBeUndefined();
    expect(normalized.getAttribute("position").array[0]).not.toBe(geometry.getAttribute("position").array[0]);
  });

  test("keeps vertex color when requested", () => {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const normalized = normalizeGeometryForMerge(geometry, new THREE.Matrix4(), { keepColor: true });
    expect(normalized.getAttribute("color")).toBeDefined();
    expect(normalized.getAttribute("color").array[0]).toBe(1);
  });
});
