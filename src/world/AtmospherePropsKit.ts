import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { MeshBasicNodeMaterial } from "three/webgpu";
import {
  getShaderProgramModeRegistry,
  onShaderProgramModeRegistryChange,
  type ShaderProgramMode,
} from "../systems/ShaderProgramMode";
import { requireTslBuilder } from "../systems/TslMaterialModules";
import {
  createImageSculptedHanging,
  createTaperedTubeGeometry,
  isImageSculptedHangingFamily,
  type ImageSculptedHangingFamily,
} from "./ImageSculptedHangingKit";
import { getReadableRootMaterial } from "./LocalModelMaterials";
import type { DungeonMaterials } from "./MaterialLibrary";

/**
 * Ambient "life and decay" props: cobwebs, bone piles, hanging chains/vines,
 * rubble drifts. These read as abandonment and make a dungeon feel lived-in
 * rather than empty.
 *
 * Design rules (shared with the rest of the world kit):
 * - Builders are pure: (materials, variant) -> THREE.Group.
 * - Geometries are simple primitives; materials are the shared
 *   {@link DungeonMaterials} so the renderer batches draw calls.
 * - Cobwebs use a NormalBlended transparent shader (dulling, not glowing) with
 *   Bayer-dithered alpha, modelled on VolumetricBeam's pattern so thin silk
 *   stays readable at low opacity.
 *
 * The scatter system in DungeonWorld builds ONE InstancedMesh per kind using a
 * shared geometry + material, so adding hundreds of these costs a handful of
 * extra draw calls total — no per-instance cost, no GC pressure.
 */

/** Mesh helper matching the DungeonPropKit convention. */
function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, name: string): THREE.Mesh {
  const part = new THREE.Mesh(geometry, material);
  part.name = name;
  part.castShadow = true;
  part.receiveShadow = true;
  return part;
}

// ─── Cobweb shader ────────────────────────────────────────────────────────────

/** ShaderProgramMode factory id for procedural cobweb silk. */
export const COBWEB_SILK_SHADER_FACTORY_ID = "cobweb-silk";

/** Register (or refresh) dual-mode support on the active shader program registry. */
export function registerCobwebSilkShaderFactory(registry = getShaderProgramModeRegistry()): void {
  registry.register({
    id: COBWEB_SILK_SHADER_FACTORY_ID,
    supports: ["glsl", "tsl"],
  });
}

registerCobwebSilkShaderFactory();
onShaderProgramModeRegistryChange(registerCobwebSilkShaderFactory);

const COBWEB_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 localPosition = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      localPosition = instanceMatrix * localPosition;
    #endif
    gl_Position = projectionMatrix * modelViewMatrix * localPosition;
  }
