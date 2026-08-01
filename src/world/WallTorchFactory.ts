import * as THREE from "three";

import { FIRE_LIGHT_TUNING } from "../systems/LightTuning";
import { createLightingPropBase } from "./LightingPropFactory";
import { createDungeonMaterials, type DungeonMaterials } from "./MaterialLibrary";
import { createNoiseFlame } from "./ProceduralFlameVfx";

/** Keep the mount readable at corridor range without pushing it above player-scale furniture. */
export const WALL_TORCH_MESH_SCALE = 0.78;
export const WALL_LANTERN_MESH_SCALE = 0.76;
export const WALL_LANTERN_LIGHT_INTENSITY = 25.2;

export interface WallTorchAssembly {
  root: THREE.Group;
  flame: THREE.Mesh;
  flameDetails: THREE.Object3D[];
  halos: THREE.Mesh[];
  light: THREE.PointLight | null;
  baseIntensity: number;
  baseY: number;
}

function haloMaterial(color: number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    toneMapped: false,
  });
}

function markVfx(object: THREE.Object3D): void {
  object.userData.vfxOnly = true;
}

function flameSocketPosition(
  root: THREE.Object3D,
  socketName: string,
  fallback: readonly [number, number, number],
): THREE.Vector3 {
  const socket = root.getObjectByName(socketName);
  if (socket?.userData.socket?.type !== "flame") return new THREE.Vector3(...fallback);
  return socket.position.clone();
}

export function createWallLantern(
  position: THREE.Vector3,
  facing: THREE.Vector3,
  lit: boolean,
  materials: DungeonMaterials,
): WallTorchAssembly {
  const root = createLightingPropBase("wall-lantern", materials);
  root.name = "Image-sculpted wall lantern sconce";
  root.position.copy(position);
  root.rotation.y = Math.atan2(facing.x, facing.z);

  const socketPosition = flameSocketPosition(root, "Lantern flame socket", [0, 0.03, 0.57]);
  const baseY = socketPosition.y;
  const flameVfx = createNoiseFlame({
    name: "Lantern procedural noise flame",
    width: 0.21,
    height: 0.38,
    phase: position.x * 0.37 + position.z * 0.19,
    opacity: 0.95,
    turbulence: 0.92,
    lean: 0.035,
    emberCount: 5,
  });
  const flame = flameVfx.flame;
  flame.visible = lit;
  flame.position.copy(socketPosition);

  const vfx = new THREE.Group();
  vfx.name = "Wall lantern VFX";
  markVfx(vfx);
  vfx.add(flame);
  root.add(vfx);

  const baseIntensity = WALL_LANTERN_LIGHT_INTENSITY;
  const light = lit
    ? new THREE.PointLight(0xc9864d, baseIntensity, FIRE_LIGHT_TUNING.wallRange, 1.94)
    : null;
  const halos: THREE.Mesh[] = [];
  if (light) {
    light.name = "Wall lantern radial point light";
    light.position.set(0, baseY + 0.04, 0.68);
    markVfx(light);
    root.add(light);
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(0.82, 12, 8),
      haloMaterial(0xb97844, 0.055),
    );
    halo.name = "Wall lantern spherical light halo";
    halo.position.copy(light.position);
    halo.renderOrder = 2;
    markVfx(halo);
    halos.push(halo);
    root.add(halo);
  }
  root.scale.setScalar(WALL_LANTERN_MESH_SCALE);
  root.userData.sculptRuntime.vfx = {
    baseGeometryHasVfx: false,
    socket: "Lantern flame socket",
    runtimeRoot: vfx.name,
    runtimeOnly: true,
  };
  return { root, flame, flameDetails: flameVfx.details, halos, light, baseIntensity, baseY };
}

export function createWallTorch(
  position: THREE.Vector3,
  facing: THREE.Vector3,
  lit: boolean,
  materials?: DungeonMaterials,
): WallTorchAssembly {
  const resolvedMaterials = materials ?? createDungeonMaterials({ compact: true });
  const root = createLightingPropBase("wall-torch", resolvedMaterials);
  root.name = "Wall torch sconce";
  root.position.copy(position);
  root.rotation.y = Math.atan2(facing.x, facing.z);

  const socketPosition = flameSocketPosition(root, "Torch flame socket", [0, 0.93, 0.64]);
  const baseY = socketPosition.y;
  const flameVfx = createNoiseFlame({
    name: "Torch procedural noise flame",
    width: 0.5,
    height: 0.74,
    phase: position.x * 0.31 + position.z * 0.23,
    opacity: 0.98,
    turbulence: 1.15,
    lean: 0.08,
    emberCount: 7,
  });
  const flame = flameVfx.flame;
  flame.visible = lit;
  flame.position.copy(socketPosition);

  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.18, 16),
    new THREE.MeshBasicMaterial({
      color: 0xb87943,
      transparent: true,
      opacity: 0.075,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  glow.name = "Torch wall glow card";
  glow.visible = lit;
  glow.position.set(0, 0.36, 0.025);
  glow.renderOrder = 1;
  markVfx(glow);

  const vfx = new THREE.Group();
  vfx.name = "Wall torch VFX";
  markVfx(vfx);
  vfx.add(glow, flame);
  root.add(vfx);

  const baseIntensity = 44;
  const light = lit
    ? new THREE.PointLight(0xd18b4c, baseIntensity, FIRE_LIGHT_TUNING.wallRange, 1.92)
    : null;
  const halos: THREE.Mesh[] = [];
  if (light) {
    halos.push(glow);
    light.name = "Wall torch radial point light";
    light.position.set(0, baseY + 0.05, 0.92);
    markVfx(light);
    root.add(light);
    for (const [radius, opacity] of [
      [0.72, 0.055],
      [1.35, 0.022],
    ] as const) {
      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 12, 8),
        haloMaterial(0xc88a51, opacity),
      );
      halo.name = "Wall torch spherical light halo";
      halo.position.set(0, baseY + 0.05, 0.86);
      halo.renderOrder = 2;
      markVfx(halo);
      halos.push(halo);
      root.add(halo);
    }
  }

  root.scale.setScalar(WALL_TORCH_MESH_SCALE);
  root.userData.sculptRuntime.vfx = {
    baseGeometryHasVfx: false,
    socket: "Torch flame socket",
    runtimeRoot: vfx.name,
    runtimeOnly: true,
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
