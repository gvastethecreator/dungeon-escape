import * as THREE from "three";
import type { MeshStandardNodeMaterial } from "three/webgpu";
import {
  getShaderProgramModeRegistry,
  onShaderProgramModeRegistryChange,
  type ShaderProgramMode,
} from "../systems/ShaderProgramMode";
import { requireTslBuilder } from "../systems/TslMaterialModules";

export type SeamMode = "none" | "mirror" | "edge-blend";

/** One texture repeat spans about 1.6 world cells, avoiding a stamped tile grid. */
export const DUNGEON_SURFACE_WORLD_UV_SCALE = 0.62;

/** ShaderProgramMode factory id for the dungeon surface treatment. */
export const DUNGEON_SURFACE_SHADER_FACTORY_ID = "dungeon-surface";

const DUNGEON_SURFACE_GLSL_CACHE_KEY = "dungeon-surface-v4";

export type DungeonSurfaceMaterial = THREE.MeshStandardMaterial | MeshStandardNodeMaterial;

/** Register (or refresh) dual-mode support on the active shader program registry. */
export function registerDungeonSurfaceShaderFactory(
  registry = getShaderProgramModeRegistry(),
): void {
  registry.register({
    id: DUNGEON_SURFACE_SHADER_FACTORY_ID,
    supports: ["glsl", "tsl"],
  });
}

registerDungeonSurfaceShaderFactory();
onShaderProgramModeRegistryChange(registerDungeonSurfaceShaderFactory);

interface LinkedTextureState {
  linked: Set<THREE.Texture>;
  seamMode: SeamMode;
  resolvedImage?: unknown;
  sourcePath: string;
}

function state(texture: THREE.Texture): LinkedTextureState | undefined {
  return texture.userData.linkedTextureState as LinkedTextureState | undefined;
}

function imageSize(image: CanvasImageSource): { width: number; height: number } {
  if (
    image instanceof HTMLImageElement ||
    image instanceof HTMLCanvasElement ||
    image instanceof ImageBitmap
  ) {
    return { width: image.width, height: image.height };
  }
  const video = image as HTMLVideoElement;
  return { width: video.videoWidth || 0, height: video.videoHeight || 0 };
}

function mirroredCanvas(image: CanvasImageSource): HTMLCanvasElement {
  const { width, height } = imageSize(image);
  const half = Math.max(64, Math.min(512, Math.max(width, height)));
  const canvas = document.createElement("canvas");
  canvas.width = half * 2;
  canvas.height = half * 2;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  context.imageSmoothingEnabled = false;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.drawImage(image, 0, 0, half, half);
  context.setTransform(-1, 0, 0, 1, half * 2, 0);
  context.drawImage(image, 0, 0, half, half);
  context.setTransform(1, 0, 0, -1, 0, half * 2);
  context.drawImage(image, 0, 0, half, half);
  context.setTransform(-1, 0, 0, -1, half * 2, half * 2);
  context.drawImage(image, 0, 0, half, half);
  return canvas;
}

/**
 * Force-wrap seamless on RGBA buffer: opposite edge strips become identical.
 * Avoids hard tile lines without the kaleidoscope look of 2×2 mirroring.
 */