`;

const COBWEB_FRAGMENT = /* glsl */ `
  // Procedural cobweb mask: radial spokes from the corner anchor + concentric
  // arcs. Cheap (no noise), reads as silk at low opacity once dithered.
  uniform vec3 uColor;
  uniform float uStrength;
  uniform float uVariant; // 0 = quarter (corner), 1 = half (wall-ceiling)
  varying vec2 vUv;

  float bayer(vec2 p) {
    vec2 f = mod(floor(p), 4.0);
    return mod(f.x * 2.0 + f.y * 3.0, 4.0) / 4.0;
  }

  float spokeMask(vec2 uv, float angle, float halfWidth) {
    // Distance from the sample to a ray at the given angle from the anchor.
    float a = atan(uv.y, uv.x);
    float d = abs(mod(a - angle + 3.14159265, 6.2831853) - 3.14159265);
    float radial = length(uv);
    // Spokes fade slightly toward the far edge.
    return smoothstep(halfWidth, 0.0, d) * smoothstep(1.05, 0.15, radial);
  }

  void main() {
    // Anchor in the plane corner; uv 0..1 fans into the room from that point.
    vec2 p = vUv;

    float silk = 0.0;
    // 8 radial spokes fan out from the corner anchor.
    const float SPOKES = 8.0;
    for (float i = 0.0; i < SPOKES; i += 1.0) {
      float a = (i / SPOKES) * 1.5707; // 0..PI/2 — corner quadrant
      silk = max(silk, spokeMask(p, a, 0.018));
    }
    // Concentric sticky arcs, spaced by ~0.14 of the radius.
    float r = length(p);
    float arcs = smoothstep(0.012, 0.0, abs(fract(r / 0.14) - 0.5) * 0.14);
    // Arcs only render between the innermost and outermost spoke reach.
    arcs *= smoothstep(0.05, 0.18, r) * smoothstep(1.02, 0.4, r);
    // Arcs are strongest where they cross a spoke (intersection dusting).
    arcs *= 0.55 + silk * 0.6;
    silk = max(silk, arcs);

    float alpha = silk * uStrength;
    // 8-band dither keeps faint silk crisp instead of milky.
    alpha = floor((alpha + bayer(gl_FragCoord.xy) * 0.06) * 8.0) / 8.0;
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

export type CobwebMaterial = THREE.ShaderMaterial | MeshBasicNodeMaterial;

/**
 * Shared cobweb material. NormalBlended (webs dull the background, they don't
 * glow), depthWrite off so they don't fight the depth buffer at low opacity,
 * DoubleSide so they read from any approach. `toneMapped: false` keeps the silk
 * color stable under ACES tone mapping.
 */
export function applyCobwebMaterialMetadata(
  material: CobwebMaterial,
  mode: ShaderProgramMode,
  variant: CobwebVariant,
): CobwebMaterial {
  material.name =
    mode === "tsl" ? "Procedural cobweb silk material (TSL)" : "Procedural cobweb silk material";
  material.userData.cobwebSilk = true;
  material.userData.shaderProgramMode = mode;
  material.userData.cobwebVariant = variant;
  material.userData.sourceTechnique =
    "procedural corner spokes + concentric sticky arcs + dithered low-opacity silk";
  return material;
}

function makeCobwebMaterialGlsl(
  color = 0xb8b4a8,
  strength = 0.22,
  variant: CobwebVariant = 0,
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    vertexShader: COBWEB_VERTEX,
    fragmentShader: COBWEB_FRAGMENT,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uStrength: { value: strength },
      uVariant: { value: variant },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  return applyCobwebMaterialMetadata(material, "glsl", variant) as THREE.ShaderMaterial;
}

function makeCobwebMaterial(
  color = 0xb8b4a8,
  strength = 0.22,
  variant: CobwebVariant = 0,
  mode?: ShaderProgramMode,
): CobwebMaterial {
  registerCobwebSilkShaderFactory();
  const registry = getShaderProgramModeRegistry();
  const resolved = mode ?? registry.mode;
  registry.require(COBWEB_SILK_SHADER_FACTORY_ID, resolved);
  if (resolved === "tsl") {
    const build = requireTslBuilder<
      typeof import("./AtmospherePropsKit.tsl").makeCobwebMaterialTsl
    >(COBWEB_SILK_SHADER_FACTORY_ID);
    return build(color, strength, variant);
  }
  return makeCobwebMaterialGlsl(color, strength, variant);
}

/** Cobweb coverage on the plane, in meters. Sized to span a ~1-tile corner. */
const COBWEB_SIZE = 1.8;

export type CobwebVariant = 0 | 1;

/**
 * Build a cobweb group. `variant` 0 = corner (quarter web, anchors at a wall
 * corner), 1 = wall-ceiling junction (half web). The plane lies in local XZ
 * (horizontal) for ceiling drops or local XY (vertical) for corner walls; the
 * caller rotates it into place.
 */
export function createCobweb(
  variant: CobwebVariant = 0,
  color = 0xb8b4a8,
  strength = 0.22,
  mode?: ShaderProgramMode,
): THREE.Group {
  const root = new THREE.Group();
  root.name = variant === 0 ? "Corner cobweb" : "Wall-ceiling cobweb";
  const material = makeCobwebMaterial(color, strength, variant, mode);
  const geometry = createCobwebGeometry(variant);
  const web = new THREE.Mesh(geometry, material);
  web.name = "Procedural cobweb silk";
  web.renderOrder = 3;
  root.add(web);
  return root;
}

/** Exposed so the scatter system can build a single shared web material. */
export function createCobwebMaterial(
  color = 0xb8b4a8,
  strength = 0.22,
  variant: CobwebVariant = 0,
  mode?: ShaderProgramMode,
): CobwebMaterial {
  return makeCobwebMaterial(color, strength, variant, mode);
}

/**
 * Corner webs use two perpendicular sheets joined at one ceiling anchor. This
 * keeps the silk readable from either corridor approach without another draw
 * call. The half variant stays flat for wall/ceiling junction use.
 */
export function createCobwebGeometry(variant: CobwebVariant = 0): THREE.BufferGeometry {
  if (variant === 1) {
    const plane = new THREE.PlaneGeometry(COBWEB_SIZE, COBWEB_SIZE);
    plane.translate(COBWEB_SIZE * 0.5, -COBWEB_SIZE * 0.5, 0);
    return plane;
  }
  const positions = new Float32Array([
    0,
    0,
    0,
    COBWEB_SIZE,
    0,
    0,
    0,
    -COBWEB_SIZE,
    0,
    COBWEB_SIZE,
    -COBWEB_SIZE,
    0,
    0,
    0,
    0,
    0,
    0,
    COBWEB_SIZE,
    0,
    -COBWEB_SIZE,
    0,
    0,
    -COBWEB_SIZE,
    COBWEB_SIZE,
  ]);
  const uvs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1, 0, 0, 1, 0, 0, 1, 1, 1]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex([0, 2, 1, 2, 3, 1, 4, 5, 6, 6, 5, 7]);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

// ─── Image-sculpted ambient models ───────────────────────────────────────────

export type ImageSculptedAmbientKind =
  | "bone-pile"
  | "rubble-pile"
  | "rock-cluster"
  | "icicle"
  | "ice-shard"
  | "ground-root-tangle"
  | "ground-debris";

export const IMAGE_SCULPTED_AMBIENT_KINDS: readonly ImageSculptedAmbientKind[] = [
  "bone-pile",
  "rubble-pile",
  "rock-cluster",
  "icicle",
  "ice-shard",
  "ground-root-tangle",
  "ground-debris",
] as const;

const AMBIENT_REFERENCE_ROOT = "assets-source/imagegen/model-references-v2/ambient";

function ambientTriangleCount(root: THREE.Object3D): number {
  let triangles = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    triangles += object.geometry.index
      ? object.geometry.index.count / 3
      : object.geometry.getAttribute("position").count / 3;
  });
  return Math.round(triangles);
}

