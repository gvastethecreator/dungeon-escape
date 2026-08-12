import * as THREE from "three";
import type { MeshBasicNodeMaterial } from "three/webgpu";
import type { DungeonMoodId } from "../systems/DungeonMood";
import {
  getShaderProgramModeRegistry,
  onShaderProgramModeRegistryChange,
  type ShaderProgramMode,
} from "../systems/ShaderProgramMode";
import { requireTslBuilder } from "../systems/TslMaterialModules";
import { biomeSurfacePalette } from "./BiomeSurfacePalettes.generated";
import type { UncannyWallAnimationDefinition } from "./UncannyWallCatalog.generated";

export const UNCANNY_WALL_HOLD_MIN_SECONDS = 1;
export const UNCANNY_WALL_HOLD_MAX_SECONDS = 10;
export const UNCANNY_WALL_FRAME_INTERPOLATION = true;
export const UNCANNY_WALL_FADE_FAR = 26;
export const UNCANNY_WALL_FADE_HYSTERESIS = 2.5;

/** ShaderProgramMode factory id for the uncanny wall instanced atlas. */
export const UNCANNY_WALL_SHADER_FACTORY_ID = "uncanny-wall-atlas";

/** Register (or refresh) dual-mode support on the active shader program registry. */
export function registerUncannyWallShaderFactory(registry = getShaderProgramModeRegistry()): void {
  registry.register({
    id: UNCANNY_WALL_SHADER_FACTORY_ID,
    supports: ["glsl", "tsl"],
  });
}

registerUncannyWallShaderFactory();
onShaderProgramModeRegistryChange(registerUncannyWallShaderFactory);

export interface UncannyWallPlaybackState {
  readonly seed: number;
  cycle: number;
  mode: "hold" | "animate";
  frame: number;
  remainingSeconds: number;
}

export interface UncannyWallFrameSample {
  readonly frameA: number;
  readonly frameB: number;
  readonly blend: number;
}

export interface UncannyWallPlacement {
  readonly matrix: THREE.Matrix4;
  readonly row: number;
  readonly definition: UncannyWallAnimationDefinition;
  readonly seed: number;
  readonly x: number;
  readonly z: number;
}

export interface UncannyWallVisualProfile {
  readonly shadow: number;
  readonly base: number;
  readonly highlight: number;
  readonly propTint: number;
}

export function uncannyWallVisualProfile(mood: DungeonMoodId): UncannyWallVisualProfile {
  const palette = biomeSurfacePalette(mood, "wall");
  return {
    shadow: palette.shadow,
    base: palette.base,
    highlight: palette.highlight,
    propTint: palette.propTint,
  };
}

function hashUnit(seed: number): number {
  let value = Math.trunc(seed) | 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}

/** A deterministic integer hold in the inclusive 1..10 second range. */
export function uncannyWallHoldSeconds(seed: number, cycle: number): number {
  const mixed = Math.imul(Math.trunc(cycle) + 1, 0x9e3779b1) ^ Math.trunc(seed);
  return UNCANNY_WALL_HOLD_MIN_SECONDS + Math.floor(hashUnit(mixed) * 10);
}

export function createUncannyWallPlayback(seed: number): UncannyWallPlaybackState {
  return {
    seed,
    cycle: 0,
    mode: "hold",
    frame: 0,
    remainingSeconds: uncannyWallHoldSeconds(seed, 0),
  };
}

function transitionSeconds(
  durations: readonly [number, number, number, number],
  frame: number,
): number {
  const durationIndex = frame === 3 ? 1 : frame + 1;
  return Math.max(0.06, durations[durationIndex]! / 1000);
}

/** Mutates one independent instance clock without allocating. */
export function advanceUncannyWallPlayback(
  state: UncannyWallPlaybackState,
  deltaSeconds: number,
  durations: readonly [number, number, number, number],
): void {
  let remainingDelta = Math.max(0, deltaSeconds);
  for (let guard = 0; remainingDelta > 0 && guard < 256; guard += 1) {
    if (remainingDelta < state.remainingSeconds) {
      state.remainingSeconds -= remainingDelta;
      return;
    }
    remainingDelta -= state.remainingSeconds;
    if (state.mode === "hold") {
      state.mode = "animate";
      state.frame = 0;
      state.remainingSeconds = transitionSeconds(durations, 0);
      continue;
    }
    if (state.frame < 3) {
      state.frame += 1;
      state.remainingSeconds = transitionSeconds(durations, state.frame);
      continue;
    }
    state.cycle += 1;
    state.mode = "hold";
    state.frame = 0;
    state.remainingSeconds = uncannyWallHoldSeconds(state.seed, state.cycle);
  }
}

