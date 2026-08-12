import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  Fn,
  float,
  materialColor,
  positionGeometry,
  sin,
  texture,
  uniform,
  uv,
  vec3,
} from "three/tsl";

import { gridToWorld } from "../dungeon/gridCollision";
import type { DungeonData, GridCell } from "../dungeon/types";
import type { SceneTextureSink } from "../systems/SceneTextureRegistry";
import {
  getShaderProgramModeRegistry,
  onShaderProgramModeRegistryChange,
  type ShaderProgramMode,
} from "../systems/ShaderProgramMode";
import type { DungeonMaterials } from "./MaterialLibrary";

export const LIQUID_SHADER_FACTORY_ID = "liquid-surface";

/** Register (or refresh) dual-mode support on the active shader program registry. */
export function registerLiquidShaderFactory(
  registry = getShaderProgramModeRegistry(),
): void {
  registry.register({
    id: LIQUID_SHADER_FACTORY_ID,
    supports: ["glsl", "tsl"],
  });
}

registerLiquidShaderFactory();
onShaderProgramModeRegistryChange(registerLiquidShaderFactory);

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export interface LiquidSection {
  cells: GridCell[];
}

export type LiquidKind = "pool" | "lake";

/**
 * Floor boxes are centered at y=-0.05 with height 0.1, so the walkable top is y=0.
 * Liquid quads sit a hair above that plane to avoid z-fight while reading coplanar.
 */
export const LIQUID_SURFACE_Y = 0.004;
/** Boundary rim center height (thin lip on the floor edge, not a raised platform). */
export const LIQUID_RIM_Y = 0.012;
export const LIQUID_RIM_HEIGHT = 0.04;

export interface LiquidSurface {
  kind: LiquidKind;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
}

export interface LiquidSectionKit {
  root: THREE.Group;
  surfaces: LiquidSurface[];
  stats: {
    sections: number;
    cells: number;
    boundaryEdges: number;
  };
  textureSink?: SceneTextureSink;
  disposed?: boolean;
}

function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

export function collectLiquidSections(
  mask: Uint8Array,
  width: number,
  height: number,
): LiquidSection[] {
  const visited = new Uint8Array(mask.length);
  const sections: LiquidSection[] = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    const queue = [start];
    const cells: GridCell[] = [];
    visited[start] = 1;
    for (let head = 0; head < queue.length; head += 1) {
      const current = queue[head]!;
      const x = current % width;
      const y = Math.floor(current / width);
      cells.push({ x, y });
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inBounds(nx, ny, width, height)) continue;
        const next = ny * width + nx;
        if (!mask[next] || visited[next]) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    sections.push({ cells });
  }
  return sections.sort((left, right) => right.cells.length - left.cells.length);
}

export function countLiquidBoundaryEdges(
  section: LiquidSection,
  mask: Uint8Array,
  width: number,
  height: number,
): number {
  let edges = 0;
  for (const cell of section.cells) {
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cell.x + dx;
      const ny = cell.y + dy;
      if (!inBounds(nx, ny, width, height) || !mask[ny * width + nx]) edges += 1;
    }
  }
  return edges;
}

