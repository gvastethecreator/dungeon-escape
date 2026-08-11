import * as THREE from "three";

import {
  MAX_POST_PALETTE_COLORS,
  palettePostEffectProfile,
  type PalettePostEffectProfile,
  type PalettePostEffectId,
} from "./PalettePostEffect";
import {
  DEFAULT_DISPLAY_POST_FX_TUNING,
  normalizeDisplayPostFxTuning,
  type DisplayPostFxTuning,
} from "./DisplayPostFxTuning";

export const POV_VIGNETTE_STRENGTH = 0.1;
export const POV_VIGNETTE_INNER_RADIUS = 0.62;
export const POV_CRT_HISTORY_WEIGHT = 0.16;
export const POV_CRT_HALATION_STRENGTH = 0.16;
/** Heavy CRT composite runs below scene resolution, then uses one cheap upscale. */
export const POV_CRT_RENDER_SCALE = 0.8;

const FULLSCREEN_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

function createPostTarget(depthBuffer: boolean): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer,
    stencilBuffer: false,
  });
  target.texture.generateMipmaps = false;
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

function parsePaletteColor(hex: string | undefined): THREE.Vector3 {
  const value = Number.parseInt((hex ?? "#000000").slice(1), 16);
  return new THREE.Vector3(
    ((value >> 16) & 0xff) / 255,
    ((value >> 8) & 0xff) / 255,
    (value & 0xff) / 255,
  );
}

