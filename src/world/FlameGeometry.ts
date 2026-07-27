import * as THREE from "three";

/**
 * Low-poly flame tongue with a broad lower body, narrow shoulder and leaning
 * tip. Its profile stays readable as fire instead of a solid gem silhouette.
 */
export function createFlameTongueGeometry(
  radius: number,
  height: number,
  sides = 7,
  lean = 0,
): THREE.BufferGeometry {
  const rings = [
    { y: -0.5, radius: 0.42, lean: 0 },
    { y: -0.28, radius: 1, lean: lean * 0.08 },
    { y: 0.04, radius: 0.72, lean: lean * 0.34 },
    { y: 0.28, radius: 0.32, lean: lean * 0.68 },
  ] as const;
  const positions: number[] = [];
  const indices: number[] = [];
  for (const [ringIndex, ring] of rings.entries()) {
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2 + ringIndex * 0.11;
      positions.push(
        Math.cos(angle) * radius * ring.radius + ring.lean,
        ring.y * height,
        Math.sin(angle) * radius * ring.radius,
      );
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      const lower = ring * sides + side;
      const lowerNext = ring * sides + next;
      const upper = (ring + 1) * sides + side;
      const upperNext = (ring + 1) * sides + next;
      indices.push(lower, upper, lowerNext, lowerNext, upper, upperNext);
    }
  }
  const tip = positions.length / 3;
  positions.push(lean, height * 0.5, -radius * 0.08);
  const lastRing = (rings.length - 1) * sides;
  for (let side = 0; side < sides; side += 1) {
    indices.push(lastRing + side, tip, lastRing + ((side + 1) % sides));
  }
  const base = positions.length / 3;
  positions.push(0, height * -0.5, 0);
  for (let side = 0; side < sides; side += 1) {
    indices.push(base, (side + 1) % sides, side);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = "Authored low-poly flame tongue";
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}
