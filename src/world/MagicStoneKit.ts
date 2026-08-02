import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { StoneId } from "../ui/copy";
import { stoneLabel } from "../ui/copy";
import { getDungeonMaterialVariant, type DungeonMaterials } from "./MaterialLibrary";

export interface MagicStoneVisual {
  root: THREE.Group;
  crystalAssembly: THREE.Group;
  glow: THREE.Mesh;
  crown: THREE.Mesh;
  light: THREE.PointLight;
  stoneId: StoneId;
  baseColor: number;
  emissive: number;
  effectColor: number;
  baseLightIntensity: number;
  baseGlowOpacity: number;
}

/** Muted grimdark pixel palette — desaturated, no neon bloom. */
const STONE_LOOK: Record<
  StoneId,
  { body: number; emissive: number; light: number; crystal: number }
> = {
  ember: { body: 0x4a221c, emissive: 0xb04a28, light: 0xa84a2e, crystal: 0xc07048 },
  ash: { body: 0x3e4240, emissive: 0x8a8880, light: 0x9a968c, crystal: 0xb0aca0 },
  crypt: { body: 0x2a343c, emissive: 0x4a7a8c, light: 0x4a7080, crystal: 0x6a8a98 },
  verdant: { body: 0x243428, emissive: 0x3a6a48, light: 0x3a6048, crystal: 0x5a7a60 },
};

interface CrystalRing {
  y: number;
  radiusX: number;
  radiusZ: number;
  offsetX?: number;
  offsetZ?: number;
  twist?: number;
}

interface StoneSculptProfile {
  pedestalRadius: number;
  pedestalHeight: number;
  cageRadius: number;
  cageY: number;
  cagePosts: number;
  crownY: number;
  collider: readonly [number, number, number];
  details: readonly string[];
}

const STONE_SCULPT: Record<StoneId, StoneSculptProfile> = {
  ember: {
    pedestalRadius: 0.48,
    pedestalHeight: 0.38,
    cageRadius: 0.43,
    cageY: 0.67,
    cagePosts: 6,
    crownY: 1.58,
    collider: [1.02, 1.58, 1.02],
    details: [
      "tall single red core",
      "two lower shards",
      "six-post middle cage",
      "deep hot-rune plinth",
    ],
  },
  ash: {
    pedestalRadius: 0.5,
    pedestalHeight: 0.44,
    cageRadius: 0.41,
    cageY: 0.72,
    cagePosts: 6,
    crownY: 1.4,
    collider: [1.04, 1.42, 1.04],
    details: ["split pale crown", "dark open cleft", "six-post cage", "broad stepped rune plinth"],
  },
  crypt: {
    pedestalRadius: 0.46,
    pedestalHeight: 0.53,
    cageRadius: 0.38,
    cageY: 0.8,
    cagePosts: 4,
    crownY: 1.66,
    collider: [0.96, 1.66, 0.96],
    details: ["tall cyan monolith", "three lower satellites", "raised cage", "tall rune plinth"],
  },
  verdant: {
    pedestalRadius: 0.51,
    pedestalHeight: 0.5,
    cageRadius: 0.43,
    cageY: 0.76,
    cagePosts: 4,
    crownY: 1.48,
    collider: [1.1, 1.5, 1.04],
    details: [
      "three-shard olive crown",
      "two lower chips",
      "low four-brace cage",
      "blocky plant-rune plinth",
    ],
  },
};