function finishAmbient(root: THREE.Group, kind: ImageSculptedAmbientKind): THREE.Group {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const nodes: Record<string, string> = {};
  const materials = new Set<string>();
  root.traverse((object) => {
    const partId = object.userData.partId as string | undefined;
    if (partId) nodes[partId] = object.name;
    if (object instanceof THREE.Mesh) {
      object.userData.partId ??= object.name.toLowerCase().replaceAll(" ", "-");
      const entries = Array.isArray(object.material) ? object.material : [object.material];
      entries.forEach((material) => materials.add(material.uuid));
    }
  });
  root.userData.propFamily = kind;
  root.userData.sculptRuntime = {
    sourceImage: `${AMBIENT_REFERENCE_ROOT}/${kind}-three-view.png`,
    specification: `.scratch/img2threejs/model-references-v2/ambient/${kind}/spec.json`,
    approximation: "procedural low-poly reconstruction from three generated views",
    family: kind,
    units: "meters",
    origin: kind === "icicle" ? "ceiling-contact" : "ground-contact",
    nodes,
    sockets: {
      contact: { name: `${kind} contact socket`, type: kind === "icicle" ? "ceiling" : "ground" },
    },
    collider: { type: "box", size: size.toArray(), offset: center.toArray() },
    destructionGroups: {
      body: Object.keys(nodes),
      fragments: Object.keys(nodes).filter((id) => id.includes("stone") || id.includes("bone")),
    },
    geometry: {
      triangles: ambientTriangleCount(root),
      materialBatches: materials.size,
      targetTriangles: 800,
      maxTriangles: 1200,
      mergeStrategy: "StaticDungeonScene merges template meshes by shared DungeonMaterial",
    },
  };
  return root;
}

function ambientPart(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  name: string,
  partId: string,
  surfaceRelief = false,
): THREE.Mesh {
  const part = mesh(geometry, material, name);
  part.userData.partId = partId;
  if (surfaceRelief) part.userData.explodeWithParent = true;
  return part;
}

function ambientPivot(name: string, partId: string): THREE.Group {
  const group = new THREE.Group();
  group.name = name;
  group.userData.partId = partId;
  group.userData.pivot = true;
  return group;
}

