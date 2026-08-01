import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

import { FIRE_LIGHT_TUNING } from "../systems/LightTuning";
import { createLightingPropBase } from "./LightingPropFactory";
import type { DungeonMaterials } from "./MaterialLibrary";
import { createNoiseFlame } from "./ProceduralFlameVfx";

/** Small floor campfire footprint at adult player scale. */
export const FLOOR_CAMPFIRE_MESH_SCALE = 1;

export interface FloorCampfireAssembly {
  root: THREE.Group;
  flame: THREE.Mesh;
  flameDetails: THREE.Object3D[];
  halos: THREE.Mesh[];
  light: THREE.PointLight | null;
  baseIntensity: number;
  baseY: number;
}

function markVfx(object: THREE.Object3D): void {
  object.userData.vfxOnly = true;
}

interface CampfireBatch {
  material: THREE.Material;
  materialRole: string;
  geometries: THREE.BufferGeometry[];
  sourceNames: string[];
}

function repairCampfireUvs(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute("position");
  const sourceUv = geometry.getAttribute("uv");
  const values = new Float32Array(position.count * 2);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();

  for (let index = 0; index < position.count; index += 3) {
    const sourceArea = sourceUv
      ? Math.abs(
          (sourceUv.getX(index + 1) - sourceUv.getX(index)) *
            (sourceUv.getY(index + 2) - sourceUv.getY(index)) -
            (sourceUv.getY(index + 1) - sourceUv.getY(index)) *
              (sourceUv.getX(index + 2) - sourceUv.getX(index)),
        )
      : 0;
    const sourceFinite = sourceUv
      ? [index, index + 1, index + 2].every(
          (vertex) =>
            Number.isFinite(sourceUv.getX(vertex)) && Number.isFinite(sourceUv.getY(vertex)),
        )
      : false;
    if (sourceUv && sourceFinite && sourceArea > 1e-7) {
      for (let vertex = index; vertex < index + 3; vertex += 1) {
        values[vertex * 2] = sourceUv.getX(vertex);
        values[vertex * 2 + 1] = sourceUv.getY(vertex);
      }
      continue;
    }

    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    c.fromBufferAttribute(position, index + 2);
    ab.copy(b).sub(a);
    ac.copy(c).sub(a);
    const abLength = Math.max(ab.length(), 1e-6);
    values[index * 2] = 0;
    values[index * 2 + 1] = 0;
    values[(index + 1) * 2] = abLength;
    values[(index + 1) * 2 + 1] = 0;
    values[(index + 2) * 2] = ac.dot(ab) / abLength;
    values[(index + 2) * 2 + 1] = Math.max(cross.crossVectors(ab, ac).length() / abLength, 1e-6);
  }

  let minimumU = Number.POSITIVE_INFINITY;
  let maximumU = Number.NEGATIVE_INFINITY;
  let minimumV = Number.POSITIVE_INFINITY;
  let maximumV = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < values.length; index += 2) {
    minimumU = Math.min(minimumU, values[index]!);
    maximumU = Math.max(maximumU, values[index]!);
    minimumV = Math.min(minimumV, values[index + 1]!);
    maximumV = Math.max(maximumV, values[index + 1]!);
  }
  const width = Math.max(maximumU - minimumU, 1e-6);
  const height = Math.max(maximumV - minimumV, 1e-6);
  for (let index = 0; index < values.length; index += 2) {
    values[index] = (values[index]! - minimumU) / width;
    values[index + 1] = (values[index + 1]! - minimumV) / height;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(values, 2));
}

function campfireGeometryAt(source: THREE.Mesh, rootInverse: THREE.Matrix4): THREE.BufferGeometry {
  const geometry = source.geometry.index ? source.geometry.toNonIndexed() : source.geometry.clone();
  geometry.applyMatrix4(rootInverse.clone().multiply(source.matrixWorld));
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  for (const attribute of Object.keys(geometry.attributes)) {
    if (attribute !== "position" && attribute !== "normal" && attribute !== "uv") {
      geometry.deleteAttribute(attribute);
    }
  }
  geometry.clearGroups();
  repairCampfireUvs(geometry);
  return geometry;
}

function campfirePartMarker(source: THREE.Mesh): THREE.Group {
  const marker = new THREE.Group();
  marker.name = source.name;
  marker.position.copy(source.position);
  marker.quaternion.copy(source.quaternion);
  marker.scale.copy(source.scale);
  marker.userData = {
    ...source.userData,
    sourceGeometryType: source.geometry.type,
    renderedByMaterialBatch: true,
  };
  return marker;
}