function createLiquidPattern(kind: LiquidKind): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const wave =
        Math.sin((x + y * 0.6) * 0.65) * 0.5 +
        Math.sin((x * 0.25 - y) * 0.48) * 0.35 +
        Math.sin((x + y) * 0.18) * 0.15;
      const value = Math.round((kind === "lake" ? 178 : 148) + wave * (kind === "lake" ? 34 : 46));
      const index = (y * size + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.name = `${kind} connected surface pattern`;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(0.42, 0.42);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function applyLiquidMaterialGlsl(
  material: THREE.MeshStandardMaterial,
  kind: LiquidKind,
  liquidTime: { value: number },
): void {
  const lake = kind === "lake";
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uLiquidTime = liquidTime;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uLiquidTime;\nvarying vec2 vLiquidUv;",
      )
      .replace(
        "#include <begin_vertex>",
        `vLiquidUv = uv;
         #include <begin_vertex>
         float liquidWave = sin(position.x * 1.65 + uLiquidTime * 1.15)
           + sin(position.z * 2.2 - uLiquidTime * 0.82);
         // Keep ripples shallow so the surface stays coplanar with the floor.
         transformed.y += liquidWave * ${lake ? "0.006" : "0.01"};`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float uLiquidTime;\nvarying vec2 vLiquidUv;",
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
         float liquidRippleA = sin(vLiquidUv.x * 7.4 + uLiquidTime * 0.95);
         float liquidRippleB = sin(vLiquidUv.y * 9.1 - uLiquidTime * 0.72);
         float liquidRipple = liquidRippleA * liquidRippleB;
         diffuseColor.rgb *= 0.91 + liquidRipple * ${lake ? "0.035" : "0.075"};`,
      );
  };
  material.customProgramCacheKey = () => `connected-liquid-wave-${kind}-v3`;
}

const liquidTimeUniformType = uniform(0);

function applyLiquidMaterialTsl(
  material: MeshStandardNodeMaterial,
  kind: LiquidKind,
  liquidTimeUniform: typeof liquidTimeUniformType,
  map: THREE.Texture,
): void {
  const lake = kind === "lake";
  const waveAmplitude = float(lake ? 0.006 : 0.01);
  const rippleStrength = float(lake ? 0.035 : 0.075);

  material.positionNode = Fn(() => {
    const wave = sin(positionGeometry.x.mul(1.65).add(liquidTimeUniform.mul(1.15))).add(
      sin(positionGeometry.z.mul(2.2).sub(liquidTimeUniform.mul(0.82))),
    );
    return positionGeometry.add(vec3(0, wave.mul(waveAmplitude), 0));
  })();

  const liquidUv = uv();
  const ripple = sin(liquidUv.x.mul(7.4).add(liquidTimeUniform.mul(0.95))).mul(
    sin(liquidUv.y.mul(9.1).sub(liquidTimeUniform.mul(0.72))),
  );
  material.colorNode = texture(map, liquidUv)
    .rgb.mul(materialColor)
    .mul(float(0.91).add(ripple.mul(rippleStrength)));
  material.customProgramCacheKey = () => `connected-liquid-wave-${kind}-tsl-v1`;
}

export function createLiquidMaterial(
  kind: LiquidKind,
  textureSink?: SceneTextureSink,
  mode?: ShaderProgramMode,
): THREE.MeshStandardMaterial {
  registerLiquidShaderFactory();
  const registry = getShaderProgramModeRegistry();
  const resolved = mode ?? registry.mode;
  registry.require(LIQUID_SHADER_FACTORY_ID, resolved);

  const lake = kind === "lake";
  const liquidTime = { value: 0 };
  const map = createLiquidPattern(kind);
  textureSink?.register(map);
  const common = {
    name: lake ? "Connected frost lake material" : "Connected dark water material",
    map,
    color: lake ? 0x60777c : 0x253943,
    emissive: lake ? 0x12262b : 0x101c22,
    emissiveIntensity: lake ? 0.38 : 0.24,
    roughness: lake ? 0.58 : 0.72,
    metalness: 0,
    envMapIntensity: lake ? 0.34 : 0.24,
    transparent: true,
    opacity: lake ? 0.86 : 0.78,
    depthWrite: false,
    side: THREE.DoubleSide,
  } as const;

  if (resolved === "tsl") {
    const material = new MeshStandardNodeMaterial(common);
    const uLiquidTime = uniform(0);
    material.userData.liquidTime = liquidTime;
    material.userData.liquidTimeUniform = uLiquidTime;
    material.userData.liquidShaderMode = "tsl";
    applyLiquidMaterialTsl(material, kind, uLiquidTime, map);
    return material as unknown as THREE.MeshStandardMaterial;
  }

  const material = new THREE.MeshStandardMaterial(common);
  material.userData.liquidTime = liquidTime;
  material.userData.liquidShaderMode = "glsl";
  applyLiquidMaterialGlsl(material, kind, liquidTime);
  return material;
}

function createSectionGeometry(
  dungeon: DungeonData,
  section: LiquidSection,
  tileSize: number,
): THREE.BufferGeometry {
  const positions = new Float32Array(section.cells.length * 12);
  const normals = new Float32Array(section.cells.length * 12);
  const uvs = new Float32Array(section.cells.length * 8);
  const indices = new Uint32Array(section.cells.length * 6);
  const half = tileSize * 0.505;
  section.cells.forEach((cell, cellIndex) => {
    const center = gridToWorld(dungeon, cell, tileSize);
    const p = cellIndex * 12;
    positions.set(
      [
        center.x - half,
        0,
        center.z - half,
        center.x + half,
        0,
        center.z - half,
        center.x + half,
        0,
        center.z + half,
        center.x - half,
        0,
        center.z + half,
      ],
      p,
    );
    normals.set([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], p);
    const u = cell.x;
    const v = cell.y;
    uvs.set([u, v, u + 1, v, u + 1, v + 1, u, v + 1], cellIndex * 8);
    const vertex = cellIndex * 4;
    indices.set([vertex, vertex + 2, vertex + 1, vertex, vertex + 3, vertex + 2], cellIndex * 6);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createBoundaryRim(
  dungeon: DungeonData,
  sections: readonly LiquidSection[],
  mask: Uint8Array,
  tileSize: number,
  material: THREE.Material,
  kind: LiquidKind,
): THREE.InstancedMesh | null {
  const edges: Array<{ cell: GridCell; dx: number; dy: number }> = [];
  for (const section of sections) {
    for (const cell of section.cells) {
      for (const [dx, dy] of NEIGHBORS) {
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        if (inBounds(nx, ny, dungeon.width, dungeon.height) && mask[ny * dungeon.width + nx])
          continue;
        edges.push({ cell, dx, dy });
      }
    }
  }
  if (edges.length === 0) return null;
  const rim = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, edges.length);
  rim.name = kind === "lake" ? "Frost lake boundary rim" : "Dark water boundary rim";
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  edges.forEach((edge, index) => {
    const center = gridToWorld(dungeon, edge.cell, tileSize);
    position.set(
      center.x + edge.dx * tileSize * 0.49,
      LIQUID_RIM_Y,
      center.z + edge.dy * tileSize * 0.49,
    );
    scale.set(
      edge.dx === 0 ? tileSize * 0.98 : 0.16,
      LIQUID_RIM_HEIGHT,
      edge.dy === 0 ? tileSize * 0.98 : 0.16,
    );
    rim.setMatrixAt(index, matrix.compose(position, rotation, scale));
  });
  rim.instanceMatrix.needsUpdate = true;
  rim.castShadow = false;
  rim.receiveShadow = true;
  return rim;
}

export function createLiquidSectionKit(
  dungeon: DungeonData,
  materials: DungeonMaterials,
  tileSize: number,
  textureSink?: SceneTextureSink,
): LiquidSectionKit | null {
  const forge = dungeon.forge;
  if (!forge) return null;
  const root = new THREE.Group();
  root.name = "Connected Forge liquid sections";
  const surfaces: LiquidSurface[] = [];
  let sectionCount = 0;
  let cellCount = 0;
  let boundaryEdges = 0;

  for (const kind of ["pool", "lake"] as const) {
    const source = kind === "pool" ? forge.pools : forge.lakeMask;
    const mask = source.slice();
    if (kind === "pool") {
      for (let index = 0; index < mask.length; index += 1)
        if (forge.lakeMask[index]) mask[index] = 0;
    }
    const sections = collectLiquidSections(mask, dungeon.width, dungeon.height);
    if (sections.length === 0) continue;
    const material = createLiquidMaterial(kind, textureSink);
    sectionCount += sections.length;
    cellCount += sections.reduce((total, section) => total + section.cells.length, 0);
    boundaryEdges += sections.reduce(
      (total, section) =>
        total + countLiquidBoundaryEdges(section, mask, dungeon.width, dungeon.height),
      0,
    );
    for (const [index, section] of sections.entries()) {
      const mesh = new THREE.Mesh(createSectionGeometry(dungeon, section, tileSize), material);
      mesh.name = `${kind === "lake" ? "Frozen lake" : "Dark water"} section ${index + 1}`;
      mesh.position.y = LIQUID_SURFACE_Y;
      mesh.renderOrder = 2;
      root.add(mesh);
      surfaces.push({ kind, mesh, material });
    }
    const rim = createBoundaryRim(
      dungeon,
      sections,
      mask,
      tileSize,
      kind === "lake" ? materials.ice : materials.darkStone,
      kind,
    );
    if (rim) root.add(rim);
  }

  return sectionCount > 0
    ? {
        root,
        surfaces,
        stats: { sections: sectionCount, cells: cellCount, boundaryEdges },
        textureSink,
      }
    : null;
}

export function tickLiquidSections(surfaces: readonly LiquidSurface[], time: number): void {
  const updated = new Set<THREE.MeshStandardMaterial>();
  for (const surface of surfaces) {
    if (updated.has(surface.material)) continue;
    updated.add(surface.material);
    const liquidTime = surface.material.userData.liquidTime as { value: number } | undefined;
    if (liquidTime) liquidTime.value = time;
    const liquidTimeUniform = surface.material.userData.liquidTimeUniform as
      | { value: number }
      | undefined;
    if (liquidTimeUniform) liquidTimeUniform.value = time;
    const speed = surface.kind === "lake" ? 0.004 : 0.012;
    if (surface.material.map) {
      surface.material.map.offset.x = time * speed;
      surface.material.map.offset.y = -time * speed * 0.57;
    }
    const base = surface.kind === "lake" ? 0.38 : 0.24;
    surface.material.emissiveIntensity = base + Math.sin(time * 0.75) * 0.025;
  }
}

export function disposeLiquidSectionKit(kit: LiquidSectionKit): void {
  if (kit.disposed) return;
  kit.disposed = true;
  const geometries = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  let cleanupError: unknown;
  let hasCleanupError = false;
  const clean = (dispose: () => void): void => {
    try {
      dispose();
    } catch (error) {
      if (!hasCleanupError) {
        hasCleanupError = true;
        cleanupError = error;
      }
    }
  };
  try {
    kit.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const entries = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of entries) {
        if (material.userData.sharedDungeonMaterial) continue;
        materials.add(material);
        if ("map" in material && material.map instanceof THREE.Texture) textures.add(material.map);
      }
    });
    geometries.forEach((geometry) => clean(() => geometry.dispose()));
    textures.forEach((texture) => {
      clean(() => kit.textureSink?.unregister(texture));
      clean(() => texture.dispose());
    });
    materials.forEach((material) => clean(() => material.dispose()));
  } finally {
    // The owner explicitly releases liquid resources before the generic Three
    // walk. Removing the meshes prevents a second disposal pass and leaves no
    // registered texture owned by a retired floor.
    kit.root.clear();
    kit.surfaces.length = 0;
    kit.textureSink = undefined;
  }
  if (hasCleanupError) throw cleanupError;
}
