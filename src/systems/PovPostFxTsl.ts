/**
 * WGP-18: TSL / RenderPipeline path for PovPostFx (WebGPU).
 * WGP-19: CRT history ping-pong for the WebGPU path.
 */
import * as THREE from "three";
import { POV_POST_FX_TSL_BUILDER_ID } from "./PovPostFx";
import { registerTslBuilder } from "./TslMaterialModules";
import {
  NodeMaterial,
  NodeUpdateType,
  QuadMesh,
  RendererUtils,
  RenderPipeline,
  RenderTarget,
  TempNode,
} from "three/webgpu";
import {
  Fn,
  clamp,
  cos,
  dot,
  float,
  floor,
  fract,
  length,
  max,
  mix,
  mod,
  passTexture,
  pass,
  select,
  sin,
  smoothstep,
  step,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  viewportCoordinate,
} from "three/tsl";

import type { DungeonRenderer } from "./DungeonRenderer";
import { DEFAULT_DISPLAY_POST_FX_TUNING, type DisplayPostFxTuning } from "./DisplayPostFxTuning";
import {
  POV_CRT_RENDER_SCALE,
  POV_VIGNETTE_INNER_RADIUS,
  POV_VIGNETTE_STRENGTH,
} from "./PovPostFxShared";

/**
 * Uniform bag for the TSL composite.
 * Node field types are intentionally `any`: @types/three TSL ProxiedTuple /
 * UniformNode inference rejects valid runtime graphs (same approach as
 * TextureTreatment dungeon-surface TSL).
 */
export interface PovPostFxTslUniformState {
  uCrtEnabled: any;
  uCrtHalation: any;
  uCrtPersistence: any;
  uCrtScanlines: any;
  uCrtPhosphor: any;
  uCrtBrightness: any;
  uCurvature: any;
  uChromatic: any;
  uCriticalRed: any;
  uHeatwave: any;
  uWaterWarp: any;
  uToxinGreen: any;
  uIceBlue: any;
  uSpikeEdge: any;
  uGrain: any;
  uVignette: any;
  uTime: any;
  uResolution: any;
  uHistoryReady: any;
}

export function createPovPostFxTslUniforms(): PovPostFxTslUniformState {
  return {
    uCrtEnabled: uniform(1),
    uCrtHalation: uniform(DEFAULT_DISPLAY_POST_FX_TUNING.halation),
    uCrtPersistence: uniform(DEFAULT_DISPLAY_POST_FX_TUNING.persistence),
    uCrtScanlines: uniform(DEFAULT_DISPLAY_POST_FX_TUNING.scanlines),
    uCrtPhosphor: uniform(DEFAULT_DISPLAY_POST_FX_TUNING.phosphorMask),
    uCrtBrightness: uniform(DEFAULT_DISPLAY_POST_FX_TUNING.brightness),
    uCurvature: uniform(0.032),
    uChromatic: uniform(0),
    uCriticalRed: uniform(0),
    uHeatwave: uniform(0),
    uWaterWarp: uniform(0),
    uToxinGreen: uniform(0),
    uIceBlue: uniform(0),
    uSpikeEdge: uniform(0),
    uGrain: uniform(0.007),
    uVignette: uniform(POV_VIGNETTE_STRENGTH),
    uTime: uniform(0),
    uResolution: uniform(new THREE.Vector2(1, 1)),
    uHistoryReady: uniform(0),
  };
}

/** Rec.601 luma — do not use the TSL Rec.709 luminance helper. */
const rec601Luma = /*@__PURE__*/ Fn(([color]: [any]) => {
  return dot(color, vec3(0.299, 0.587, 0.114));
});

const random21 = /*@__PURE__*/ Fn(([seed]: [any]) => {
  return fract(sin(dot(seed, vec2(12.9898, 78.233))).mul(43758.5453));
});

/**
 * Pincushion warp (edges pull outward): opposite of three/addons barrel distortion.
 * Aspect-corrected so wide screens don't stretch the warp.
 * Do not import barrel helpers from three/addons/tsl/display/CRT.js.
 */
