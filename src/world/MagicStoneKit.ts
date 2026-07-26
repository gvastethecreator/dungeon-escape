import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import type { StoneId } from "../ui/copy";
import { stoneLabel } from "../ui/copy";
import type { DungeonMaterials } from "./MaterialLibrary";

export interface MagicStoneVisual {
  root: THREE.Group;
  glow: THREE.Mesh;
  crown: THREE.Mesh;
  light: THREE.PointLight;
  stoneId: StoneId;
  baseColor: number;
  emissive: number;
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
  const root = new THREE.Group();
  root.name = `Magic stone ${stoneLabel(stoneId)}`;
  root.userData.pickupKind = "stone";
  root.userData.stoneId = stoneId;
  root.userData.sculptRuntime = {
    sourceImage: `/assets/concepts/stones/${stoneId}-sheet.jpg`,
    family: `magic-stone-${stoneId}`,
    units: "meters",
    collider: { type: "box", size: [0.55, 0.72, 0.55], offset: [0, 0.36, 0] },
  };

  const pedestal = mesh(
    new THREE.CylinderGeometry(0.28, 0.34, 0.14, 8),
    materials.darkStone.clone(),
    `${stoneId} stone pedestal`,
  );
  pedestal.position.y = 0.07;

  const cageMat = materials.iron.clone();
  cageMat.color = new THREE.Color(0x2a2c2b);
  const cage = mesh(
    new THREE.TorusGeometry(0.26, 0.035, 6, 14),
    cageMat,
    `${stoneId} iron cage ring`,
  );
  cage.rotation.x = Math.PI / 2;
  cage.position.y = 0.28;

  // Solid mute crystal only. Imagine albedos were busy motif tiles, not gem skin.
  // Keep `texture` arg for future clean maps; do not auto-bind wallpaper sheets.
  void texture;
  const bodyMat = new THREE.MeshStandardMaterial({
    color: look.body,
    emissive: look.emissive,
    emissiveIntensity: 0.48,
    roughness: 0.74,
    metalness: 0.1,
    flatShading: true,
  });
  // Octahedron = primary crystal mass from turnaround sheets.
  const core = mesh(new THREE.OctahedronGeometry(0.22, 0), bodyMat, `${stoneId} crystal core`);
  core.position.y = 0.42;
  core.rotation.y = 0.4;
  core.scale.set(1, 1.35, 1);

  const shardMat = new THREE.MeshStandardMaterial({
    color: look.crystal,
    emissive: look.emissive,
    emissiveIntensity: 0.7,
    roughness: 0.55,
    metalness: 0.05,
    transparent: true,
    opacity: 0.9,
    flatShading: true,
  });
  const shardParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2;
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * 0.16, 0.5, Math.sin(a) * 0.16),
      new THREE.Quaternion().setFromEuler(
        new THREE.Euler(Math.sin(a) * 0.35, 0, Math.cos(a) * 0.45),
      ),
      new THREE.Vector3(1, 1, 1),
    );
    shardParts.push(new THREE.ConeGeometry(0.06, 0.2, 5).applyMatrix4(transform));
  }
  const shardCluster = mesh(
    mergeParts(shardParts, `${stoneId} crystal shard cluster geometry`),
    shardMat,
    `${stoneId} crystal shard cluster`,
  );

  const glow = mesh(
    new THREE.SphereGeometry(0.48, 10, 8),
    new THREE.MeshBasicMaterial({
      color: look.emissive,
      transparent: true,
      opacity: 0.13,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    `${stoneId} stone glow`,
  );
  glow.position.y = 0.42;
  glow.renderOrder = 2;

  const crown = mesh(
    new THREE.TorusGeometry(0.4, 0.028, 6, 20),
    new THREE.MeshBasicMaterial({
      color: look.crystal,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
    `${stoneId} distant beacon crown`,
  );
  crown.castShadow = false;
  crown.receiveShadow = false;
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 0.72;
  crown.renderOrder = 3;

  const baseLightIntensity = 22;
  const baseGlowOpacity = 0.13;
  const light = new THREE.PointLight(look.light, baseLightIntensity, 13.5, 1.85);
  light.name = `${stoneId} stone point light`;
  light.position.set(0, 0.62, 0);

  // Rune studs — identity detail from Imagine sheets.
  const runeMat = new THREE.MeshStandardMaterial({
    color: look.crystal,
    emissive: look.emissive,
    emissiveIntensity: 0.65,
    roughness: 0.62,
    flatShading: true,
  });
  const runeParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const transform = new THREE.Matrix4().compose(
      new THREE.Vector3(Math.cos(a) * 0.3, 0.14, Math.sin(a) * 0.3),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0)),
      new THREE.Vector3(1, 1, 1),
    );
    runeParts.push(new THREE.BoxGeometry(0.04, 0.08, 0.03).applyMatrix4(transform));
  }

  const runeRing = mesh(
    mergeParts(runeParts, `${stoneId} rim rune ring geometry`),
    runeMat,
    `${stoneId} rim rune ring`,
  );

  // Creation keeps the core, cage and pedestal on compact screens while it
  // drops these small additive/detail passes. Play always uses the full kit.
  for (const detail of [shardCluster, glow, crown, runeRing]) {
    detail.userData.compactPreviewOptional = true;
  }

  root.add(pedestal, cage, core, shardCluster, glow, crown, runeRing, light);
  return {
    root,
    glow,
    crown,
    light,
    stoneId,
    baseColor: look.body,
    emissive: look.emissive,
    baseLightIntensity,
    baseGlowOpacity,
  };
}

export function magicStoneIds(): readonly StoneId[] {
  return ["ember", "ash", "crypt", "verdant"];
}