function createFacetedRockGeometry(radius: number, seed: number): THREE.BufferGeometry {
  const geometry = new THREE.DodecahedronGeometry(radius, 0);
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    let y = positions.getY(index);
    const z = positions.getZ(index);
    const coordinateNoise =
      Math.sin(
        Math.round((x / radius) * 1000) * 12.9898 +
          Math.round((y / radius) * 1000) * 78.233 +
          Math.round((z / radius) * 1000) * 37.719 +
          seed * 19.913,
      ) * 43758.5453;
    const variation = 0.91 + (coordinateNoise - Math.floor(coordinateNoise)) * 0.15;
    y = Math.max(y * variation, -radius * 0.52);
    positions.setXYZ(index, x * variation, y, z * (1.04 - (variation - 0.9) * 0.35));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createRubbleContactGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const chips = [
    [-0.05, 0.02, 0.021, 0.013],
    [0.04, 0.025, 0.02, 0.012],
    [-0.03, -0.022, 0.019, 0.012],
    [0.05, -0.018, 0.02, 0.012],
  ] as const;
  chips.forEach(([x, z, width, depth]) => {
    const offset = positions.length / 3;
    positions.push(x - width, 0, z - depth, x, 0, z + depth, x + width, 0, z - depth * 0.72);
    uvs.push(0, 0, 0.5, 1, 1, 0);
    indices.push(offset, offset + 1, offset + 2);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.name = "Four separated low-profile rubble contact chips";
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createCrystalShardGeometry(
  height: number,
  radius: number,
  leanX = 0,
  leanZ = 0,
  options: { flatFacets?: boolean; uvScale?: number } = {},
): THREE.BufferGeometry {
  const sides = 5;
  const rings = [
    { y: 0, radius, x: 0, z: 0 },
    { y: height * 0.58, radius: radius * 0.84, x: leanX * 0.45, z: leanZ * 0.45 },
    { y: height * 0.86, radius: radius * 0.48, x: leanX * 0.78, z: leanZ * 0.78 },
  ];
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  rings.forEach((ring, ringIndex) => {
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2 + ringIndex * 0.14;
      positions.push(
        ring.x + Math.cos(angle) * ring.radius,
        ring.y,
        ring.z + Math.sin(angle) * ring.radius,
      );
      const uvScale = options.uvScale ?? 1;
      uvs.push((side / sides) * uvScale, (ring.y / height) * uvScale);
    }
  });
  for (let ring = 0; ring < rings.length - 1; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      const lower = ring * sides + side;
      const upper = (ring + 1) * sides + side;
      indices.push(
        lower,
        upper,
        ring * sides + next,
        ring * sides + next,
        upper,
        (ring + 1) * sides + next,
      );
    }
  }
  const tip = positions.length / 3;
  positions.push(leanX, height, leanZ);
  const uvScale = options.uvScale ?? 1;
  uvs.push(0.5 * uvScale, uvScale);
  const lastRing = (rings.length - 1) * sides;
  for (let side = 0; side < sides; side += 1) {
    indices.push(lastRing + side, tip, lastRing + ((side + 1) % sides));
  }
  const base = positions.length / 3;
  positions.push(0, 0, 0);
  uvs.push(0.5 * uvScale, 0);
  for (let side = 0; side < sides; side += 1) {
    indices.push(base, (side + 1) % sides, side);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  if (options.flatFacets) {
    const faceted = geometry.toNonIndexed();
    geometry.dispose();
    faceted.name = "Flat-shaded crystal shard with object-scale PBR UVs";
    faceted.computeVertexNormals();
    faceted.computeBoundingBox();
    faceted.computeBoundingSphere();
    return faceted;
  }
  return geometry;
}

function bonePile(materials: DungeonMaterials, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted bone pile";
  const heap = ambientPivot("Crossed bone heap pivot", "heap-base");
  const seed = Math.abs(variant) % 3;
  const verticalAxis = new THREE.Vector3(0, 1, 0);
  const bake = (
    source: THREE.BufferGeometry,
    position: THREE.Vector3,
    quaternion = new THREE.Quaternion(),
    scale = new THREE.Vector3(1, 1, 1),
  ): THREE.BufferGeometry => {
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    geometry.applyMatrix4(new THREE.Matrix4().compose(position, quaternion, scale));
    return geometry;
  };
  const createPileBoneGeometry = (length: number): THREE.BufferGeometry => {
    const half = length * 0.5;
    return new THREE.LatheGeometry(
      [
        new THREE.Vector2(0, -half),
        new THREE.Vector2(0.072, -half + length * 0.08),
        new THREE.Vector2(0.032, 0),
        new THREE.Vector2(0.068, half - length * 0.075),
        new THREE.Vector2(0, half),
      ],
      5,
    );
  };
  const boneAngles = [
    0.08, -0.34, 0.68, -0.94, 1.28, 1.82, 2.26, 2.78, -1.42, -1.92, -2.48, 0.38, 1.08, -2.86,
  ];
  const boneOffsets = [
    [-0.19, 0.02],
    [0.18, -0.05],
    [-0.06, -0.16],
    [0.1, 0.14],
    [-0.2, 0.13],
    [0.21, 0.07],
    [-0.03, 0.19],
    [-0.15, -0.09],
    [0.05, -0.2],
    [0.17, -0.15],
    [-0.23, -0.14],
    [0.24, 0.18],
    [-0.09, 0.07],
    [0.09, -0.02],
  ] as const;
  const bonePieces = boneAngles.map((baseAngle, index) => {
    const angle = baseAngle + seed * 0.17;
    const direction = new THREE.Vector3(
      Math.cos(angle),
      ((index % 5) - 2) * 0.065,
      Math.sin(angle),
    ).normalize();
    const quaternion = new THREE.Quaternion().setFromUnitVectors(verticalAxis, direction);
    quaternion.multiply(
      new THREE.Quaternion().setFromAxisAngle(direction, ((index % 4) - 1.5) * 0.11),
    );
    const [offsetX, offsetZ] = boneOffsets[index]!;
    return bake(
      createPileBoneGeometry(0.44 + (index % 5) * 0.045),
      new THREE.Vector3(
        offsetX,
        0.05 + (index % 6) * 0.026 + Math.floor(index / 6) * 0.018,
        offsetZ,
      ),
      quaternion,
      new THREE.Vector3(0.9 + (index % 3) * 0.07, 1, 0.88 + ((index + 1) % 3) * 0.06),
    );
  });
  const mergedBonesGeometry = mergeGeometries(bonePieces, false);
  bonePieces.forEach((geometry) => geometry.dispose());
  if (!mergedBonesGeometry) throw new Error("Could not merge the varied bone pile geometry");
  mergedBonesGeometry.name = "Fourteen merged low-poly long bones";
  mergedBonesGeometry.computeBoundingBox();
  mergedBonesGeometry.computeBoundingSphere();
  const mergedBones = ambientPart(
    mergedBonesGeometry,
    materials.bone,
    "Merged pile of fourteen varied long bones",
    "long-bones",
  );
  mergedBones.userData.boneCount = boneAngles.length;
  mergedBones.userData.variedLengths = 5;
  heap.add(mergedBones);

  const skull = new THREE.Group();
  skull.name = "Pile skull pivot";
  skull.userData.partId = "skull";
  skull.position.set(-0.035, 0.31, 0.055);
  skull.rotation.set(-0.06, 0.14 + seed * 0.13, -0.04);
  const cranium = ambientPart(
    new THREE.DodecahedronGeometry(0.205, 0),
    materials.bone,
    "Faceted volumetric skull vault",
    "skull",
  );
  cranium.scale.set(0.9, 0.82, 0.76);
  cranium.position.y = 0.045;

  const facialPieces: THREE.BufferGeometry[] = [
    bake(new THREE.BoxGeometry(0.052, 0.07, 0.075), new THREE.Vector3(0, 0.012, 0.145)),
    bake(
      new THREE.BoxGeometry(0.085, 0.032, 0.065),
      new THREE.Vector3(-0.066, 0.068, 0.135),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.13)),
    ),
    bake(
      new THREE.BoxGeometry(0.085, 0.032, 0.065),
      new THREE.Vector3(0.066, 0.068, 0.135),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.13)),
    ),
    bake(
      new THREE.DodecahedronGeometry(0.066, 0),
      new THREE.Vector3(-0.09, -0.055, 0.112),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 0.62, 0.72),
    ),
    bake(
      new THREE.DodecahedronGeometry(0.066, 0),
      new THREE.Vector3(0.09, -0.055, 0.112),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 0.62, 0.72),
    ),
    bake(new THREE.BoxGeometry(0.158, 0.065, 0.068), new THREE.Vector3(0, -0.116, 0.13)),
  ];
  for (const [index, x] of [-0.045, -0.015, 0.015, 0.045].entries()) {
    facialPieces.push(
      bake(
        new THREE.BoxGeometry(0.022, 0.04 - (index % 2) * 0.006, 0.026),
        new THREE.Vector3(x, -0.161, 0.169),
      ),
    );
  }
  const faceGeometry = mergeGeometries(facialPieces, false);
  facialPieces.forEach((geometry) => geometry.dispose());
  if (!faceGeometry) throw new Error("Could not merge the open skull facial shell");
  const face = ambientPart(
    faceGeometry,
    materials.bone,
    "Open low-poly skull facial shell",
    "facial-shell",
  );

  const jawPieces = [
    bake(
      new THREE.BoxGeometry(0.035, 0.105, 0.056),
      new THREE.Vector3(-0.086, -0.192, 0.113),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -0.12)),
    ),
    bake(
      new THREE.BoxGeometry(0.035, 0.105, 0.056),
      new THREE.Vector3(0.086, -0.192, 0.113),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.12)),
    ),
    bake(new THREE.BoxGeometry(0.17, 0.035, 0.056), new THREE.Vector3(0, -0.237, 0.12)),
  ];
  const jawGeometry = mergeGeometries(jawPieces, false);
  jawPieces.forEach((geometry) => geometry.dispose());
  if (!jawGeometry) throw new Error("Could not merge the volumetric skull jaw");
  const jaw = ambientPart(jawGeometry, materials.bone, "Volumetric U-shaped skull jaw", "jaw");

  const socketGeometry = new THREE.CylinderGeometry(0.041, 0.047, 0.062, 7);
  socketGeometry.rotateX(Math.PI / 2);
  for (const x of [-0.057, 0.057]) {
    const eye = ambientPart(
      socketGeometry,
      materials.darkStone,
      "Recessed volumetric skull eye cavity",
      "eye-sockets",
      true,
    );
    eye.position.set(x, 0.012, 0.135);
    eye.rotation.z = x < 0 ? -0.12 : 0.12;
    eye.scale.set(0.9, 1.12, 1);
    eye.userData.cavityDepth = 0.062;
    skull.add(eye);
  }
  const nasal = ambientPart(
    new THREE.CylinderGeometry(0.024, 0.032, 0.052, 3),
    materials.darkStone,
    "Volumetric triangular skull nasal opening",
    "nasal-opening",
    true,
  );
  nasal.rotation.set(Math.PI / 2, 0, Math.PI);
  nasal.scale.y = 1.18;
  nasal.position.set(0, -0.064, 0.138);
  nasal.userData.cavityDepth = 0.052;
  skull.add(cranium, face, jaw, nasal);
  heap.add(skull);
  root.add(heap);
  return finishAmbient(root, "bone-pile");
}