const pincushion = /*@__PURE__*/ Fn(([uvCoord, k, resolution]: [any, any, any]) => {
  const c = uvCoord.mul(2).sub(1).toVar();
  const aspect = resolution.x.div(max(resolution.y, float(1)));
  c.x.mulAssign(aspect);
  const r2 = dot(c, c);
  c.mulAssign(float(1).sub(k.mul(r2)));
  c.x.divAssign(aspect);
  return c.mul(0.5).add(0.5);
});

const heatwaveOffset = /*@__PURE__*/ Fn(([uvCoord, amount, time]: [any, any, any]) => {
  const wave = sin(uvCoord.y.mul(34).add(time.mul(7.2)))
    .mul(0.0044)
    .add(sin(uvCoord.y.mul(17).sub(time.mul(4.3))).mul(0.0026))
    .add(sin(uvCoord.x.mul(9).add(time.mul(2.8))).mul(0.0014));
  const lift = sin(uvCoord.x.mul(26).add(time.mul(5.5)))
    .mul(0.0026)
    .add(cos(uvCoord.x.mul(11).sub(time.mul(3.1))).mul(0.0014));
  return select(amount.lessThan(0.001), vec2(0, 0), vec2(wave, lift).mul(amount));
});

const waterWarpOffset = /*@__PURE__*/ Fn(([uvCoord, amount, time]: [any, any, any]) => {
  const t = time.mul(0.55);
  const n0 = random21(floor(uvCoord.mul(18).add(t.mul(0.35))));
  const n1 = random21(floor(uvCoord.mul(11).sub(t.mul(0.22))).add(3.7));
  const noise = n0.add(n1).mul(0.5).sub(0.5);
  const waveX = sin(uvCoord.y.mul(9.5).add(t.mul(1.35)))
    .mul(0.00105)
    .add(sin(uvCoord.y.mul(4.2).sub(t.mul(0.82)).add(noise.mul(2.4))).mul(0.00055))
    .add(sin(uvCoord.x.mul(3.1).add(t.mul(0.48))).mul(0.00032));
  const waveY = cos(uvCoord.x.mul(8.4).sub(t.mul(1.12)))
    .mul(0.00085)
    .add(sin(uvCoord.x.mul(3.8).add(t.mul(0.66)).add(noise.mul(1.7))).mul(0.00042))
    .add(cos(uvCoord.y.mul(2.6).add(t.mul(0.38))).mul(0.00028));
  return select(amount.lessThan(0.001), vec2(0, 0), vec2(waveX, waveY).mul(amount));
});

const crtPhosphorMask = /*@__PURE__*/ Fn(([pixel]: [any]) => {
  const triad = mod(floor(pixel.x), 3);
  const mask = select(
    triad.lessThan(0.5),
    vec3(1.08, 0.94, 0.94),
    select(triad.lessThan(1.5), vec3(0.94, 1.08, 0.94), vec3(0.94, 0.94, 1.08)),
  );
  const grille = mix(float(0.97), float(1.02), step(0.5, mod(floor(pixel.y), 2)));
  return mask.mul(grille);
});