function linearPaletteChannel(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function paletteColorToOklab(color: THREE.Vector3): THREE.Vector3 {
  const red = linearPaletteChannel(color.x);
  const green = linearPaletteChannel(color.y);
  const blue = linearPaletteChannel(color.z);
  const l = Math.cbrt(0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue);
  const m = Math.cbrt(0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue);
  const s = Math.cbrt(0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue);
  return new THREE.Vector3(
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  );
}

/**
 * Full-screen post pass: mild outward (pincushion) lens warp + radial chromatic aberration.
 * Renders the main scene into a target, then composites to the canvas.
 */
export class PovPostFx {
  private readonly sceneTarget: THREE.WebGLRenderTarget;
  private readonly historyTargets = [createPostTarget(false), createPostTarget(false)] as const;
  private readonly fsScene = new THREE.Scene();
  private readonly copyScene = new THREE.Scene();
  private readonly fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly copyMaterial: THREE.ShaderMaterial;
  private readonly geometry = new THREE.PlaneGeometry(2, 2);
  private readonly mesh: THREE.Mesh;
  private readonly copyMesh: THREE.Mesh;
  private readonly paletteColors = Array.from(
    { length: MAX_POST_PALETTE_COLORS },
    () => new THREE.Vector3(),
  );
  private readonly paletteOklabColors = Array.from(
    { length: MAX_POST_PALETTE_COLORS },
    () => new THREE.Vector3(),
  );
  private width = 1;
  private height = 1;
  private enabled = true;
  private crtEnabled = true;
  private historyReadIndex = 0;
  private historyReady = false;
  private animateGrain = true;
  private displayTuning: DisplayPostFxTuning = { ...DEFAULT_DISPLAY_POST_FX_TUNING };
  private activePaletteProfile: PalettePostEffectProfile | null = null;

  constructor() {
    this.sceneTarget = createPostTarget(true);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.sceneTarget.texture },
        tHistory: { value: this.historyTargets[0].texture },
        uHistoryReady: { value: 0 },
        uCrtEnabled: { value: 1 },
        uCrtHalation: { value: DEFAULT_DISPLAY_POST_FX_TUNING.halation },
        uCrtPersistence: { value: DEFAULT_DISPLAY_POST_FX_TUNING.persistence },
        uCrtScanlines: { value: DEFAULT_DISPLAY_POST_FX_TUNING.scanlines },
        uCrtPhosphor: { value: DEFAULT_DISPLAY_POST_FX_TUNING.phosphorMask },
        uCrtBrightness: { value: DEFAULT_DISPLAY_POST_FX_TUNING.brightness },
        uCurvature: { value: 0.032 },
        uChromatic: { value: 0 },
        uCriticalRed: { value: 0 },
        uHeatwave: { value: 0 },
        uWaterWarp: { value: 0 },
        uToxinGreen: { value: 0 },
        uIceBlue: { value: 0 },
        uSpikeEdge: { value: 0 },
        uGrain: { value: 0.007 },
        uVignette: { value: POV_VIGNETTE_STRENGTH },
        uPaletteEnabled: { value: 0 },
        uPaletteSize: { value: 0 },
        uPaletteColors: { value: this.paletteColors },
        uPaletteOklabColors: { value: this.paletteOklabColors },
        uPaletteDither: { value: 0 },
        uPaletteDitherAmplitude: { value: 0.07 },
        uPalettePatternScale: { value: 1 },
        uPaletteShadowStart: { value: 0.1 },
        uPaletteShadowEnd: { value: 0.3 },
        uPaletteFlatSuppression: { value: 0.8 },
        uPaletteDetailBoost: { value: 1 },
        uPaletteLightnessBias: { value: 0 },
        uPaletteLightnessWeight: { value: 4 },
        uPaletteChromaWeight: { value: 1 },
        uPaletteStage: { value: 1 },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: FULLSCREEN_VERTEX_SHADER,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform sampler2D tDiffuse;
        uniform sampler2D tHistory;
        uniform float uHistoryReady;
        uniform float uCrtEnabled;
        uniform float uCrtHalation;
        uniform float uCrtPersistence;
        uniform float uCrtScanlines;
        uniform float uCrtPhosphor;
        uniform float uCrtBrightness;
        uniform float uCurvature;
        uniform float uChromatic;
        uniform float uCriticalRed;
        uniform float uHeatwave;
        uniform float uWaterWarp;
        uniform float uToxinGreen;
        uniform float uIceBlue;
        uniform float uSpikeEdge;
        uniform float uGrain;
        uniform float uVignette;
        uniform float uPaletteEnabled;
        uniform float uPaletteSize;
        uniform vec3 uPaletteColors[${MAX_POST_PALETTE_COLORS}];
        uniform vec3 uPaletteOklabColors[${MAX_POST_PALETTE_COLORS}];
        uniform float uPaletteDither;
        uniform float uPaletteDitherAmplitude;
        uniform float uPalettePatternScale;
        uniform float uPaletteShadowStart;
        uniform float uPaletteShadowEnd;
        uniform float uPaletteFlatSuppression;
        uniform float uPaletteDetailBoost;
        uniform float uPaletteLightnessBias;
        uniform float uPaletteLightnessWeight;
        uniform float uPaletteChromaWeight;
        uniform float uPaletteStage;
        uniform float uTime;
        uniform vec2 uResolution;
        varying vec2 vUv;

        float luma(vec3 color) {
          return dot(color, vec3(0.299, 0.587, 0.114));
        }

        float random(vec2 seed) {
          return fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453);
        }

        float paletteBayer2(vec2 pixel) {
          vec2 cell = mod(floor(pixel), 2.0);
          if (cell.x < 0.5 && cell.y < 0.5) return 0.0;
          if (cell.x > 0.5 && cell.y > 0.5) return 1.0;
          if (cell.x > 0.5 && cell.y < 0.5) return 2.0;
          return 3.0;
        }

        float paletteBayer4(vec2 pixel) {
          vec2 cell = floor(pixel);
          return paletteBayer2(cell) * 4.0 + paletteBayer2(floor(cell * 0.5));
        }

        float paletteLinearChannel(float value) {
          return value <= 0.04045
            ? value / 12.92
            : pow((value + 0.055) / 1.055, 2.4);
        }

        vec3 paletteOklab(vec3 color) {
          vec3 linearColor = vec3(
            paletteLinearChannel(color.r),
            paletteLinearChannel(color.g),
            paletteLinearChannel(color.b)
          );
          float l = pow(max(dot(linearColor, vec3(0.4122214708, 0.5363325363, 0.0514459929)), 0.0), 1.0 / 3.0);
          float m = pow(max(dot(linearColor, vec3(0.2119034982, 0.6806995451, 0.1073969566)), 0.0), 1.0 / 3.0);
          float s = pow(max(dot(linearColor, vec3(0.0883024619, 0.2817188376, 0.6299787005)), 0.0), 1.0 / 3.0);
          return vec3(
            0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
          );
        }

        vec3 limitToPalette(vec3 color) {
          if (uPaletteEnabled < 0.5 || uPaletteSize < 1.5) return color;
          vec3 sourceLab = paletteOklab(clamp(color, 0.0, 1.0));
          float edgeEnergy = fwidth(sourceLab.x);
          float detailGate = smoothstep(
            0.004,
            0.04,
            edgeEnergy * max(uPaletteDetailBoost, 0.01)
          );
          float flatGate = mix(
            1.0 - clamp(uPaletteFlatSuppression, 0.0, 0.98),
            1.0,
            detailGate
          );
          float shadowGate = smoothstep(
            min(uPaletteShadowStart, uPaletteShadowEnd - 0.001),
            max(uPaletteShadowEnd, uPaletteShadowStart + 0.001),
            sourceLab.x
          );
          float highlightGate = 1.0 - smoothstep(0.92, 0.995, sourceLab.x);
          float threshold =
            (paletteBayer4(gl_FragCoord.xy / max(uPalettePatternScale, 1.0)) + 0.5) / 16.0 - 0.5;
          float ditherGate = mix(0.08, 1.0, shadowGate) * flatGate * highlightGate;
          sourceLab.x = clamp(
            sourceLab.x + uPaletteLightnessBias +
              threshold * uPaletteDither * uPaletteDitherAmplitude * ditherGate,
            0.0,
            1.0
          );
          vec3 closest = uPaletteColors[0];
          float closestDistance = 1000.0;
          for (int index = 0; index < ${MAX_POST_PALETTE_COLORS}; index++) {
            if (float(index) >= uPaletteSize) continue;
            vec3 candidate = uPaletteColors[index];
            vec3 delta = sourceLab - uPaletteOklabColors[index];
            float distance =
              delta.x * delta.x * uPaletteLightnessWeight +
              (delta.y * delta.y + delta.z * delta.z) * uPaletteChromaWeight;
            if (distance < closestDistance) {
              closestDistance = distance;
              closest = candidate;
            }
          }
          return closest;
        }

        vec3 crtPhosphorMask(vec2 pixel) {
          float triad = mod(floor(pixel.x), 3.0);
          vec3 mask = triad < 0.5
            ? vec3(1.08, 0.94, 0.94)
            : triad < 1.5
              ? vec3(0.94, 1.08, 0.94)
              : vec3(0.94, 0.94, 1.08);
          float grille = mix(0.97, 1.02, step(0.5, mod(floor(pixel.y), 2.0)));
          return mask * grille;
        }

        vec3 crtHalation(vec2 uv, vec3 center) {
          vec2 glowStep = vec2(1.8, 1.5) / max(uResolution, vec2(1.0));
          vec3 glow = center * 0.32;
          glow += texture2D(tDiffuse, uv + vec2(glowStep.x, 0.0)).rgb * 0.17;
          glow += texture2D(tDiffuse, uv - vec2(glowStep.x, 0.0)).rgb * 0.17;
          glow += texture2D(tDiffuse, uv + vec2(0.0, glowStep.y)).rgb * 0.17;
          glow += texture2D(tDiffuse, uv - vec2(0.0, glowStep.y)).rgb * 0.17;

          float highlight = smoothstep(0.34, 0.92, luma(center));
          return glow * vec3(1.08, 0.91, 0.76) * highlight;
        }

        // Pincushion warp (edges pull outward): opposite of inward barrel.
        // Positive k → sample closer to center at the frame edge so the scene
        // bows the other way from classic “fisheye” barrel.
        vec2 pincushion(vec2 uv, float k) {
          vec2 c = uv * 2.0 - 1.0;
          // Mild aspect correction so wide screens don't stretch the warp.
          float aspect = uResolution.x / max(uResolution.y, 1.0);
          c.x *= aspect;
          float r2 = dot(c, c);
          c *= 1.0 - k * r2;
          c.x /= aspect;
          return c * 0.5 + 0.5;
        }

        // Vertical heat shimmer: UV bend only (no extra texture samples).
        vec2 heatwaveOffset(vec2 uv, float amount) {
          if (amount < 0.001) return vec2(0.0);
          float wave =
            sin(uv.y * 34.0 + uTime * 7.2) * 0.0044 +
            sin(uv.y * 17.0 - uTime * 4.3) * 0.0026 +
            sin(uv.x * 9.0 + uTime * 2.8) * 0.0014;
          float lift =
            sin(uv.x * 26.0 + uTime * 5.5) * 0.0026 +
            cos(uv.x * 11.0 - uTime * 3.1) * 0.0014;
          return vec2(wave, lift) * amount;
        }

        // Quiet underwater pressure: slow multi-frequency noise UV warp.
        // Amplitude stays well below heatwave so it never reads as drunk-camera.
        vec2 waterWarpOffset(vec2 uv, float amount) {
          if (amount < 0.001) return vec2(0.0);
          float t = uTime * 0.55;
          float n0 = random(floor(uv * 18.0 + t * 0.35));
          float n1 = random(floor(uv * 11.0 - t * 0.22) + 3.7);
          float noise = (n0 + n1) * 0.5 - 0.5;
          float waveX =
            sin(uv.y * 9.5 + t * 1.35) * 0.00105 +
            sin(uv.y * 4.2 - t * 0.82 + noise * 2.4) * 0.00055 +
            sin(uv.x * 3.1 + t * 0.48) * 0.00032;
          float waveY =
            cos(uv.x * 8.4 - t * 1.12) * 0.00085 +
            sin(uv.x * 3.8 + t * 0.66 + noise * 1.7) * 0.00042 +
            cos(uv.y * 2.6 + t * 0.38) * 0.00028;
          return vec2(waveX, waveY) * amount;
        }

        void main() {
          float k = uCurvature;
          float crtFrame = floor(uTime * 24.0);
          float jitterGate = step(0.982, random(vec2(crtFrame, 7.0)));
          vec2 crtJitter = vec2(
            (random(vec2(crtFrame, 13.0)) - 0.5) * jitterGate * uCrtEnabled * 0.2 / max(uResolution.x, 1.0),
            0.0
          );
          float ca = uChromatic + uCrtEnabled * 0.00022;
          vec2 heat = heatwaveOffset(vUv, uHeatwave);
          vec2 water = waterWarpOffset(vUv, uWaterWarp);
          vec2 sampleUv = vUv + heat + water + crtJitter;

          vec2 uvG = pincushion(sampleUv, k);
          // Radial chromatic: R/B pull slightly along the same warp direction.
          vec2 centered = vUv * 2.0 - 1.0;
          float len = length(centered);
          vec2 radial = len > 1e-4 ? centered / len : vec2(0.0);
          vec2 uvR = pincushion(sampleUv + radial * ca, k);
          vec2 uvB = pincushion(sampleUv - radial * ca, k);

          // Soft edge clamp — avoids hard wrap seams at the frame border.
          float maskR = step(0.0, uvR.x) * step(uvR.x, 1.0) * step(0.0, uvR.y) * step(uvR.y, 1.0);
          float maskG = step(0.0, uvG.x) * step(uvG.x, 1.0) * step(0.0, uvG.y) * step(uvG.y, 1.0);
          float maskB = step(0.0, uvB.x) * step(uvB.x, 1.0) * step(0.0, uvB.y) * step(uvB.y, 1.0);

          float r = texture2D(tDiffuse, clamp(uvR, 0.0, 1.0)).r * maskR;
          float g = texture2D(tDiffuse, clamp(uvG, 0.0, 1.0)).g * maskG;
          float b = texture2D(tDiffuse, clamp(uvB, 0.0, 1.0)).b * maskB;
          // When a channel samples outside, fall back to green sample (shared luminance).
          vec3 fallback = texture2D(tDiffuse, clamp(uvG, 0.0, 1.0)).rgb;
          if (maskR < 0.5) r = fallback.r;
          if (maskG < 0.5) g = fallback.g;
          if (maskB < 0.5) b = fallback.b;

          vec3 baseColor = vec3(r, g, b);
          vec3 crtGlow = crtHalation(uvG, fallback) * uCrtEnabled * uCrtHalation;
          if (uPaletteStage >= 0.5) baseColor += crtGlow;
          float baseLuma = luma(baseColor);
          vec3 criticalColor = vec3(
            max(baseColor.r, baseLuma * 0.82),
            baseColor.g * 0.48,
            baseColor.b * 0.42
          );
          vec3 gradedColor = mix(baseColor, criticalColor, uCriticalRed);

          // Hazard surface grades (after critical health so poison/ice read over low HP red).
          vec3 heatColor = gradedColor * vec3(1.14, 0.9, 0.72) + vec3(0.05, 0.012, 0.0) * uHeatwave;
          gradedColor = mix(gradedColor, heatColor, clamp(uHeatwave * 0.62, 0.0, 1.0));
          vec3 toxinColor = vec3(
            gradedColor.r * 0.4,
            max(gradedColor.g, baseLuma * 0.88),
            gradedColor.b * 0.46
          );
          gradedColor = mix(gradedColor, toxinColor, clamp(uToxinGreen, 0.0, 1.0));
          vec3 iceColor = vec3(
            gradedColor.r * 0.52,
            gradedColor.g * 0.78,
            max(gradedColor.b, baseLuma * 0.92)
          );
          gradedColor = mix(gradedColor, iceColor, clamp(uIceBlue, 0.0, 1.0));
          float edge = smoothstep(0.42, 1.08, length(centered));
          gradedColor = mix(
            gradedColor,
            gradedColor * vec3(0.82, 0.8, 0.76) + vec3(0.08, 0.07, 0.05) * edge,
            clamp(uSpikeEdge * edge, 0.0, 1.0)
          );
          if (uPaletteStage < 0.5) {
            gradedColor = limitToPalette(clamp(gradedColor, 0.0, 1.0));
            gradedColor += crtGlow;
          }

          vec3 historyColor = texture2D(tHistory, clamp(uvG, 0.0, 1.0)).rgb;
          vec3 decayedHistory = historyColor * vec3(0.93, 0.95, 0.92);
          float historyDelta = max(luma(decayedHistory) - luma(gradedColor), 0.0);
          float persistence = smoothstep(0.012, 0.24, historyDelta) *
            uHistoryReady * uCrtEnabled * uCrtPersistence;
          gradedColor = mix(gradedColor, max(gradedColor, decayedHistory), persistence);
          // Soft temporal film grain: dual hash (less patterned than a single
          // sin seed), bipolar, and slightly luminance-weighted so deep shadows
          // stay cleaner and highlights don't get salt-and-pepper.
          float grainFrame = floor(uTime * 18.0);
          vec2 grainCoord = floor(gl_FragCoord.xy);
          float grainA = fract(sin(dot(grainCoord + grainFrame, vec2(12.9898, 78.233))) * 43758.5453);
          float grainB = fract(sin(dot(grainCoord * 1.37 + grainFrame * 0.71, vec2(39.346, 11.135))) * 23421.631);
          float grain = (grainA * 0.62 + grainB * 0.38) - 0.5;
          float grainResponse = mix(0.52, 1.0, smoothstep(0.03, 0.42, luma(gradedColor)));
          gradedColor += grain * uGrain * grainResponse;
          float scanPhase = cos(gl_FragCoord.y * 1.5707963) * 0.5 + 0.5;
          float scanBeam = mix(0.88, 1.035, scanPhase) *
            mix(0.97, 1.025, smoothstep(0.08, 0.78, luma(gradedColor)));
          gradedColor *= mix(1.0, scanBeam, uCrtEnabled * uCrtScanlines);
          gradedColor *= mix(
            vec3(1.0),
            crtPhosphorMask(gl_FragCoord.xy),
            uCrtEnabled * uCrtPhosphor
          );
          gradedColor *= mix(1.0, uCrtBrightness, uCrtEnabled);
          // Soft peripheral falloff: clear center, slight black only near frame edges.
          vec2 vignetteUv = vUv * 2.0 - 1.0;
          vignetteUv.x *= 0.82;
          float vignette = smoothstep(${POV_VIGNETTE_INNER_RADIUS.toFixed(2)}, 1.18, length(vignetteUv));
          gradedColor *= 1.0 - vignette * uVignette;
          if (uPaletteStage >= 0.5) {
            gradedColor = limitToPalette(clamp(gradedColor, 0.0, 1.0));
          }
          gl_FragColor = vec4(clamp(gradedColor, 0.0, 1.0), 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.copyMaterial = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.historyTargets[0].texture } },
      vertexShader: FULLSCREEN_VERTEX_SHADER,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform sampler2D tDiffuse;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tDiffuse, vUv);
        }
      `,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.fsScene.add(this.mesh);
    this.copyMesh = new THREE.Mesh(this.geometry, this.copyMaterial);
    this.copyMesh.frustumCulled = false;
    this.copyScene.add(this.copyMesh);
  }

  setEnabled(value: boolean): void {
    if (this.enabled !== value) this.resetCrtHistory();
    this.enabled = value;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setCrtEnabled(value: boolean): void {
    if (this.crtEnabled === value) return;
    this.crtEnabled = value;
    this.material.uniforms.uCrtEnabled.value = value ? 1 : 0;
    this.resetCrtHistory();
  }

  isCrtEnabled(): boolean {
    return this.crtEnabled;
  }

  setPaletteEffect(paletteId: PalettePostEffectId, ditherStrength: number): void {
    const profile = palettePostEffectProfile(paletteId);
    this.activePaletteProfile = profile;
    this.material.uniforms.uPaletteEnabled.value = profile ? 1 : 0;
    this.material.uniforms.uPaletteSize.value = profile?.colors.length ?? 0;
    this.material.uniforms.uPaletteDither.value = THREE.MathUtils.clamp(ditherStrength, 0, 1);
    this.paletteColors.forEach((color, index) => {
      const parsed = parsePaletteColor(profile?.colors[index]);
      color.copy(parsed);
      this.paletteOklabColors[index].copy(paletteColorToOklab(parsed));
    });
    this.syncPaletteTuningUniforms();
  }

  private syncPaletteTuningUniforms(): void {
    const profile = this.activePaletteProfile;
    if (!profile) return;
    const quantization = profile.quantization;
    const tuning = this.displayTuning;
    this.material.uniforms.uPaletteDitherAmplitude.value =
      quantization.ditherAmplitude * tuning.paletteDitherScale;
    this.material.uniforms.uPalettePatternScale.value = quantization.patternScale;
    this.material.uniforms.uPaletteShadowStart.value = THREE.MathUtils.clamp(
      quantization.shadowStart * tuning.paletteShadowGuard,
      0,
      0.9,
    );
    this.material.uniforms.uPaletteShadowEnd.value = THREE.MathUtils.clamp(
      quantization.shadowEnd * tuning.paletteShadowGuard,
      0.01,
      0.98,
    );
    this.material.uniforms.uPaletteFlatSuppression.value = THREE.MathUtils.clamp(
      quantization.flatSuppression * tuning.paletteFlatGuard,
      0,
      0.98,
    );
    this.material.uniforms.uPaletteDetailBoost.value =
      quantization.detailBoost * tuning.paletteDetailBoost;
    this.material.uniforms.uPaletteLightnessBias.value = THREE.MathUtils.clamp(
      quantization.lightnessBias + tuning.paletteLightnessBias,
      -0.15,
      0.15,
    );
    this.material.uniforms.uPaletteLightnessWeight.value = quantization.lightnessWeight;
    this.material.uniforms.uPaletteChromaWeight.value = quantization.chromaWeight;
  }

  setDisplayTuning(value: DisplayPostFxTuning): void {
    const tuning = normalizeDisplayPostFxTuning(value);
    this.displayTuning = tuning;
    this.material.uniforms.uCrtHalation.value = tuning.halation;
    this.material.uniforms.uCrtPersistence.value = tuning.persistence;
    this.material.uniforms.uCrtScanlines.value = tuning.scanlines;
    this.material.uniforms.uCrtPhosphor.value = tuning.phosphorMask;
    this.material.uniforms.uCrtBrightness.value = tuning.brightness;
    this.material.uniforms.uPaletteStage.value = tuning.paletteStage === "world" ? 0 : 1;
    this.syncPaletteTuningUniforms();
    this.resetCrtHistory();
  }

  getDisplayTuning(): DisplayPostFxTuning {
    return { ...this.displayTuning };
  }

  resetCrtHistory(): void {
    this.historyReady = false;
    this.material.uniforms.uHistoryReady.value = 0;
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    const w = Math.max(1, Math.round(width * pixelRatio));
    const h = Math.max(1, Math.round(height * pixelRatio));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.sceneTarget.setSize(w, h);
    const crtWidth = Math.max(1, Math.round(w * POV_CRT_RENDER_SCALE));
    const crtHeight = Math.max(1, Math.round(h * POV_CRT_RENDER_SCALE));
    this.historyTargets.forEach((target) => target.setSize(crtWidth, crtHeight));
    this.material.uniforms.uResolution.value.set(crtWidth, crtHeight);
    this.resetCrtHistory();
  }

  setParams(
    curvature: number,
    chromatic: number,
    criticalRed = 0,
    grain = 0.007,
    animateGrain = true,
  ): void {
    this.material.uniforms.uCurvature.value = curvature * this.displayTuning.curvatureScale;
    this.material.uniforms.uChromatic.value = chromatic;
    this.material.uniforms.uCriticalRed.value = THREE.MathUtils.clamp(criticalRed, 0, 1);
    // Cap stays tight: film grain should grade the image, not read as dirt.
    this.material.uniforms.uGrain.value = THREE.MathUtils.clamp(
      grain * this.displayTuning.grainScale,
      0,
      0.014,
    );
    this.animateGrain = animateGrain;
  }

  /** Hazard floor response: heat shimmer, poison grade, frost grade, spike edge. */
  setHazardFeel(heatwave: number, toxinGreen: number, iceBlue: number, spikeEdge = 0): void {
    this.material.uniforms.uHeatwave.value = THREE.MathUtils.clamp(heatwave, 0, 1);
    this.material.uniforms.uToxinGreen.value = THREE.MathUtils.clamp(toxinGreen, 0, 1);
    this.material.uniforms.uIceBlue.value = THREE.MathUtils.clamp(iceBlue, 0, 1);
    this.material.uniforms.uSpikeEdge.value = THREE.MathUtils.clamp(spikeEdge, 0, 1);
  }

  /** Biome lens response: quiet underwater UV warp (sunken). Independent of hazard heatwave. */
  setBiomeLensFeel(waterWarp: number): void {
    this.material.uniforms.uWaterWarp.value = THREE.MathUtils.clamp(waterWarp, 0, 1);
  }

  /**
   * Draw scene → RT → fullscreen warp. When disabled, falls back to a normal render.
   */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    const prevTarget = renderer.getRenderTarget();
    if (!this.enabled) {
      try {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
      } finally {
        renderer.setRenderTarget(prevTarget);
      }
      return;
    }

    const prevTone = renderer.toneMapping;
    const prevAutoClear = renderer.autoClear;
    try {
      if (this.animateGrain) this.material.uniforms.uTime.value = performance.now() * 0.001;

      renderer.setRenderTarget(this.sceneTarget);
      renderer.autoClear = true;
      renderer.clear();
      renderer.render(scene, camera);

      // Scene already tone-mapped into the RT; composite without a second grade.
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = true;

      if (this.crtEnabled) {
        const historyWriteIndex = 1 - this.historyReadIndex;
        const historyRead = this.historyTargets[this.historyReadIndex];
        const historyWrite = this.historyTargets[historyWriteIndex];
        this.material.uniforms.tHistory.value = historyRead.texture;
        this.material.uniforms.uHistoryReady.value = this.historyReady ? 1 : 0;

        renderer.setRenderTarget(historyWrite);
        renderer.clear();
        renderer.render(this.fsScene, this.fsCamera);

        this.copyMaterial.uniforms.tDiffuse.value = historyWrite.texture;
        renderer.setRenderTarget(null);
        renderer.render(this.copyScene, this.fsCamera);
        this.historyReadIndex = historyWriteIndex;
        this.historyReady = true;
      } else {
        renderer.setRenderTarget(null);
        renderer.render(this.fsScene, this.fsCamera);
      }
    } finally {
      renderer.toneMapping = prevTone;
      renderer.autoClear = prevAutoClear;
      renderer.setRenderTarget(prevTarget);
    }
  }

  dispose(): void {
    this.sceneTarget.dispose();
    this.historyTargets.forEach((target) => target.dispose());
    this.material.dispose();
    this.copyMaterial.dispose();
    this.geometry.dispose();
    this.fsScene.remove(this.mesh);
    this.copyScene.remove(this.copyMesh);
  }
}