export function edgeBlendSeamlessRgba(
  data: Uint8ClampedArray,
  size: number,
  blendRatio = 0.16,
): void {
  const blend = Math.max(6, Math.min(Math.floor(size * blendRatio), Math.floor(size / 3.5)));
  const original = new Uint8ClampedArray(data);

  const read = (buf: Uint8ClampedArray, x: number, y: number, channel: number): number => {
    const sx = ((x % size) + size) % size;
    const sy = ((y % size) + size) % size;
    return buf[(sy * size + sx) * 4 + channel]!;
  };

  // Horizontal edges: left x and right (size-1-x) converge to the same color.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < blend; x += 1) {
      const t = x / Math.max(1, blend - 1);
      const ease = t * t * (3 - 2 * t);
      for (let channel = 0; channel < 3; channel += 1) {
        const left = read(original, x, y, channel);
        const right = read(original, size - 1 - x, y, channel);
        const mixed = left * ease + right * (1 - ease);
        data[(y * size + x) * 4 + channel] = mixed;
        data[(y * size + (size - 1 - x)) * 4 + channel] = mixed;
      }
    }
  }

  original.set(data);
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < blend; y += 1) {
      const t = y / Math.max(1, blend - 1);
      const ease = t * t * (3 - 2 * t);
      for (let channel = 0; channel < 3; channel += 1) {
        const top = read(original, x, y, channel);
        const bottom = read(original, x, size - 1 - y, channel);
        const mixed = top * ease + bottom * (1 - ease);
        data[(y * size + x) * 4 + channel] = mixed;
        data[((size - 1 - y) * size + x) * 4 + channel] = mixed;
      }
    }
  }

  // Soften corner patches where both blends meet.
  for (let y = 0; y < blend; y += 1) {
    for (let x = 0; x < blend; x += 1) {
      const tx = x / Math.max(1, blend - 1);
      const ty = y / Math.max(1, blend - 1);
      const w = Math.min(tx, ty, 1 - tx, 1 - ty);
      const ease = w * w * (3 - 2 * w);
      for (const [cx, cy] of [
        [x, y],
        [size - 1 - x, y],
        [x, size - 1 - y],
        [size - 1 - x, size - 1 - y],
      ] as const) {
        for (let channel = 0; channel < 3; channel += 1) {
          const i = (cy * size + cx) * 4 + channel;
          const avg =
            (read(data, cx, cy, channel) +
              read(data, size - 1 - cx, cy, channel) +
              read(data, cx, size - 1 - cy, channel) +
              read(data, size - 1 - cx, size - 1 - cy, channel)) *
            0.25;
          data[i] = data[i]! * (0.55 + 0.45 * ease) + avg * (0.45 * (1 - ease));
        }
      }
    }
  }
}

/** Mean RGB mismatch across opposite borders; zero is a perfect wrap. */
export function textureEdgeMismatchRgba(data: Uint8ClampedArray, size: number): number {
  let error = 0;
  let samples = 0;
  for (let offset = 0; offset < size; offset += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const left = offset * size * 4 + channel;
      const right = (offset * size + size - 1) * 4 + channel;
      const top = offset * 4 + channel;
      const bottom = ((size - 1) * size + offset) * 4 + channel;
      error += Math.abs(data[left]! - data[right]!);
      error += Math.abs(data[top]! - data[bottom]!);
      samples += 2;
    }
  }
  return samples > 0 ? error / samples : 0;
}

export function edgeBlendSeamlessCanvas(
  image: CanvasImageSource,
  blendRatio = 0.16,
): HTMLCanvasElement {
  const { width: srcW, height: srcH } = imageSize(image);
  const size = Math.max(64, Math.min(512, Math.max(srcW, srcH) || 256));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return canvas;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, size, size);
  const imageData = context.getImageData(0, 0, size, size);
  // Baked maps already match at the border. Keep their edge detail intact.
  if (textureEdgeMismatchRgba(imageData.data, size) > 2) {
    edgeBlendSeamlessRgba(imageData.data, size, blendRatio);
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function applySeamTreatment(image: CanvasImageSource, mode: SeamMode): CanvasImageSource {
  if (typeof document === "undefined") return image;
  if (mode === "mirror") return mirroredCanvas(image);
  if (mode === "edge-blend") return edgeBlendSeamlessCanvas(image);
  return image;
}

export interface TextureLuminanceLevels {
  targetLuma: number;
  contrast: number;
  gamma: number;
}

/** Roughness maps are linear grayscale data; the floor keeps dark maps matte. */
export interface TextureRoughnessLevels {
  floor: number;
  gamma?: number;
}

export function liftTextureLuminanceRgba(
  data: Uint8ClampedArray,
  levels: TextureLuminanceLevels,
): void {
  const pixelCount = data.length / 4;
  if (pixelCount === 0) return;
  const transformed = new Float32Array(pixelCount * 3);
  const means = [0, 0, 0];

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = Math.pow(data[pixel * 4 + channel]! / 255, levels.gamma);
      transformed[pixel * 3 + channel] = value;
      means[channel]! += value;
    }
  }
  means.forEach((value, channel) => {
    means[channel] = value / pixelCount;
  });
  const meanLuma = means[0]! * 0.2126 + means[1]! * 0.7152 + means[2]! * 0.0722;
  const gain = levels.targetLuma / Math.max(0.01, meanLuma);

  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const centered =
        means[channel]! + (transformed[pixel * 3 + channel]! - means[channel]!) * levels.contrast;
      data[pixel * 4 + channel] = Math.round(THREE.MathUtils.clamp(centered * gain, 0, 1) * 255);
    }
  }
}