function crystalLoftGeometry(
  rings: readonly CrystalRing[],
  sides: number,
  phase = 0,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const [ringIndex, ring] of rings.entries()) {
    for (let side = 0; side < sides; side += 1) {
      const angle = phase + (side / sides) * Math.PI * 2 + (ring.twist ?? 0);
      const irregularity = 1 + Math.sin(side * 2.37 + ringIndex * 1.11) * 0.055;
      positions.push(
        (ring.offsetX ?? 0) + Math.sin(angle) * ring.radiusX * irregularity,
        ring.y,
        (ring.offsetZ ?? 0) + Math.cos(angle) * ring.radiusZ * irregularity,
      );
      uvs.push(side / sides, ringIndex / Math.max(1, rings.length - 1));
    }
  }
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      const lower = ring * sides + side;
      const lowerNext = ring * sides + next;
      const upper = (ring + 1) * sides + side;
      const upperNext = (ring + 1) * sides + next;
      indices.push(lower, upper, upperNext, lower, upperNext, lowerNext);
    }
  }
  const bottomCenter = positions.length / 3;
  positions.push(rings[0].offsetX ?? 0, rings[0].y, rings[0].offsetZ ?? 0);
  uvs.push(0.5, 0);
  const top = rings[rings.length - 1];
  const topCenter = positions.length / 3;
  positions.push(top.offsetX ?? 0, top.y, top.offsetZ ?? 0);
  uvs.push(0.5, 1);
  for (let side = 0; side < sides; side += 1) {
    const next = (side + 1) % sides;
    indices.push(bottomCenter, next, side);
    const topOffset = (rings.length - 1) * sides;
    indices.push(topCenter, topOffset + side, topOffset + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const faceted = geometry.toNonIndexed();
  geometry.dispose();
  const facetedPosition = faceted.getAttribute("position") as THREE.BufferAttribute;
  const facetedUv = faceted.getAttribute("uv") as THREE.BufferAttribute;
  const capBounds = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number }>();
  for (let triangle = 0; triangle < facetedPosition.count; triangle += 3) {
    const y0 = facetedPosition.getY(triangle);
    const y1 = facetedPosition.getY(triangle + 1);
    const y2 = facetedPosition.getY(triangle + 2);
    if (Math.max(y0, y1, y2) - Math.min(y0, y1, y2) > 1e-6) continue;
    const key = ((y0 + y1 + y2) / 3).toFixed(6);
    const bounds = capBounds.get(key) ?? {
      minX: Number.POSITIVE_INFINITY,
      maxX: Number.NEGATIVE_INFINITY,
      minZ: Number.POSITIVE_INFINITY,
      maxZ: Number.NEGATIVE_INFINITY,
    };
    for (let vertex = triangle; vertex < triangle + 3; vertex += 1) {
      bounds.minX = Math.min(bounds.minX, facetedPosition.getX(vertex));
      bounds.maxX = Math.max(bounds.maxX, facetedPosition.getX(vertex));
      bounds.minZ = Math.min(bounds.minZ, facetedPosition.getZ(vertex));
      bounds.maxZ = Math.max(bounds.maxZ, facetedPosition.getZ(vertex));
    }
    capBounds.set(key, bounds);
  }
  for (let triangle = 0; triangle < facetedPosition.count; triangle += 3) {
    const y0 = facetedPosition.getY(triangle);
    const y1 = facetedPosition.getY(triangle + 1);
    const y2 = facetedPosition.getY(triangle + 2);
    if (Math.max(y0, y1, y2) - Math.min(y0, y1, y2) > 1e-6) continue;
    const key = ((y0 + y1 + y2) / 3).toFixed(6);
    const bounds = capBounds.get(key)!;
    const width = Math.max(1e-6, bounds.maxX - bounds.minX);
    const depth = Math.max(1e-6, bounds.maxZ - bounds.minZ);
    for (let vertex = triangle; vertex < triangle + 3; vertex += 1) {
      facetedUv.setXY(
        vertex,
        (facetedPosition.getX(vertex) - bounds.minX) / width,
        (facetedPosition.getZ(vertex) - bounds.minZ) / depth,
      );
    }
  }
  facetedUv.needsUpdate = true;
  faceted.computeVertexNormals();
  return faceted;
}

function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
}

function mergeParts(parts: THREE.BufferGeometry[], name: string): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error(`Could not merge ${name}.`);
  merged.name = name;
  return merged;
}