function rubblePile(materials: DungeonMaterials, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted rubble pile";
  const lowerCourse = ambientPivot("Two-stone lower course pivot", "lower-course");
  const upperCourse = ambientPivot("Four-stone upper course pivot", "upper-course");
  const seed = Math.abs(variant) % 3;
  const layout = [
    [-0.3, 0.2, 0.12, 0.3, 1.35, 0.88, 1],
    [0.27, 0.19, 0.08, 0.27, 1.2, 0.86, 1.05],
    [-0.18, 0.39, -0.04, 0.23, 1.15, 0.92, 0.92],
    [0.17, 0.4, -0.06, 0.24, 1.25, 0.9, 1],
    [0.02, 0.58, 0.04, 0.2, 1.05, 0.94, 0.9],
    [-0.05, 0.75, 0, 0.14, 1, 0.95, 1],
  ] as const;
  layout.forEach(([x, y, z, radius, sx, sy, sz], index) => {
    const stone = ambientPart(
      createFacetedRockGeometry(radius, seed + index),
      materials.stone,
      "Rubble stone",
      `rubble-stone-${index + 1}`,
    );
    stone.position.set(x, y, z);
    stone.scale.set(sx, sy, sz);
    stone.rotation.set((index % 2) * 0.12, index * 0.48 + seed * 0.1, ((index + 1) % 3) * 0.09);
    (index < 2 ? lowerCourse : upperCourse).add(stone);
  });
  lowerCourse.add(upperCourse);
  root.add(lowerCourse);
  const dust = ambientPart(
    createRubbleContactGeometry(),
    materials.stone,
    "Rubble contact dust footprint",
    "dust-footprint",
    true,
  );
  dust.position.y = -0.006;
  root.add(dust);
  return finishAmbient(root, "rubble-pile");
}