export function liftTextureRoughnessRgba(
  data: Uint8ClampedArray,
  levels: TextureRoughnessLevels,
): void {
  const floor = THREE.MathUtils.clamp(levels.floor, 0, 0.95);
  const gamma = THREE.MathUtils.clamp(levels.gamma ?? 1, 0.65, 1.5);
  for (let pixel = 0; pixel < data.length; pixel += 4) {
    const value = Math.pow(data[pixel]! / 255, gamma);
    const remapped = floor + value * (1 - floor);
    const output = Math.round(THREE.MathUtils.clamp(remapped, 0, 1) * 255);
    data[pixel] = output;
    data[pixel + 1] = output;
    data[pixel + 2] = output;
  }
}

/**
 * Normalize a dark authored albedo before sRGB decoding. The transform keeps
 * each channel mean and raises local contrast around it.
 */
export function liftTextureLuminanceSource(
  texture: THREE.Texture,
  levels: TextureLuminanceLevels,
  maxSide = 512,
): void {
  if (typeof document === "undefined") return;
  const image = texture.image as HTMLImageElement | HTMLCanvasElement | undefined;
  const sourceWidth = image?.width ?? 0;
  const sourceHeight = image?.height ?? 0;
  if (!image || sourceWidth === 0 || sourceHeight === 0) return;

  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  liftTextureLuminanceRgba(pixels.data, levels);
  context.putImageData(pixels, 0, 0);
  texture.image = canvas;
}

export function liftTextureRoughnessSource(
  texture: THREE.Texture,
  levels: TextureRoughnessLevels,
  maxSide = 512,
): void {
  if (typeof document === "undefined") return;
  const image = texture.image as HTMLImageElement | HTMLCanvasElement | undefined;
  const sourceWidth = image?.width ?? 0;
  const sourceHeight = image?.height ?? 0;
  if (!image || sourceWidth === 0 || sourceHeight === 0) return;

  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  liftTextureRoughnessRgba(pixels.data, levels);
  context.putImageData(pixels, 0, 0);
  texture.image = canvas;
}

function seamLabel(mode: SeamMode): string {
  if (mode === "mirror") return "mirrored-2x2";
  if (mode === "edge-blend") return "edge-blend-wrap";
  return "source-image";
}

/** @deprecated Prefer registerTextureSource(texture, path, { seam }) */
export function registerTextureSource(
  texture: THREE.Texture,
  sourcePath: string,
  mirroredOrOptions: boolean | { seam?: SeamMode } = false,
): void {
  const seamMode: SeamMode =
    typeof mirroredOrOptions === "boolean"
      ? mirroredOrOptions
        ? "mirror"
        : "none"
      : (mirroredOrOptions.seam ?? "none");
  texture.userData.linkedTextureState = {
    linked: new Set([texture]),
    seamMode,
    sourcePath,
  } satisfies LinkedTextureState;
  texture.userData.seamTreatment = seamLabel(seamMode);
}