function buildCompositeNode(
  inputTexture: any,
  historyTexture: any | null,
  u: PovPostFxTslUniformState,
): any {
  // Composite body uses loose node typing — @types/three TSL overloads collapse
  // valid graphs to `never` (same expand pattern as TextureTreatment TSL helpers).
  return Fn((): any => {
    const vUv: any = uv();
    const k: any = u.uCurvature;
    const crtFrame: any = floor(u.uTime.mul(24));
    const jitterGate: any = step(0.982, random21(vec2(crtFrame, 7)));
    const jitterX: any = random21(vec2(crtFrame, 13))
      .sub(0.5)
      .mul(jitterGate)
      .mul(u.uCrtEnabled)
      .mul(0.2)
      .div(max(u.uResolution.x, float(1)));
    const crtJitter: any = vec2(jitterX as any, float(0));
    const ca: any = u.uChromatic.add(u.uCrtEnabled.mul(0.00022));
    const heat: any = heatwaveOffset(vUv, u.uHeatwave, u.uTime);
    const water: any = waterWarpOffset(vUv, u.uWaterWarp, u.uTime);
    // heat + water (biome lens independent of hazard heatwave)
    const sampleUv: any = vUv.add(heat).add(water).add(crtJitter);

    const uvG = pincushion(sampleUv, k, u.uResolution).toVar();
    const centered = vUv.mul(2).sub(1).toVar();
    const len = length(centered);
    const radial = select(len.greaterThan(1e-4), centered.div(len), vec2(0, 0));
    const uvR = pincushion(sampleUv.add(radial.mul(ca)), k, u.uResolution);
    const uvB = pincushion(sampleUv.sub(radial.mul(ca)), k, u.uResolution);

    const maskR = step(0, uvR.x).mul(step(uvR.x, 1)).mul(step(0, uvR.y)).mul(step(uvR.y, 1));
    const maskG = step(0, uvG.x).mul(step(uvG.x, 1)).mul(step(0, uvG.y)).mul(step(uvG.y, 1));
    const maskB = step(0, uvB.x).mul(step(uvB.x, 1)).mul(step(0, uvB.y)).mul(step(uvB.y, 1));

    const r = inputTexture
      .sample(clamp(uvR, 0, 1))
      .r.mul(maskR)
      .toVar();
    const g = inputTexture
      .sample(clamp(uvG, 0, 1))
      .g.mul(maskG)
      .toVar();
    const b = inputTexture
      .sample(clamp(uvB, 0, 1))
      .b.mul(maskB)
      .toVar();
    const fallback = inputTexture.sample(clamp(uvG, 0, 1)).rgb.toVar();
    r.assign(select(maskR.lessThan(0.5), fallback.r, r));
    g.assign(select(maskG.lessThan(0.5), fallback.g, g));
    b.assign(select(maskB.lessThan(0.5), fallback.b, b));

    const baseColor = vec3(r, g, b).toVar();

    // Halation (CRT): 4-tap glow around the green sample.
    const glowStep = vec2(1.8, 1.5).div(max(u.uResolution, vec2(1, 1)));
    const glow = fallback
      .mul(0.32)
      .add(inputTexture.sample(uvG.add(vec2(glowStep.x, 0))).rgb.mul(0.17))
      .add(inputTexture.sample(uvG.sub(vec2(glowStep.x, 0))).rgb.mul(0.17))
      .add(inputTexture.sample(uvG.add(vec2(0, glowStep.y))).rgb.mul(0.17))
      .add(inputTexture.sample(uvG.sub(vec2(0, glowStep.y))).rgb.mul(0.17));
    const highlight = smoothstep(0.34, 0.92, rec601Luma(fallback));
    const crtGlow = glow
      .mul(vec3(1.08, 0.91, 0.76))
      .mul(highlight)
      .mul(u.uCrtEnabled)
      .mul(u.uCrtHalation);
    baseColor.addAssign(crtGlow);

    const baseLuma = rec601Luma(baseColor);
    const criticalColor = vec3(
      max(baseColor.r, baseLuma.mul(0.82)),
      baseColor.g.mul(0.48),
      baseColor.b.mul(0.42),
    );
    const gradedColor = mix(baseColor, criticalColor, u.uCriticalRed).toVar();

    const heatColor = gradedColor
      .mul(vec3(1.14, 0.9, 0.72))
      .add(vec3(0.05, 0.012, 0).mul(u.uHeatwave));
    gradedColor.assign(mix(gradedColor, heatColor, clamp(u.uHeatwave.mul(0.62), 0, 1)));
    const toxinColor = vec3(
      gradedColor.r.mul(0.4),
      max(gradedColor.g, baseLuma.mul(0.88)),
      gradedColor.b.mul(0.46),
    );
    gradedColor.assign(mix(gradedColor, toxinColor, clamp(u.uToxinGreen, 0, 1)));
    const iceColor = vec3(
      gradedColor.r.mul(0.52),
      gradedColor.g.mul(0.78),
      max(gradedColor.b, baseLuma.mul(0.92)),
    );
    gradedColor.assign(mix(gradedColor, iceColor, clamp(u.uIceBlue, 0, 1)));
    const edge = smoothstep(0.42, 1.08, length(centered));
    gradedColor.assign(
      mix(
        gradedColor,
        gradedColor.mul(vec3(0.82, 0.8, 0.76)).add(vec3(0.08, 0.07, 0.05).mul(edge)),
        clamp(u.uSpikeEdge.mul(edge), 0, 1),
      ),
    );

    if (historyTexture) {
      const historyColor = historyTexture.sample(clamp(uvG, 0, 1)).rgb;
      const decayedHistory = historyColor.mul(vec3(0.93, 0.95, 0.92));
      const historyDelta = max(rec601Luma(decayedHistory).sub(rec601Luma(gradedColor)), 0);
      const persistence = smoothstep(0.012, 0.24, historyDelta)
        .mul(u.uHistoryReady)
        .mul(u.uCrtEnabled)
        .mul(u.uCrtPersistence);
      // Loose cast: vec3 max/mix overloads collapse under @types/three TSL.
      gradedColor.assign(
        (mix as any)(gradedColor, (max as any)(gradedColor, decayedHistory), persistence),
      );
    }

    const grainFrame = floor(u.uTime.mul(18));
    const grainCoord = floor(viewportCoordinate.xy);
    const grainA = fract(
      sin(dot(grainCoord.add(grainFrame), vec2(12.9898, 78.233))).mul(43758.5453),
    );
    const grainB = fract(
      sin(dot(grainCoord.mul(1.37).add(grainFrame.mul(0.71)), vec2(39.346, 11.135))).mul(23421.631),
    );
    const grain = grainA.mul(0.62).add(grainB.mul(0.38)).sub(0.5);
    const grainResponse = mix(
      float(0.52),
      float(1),
      smoothstep(0.03, 0.42, rec601Luma(gradedColor)),
    );
    gradedColor.addAssign(grain.mul(u.uGrain).mul(grainResponse));

    const scanPhase = cos(viewportCoordinate.y.mul(1.5707963)).mul(0.5).add(0.5);
    const scanBeam = mix(float(0.88), float(1.035), scanPhase).mul(
      mix(float(0.97), float(1.025), smoothstep(0.08, 0.78, rec601Luma(gradedColor))),
    );
    gradedColor.mulAssign(mix(float(1), scanBeam, u.uCrtEnabled.mul(u.uCrtScanlines)));
    gradedColor.mulAssign(
      mix(vec3(1, 1, 1), crtPhosphorMask(viewportCoordinate.xy), u.uCrtEnabled.mul(u.uCrtPhosphor)),
    );
    gradedColor.mulAssign(mix(float(1), u.uCrtBrightness, u.uCrtEnabled));

    const vignetteUv = vUv.mul(2).sub(1).toVar();
    vignetteUv.x.mulAssign(0.82);
    const vignette = smoothstep(float(POV_VIGNETTE_INNER_RADIUS), float(1.18), length(vignetteUv));
    gradedColor.mulAssign(float(1).sub(vignette.mul(u.uVignette)));

    return vec4(clamp(gradedColor, 0, 1), 1);
  })();
}