function rockCluster(materials: DungeonMaterials, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted rock cluster";
  const mainRocks = ambientPivot("Three main rocks pivot", "main-rocks");
  const seed = Math.abs(variant) % 3;
  const main = [
    [-0.26, 0.29, 0.02, 0.3, 0.72, 1.7, 0.82],
    [0.18, 0.2, 0.05, 0.29, 1.2, 0.82, 1],
    [0.31, 0.18, -0.16, 0.23, 0.78, 1.15, 0.85],
  ] as const;
  main.forEach(([x, y, z, radius, sx, sy, sz], index) => {
    const rock = ambientPart(
      createFacetedRockGeometry(radius, seed + index * 3),
      materials.darkStone,
      "Cluster main rock",
      `main-rock-${index + 1}`,
    );
    rock.position.set(x, y, z);
    rock.scale.set(sx, sy, sz);
    rock.rotation.y = index * 0.73 + seed * 0.16;
    mainRocks.add(rock);
  });
  for (let index = 0; index < 6; index += 1) {
    const angle = index * 1.05 + seed * 0.2;
    const pebble = ambientPart(
      createFacetedRockGeometry(0.065 + (index % 2) * 0.018, seed + index + 9),
      materials.stone,
      "Loose cluster pebble",
      "pebble-skirt",
    );
    pebble.position.set(
      Math.cos(angle) * (0.42 + (index % 2) * 0.08),
      0.04,
      Math.sin(angle) * 0.32,
    );
    pebble.scale.y = 0.65;
    mainRocks.add(pebble);
  }
  root.add(mainRocks);
  return finishAmbient(root, "rock-cluster");
}

function ceilingIcicle(materials: DungeonMaterials, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted ceiling icicle";
  const cap = ambientPart(
    new THREE.CylinderGeometry(0.31, 0.29, 0.12, 8),
    materials.stone,
    "Icicle ceiling stone cap",
    "ceiling-cap",
  );
  cap.position.y = -0.06;
  root.add(cap);
  const sway = ((Math.abs(variant) % 3) - 1) * 0.025;
  const main = ambientPart(
    createTaperedTubeGeometry(
      [
        new THREE.Vector3(0, -0.1, 0),
        new THREE.Vector3(0.025 + sway, -0.48, 0.015),
        new THREE.Vector3(-0.035 + sway, -0.92, -0.02),
        new THREE.Vector3(0.015, -1.35, 0),
      ],
      0.19,
      0.012,
      9,
      5,
    ),
    materials.ice,
    "Bent tapered main icicle",
    "main-icicle",
  );
  root.add(main);
  for (const [index, x] of [-0.23, 0.23].entries()) {
    const satellite = ambientPart(
      createCrystalShardGeometry(0.36 + index * 0.06, 0.075, x * 0.08, 0.012),
      materials.ice,
      "Short satellite icicle",
      "satellite-icicles",
    );
    satellite.rotation.z = Math.PI;
    satellite.position.set(x, -0.08, 0);
    root.add(satellite);
  }
  return finishAmbient(root, "icicle");
}

function iceShardCluster(materials: DungeonMaterials, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted ice shard cluster";
  const seed = Math.abs(variant) % 3;
  const plinth = ambientPart(
    new THREE.CylinderGeometry(0.43, 0.5, 0.22, 8, 1, false),
    materials.darkStone,
    "Octagonal crystal socket plinth",
    "stone-socket",
  );
  plinth.position.y = 0.11;
  plinth.rotation.y = Math.PI / 8 + seed * 0.035;
  root.add(plinth);
  const plinthFaceLayout = [
    [-0.29, 0.13, 0.3, 0.13, 1.02, 0.62, 0.72],
    [-0.1, 0.12, 0.38, 0.14, 0.88, 0.58, 0.65],
    [0.1, 0.12, 0.38, 0.14, 0.92, 0.6, 0.66],
    [0.29, 0.13, 0.3, 0.13, 1.02, 0.62, 0.72],
  ] as const;
  plinthFaceLayout.forEach(([x, y, z, radius, sx, sy, sz], index) => {
    const facing = ambientPart(
      createFacetedRockGeometry(radius, seed + index + 17),
      materials.darkStone,
      "Faceted crystal plinth facing stone",
      "plinth-facing-stones",
      true,
    );
    facing.position.set(x, y, z);
    facing.scale.set(sx, sy, sz);
    facing.rotation.y = (index - 1.5) * 0.12;
    root.add(facing);
  });
  const main = ambientPart(
    createCrystalShardGeometry(1.18, 0.29, -0.1, 0.035, {
      flatFacets: true,
      uvScale: 1.25,
    }),
    materials.ice,
    "Tall asymmetric ice crystal",
    "main-crystal",
  );
  main.position.y = 0.19;
  root.add(main);
  for (const [index, x] of [-0.28, 0.3].entries()) {
    const shard = ambientPart(
      createCrystalShardGeometry(0.5 + index * 0.09, 0.118, x * 0.16, 0.02, {
        flatFacets: true,
        uvScale: 1.1,
      }),
      materials.ice,
      "Satellite ice crystal",
      "side-crystals",
    );
    shard.position.set(x, 0.19, 0.025);
    root.add(shard);
  }
  for (const x of [-0.31, 0.31]) {
    const strap = ambientPart(
      new THREE.BoxGeometry(0.055, 0.2, 0.055),
      materials.iron,
      "Socket reinforcement strap",
      "metal-straps",
    );
    strap.position.set(x, 0.13, 0.31);
    strap.rotation.z = x * -0.12;
    root.add(strap);
    for (const y of [0.075, 0.18]) {
      const bolt = ambientPart(
        new THREE.CylinderGeometry(0.018, 0.02, 0.022, 6),
        materials.iron,
        "Strap bolt",
        "strap-bolts",
        true,
      );
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(x, y, 0.344);
      root.add(bolt);
    }
  }
  return finishAmbient(root, "ice-shard");
}

