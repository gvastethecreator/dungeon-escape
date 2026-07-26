import * as THREE from "three";

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

/**
 * Shared cobweb material. NormalBlended (webs dull the background, they don't
 * glow), depthWrite off so they don't fight the depth buffer at low opacity,
 * DoubleSide so they read from any approach. `toneMapped: false` keeps the silk
 * color stable under ACES tone mapping.
 */
function makeCobwebMaterial(color = 0xb8b4a8, strength = 0.22, variant = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
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
): THREE.Group {
  const root = new THREE.Group();
  root.name = variant === 0 ? "Corner cobweb" : "Wall-ceiling cobweb";
  const material = makeCobwebMaterial(color, strength, variant);
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
): THREE.ShaderMaterial {
  return makeCobwebMaterial(color, strength, variant);
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

// ─── Bone pile ────────────────────────────────────────────────────────────────

/**
 * Dense bone pile: scattered long bones + 1-2 skulls. Denser and more "heaped"
 * than the 5 loose cylinders in ForgePropFactory's `bones` detail. Reuses the
 * shared `bone` material.
 */
export function createBonePile(materials: DungeonMaterials, variant = 0): THREE.Group {
  const root = new THREE.Group();
  root.name = "Dungeon bone pile";
  const seed = Math.abs(variant) % 3;
  const boneCount = 9 + seed * 2;
  for (let i = 0; i < boneCount; i += 1) {
    const bone = mesh(
      new THREE.CylinderGeometry(0.035, 0.05, 0.5 + (i % 4) * 0.08, 5),
      materials.bone,
      "Pile long bone",
    );
    const angle = (i / boneCount) * Math.PI * 2 + seed;
    const radius = 0.12 + (i % 3) * 0.12;
    bone.rotation.set(Math.PI / 2 + (i % 2) * 0.4, angle, (i % 3) * 0.3);
    bone.position.set(Math.cos(angle) * radius, 0.05 + (i % 3) * 0.06, Math.sin(angle) * radius);
    root.add(bone);
  }
  // 1-2 skulls (flattened spheres) on top of the heap.
  const skullCount = 1 + (seed % 2);
  for (let i = 0; i < skullCount; i += 1) {
    const skull = mesh(new THREE.SphereGeometry(0.13, 8, 6), materials.bone, "Pile skull");
    skull.scale.set(1, 0.86, 1.08);
    const angle = i * 2.4 + seed;
    skull.position.set(Math.cos(angle) * 0.18, 0.2 + i * 0.05, Math.sin(angle) * 0.18);
    skull.rotation.y = angle * 1.7;
    root.add(skull);
  }
  return root;
}

// ─── Hanging chain / vine ────────────────────────────────────────────────────

/**
 * Hangs from the ceiling. A vertical run of short cylinders (links) in `iron`
 * (chain) or `wood` (vine/root). The group's origin is the ceiling anchor; the
 * chain extends downward by `length` meters.
 */
export type HangingKind = "chain" | "vine";

export function createHanging(
  materials: DungeonMaterials,
  kind: HangingKind = "chain",
  length = 2.2,
  variant = 0,
): THREE.Group {
  const root = new THREE.Group();
  root.name = kind === "chain" ? "Hanging chain" : "Hanging vine";
  const material = kind === "chain" ? materials.iron : materials.wood;
  const linkCount = Math.max(3, Math.round(length / 0.32));
  const linkHeight = length / linkCount;
  for (let i = 0; i < linkCount; i += 1) {
    const link = mesh(
      new THREE.TorusGeometry(0.07, 0.022, 5, 8),
      material,
      kind === "chain" ? "Chain link" : "Vine segment",
    );
    // Alternate link orientation like a real chain.
    link.rotation.x = Math.PI / 2 + ((i % 2) * Math.PI) / 2;
    // Hang downward from the anchor: top link at y=0, last at y=-length.
    link.position.set(0, -linkHeight * (i + 0.5), 0);
    root.add(link);
  }
  if (kind === "vine") {
    // A couple of stray leaf-tendrils off the vine for organic read.
    const stray = variant % 2;
    for (let i = 0; i < 2 + stray; i += 1) {
      const leaf = mesh(new THREE.ConeGeometry(0.05, 0.32, 4), materials.wood, "Vine tendril");
      const angle = i * 2.1 + variant;
      leaf.position.set(Math.cos(angle) * 0.12, -linkHeight * (i * 2 + 1), Math.sin(angle) * 0.12);
      leaf.rotation.set(Math.PI / 3, angle, Math.PI / 4);
      root.add(leaf);
    }
  }
  return root;
}

// ─── Rubble pile ──────────────────────────────────────────────────────────────

/**
 * Heap of broken masonry: 4-7 dodecahedron stones of varying size, plus a faint
 * dust mound. Reuses `darkStone`. Heavier and more accumulated than the loose
 * `debris` scatter rocks.
 */
export function createRubblePile(materials: DungeonMaterials, variant = 0): THREE.Group {
  const root = new THREE.Group();
  root.name = "Dungeon rubble pile";
  const seed = Math.abs(variant) % 3;
  const count = 4 + seed;
  for (let i = 0; i < count; i += 1) {
    const radius = 0.16 + ((i + seed) % 4) * 0.05;
    const rock = mesh(
      new THREE.DodecahedronGeometry(radius, 0),
      materials.darkStone,
      "Rubble stone",
    );
    rock.scale.set(
      1 + (i % 2) * 0.3,
      0.6 + ((i + seed) % 3) * 0.14,
      0.85 + ((i * 2 + seed) % 3) * 0.18,
    );
    const angle = i * 1.7 + seed;
    rock.rotation.set((i + seed) * 0.31, i * 1.17, seed * 0.23);
    rock.position.set(
      Math.cos(angle) * (0.18 + radius),
      radius * rock.scale.y,
      Math.sin(angle) * (0.16 + radius),
    );
    root.add(rock);
  }
  // Dust mound under the heap.
  const dust = new THREE.Mesh(
    new THREE.CircleGeometry(0.6, 10),
    new THREE.MeshLambertMaterial({
      map: materials.darkStone.map,
      color: 0x3a3a36,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
  );
  dust.name = "Rubble dust mound";
  dust.rotation.x = -Math.PI / 2;
  dust.position.y = 0.01;
  root.add(dust);
  return root;
}
