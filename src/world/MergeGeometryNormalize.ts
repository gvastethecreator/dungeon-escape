import * as THREE from "three";

export interface NormalizeGeometryForMergeOptions {
  /** Keep vertex colors; fill white when the source has none. */
  readonly keepColor?: boolean;
}

/**
 * Shared merge contract: world/local bake, normals, UVs, optional color, then
 * strip leftover attributes so BufferGeometryUtils.mergeGeometries can join parts.
 */
export function normalizeGeometryForMerge(
  geometry: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  options: NormalizeGeometryForMergeOptions = {},
): THREE.BufferGeometry {
  const next = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  next.applyMatrix4(matrix);
  if (!next.getAttribute("normal")) next.computeVertexNormals();
  if (!next.getAttribute("uv")) {
    next.setAttribute(
      "uv",
      new THREE.Float32BufferAttribute(new Float32Array(next.getAttribute("position").count * 2), 2),
    );
  }
  if (options.keepColor && !next.getAttribute("color")) {
    const colors = new Float32Array(next.getAttribute("position").count * 3);
    colors.fill(1);
    next.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  }
  const keep = new Set(["position", "normal", "uv"]);
  if (options.keepColor) keep.add("color");
  for (const attribute of Object.keys(next.attributes)) {
    if (!keep.has(attribute)) next.deleteAttribute(attribute);
  }
  next.clearGroups();
  return next;
}