export function sampleUncannyWallPlayback(
  state: UncannyWallPlaybackState,
  durations: readonly [number, number, number, number],
  interpolate = UNCANNY_WALL_FRAME_INTERPOLATION,
): UncannyWallFrameSample {
  if (state.mode === "hold") return { frameA: 0, frameB: 0, blend: 0 };
  const duration = transitionSeconds(durations, state.frame);
  const progress = THREE.MathUtils.clamp(1 - state.remainingSeconds / duration, 0, 1);
  return {
    frameA: state.frame,
    frameB: (state.frame + 1) % 4,
    blend: interpolate ? progress : 0,
  };
}

export type UncannyWallMaterial = THREE.ShaderMaterial | MeshBasicNodeMaterial;

export function tagMaterial(
  material: UncannyWallMaterial,
  visualProfile: UncannyWallVisualProfile,
  mode: ShaderProgramMode,
): UncannyWallMaterial {
  material.userData.sharedDungeonMaterial = false;
  material.userData.biomeIntegrated = true;
  material.userData.visualProfile = visualProfile;
  material.userData.fogAlphaFade = [0.12, 0.48];
  material.userData.shaderProgramMode = mode;
  material.userData.uncannyWallAtlas = true;
  return material;
}

function createMaterialGlsl(
  texture: THREE.Texture,
  visualProfile: UncannyWallVisualProfile,
): THREE.ShaderMaterial {
  const material = new THREE.ShaderMaterial({
    name: "Uncanny wall atlas material",
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uncannyMap: { value: texture },
        uncannySurfaceShadow: { value: new THREE.Color(visualProfile.shadow) },
        uncannySurfaceTint: { value: new THREE.Color(visualProfile.propTint) },
        uncannySurfaceHighlight: { value: new THREE.Color(visualProfile.highlight) },
      },
    ]),
    vertexShader: `
      attribute float uncannyRow;
      attribute float uncannyFrameA;
      attribute float uncannyFrameB;
      attribute float uncannyBlend;
      attribute float uncannyVisibility;
      varying vec2 uncannyUv;
      varying float vUncannyRow;
      varying float vUncannyFrameA;
      varying float vUncannyFrameB;
      varying float vUncannyBlend;
      varying float vUncannyVisibility;
      #include <fog_pars_vertex>
      void main() {
        uncannyUv = uv;
        vUncannyRow = uncannyRow;
        vUncannyFrameA = uncannyFrameA;
        vUncannyFrameB = uncannyFrameB;
        vUncannyBlend = uncannyBlend;
        vUncannyVisibility = uncannyVisibility;
        vec4 worldPosition = instanceMatrix * vec4(position, 1.0);
        vec4 mvPosition = modelViewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform sampler2D uncannyMap;
      uniform vec3 uncannySurfaceShadow;
      uniform vec3 uncannySurfaceTint;
      uniform vec3 uncannySurfaceHighlight;
      varying vec2 uncannyUv;
      varying float vUncannyRow;
      varying float vUncannyFrameA;
      varying float vUncannyFrameB;
      varying float vUncannyBlend;
      varying float vUncannyVisibility;
      #include <fog_pars_fragment>
      vec2 atlasUv(float frame) {
        return vec2(
          (frame + uncannyUv.x) * 0.25,
          (3.0 - vUncannyRow + uncannyUv.y) * 0.25
        );
      }
      void main() {
        vec4 first = texture2D(uncannyMap, atlasUv(vUncannyFrameA));
        vec4 second = texture2D(uncannyMap, atlasUv(vUncannyFrameB));
        float temporalBlend = smoothstep(0.0, 1.0, vUncannyBlend);
        vec4 color = mix(first, second, temporalBlend);
        float uncannyLuma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
        float uncannyCompressedValue = mix(
          0.28,
          0.74,
          smoothstep(0.04, 0.96, uncannyLuma)
        );
        vec3 uncannySurfaceTone = mix(
          uncannySurfaceShadow,
          uncannySurfaceHighlight,
          uncannyCompressedValue
        );
        vec3 uncannyAuthoredHue = mix(vec3(uncannyLuma), color.rgb, 0.32);
        color.rgb = mix(uncannySurfaceTone, uncannyAuthoredHue, 0.34);
        color.rgb = mix(
          color.rgb,
          uncannySurfaceTint * mix(0.72, 1.04, uncannyCompressedValue),
          0.22
        );
        color.a *= vUncannyVisibility;
        if (color.a < 0.08) discard;
        gl_FragColor = color;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
        #ifdef USE_FOG
          float uncannyFogVisibility = 1.0 - smoothstep(0.12, 0.48, fogFactor);
          gl_FragColor.a *= uncannyFogVisibility;
          if (gl_FragColor.a < 0.02) discard;
        #endif
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    fog: true,
    toneMapped: true,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  return tagMaterial(material, visualProfile, "glsl") as THREE.ShaderMaterial;
}

function createMaterial(
  texture: THREE.Texture,
  visualProfile: UncannyWallVisualProfile,
  mode?: ShaderProgramMode,
): UncannyWallMaterial {
  registerUncannyWallShaderFactory();
  const registry = getShaderProgramModeRegistry();
  const resolved = mode ?? registry.mode;
  registry.require(UNCANNY_WALL_SHADER_FACTORY_ID, resolved);
  if (resolved === "tsl") {
    const build = requireTslBuilder<
      typeof import("./UncannyWallRuntime.tsl").createUncannyWallMaterialTsl
    >(UNCANNY_WALL_SHADER_FACTORY_ID);
    return build(texture, visualProfile);
  }
  return createMaterialGlsl(texture, visualProfile);
}

/** One instanced atlas batch with an independent pause/play clock per wall copy. */
export class UncannyWallRuntime {
  readonly mesh: THREE.InstancedMesh<THREE.PlaneGeometry, UncannyWallMaterial>;
  private readonly placements: readonly UncannyWallPlacement[];
  private readonly states: UncannyWallPlaybackState[];
  private readonly frameA: THREE.InstancedBufferAttribute;
  private readonly frameB: THREE.InstancedBufferAttribute;
  private readonly blend: THREE.InstancedBufferAttribute;
  private readonly visibility: THREE.InstancedBufferAttribute;
  private readonly interpolate: boolean;

  constructor(
    texture: THREE.Texture,
    placements: readonly UncannyWallPlacement[],
    interpolate = UNCANNY_WALL_FRAME_INTERPOLATION,
    visualProfile: UncannyWallVisualProfile = uncannyWallVisualProfile("ancient"),
    mode?: ShaderProgramMode,
  ) {
    this.placements = placements;
    this.states = placements.map(({ seed }) => createUncannyWallPlayback(seed));
    this.interpolate = interpolate;
    const geometry = new THREE.PlaneGeometry(1, 1);
    const rows = new Float32Array(placements.length);
    const framesA = new Float32Array(placements.length);
    const framesB = new Float32Array(placements.length);
    const blends = new Float32Array(placements.length);
    const visibility = new Float32Array(placements.length).fill(1);
    placements.forEach((placement, index) => {
      rows[index] = placement.row;
    });
    geometry.setAttribute("uncannyRow", new THREE.InstancedBufferAttribute(rows, 1));
    this.frameA = new THREE.InstancedBufferAttribute(framesA, 1).setUsage(THREE.DynamicDrawUsage);
    this.frameB = new THREE.InstancedBufferAttribute(framesB, 1).setUsage(THREE.DynamicDrawUsage);
    this.blend = new THREE.InstancedBufferAttribute(blends, 1).setUsage(THREE.DynamicDrawUsage);
    this.visibility = new THREE.InstancedBufferAttribute(visibility, 1).setUsage(
      THREE.DynamicDrawUsage,
    );
    geometry.setAttribute("uncannyFrameA", this.frameA);
    geometry.setAttribute("uncannyFrameB", this.frameB);
    geometry.setAttribute("uncannyBlend", this.blend);
    geometry.setAttribute("uncannyVisibility", this.visibility);

    this.mesh = new THREE.InstancedMesh(
      geometry,
      createMaterial(texture, visualProfile, mode),
      placements.length,
    );
    this.mesh.name = "Uncanny wall animation batch";
    this.mesh.renderOrder = 6;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = true;
    placements.forEach((placement, index) => this.mesh.setMatrixAt(index, placement.matrix));
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.computeBoundingBox();
    this.mesh.computeBoundingSphere();
    this.mesh.userData.uncannyWallRuntime = {
      instances: placements.length,
      interpolation: interpolate,
      holdRangeSeconds: [UNCANNY_WALL_HOLD_MIN_SECONDS, UNCANNY_WALL_HOLD_MAX_SECONDS],
      visualProfile,
      fogAlphaFade: [0.12, 0.48],
      shaderProgramMode: mode ?? getShaderProgramModeRegistry().mode,
    };
  }

  update(deltaSeconds: number, viewerPosition?: THREE.Vector3Like): void {
    for (let index = 0; index < this.states.length; index += 1) {
      const state = this.states[index]!;
      const placement = this.placements[index]!;
      advanceUncannyWallPlayback(state, deltaSeconds, placement.definition.frameDurationsMs);
      const sample = sampleUncannyWallPlayback(
        state,
        placement.definition.frameDurationsMs,
        this.interpolate,
      );
      this.frameA.setX(index, sample.frameA);
      this.frameB.setX(index, sample.frameB);
      this.blend.setX(index, sample.blend);
      if (viewerPosition) {
        const distance = Math.hypot(placement.x - viewerPosition.x, placement.z - viewerPosition.z);
        const fade = THREE.MathUtils.clamp(
          1 - (distance - UNCANNY_WALL_FADE_FAR) / UNCANNY_WALL_FADE_HYSTERESIS,
          0,
          1,
        );
        this.visibility.setX(index, fade);
      } else {
        this.visibility.setX(index, 1);
      }
    }
    this.frameA.needsUpdate = true;
    this.frameB.needsUpdate = true;
    this.blend.needsUpdate = true;
    this.visibility.needsUpdate = true;
  }
}