export function resolveTextureSource(texture: THREE.Texture): void {
  const linkedState = state(texture);
  if (!linkedState) return;
  const sourceImage = texture.image as CanvasImageSource | undefined;
  if (!sourceImage) return;
  const image = applySeamTreatment(sourceImage, linkedState.seamMode);
  linkedState.resolvedImage = image;
  for (const linked of linkedState.linked) {
    linked.image = image;
    linked.needsUpdate = true;
    refreshDerivedNormalMap(linked);
  }
  refreshDerivedNormalMap(texture);
}

export function linkTextureClone(source: THREE.Texture, clone: THREE.Texture): void {
  const linkedState = state(source);
  if (!linkedState) {
    if (source.image) {
      clone.image = source.image;
      clone.needsUpdate = true;
    }
    return;
  }
  linkedState.linked.add(clone);
  clone.userData.linkedTextureSource = source;
  clone.userData.seamTreatment = seamLabel(linkedState.seamMode);
  clone.userData.textureSourcePath = linkedState.sourcePath;
  if (linkedState.resolvedImage) {
    clone.image = linkedState.resolvedImage;
    clone.needsUpdate = true;
  }
  refreshDerivedNormalMap(clone);
}

export function unlinkTextureClone(clone: THREE.Texture): void {
  const source = clone.userData.linkedTextureSource as THREE.Texture | undefined;
  if (!source) return;
  state(source)?.linked.delete(clone);
  delete clone.userData.linkedTextureSource;
}

/** Sobel height → tangent-space normal map (R=X, G=Y, B=Z). Seamless wrap. */
export function normalMapRgbaFromAlbedo(
  albedo: Uint8ClampedArray,
  size: number,
  strength = 3.2,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const heightAt = (x: number, y: number): number => {
    const sx = ((x % size) + size) % size;
    const sy = ((y % size) + size) % size;
    const i = (sy * size + sx) * 4;
    // Luma as height — mortar (dark) sits lower than stone faces.
    return (albedo[i]! * 0.299 + albedo[i + 1]! * 0.587 + albedo[i + 2]! * 0.114) / 255;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (heightAt(x - 1, y) - heightAt(x + 1, y)) * strength;
      const dy = (heightAt(x, y - 1) - heightAt(x, y + 1)) * strength;
      // OpenGL-style normal map: +X right, +Y up, +Z out.
      let nx = dx;
      let ny = dy;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const i = (y * size + x) * 4;
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}

export function bakeNormalMapCanvas(image: CanvasImageSource, strength = 3.2): HTMLCanvasElement {
  const { width: srcW, height: srcH } = imageSize(image);
  const size = Math.max(64, Math.min(512, Math.max(srcW, srcH) || 256));
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return canvas;
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 0, 0, size, size);
  const src = context.getImageData(0, 0, size, size);
  const normals = normalMapRgbaFromAlbedo(src.data, size, strength);
  const out = context.createImageData(size, size);
  out.data.set(normals);
  context.putImageData(out, 0, 0);
  return canvas;
}

/**
 * Derive (or refresh) a normal map texture from an albedo map's current image.
 * Shared via albedo.userData.derivedNormalMap so clones can re-bake together.
 */
export function ensureDerivedNormalMap(albedo: THREE.Texture, strength = 3.2): THREE.Texture {
  let normal = albedo.userData.derivedNormalMap as THREE.Texture | undefined;
  if (!normal) {
    normal = new THREE.Texture();
    normal.name = `${albedo.name || "albedo"}#normal`;
    normal.colorSpace = THREE.NoColorSpace;
    normal.wrapS = THREE.RepeatWrapping;
    normal.wrapT = THREE.RepeatWrapping;
    normal.magFilter = THREE.LinearFilter;
    normal.minFilter = THREE.LinearMipmapLinearFilter;
    normal.generateMipmaps = true;
    albedo.userData.derivedNormalMap = normal;
  }
  normal.userData.normalStrength = strength;
  refreshDerivedNormalMap(albedo);
  return normal;
}