/** One-sample path for the default CRT-off presentation. */
function buildLightCompositeNode(inputTexture: any, u: PovPostFxTslUniformState): any {
  return Fn((): any => {
    const vUv: any = uv();
    const centered = vUv.mul(2).sub(1).toVar();
    const sampleUv = vUv
      .add(heatwaveOffset(vUv, u.uHeatwave, u.uTime))
      .add(waterWarpOffset(vUv, u.uWaterWarp, u.uTime));
    const color = inputTexture.sample(clamp(sampleUv, 0, 1)).rgb.toVar();
    const luma = rec601Luma(color);

    const criticalColor = vec3(max(color.r, luma.mul(0.82)), color.g.mul(0.48), color.b.mul(0.42));
    color.assign(mix(color, criticalColor, u.uCriticalRed));
    color.assign(
      mix(
        color,
        color.mul(vec3(1.14, 0.9, 0.72)).add(vec3(0.05, 0.012, 0).mul(u.uHeatwave)),
        clamp(u.uHeatwave.mul(0.62), 0, 1),
      ),
    );
    color.assign(
      mix(
        color,
        vec3(color.r.mul(0.4), max(color.g, luma.mul(0.88)), color.b.mul(0.46)),
        clamp(u.uToxinGreen, 0, 1),
      ),
    );
    color.assign(
      mix(
        color,
        vec3(color.r.mul(0.52), color.g.mul(0.78), max(color.b, luma.mul(0.92))),
        clamp(u.uIceBlue, 0, 1),
      ),
    );
    const edge = smoothstep(0.42, 1.08, length(centered));
    color.assign(
      mix(
        color,
        color.mul(vec3(0.82, 0.8, 0.76)).add(vec3(0.08, 0.07, 0.05).mul(edge)),
        clamp(u.uSpikeEdge.mul(edge), 0, 1),
      ),
    );

    const grainCoord = floor(viewportCoordinate.xy);
    const grainFrame = floor(u.uTime.mul(18));
    const grain = random21(grainCoord.add(grainFrame)).sub(0.5);
    color.addAssign(grain.mul(u.uGrain).mul(0.72));

    const vignetteUv = centered.toVar();
    vignetteUv.x.mulAssign(0.82);
    const vignette = smoothstep(float(POV_VIGNETTE_INNER_RADIUS), float(1.18), length(vignetteUv));
    color.mulAssign(float(1).sub(vignette.mul(u.uVignette)));
    return vec4((clamp as any)(color, vec3(0), vec3(1)), 1);
  })();
}