/** Collapse the stable solid base to one draw per PBR role while retaining part markers. */
export function batchFloorCampfireBaseForRuntime(
  root: THREE.Group,
  materials: DungeonMaterials,
): void {
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const sources: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && !object.userData.vfxOnly) sources.push(object);
  });
  const batches = new Map<string, CampfireBatch>();

  for (const source of sources) {
    if (Array.isArray(source.material)) {
      throw new Error(`Floor campfire cannot batch multi-material part ${source.name}.`);
    }
    const sourceRole = String(source.userData.materialRole ?? "unassigned");
    const material = sourceRole === "black-coal" ? materials.darkStone : source.material;
    const materialRole =
      material === materials.darkStone
        ? "ash-and-coal"
        : material === materials.stone
          ? "faceted-stone"
          : "charred-wood";
    const batch = batches.get(material.uuid) ?? {
      material,
      materialRole,
      geometries: [],
      sourceNames: [],
    };
    batch.geometries.push(campfireGeometryAt(source, rootInverse));
    batch.sourceNames.push(source.name);
    batches.set(material.uuid, batch);
  }

  for (const source of sources) {
    source.parent?.add(campfirePartMarker(source));
    source.parent?.remove(source);
    source.geometry.dispose();
  }

  let batchIndex = 0;
  for (const batch of batches.values()) {
    const geometry =
      batch.geometries.length === 1
        ? batch.geometries[0]!
        : mergeGeometries(batch.geometries, false);
    if (!geometry) throw new Error(`Floor campfire could not merge batch ${batchIndex + 1}.`);
    if (batch.geometries.length > 1) batch.geometries.forEach((part) => part.dispose());
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const mesh = new THREE.Mesh(geometry, batch.material);
    mesh.name = `Floor campfire ${batch.materialRole} material batch`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.materialRole = batch.materialRole;
    mesh.userData.closedVolume = true;
    mesh.userData.sourceMeshCount = batch.sourceNames.length;
    mesh.userData.sourcePartNames = batch.sourceNames;
    root.add(mesh);
    batchIndex += 1;
  }

  const runtime = root.userData.sculptRuntime as {
    geometry?: Record<string, unknown>;
    destructionGroups?: Record<string, string[]>;
    runtimeBatching?: Record<string, unknown>;
  };
  runtime.geometry = {
    ...runtime.geometry,
    materialBatches: batches.size,
    materialRoles: [...batches.values()].map((batch) => batch.materialRole).sort(),
    drawCalls: batches.size,
    baseOnly: true,
  };
  runtime.runtimeBatching = {
    sourceMeshes: sources.length,
    drawCalls: batches.size,
    materialBatches: batches.size,
    partMarkersPreserved: sources.length,
  };
  root.updateMatrixWorld(true);
}

/**
 * Runtime campfire assembly. The stable base builder owns only solid geometry;
 * this wrapper adds the flame, glow and light at named sockets.
 */
export function createFloorCampfire(
  position: THREE.Vector3,
  lit: boolean,
  materials: DungeonMaterials,
  variant = 0,
): FloorCampfireAssembly {
  const root = createLightingPropBase("floor-campfire", materials, variant);
  batchFloorCampfireBaseForRuntime(root, materials);
  root.name = "Image-sculpted floor campfire";
  root.position.copy(position);

  const baseY = 0.32;
  const flameVfx = createNoiseFlame({
    name: "Campfire procedural noise flame",
    width: 0.7,
    height: 0.92,
    phase: variant * 0.73 + position.x * 0.17 + position.z * 0.11,
    opacity: 0.98,
    turbulence: 1.22,
    lean: 0.055,
    emberCount: 9,
  });
  const flame = flameVfx.flame;
  flame.visible = lit;
  flame.position.set(0, baseY, 0);

  const groundGlow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 14),
    new THREE.MeshBasicMaterial({
      color: 0xb87943,
      transparent: true,
      opacity: 0.1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  groundGlow.name = "Campfire ground glow";
  groundGlow.visible = lit;
  groundGlow.rotation.x = -Math.PI / 2;
  groundGlow.position.y = 0.04;
  groundGlow.renderOrder = 1;
  markVfx(groundGlow);

  const vfx = new THREE.Group();
  vfx.name = "Floor campfire VFX";
  markVfx(vfx);
  vfx.add(groundGlow, flame);
  root.add(vfx);

  const baseIntensity = 26;
  const light = lit
    ? new THREE.PointLight(0xd18b4c, baseIntensity, FIRE_LIGHT_TUNING.candleRange, 2.1)
    : null;
  const halos: THREE.Mesh[] = [groundGlow];
  if (light) {
    light.name = "Floor campfire point light";
    light.position.set(0, baseY + 0.12, 0);
    markVfx(light);
    root.add(light);
    for (const [radius, opacity] of [
      [0.55, 0.05],
      [1.05, 0.02],
    ] as const) {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 12, 8),
        new THREE.MeshBasicMaterial({
          color: 0xc88a51,
          transparent: true,
          opacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.BackSide,
          toneMapped: false,
        }),
      );
      halo.name = "Floor campfire spherical light halo";
      halo.position.set(0, baseY + 0.06, 0);
      halo.renderOrder = 2;
      markVfx(halo);
      halos.push(halo);
      root.add(halo);
    }
  }

  root.scale.setScalar(FLOOR_CAMPFIRE_MESH_SCALE);
  root.userData.sculptRuntime.vfx = {
    baseGeometryHasVfx: false,
    flameSocket: "Campfire flame socket",
    smokeSocket: "Campfire smoke socket",
    runtimeRoot: vfx.name,
  };

  return {
    root,
    flame,
    flameDetails: flameVfx.details,
    halos,
    light,
    baseIntensity,
    baseY,
  };
}