function refreshDerivedNormalMap(albedo: THREE.Texture): void {
  const normal = albedo.userData.derivedNormalMap as THREE.Texture | undefined;
  if (!normal || typeof document === "undefined") return;
  const image = albedo.image as CanvasImageSource | undefined;
  if (!image || !imageSize(image).width) return;
  const strength = (normal.userData.normalStrength as number | undefined) ?? 3.2;
  normal.image = bakeNormalMapCanvas(image, strength);
  normal.needsUpdate = true;
  // Keep UV transform in lockstep with albedo (world UV still overrides sampling).
  normal.repeat.copy(albedo.repeat);
  normal.offset.copy(albedo.offset);
  normal.wrapS = albedo.wrapS;
  normal.wrapT = albedo.wrapT;
}

/**
 * Minimal, safe fuse: after standard UV setup, add a per-instance tile offset.
 * Keeps mesh TBN valid (UV only translated) so normal maps keep working, while
 * neighboring cells continue the pattern instead of restarting at 0..1.
 *
 * Requires geometry attribute `aTileUvOffset` (InstancedBufferAttribute, vec2).
 */
export function enableInstanceTileUvOffset(
  material: DungeonSurfaceMaterial,
  mode?: ShaderProgramMode,
): void {
  enableDungeonSurfaceShader(material, mode);
}

/**
 * GLSL onBeforeCompile path (WebGL default): per-instance tile UV offset +
 * world-space FBM macro variation + damp floor grime on vertical surfaces.
 *
 * Requires geometry attribute `aTileUvOffset` (InstancedBufferAttribute, vec2).
 */