function groundRootTangle(materials: DungeonMaterials, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted ground root tangle";
  const rootMaterial = getReadableRootMaterial(materials);
  const seed = Math.abs(variant) % 3;
  const crown = ambientPart(
    new THREE.CylinderGeometry(0.15, 0.23, 0.17, 7),
    rootMaterial,
    "Low closed cut stump crown",
    "stump-crown",
  );
  crown.position.set(-0.38, 0.085, 0.06);
  crown.rotation.y = 0.22;
  crown.scale.set(1.24, 1, 0.86);
  crown.userData.closedStump = true;
  const cutTop = ambientPart(
    new THREE.CircleGeometry(0.147, 12),
    materials.wood,
    "Dry stump cut face",
    "stump-cut-face",
    true,
  );
  cutTop.rotation.x = -Math.PI / 2;
  cutTop.rotation.z = -0.22;
  cutTop.position.set(-0.38, 0.173, 0.06);
  cutTop.scale.set(1.2, 0.84, 1);
  root.add(crown, cutTop);

  const network = ambientPivot("Crossing low root network pivot", "root-network");
  const primaryRoots = ambientPivot("Six unequal ground roots pivot", "primary-roots");
  const basePaths = [
    [
      [-0.48, 0.135, 0.035],
      [-0.61, 0.095, -0.06],
      [-0.74, 0.052, -0.2],
      [-0.93, 0.023, -0.14],
    ],
    [
      [-0.3, 0.142, 0.04],
      [-0.14, 0.102, -0.03],
      [0.08, 0.067, 0.11],
      [0.4, 0.039, 0.015],
      [0.88, 0.021, 0.12],
    ],
    [
      [-0.31, 0.14, 0.13],
      [-0.13, 0.1, 0.27],
      [0.09, 0.061, 0.31],
      [0.34, 0.036, 0.48],
      [0.65, 0.021, 0.61],
    ],
    [
      [-0.35, 0.14, -0.01],
      [-0.19, 0.101, -0.15],
      [0.04, 0.063, -0.18],
      [0.27, 0.037, -0.43],
      [0.52, 0.021, -0.71],
    ],
    [
      [-0.43, 0.137, 0.15],
      [-0.49, 0.096, 0.31],
      [-0.31, 0.06, 0.45],
      [-0.16, 0.035, 0.7],
    ],
    [
      [-0.4, 0.138, -0.04],
      [-0.46, 0.098, -0.22],
      [-0.28, 0.06, -0.36],
      [0.08, 0.022, -0.53],
    ],
  ] as const;
  const yaw = seed * 0.055;
  const verticalAxis = new THREE.Vector3(0, 1, 0);
  const paths = basePaths.map((path) =>
    path.map(([x, y, z]) => new THREE.Vector3(x, y, z).applyAxisAngle(verticalAxis, yaw)),
  );
  const rootRadii = [0.1, 0.092, 0.078, 0.086, 0.067, 0.058] as const;
  const tipRadii = [0.026, 0.02, 0.017, 0.018, 0.015, 0.013] as const;
  paths.forEach((points, index) => {
    const primaryRoot = ambientPart(
      createTaperedTubeGeometry(points, rootRadii[index]!, tipRadii[index]!, 10, 6),
      rootMaterial,
      "Long irregular crossing ground root",
      `primary-root-${index + 1}`,
    );
    primaryRoot.userData.closedByGeometryCap = true;
    primaryRoot.userData.startRadius = rootRadii[index];
    primaryRoot.userData.endRadius = tipRadii[index];
    primaryRoots.add(primaryRoot);
  });
  const branchEnds = [
    new THREE.Vector3(0.73, 0.019, -0.29),
    new THREE.Vector3(0.34, 0.019, 0.78),
    new THREE.Vector3(0.79, 0.019, -0.49),
  ].map((point) => point.applyAxisAngle(verticalAxis, yaw));
  const branchSources = [paths[1]![3]!, paths[2]![2]!, paths[3]![3]!] as const;
  const branches = ambientPivot("Three joined bifurcated roots pivot", "bifurcated-roots");
  branchSources.forEach((start, index) => {
    const end = branchEnds[index]!;
    const midpoint = start.clone().lerp(end, 0.52);
    midpoint.y += 0.022 + index * 0.005;
    const points = [start, midpoint, end];
    const branch = ambientPart(
      createTaperedTubeGeometry(points, 0.037 - index * 0.004, 0.011, 6, 5),
      rootMaterial,
      "Joined low bifurcated root",
      `root-branch-${index + 1}`,
    );
    branch.userData.attachedTo = [`primary-root-${[2, 3, 4][index]}`];
    branch.userData.closedByGeometryCap = true;
    branches.add(branch);
  });
  const knots = ambientPivot("Root junction knots pivot", "root-knots");
  [paths[1]![2]!, paths[2]![2]!, paths[3]![3]!].forEach((position, index) => {
    const knot = ambientPart(
      new THREE.DodecahedronGeometry(0.072 - index * 0.007, 0),
      rootMaterial,
      "Low woody root junction knot",
      "root-knots",
      true,
    );
    knot.position.copy(position);
    knot.scale.set(1.28, 0.62, 0.9 + index * 0.08);
    knots.add(knot);
  });
  network.add(primaryRoots, branches, knots);
  root.add(network);
  return finishAmbient(root, "ground-root-tangle");
}