function ritualGroundLightGeometry(stoneId: StoneId, radius: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [
    new THREE.RingGeometry(radius * 0.7, radius * 0.82, 8).rotateX(-Math.PI / 2),
    new THREE.RingGeometry(radius * 0.34, radius * 0.4, 8).rotateX(-Math.PI / 2),
  ];
  const tickCount = stoneId === "ember" ? 6 : stoneId === "ash" ? 5 : 4;
  const phase = stoneId === "crypt" ? Math.PI / 4 : stoneId === "verdant" ? Math.PI / 8 : 0;
  for (let index = 0; index < tickCount; index += 1) {
    const angle = phase + (index / tickCount) * Math.PI * 2;
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.sin(angle) * radius * 0.56, 0, Math.cos(angle) * radius * 0.56),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    parts.push(new THREE.BoxGeometry(radius * 0.075, 0.012, radius * 0.19).applyMatrix4(transform));
  }
  const geometry = mergeParts(parts, `${stoneId} open ritual ground light geometry`);
  geometry.userData.closedDisc = false;
  geometry.userData.role = "ground-contact-signal";
  geometry.userData.tickCount = tickCount;
  return geometry;
}

/**
 * Procedural rebuild of Imagine white-background multi-view stone refs.
 * Faceted crystal core + iron cage + rune pedestal — action-ready pickup.
 */