export function enableDungeonSurfaceShaderGlsl(material: THREE.MeshStandardMaterial): void {
  if (material.userData.dungeonSurfaceShader) return;
  material.userData.dungeonSurfaceShader = true;
  material.userData.dungeonSurfaceShaderMode = "glsl";
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
attribute vec2 aTileUvOffset;
varying vec3 vBfWorldPos;
varying vec3 vBfWorldNormal;
`,
      )
      .replace(
        "#include <beginnormal_vertex>",
        /* glsl */ `#include <beginnormal_vertex>
{
	vec3 bfN = objectNormal;
	#ifdef USE_INSTANCING
	bfN = mat3( instanceMatrix ) * bfN;
	#endif
	vBfWorldNormal = normalize( mat3( modelMatrix ) * bfN );
}
`,
      )
      .replace(
        "#include <begin_vertex>",
        /* glsl */ `#include <begin_vertex>
{
	vec4 bfWp = vec4( transformed, 1.0 );
	#ifdef USE_INSTANCING
	bfWp = instanceMatrix * bfWp;
	#endif
	bfWp = modelMatrix * bfWp;
	vBfWorldPos = bfWp.xyz;
}
`,
      )
      .replace(
        "#include <uv_vertex>",
        /* glsl */ `#include <uv_vertex>
#ifdef USE_MAP
	vMapUv = ( vMapUv + aTileUvOffset ) * ${DUNGEON_SURFACE_WORLD_UV_SCALE.toFixed(2)};
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( vNormalMapUv + aTileUvOffset ) * ${DUNGEON_SURFACE_WORLD_UV_SCALE.toFixed(2)};
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( vRoughnessMapUv + aTileUvOffset ) * ${DUNGEON_SURFACE_WORLD_UV_SCALE.toFixed(2)};
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( vMetalnessMapUv + aTileUvOffset ) * ${DUNGEON_SURFACE_WORLD_UV_SCALE.toFixed(2)};
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( vAoMapUv + aTileUvOffset ) * ${DUNGEON_SURFACE_WORLD_UV_SCALE.toFixed(2)};
#endif
`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        /* glsl */ `#include <common>
varying vec3 vBfWorldPos;
varying vec3 vBfWorldNormal;

float bfHash21( vec2 p ) {
	return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}

float bfValueNoise( vec2 p ) {
	vec2 i = floor( p );
	vec2 f = fract( p );
	vec2 u = f * f * ( 3.0 - 2.0 * f );
	float a = bfHash21( i );
	float b = bfHash21( i + vec2( 1.0, 0.0 ) );
	float c = bfHash21( i + vec2( 0.0, 1.0 ) );
	float d = bfHash21( i + vec2( 1.0, 1.0 ) );
	return mix( mix( a, b, u.x ), mix( c, d, u.x ), u.y );
}

float bfFbm( vec2 p ) {
	float v = 0.0;
	float amp = 0.5;
	for ( int i = 0; i < 3; i++ ) {
		v += amp * bfValueNoise( p );
		p = p * 2.13 + vec2( 17.3, 9.1 );
		amp *= 0.5;
	}
	return v;
}
`,
      )
      .replace(
        "#include <map_fragment>",
        /* glsl */ `#include <map_fragment>
{
	vec3 bfAn = abs( normalize( vBfWorldNormal ) );
	// Project along the dominant axis so walls/floors/ceilings all vary in-plane.
	vec2 bfQ = bfAn.y > 0.6
		? vBfWorldPos.xz
		: ( bfAn.x > bfAn.z ? vBfWorldPos.zy : vBfWorldPos.xy );
	float bfMacro = bfFbm( bfQ * 0.33 );
	float bfVar = mix( 0.8, 1.15, bfMacro );
	// Damp grime band where vertical masonry meets the floor.
	float bfGrime = smoothstep( 1.1, 0.04, vBfWorldPos.y ) * ( 1.0 - bfAn.y );
	bfVar *= 1.0 - bfGrime * 0.3;
	diffuseColor.rgb *= bfVar;
}
`,
      );
  };
  material.customProgramCacheKey = () => DUNGEON_SURFACE_GLSL_CACHE_KEY;
  material.needsUpdate = true;
}

/**
 * Full dungeon surface shader: per-instance tile UV offset + world-space macro
 * luminance variation (breaks mechanical tiling) + damp grime band where walls
 * meet the floor. Cheap FBM, no extra textures or draw calls.
 *
 * Picks GLSL (default) or TSL from `mode`, falling back to the active
 * ShaderProgramMode registry.
 *
 * Requires geometry attribute `aTileUvOffset` (InstancedBufferAttribute, vec2).
 */
export function enableDungeonSurfaceShader(
  material: DungeonSurfaceMaterial,
  mode?: ShaderProgramMode,
): void {
  registerDungeonSurfaceShaderFactory();
  const registry = getShaderProgramModeRegistry();
  const resolved = mode ?? registry.mode;
  registry.require(DUNGEON_SURFACE_SHADER_FACTORY_ID, resolved);

  if (resolved === "tsl") {
    const nodeMaterial =
      "isMeshStandardNodeMaterial" in material && material.isMeshStandardNodeMaterial
        ? material
        : (material as unknown as MeshStandardNodeMaterial);
    const enableTsl = requireTslBuilder<
      typeof import("./TextureTreatment.tsl").enableDungeonSurfaceShaderTsl
    >(DUNGEON_SURFACE_SHADER_FACTORY_ID);
    enableTsl(nodeMaterial);
    return;
  }

  enableDungeonSurfaceShaderGlsl(material as THREE.MeshStandardMaterial);
}

/** @deprecated */
export function enableFusedSurfaceMaps(
  material: DungeonSurfaceMaterial,
  _surface: "floor" | "wall" | "ceiling",
  _worldUnitsPerTile: number,
): void {
  enableInstanceTileUvOffset(material);
}

/** @deprecated */
export function enableWorldSpaceMapUv(
  material: DungeonSurfaceMaterial,
  _axes: "xz" | "xy" | "zy",
  _worldUnitsPerTile: number,
  _themeOffset: readonly [number, number] = [0, 0],
): void {
  enableInstanceTileUvOffset(material);
}