const rendererState = { current: undefined as unknown };
const historyQuad = /*@__PURE__*/ new QuadMesh();
const HistoryTempNode = TempNode as unknown as { new (type: string): any };

class PovCrtHistoryNode extends HistoryTempNode {
  readonly textureNode: any;
  private readonly uniforms: PovPostFxTslUniformState;
  private compTarget: RenderTarget;
  private oldTarget: RenderTarget;
  private readonly outputTextureNode: any;
  private readonly oldTextureNode: any;
  private materialComposed: NodeMaterial | null = null;
  private historyReady = false;
  private clearPending = true;

  constructor(textureNode: any, uniforms: PovPostFxTslUniformState) {
    super("vec4");
    this.textureNode = textureNode;
    this.uniforms = uniforms;
    this.compTarget = this.createHistoryTarget("PovPostFxTsl.history.comp");
    this.oldTarget = this.createHistoryTarget("PovPostFxTsl.history.old");
    this.outputTextureNode = (passTexture as any)(this, this.compTarget.texture);
    this.oldTextureNode = texture(this.oldTarget.texture);
    this.updateBeforeType = NodeUpdateType.FRAME;
  }

  getTextureNode(): any {
    return this.outputTextureNode;
  }

  getHistoryTargets(): readonly [RenderTarget, RenderTarget] {
    return [this.compTarget, this.oldTarget] as const;
  }

  setSize(width: number, height: number): void {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    this.compTarget.setSize(w, h);
    this.oldTarget.setSize(w, h);
    this.reset();
  }

  reset(): void {
    this.historyReady = false;
    this.clearPending = true;
    this.uniforms.uHistoryReady.value = 0;
  }

  updateBefore(frame: any): void {
    const renderer = frame.renderer;
    rendererState.current = (RendererUtils.resetRendererState as any)(
      renderer,
      rendererState.current,
    );

    try {
      this.syncTextureNodes();
      if (this.clearPending) {
        this.clearTarget(renderer, this.compTarget);
        this.clearTarget(renderer, this.oldTarget);
        this.clearPending = false;
      }

      this.uniforms.uHistoryReady.value = this.historyReady ? 1 : 0;
      historyQuad.material = this.materialComposed!;
      historyQuad.name = "PovPostFxTsl CRT history";

      renderer.setRenderTarget(this.compTarget);
      renderer.clear();
      historyQuad.render(renderer);

      const renderedTarget = this.compTarget;
      this.compTarget = this.oldTarget;
      this.oldTarget = renderedTarget;
      this.historyReady = this.uniforms.uCrtEnabled.value > 0;
    } finally {
      (RendererUtils.restoreRendererState as any)(renderer, rendererState.current);
    }
  }

  setup(builder: any): any {
    this.oldTextureNode.uvNode = this.textureNode.uvNode || uv();
    const material = this.materialComposed || (this.materialComposed = new NodeMaterial());
    material.name = "PovPostFxTsl CRT history";
    material.fragmentNode = buildCompositeNode(
      this.textureNode,
      this.oldTextureNode,
      this.uniforms,
    );

    const properties = builder.getNodeProperties(this);
    properties.textureNode = this.textureNode;

    return this.outputTextureNode;
  }

  dispose(): void {
    this.compTarget.dispose();
    this.oldTarget.dispose();
    this.materialComposed?.dispose();
    this.materialComposed = null;
  }