export function createMagicStone(
  stoneId: StoneId,
  materials: DungeonMaterials,
  texture?: THREE.Texture | null,
): MagicStoneVisual {
  const look = STONE_LOOK[stoneId];
  const sculpt = STONE_SCULPT[stoneId];
  const root = new THREE.Group();
  root.name = `Magic stone ${stoneLabel(stoneId)}`;
  root.userData.pickupKind = "stone";
  root.userData.stoneId = stoneId;
  root.userData.reference = {
    assetId: `${stoneId}-stone-v2`,
    image: `assets-source/imagegen/model-references-v2/magic/${stoneId}-stone-three-view.png`,
    views: ["front", "right", "rear-left"],
  };
  root.userData.detailInventory = [...sculpt.details];
  root.userData.sculptRuntime = {
    sourceImage: `assets-source/imagegen/model-references-v2/magic/${stoneId}-stone-three-view.png`,
    family: `magic-stone-${stoneId}`,
    units: "meters",
    collider: {
      type: "box",
      size: [...sculpt.collider],
      offset: [0, sculpt.collider[1] / 2, 0],
    },
    nodes: ["pedestal", "cage", "core", "satellite-shards", "runes", "beacon"],
    sockets: ["pickup", "vfx", "light"],
    pivots: { pickup: [0, sculpt.pedestalHeight, 0], vfx: [0, sculpt.cageY, 0] },
    destructionGroups: ["base", "cage", "crystal"],
  };
  root.userData.lightingProfile = {
    grounded: true,
    plantedBase: true,
    animatedPart: "crystal-assembly",
    practicalRange: "short",
  };

  const pedestalParts: THREE.BufferGeometry[] = [];
  if (stoneId === "ember") {
    pedestalParts.push(
      new THREE.CylinderGeometry(0.47, 0.5, 0.11, 8).translate(0, 0.055, 0),
      new THREE.CylinderGeometry(0.46, 0.47, 0.21, 8).translate(0, 0.215, 0),
      new THREE.CylinderGeometry(0.41, 0.46, 0.08, 8).translate(0, 0.36, 0),
    );
  } else if (stoneId === "ash") {
    pedestalParts.push(
      new THREE.CylinderGeometry(0.5, 0.53, 0.1, 8).translate(0, 0.05, 0),
      new THREE.CylinderGeometry(0.49, 0.5, 0.27, 8).translate(0, 0.235, 0),
      new THREE.CylinderGeometry(0.41, 0.49, 0.09, 8).translate(0, 0.415, 0),
    );
  } else if (stoneId === "crypt") {
    pedestalParts.push(
      new THREE.CylinderGeometry(0.46, 0.49, 0.1, 8).translate(0, 0.05, 0),
      new THREE.CylinderGeometry(0.44, 0.46, 0.34, 8).translate(0, 0.27, 0),
      new THREE.CylinderGeometry(0.36, 0.44, 0.1, 8).translate(0, 0.49, 0),
    );
  } else {
    pedestalParts.push(
      new THREE.CylinderGeometry(0.51, 0.54, 0.11, 8).translate(0, 0.055, 0),
      new THREE.CylinderGeometry(0.49, 0.51, 0.31, 8).translate(0, 0.265, 0),
      new THREE.CylinderGeometry(0.42, 0.49, 0.09, 8).translate(0, 0.465, 0),
    );
  }
  const plaqueCount = stoneId === "ember" || stoneId === "crypt" ? 4 : 5;
  const plaqueHeight = stoneId === "crypt" ? 0.24 : stoneId === "verdant" ? 0.21 : 0.16;
  const plaqueWidth = stoneId === "ash" ? 0.085 : 0.1;
  for (let index = 0; index < plaqueCount; index += 1) {
    const x = (index - (plaqueCount - 1) / 2) * (stoneId === "ash" ? 0.15 : 0.17);
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(x, sculpt.pedestalHeight * 0.46, sculpt.pedestalRadius * 0.96),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 1, 1),
    );
    pedestalParts.push(
      new THREE.BoxGeometry(plaqueWidth, plaqueHeight, 0.04).applyMatrix4(transform),
    );
  }
  const pedestal = mesh(
    mergeParts(pedestalParts, `${stoneId} stepped stone pedestal geometry`),
    getDungeonMaterialVariant(materials.darkStone, `magic-stone-pedestal-${stoneId}`, (material) => {
      material.name = `${stoneId} stone pedestal material`;
    }),
    `${stoneId} stone pedestal`,
  );

  const cageMat = getDungeonMaterialVariant(materials.iron, "magic-stone-cage-iron", (material) => {
    material.color = new THREE.Color(0x2a2c2b);
    material.roughness = 0.64;
    material.metalness = 0.72;
    material.name = "Magic stone cage iron";
  });
  const cageParts: THREE.BufferGeometry[] = [
    new THREE.TorusGeometry(
      sculpt.cageRadius,
      stoneId === "ash" ? 0.055 : stoneId === "ember" ? 0.05 : 0.045,
      6,
      24,
    )
      .rotateX(Math.PI / 2)
      .translate(0, sculpt.cageY, 0),
  ];
  if (stoneId === "ember") {
    cageParts.push(
      new THREE.TorusGeometry(0.41, 0.025, 5, 16).rotateX(Math.PI / 2).translate(0, 0.59, 0),
    );
  } else if (stoneId === "ash") {
    cageParts.push(
      new THREE.TorusGeometry(0.39, 0.035, 5, 16).rotateX(Math.PI / 2).translate(0, 0.63, 0),
    );
  } else if (stoneId === "crypt") {
    cageParts.push(
      new THREE.TorusGeometry(0.33, 0.025, 5, 12).rotateX(Math.PI / 2).translate(0, 0.58, 0),
    );
  }
  const postBottom = sculpt.pedestalHeight * 0.78;
  const postTop =
    stoneId === "verdant"
      ? sculpt.cageY + 0.18
      : stoneId === "crypt"
        ? sculpt.cageY + 0.08
        : sculpt.cageY + 0.035;
  const postHeight = postTop - postBottom;
  const postPhase = stoneId === "ash" ? Math.PI / 6 : stoneId === "crypt" ? Math.PI / 4 : 0;
  for (let i = 0; i < sculpt.cagePosts; i += 1) {
    const angle = (i / sculpt.cagePosts) * Math.PI * 2 + postPhase;
    const postRadius = sculpt.cageRadius * (stoneId === "verdant" ? 1.03 : 0.96);
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(
        Math.sin(angle) * postRadius,
        postBottom + postHeight / 2,
        Math.cos(angle) * postRadius,
      ),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    const width = stoneId === "crypt" ? 0.085 : stoneId === "ember" ? 0.075 : 0.07;
    cageParts.push(new THREE.BoxGeometry(width, postHeight, width * 1.08).applyMatrix4(transform));
    if (stoneId === "crypt" || stoneId === "verdant") {
      const footTransform = new THREE.Matrix4().compose(
        new THREE.Vector3(
          Math.sin(angle) * (postRadius + 0.025),
          postBottom + 0.03,
          Math.cos(angle) * (postRadius + 0.025),
        ),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
        new THREE.Vector3(1, 1, 1),
      );
      cageParts.push(
        new THREE.BoxGeometry(width * 1.5, 0.07, width * 1.65).applyMatrix4(footTransform),
      );
    }
    if (stoneId === "ash" || stoneId === "verdant") {
      const hookTransform = new THREE.Matrix4().compose(
        new THREE.Vector3(
          Math.sin(angle) * postRadius,
          postTop - 0.025,
          Math.cos(angle) * postRadius,
        ),
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(0, angle, stoneId === "verdant" ? 0.28 : -0.22),
        ),
        new THREE.Vector3(1, 1, 1),
      );
      cageParts.push(new THREE.BoxGeometry(width, 0.16, width * 1.08).applyMatrix4(hookTransform));
    }
  }
  const cage = mesh(
    mergeParts(cageParts, `${stoneId} iron cage geometry`),
    cageMat,
    `${stoneId} iron cage ring`,
  );

  // Keep the busy concept-sheet crop off the crystal. The shared crystal
  // material already carries a clean albedo and relief map suited to 3D props.
  // `texture` remains available for a future authored per-stone skin.
  void texture;
  const bodyMat = materials.crystal?.clone() ?? new THREE.MeshStandardMaterial();
  bodyMat.color.setHex(look.body);
  bodyMat.emissive.setHex(look.emissive);
  bodyMat.emissiveIntensity = 0.04;
  bodyMat.roughness = 0.72;
  bodyMat.metalness = 0;
  bodyMat.envMapIntensity = 0.22;
  bodyMat.flatShading = true;
  let coreGeometry: THREE.BufferGeometry;
  if (stoneId === "ember") {
    coreGeometry = crystalLoftGeometry(
      [
        { y: sculpt.pedestalHeight * 0.84, radiusX: 0.16, radiusZ: 0.14 },
        { y: 0.51, radiusX: 0.29, radiusZ: 0.25, twist: 0.08 },
        { y: 0.88, radiusX: 0.28, radiusZ: 0.24, offsetX: 0.015, twist: 0.16 },
        { y: 1.17, radiusX: 0.2, radiusZ: 0.17, offsetX: 0.02, twist: 0.21 },
        { y: 1.48, radiusX: 0.012, radiusZ: 0.012, offsetX: 0.035 },
      ],
      6,
      0.12,
    );
  } else if (stoneId === "ash") {
    const left = crystalLoftGeometry(
      [
        { y: 0.3, radiusX: 0.13, radiusZ: 0.14, offsetX: -0.085 },
        { y: 0.57, radiusX: 0.18, radiusZ: 0.2, offsetX: -0.095, twist: 0.08 },
        { y: 1.01, radiusX: 0.14, radiusZ: 0.15, offsetX: -0.11, twist: 0.15 },
        { y: 1.3, radiusX: 0.012, radiusZ: 0.012, offsetX: -0.15 },
      ],
      5,
      -0.08,
    );
    const right = crystalLoftGeometry(
      [
        { y: 0.3, radiusX: 0.13, radiusZ: 0.14, offsetX: 0.085 },
        { y: 0.57, radiusX: 0.18, radiusZ: 0.2, offsetX: 0.095, twist: -0.08 },
        { y: 0.96, radiusX: 0.13, radiusZ: 0.14, offsetX: 0.11, twist: -0.14 },
        { y: 1.24, radiusX: 0.012, radiusZ: 0.012, offsetX: 0.15 },
      ],
      5,
      0.1,
    );
    coreGeometry = mergeParts([left, right], "ash split crystal core geometry");
  } else if (stoneId === "crypt") {
    coreGeometry = crystalLoftGeometry(
      [
        { y: 0.38, radiusX: 0.18, radiusZ: 0.16 },
        { y: 0.58, radiusX: 0.25, radiusZ: 0.21, twist: 0.05 },
        { y: 1.16, radiusX: 0.2, radiusZ: 0.17, offsetX: -0.025, twist: 0.14 },
        { y: 1.39, radiusX: 0.1, radiusZ: 0.09, offsetX: -0.055 },
        { y: 1.55, radiusX: 0.01, radiusZ: 0.01, offsetX: -0.075 },
      ],
      6,
      0.22,
    );
  } else {
    const centre = crystalLoftGeometry(
      [
        { y: 0.34, radiusX: 0.15, radiusZ: 0.15 },
        { y: 0.55, radiusX: 0.23, radiusZ: 0.2 },
        { y: 1.03, radiusX: 0.17, radiusZ: 0.14, offsetX: 0.02, twist: 0.11 },
        { y: 1.34, radiusX: 0.012, radiusZ: 0.012, offsetX: 0.06 },
      ],
      5,
      0.18,
    );
    const left = crystalLoftGeometry(
      [
        { y: 0.38, radiusX: 0.11, radiusZ: 0.1, offsetX: -0.16 },
        { y: 0.55, radiusX: 0.15, radiusZ: 0.13, offsetX: -0.2 },
        { y: 0.91, radiusX: 0.1, radiusZ: 0.085, offsetX: -0.27, twist: 0.1 },
        { y: 1.13, radiusX: 0.01, radiusZ: 0.01, offsetX: -0.36 },
      ],
      5,
      -0.2,
    );
    const right = crystalLoftGeometry(
      [
        { y: 0.37, radiusX: 0.1, radiusZ: 0.09, offsetX: 0.16 },
        { y: 0.54, radiusX: 0.14, radiusZ: 0.12, offsetX: 0.2 },
        { y: 0.84, radiusX: 0.09, radiusZ: 0.08, offsetX: 0.27, twist: -0.08 },
        { y: 1.05, radiusX: 0.01, radiusZ: 0.01, offsetX: 0.34 },
      ],
      5,
      0.25,
    );
    coreGeometry = mergeParts([centre, left, right], "verdant three-shard core geometry");
  }
  const core = mesh(coreGeometry, bodyMat, `${stoneId} crystal core`);

  const shardMat = bodyMat;
  const shardParts: THREE.BufferGeometry[] = [];
  const satelliteCount = stoneId === "ash" || stoneId === "crypt" ? 3 : 2;
  const satelliteRadius = sculpt.cageRadius * 0.78;
  for (let i = 0; i < satelliteCount; i += 1) {
    const angle = (i / satelliteCount) * Math.PI * 2 + (stoneId === "ember" ? Math.PI / 2 : 0.3);
    const height = 0.24 + (i % 2) * 0.06;
    const satellite = crystalLoftGeometry(
      [
        { y: 0, radiusX: 0.055, radiusZ: 0.05 },
        { y: height * 0.45, radiusX: 0.075, radiusZ: 0.06, twist: 0.1 },
        { y: height, radiusX: 0.008, radiusZ: 0.008, offsetX: 0.025 },
      ],
      5,
      angle,
    );
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(
        Math.sin(angle) * satelliteRadius,
        sculpt.pedestalHeight * 0.75,
        Math.cos(angle) * satelliteRadius,
      ),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(Math.cos(angle) * 0.24, angle, -Math.sin(angle) * 0.32),
      ),
      new THREE.Vector3(1, 1, 1),
    );
    shardParts.push(satellite.applyMatrix4(transform));
  }
  const shardCluster = mesh(
    mergeParts(shardParts, `${stoneId} crystal shard cluster geometry`),
    shardMat,
    `${stoneId} crystal shard cluster`,
  );

  const glow = mesh(
    ritualGroundLightGeometry(stoneId, sculpt.pedestalRadius * 1.55),
    new THREE.MeshBasicMaterial({
      color: look.crystal,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    `${stoneId} ritual ground light`,
  );
  glow.position.y = 0.018;
  glow.castShadow = false;
  glow.receiveShadow = false;
  glow.renderOrder = 1;

  const crownParts: THREE.BufferGeometry[] = [];
  if (stoneId === "ember") {
    crownParts.push(new THREE.TorusGeometry(0.41, 0.025, 5, 24).rotateX(Math.PI / 2));
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2;
      const transform = new THREE.Matrix4().compose(
        new THREE.Vector3(Math.sin(angle) * 0.42, 0, Math.cos(angle) * 0.42),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
        new THREE.Vector3(1, 1, 1),
      );
      crownParts.push(new THREE.BoxGeometry(0.028, 0.028, 0.13).applyMatrix4(transform));
    }
  } else if (stoneId === "ash") {
    crownParts.push(
      new THREE.TorusGeometry(0.22, 0.024, 5, 16).rotateX(Math.PI / 2).translate(-0.17, 0, 0),
      new THREE.TorusGeometry(0.22, 0.024, 5, 16).rotateX(Math.PI / 2).translate(0.17, -0.04, 0),
    );
  } else if (stoneId === "crypt") {
    crownParts.push(new THREE.TorusGeometry(0.34, 0.028, 5, 4).rotateX(Math.PI / 2));
    for (let index = 0; index < 4; index += 1) {
      const angle = (index / 4) * Math.PI * 2;
      const transform = new THREE.Matrix4().compose(
        new THREE.Vector3(Math.sin(angle) * 0.35, 0, Math.cos(angle) * 0.35),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
        new THREE.Vector3(1, 1, 1),
      );
      crownParts.push(new THREE.BoxGeometry(0.032, 0.032, 0.15).applyMatrix4(transform));
    }
  } else {
    for (const [x, y] of [
      [-0.22, -0.04],
      [0, 0.04],
      [0.22, -0.02],
    ] as const) {
      crownParts.push(
        new THREE.TorusGeometry(0.18, 0.023, 5, 14).rotateX(Math.PI / 2).translate(x, y, 0),
      );
    }
  }
  const crown = mesh(
    mergeParts(crownParts, `${stoneId} beacon crown geometry`),
    new THREE.MeshBasicMaterial({
      color: look.crystal,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      blending: THREE.NormalBlending,
      toneMapped: true,
    }),
    `${stoneId} distant beacon crown`,
  );
  crown.castShadow = false;
  crown.receiveShadow = false;
  crown.position.y = Math.min(sculpt.crownY, 1.38);
  crown.rotation.x = stoneId === "crypt" ? 0.44 : stoneId === "ash" ? 0.42 : 0.48;
  crown.rotation.z = stoneId === "verdant" ? -0.2 : 0.16;
  crown.scale.setScalar(0.68);
  crown.renderOrder = 3;

  const baseLightIntensity = 3.6;
  const baseGlowOpacity = 0.22;
  const light = new THREE.PointLight(look.light, baseLightIntensity, 4.2, 2);
  light.name = `${stoneId} stone point light`;
  light.position.set(0, sculpt.cageY + 0.18, 0);

  // Front rune strokes retain each source sheet's distinct plinth identity.
  const runeMat = materials.crystal?.clone() ?? new THREE.MeshStandardMaterial();
  runeMat.color.setHex(look.crystal);
  runeMat.emissive.setHex(look.emissive);
  runeMat.emissiveIntensity = 0.65;
  runeMat.roughness = 0.62;
  runeMat.flatShading = true;
  const runeParts: THREE.BufferGeometry[] = [];
  const frontZ = sculpt.pedestalRadius * 0.985 + 0.025;
  const addRuneStroke = (x: number, y: number, width: number, height: number, rotationZ = 0) => {
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, frontZ),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, rotationZ)),
      new THREE.Vector3(1, 1, 1),
    );
    runeParts.push(new THREE.BoxGeometry(width, height, 0.025).applyMatrix4(transform));
  };
  if (stoneId === "ember") {
    for (const x of [-0.255, -0.085, 0.085, 0.255]) {
      addRuneStroke(x, 0.17, 0.028, 0.14);
      addRuneStroke(x - 0.028, 0.225, 0.024, 0.085, -0.68);
      addRuneStroke(x + 0.028, 0.225, 0.024, 0.085, 0.68);
    }
  } else if (stoneId === "ash") {
    for (const x of [-0.3, -0.15, 0, 0.15, 0.3]) {
      addRuneStroke(x - 0.025, 0.22, 0.025, 0.105, -0.72);
      addRuneStroke(x + 0.025, 0.22, 0.025, 0.105, 0.72);
    }
  } else if (stoneId === "crypt") {
    for (const [index, x] of [-0.255, -0.085, 0.085, 0.255].entries()) {
      addRuneStroke(x, 0.25, 0.028, 0.22);
      addRuneStroke(x + (index % 2 === 0 ? 0.018 : -0.018), 0.3, 0.075, 0.026);
    }
  } else {
    for (const [index, x] of [-0.3, -0.15, 0, 0.15, 0.3].entries()) {
      const stemHeight = index === 2 ? 0.23 : index % 2 === 0 ? 0.18 : 0.13;
      addRuneStroke(x, 0.235, 0.027, stemHeight);
      addRuneStroke(x - 0.028, 0.29, 0.023, 0.09, -0.66);
      addRuneStroke(x + 0.028, 0.29, 0.023, 0.09, 0.66);
    }
  }

  const runeRing = mesh(
    mergeParts(runeParts, `${stoneId} rim rune ring geometry`),
    runeMat,
    `${stoneId} rim rune ring`,
  );
  runeRing.userData.pattern = `${stoneId} front plinth rune system`;

  const crystalAssembly = new THREE.Group();
  crystalAssembly.name = `${stoneId} floating crystal assembly`;
  crystalAssembly.userData.motionRole = "stone-crystal-idle";
  crystalAssembly.add(core, shardCluster, crown);

  // Creation keeps the core, cage and pedestal on compact screens while it
  // drops these small additive/detail passes. Play always uses the full kit.
  for (const detail of [shardCluster, glow, crown, runeRing]) {
    detail.userData.compactPreviewOptional = true;
  }

  const pickupSocket = new THREE.Object3D();
  pickupSocket.name = `${stoneId} pickup socket`;
  pickupSocket.position.y = sculpt.pedestalHeight;
  const vfxSocket = new THREE.Object3D();
  vfxSocket.name = `${stoneId} vfx socket`;
  vfxSocket.position.y = sculpt.cageY;
  const lightSocket = new THREE.Object3D();
  lightSocket.name = `${stoneId} light socket`;
  lightSocket.position.copy(light.position);

  root.add(
    pedestal,
    cage,
    crystalAssembly,
    glow,
    runeRing,
    light,
    pickupSocket,
    vfxSocket,
    lightSocket,
  );
  return {
    root,
    crystalAssembly,
    glow,
    crown,
    light,
    stoneId,
    baseColor: look.body,
    emissive: look.emissive,
    effectColor: look.crystal,
    baseLightIntensity,
    baseGlowOpacity,
  };
}

export function magicStoneIds(): readonly StoneId[] {
  return ["ember", "ash", "crypt", "verdant"];
}