function groundDebris(materials: DungeonMaterials, variant: number): THREE.Group {
  const root = new THREE.Group();
  root.name = "Image-sculpted ground debris";
  const layout = ambientPivot("Six dark flat fragment scatter pivot", "debris-layout");
  const seed = Math.abs(variant) % 3;
  const fragments = [
    [-0.34, 0.045, 0.02, 0.19, 0.82, 1.28, 5, -0.08],
    [-0.08, 0.032, -0.17, 0.145, 0.7, 1.05, 6, 0.06],
    [0.27, 0.052, -0.06, 0.17, 0.62, 1.18, 5, -0.03],
    [0.18, 0.028, 0.26, 0.12, 0.54, 1.36, 7, 0.04],
    [-0.2, 0.026, 0.27, 0.105, 0.48, 1.1, 6, -0.05],
    [0.02, 0.022, 0.08, 0.085, 0.42, 1.42, 5, 0.02],
  ] as const;
  fragments.forEach(([x, height, z, radius, scaleX, scaleZ, sides, tilt], index) => {
    const fragment = ambientPart(
      new THREE.CylinderGeometry(radius * 0.78, radius, height, sides),
      materials.darkStone,
      "Dark low flat stone fragment",
      `debris-fragment-${index + 1}`,
    );
    fragment.position.set(x, height * 0.5, z);
    fragment.scale.set(scaleX, 1, scaleZ);
    fragment.rotation.set(tilt, index * 0.71 + seed * 0.13, tilt * -0.65);
    fragment.userData.fragmentProfile = "low-flat-dark-stone";
    layout.add(fragment);
  });
  root.add(layout);
  return finishAmbient(root, "ground-debris");
}

export function createImageSculptedAmbient(
  kind: ImageSculptedAmbientKind,
  materials: DungeonMaterials,
  variant = 0,
): THREE.Group {
  if (kind === "bone-pile") return bonePile(materials, variant);
  if (kind === "rubble-pile") return rubblePile(materials, variant);
  if (kind === "rock-cluster") return rockCluster(materials, variant);
  if (kind === "icicle") return ceilingIcicle(materials, variant);
  if (kind === "ice-shard") return iceShardCluster(materials, variant);
  if (kind === "ground-root-tangle") return groundRootTangle(materials, variant);
  return groundDebris(materials, variant);
}

export function createBonePile(materials: DungeonMaterials, variant = 0): THREE.Group {
  return createImageSculptedAmbient("bone-pile", materials, variant);
}

export function createRubblePile(materials: DungeonMaterials, variant = 0): THREE.Group {
  return createImageSculptedAmbient("rubble-pile", materials, variant);
}

// ─── Hanging chain / vine ────────────────────────────────────────────────────

/** Hangs from the ceiling; the group origin is the ceiling anchor. */
export type HangingKind = "chain" | "vine" | ImageSculptedHangingFamily;

export function createHanging(
  materials: DungeonMaterials,
  kind: HangingKind = "chain",
  length = 2.2,
  variant = 0,
): THREE.Group {
  const family = kind === "chain" ? "hanging-chain" : kind === "vine" ? "hanging-vine" : kind;
  if (!isImageSculptedHangingFamily(family)) {
    throw new Error(`Unsupported hanging family: ${family satisfies never}`);
  }
  const root = createImageSculptedHanging(family, materials, length, variant);
  if (kind === "chain") root.name = "Hanging chain";
  if (kind === "vine") root.name = "Hanging vine";
  return root;
}