  private createHistoryTarget(name: string): RenderTarget {
    const target = new RenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
    });
    target.texture.name = name;
    target.texture.generateMipmaps = false;
    target.texture.colorSpace = THREE.NoColorSpace;
    return target;
  }

  private syncTextureNodes(): void {
    this.outputTextureNode.value = this.compTarget.texture;
    this.oldTextureNode.value = this.oldTarget.texture;
  }

  private clearTarget(renderer: any, target: RenderTarget): void {
    renderer.setRenderTarget(target);
    renderer.clear(true, true, true);
  }
}

/**
 * Owns the WebGPU RenderPipeline + scene pass for PovPostFx.
 */
export class PovPostFxTslPipeline {
  private readonly uniforms: PovPostFxTslUniformState;
  private pipeline: RenderPipeline | null = null;
  private scenePass: ReturnType<typeof pass> | null = null;
  private historyNode: PovCrtHistoryNode | null = null;
  private crtEnabled = true;
  private historyWidth = 1;
  private historyHeight = 1;

  constructor(uniforms: PovPostFxTslUniformState) {
    this.uniforms = uniforms;
  }

  ensure(renderer: DungeonRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.scenePass) {
      this.scenePass.scene = scene;
      this.scenePass.camera = camera;
      return;
    }
    this.scenePass = pass(scene, camera);
    this.pipeline = new RenderPipeline(renderer as never);
    // The scene pass output already carries the renderer's tone/color transform.
    // Reapplying it here lifts shadows and washes the WebGPU composite.
    this.pipeline.outputColorTransform = false;
    const beauty = this.scenePass.getTextureNode("output");
    this.historyNode = new PovCrtHistoryNode(beauty, this.uniforms);
    this.historyNode.setSize(this.historyWidth, this.historyHeight);
    this.updateOutputNode();
  }

  setCrtEnabled(value: boolean): void {
    if (this.crtEnabled === value) return;
    this.crtEnabled = value;
    this.resetHistory();
    this.updateOutputNode();
  }

  resetHistory(): void {
    this.historyNode?.reset();
    this.uniforms.uHistoryReady.value = 0;
  }

  private updateOutputNode(): void {
    if (!this.pipeline || !this.scenePass) return;
    const beauty = this.scenePass.getTextureNode("output");
    this.pipeline.outputNode = this.crtEnabled
      ? this.historyNode!.getTextureNode()
      : buildLightCompositeNode(beauty, this.uniforms);
    this.pipeline.needsUpdate = true;
  }

  setSize(width: number, height: number): void {
    this.historyWidth = Math.max(1, Math.round(width * POV_CRT_RENDER_SCALE));
    this.historyHeight = Math.max(1, Math.round(height * POV_CRT_RENDER_SCALE));
    (this.uniforms.uResolution.value as THREE.Vector2).set(this.historyWidth, this.historyHeight);
    this.historyNode?.setSize(this.historyWidth, this.historyHeight);
  }

  applyDisplayTuning(tuning: DisplayPostFxTuning): void {
    this.uniforms.uCrtHalation.value = tuning.halation;
    this.uniforms.uCrtPersistence.value = tuning.persistence;
    this.uniforms.uCrtScanlines.value = tuning.scanlines;
    this.uniforms.uCrtPhosphor.value = tuning.phosphorMask;
    this.uniforms.uCrtBrightness.value = tuning.brightness;
  }

  render(renderer: DungeonRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    this.ensure(renderer, scene, camera);
    this.pipeline!.render();
  }

  dispose(): void {
    this.pipeline?.dispose();
    this.scenePass?.dispose();
    this.historyNode?.dispose();
    this.pipeline = null;
    this.scenePass = null;
    this.historyNode = null;
  }
}

export interface PovPostFxTslStage {
  readonly uniforms: PovPostFxTslUniformState;
  readonly pipeline: PovPostFxTslPipeline;
}

export function createPovPostFxTslStage(): PovPostFxTslStage {
  const uniforms = createPovPostFxTslUniforms();
  return { uniforms, pipeline: new PovPostFxTslPipeline(uniforms) };
}

registerTslBuilder(POV_POST_FX_TSL_BUILDER_ID, createPovPostFxTslStage);
