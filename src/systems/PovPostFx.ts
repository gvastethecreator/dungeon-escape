import * as THREE from "three";

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
  private width = 1;
  private height = 1;
  private enabled = true;
  private crtEnabled = true;
  private historyReadIndex = 0;
  private historyReady = false;
  private animateGrain = true;

  constructor() {
    this.sceneTarget = createPostTarget(true);

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.sceneTarget.texture },
        tHistory: { value: this.historyTargets[0].texture },
        uHistoryReady: { value: 0 },
        uCrtEnabled: { value: 1 },
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
        uniform float uTime;
        uniform vec2 uResolution;
        varying vec2 vUv;

        float luma(vec3 color) {
          return dot(color, vec3(0.299, 0.587, 0.114));
        }

        float random(vec2 seed) {
          return fract(sin(dot(seed, vec2(12.9898, 78.233))) * 43758.5453);
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
          baseColor += crtHalation(uvG, fallback) * uCrtEnabled * ${POV_CRT_HALATION_STRENGTH.toFixed(2)};
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

          vec3 historyColor = texture2D(tHistory, clamp(uvG, 0.0, 1.0)).rgb;
          vec3 decayedHistory = historyColor * vec3(0.93, 0.95, 0.92);
          float historyDelta = max(luma(decayedHistory) - luma(gradedColor), 0.0);
          float persistence = smoothstep(0.012, 0.24, historyDelta) *
            uHistoryReady * uCrtEnabled * ${POV_CRT_HISTORY_WEIGHT.toFixed(2)};
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
          float scanBeam = mix(0.94, 1.015, smoothstep(0.12, 0.82, luma(gradedColor)));
          gradedColor *= mix(1.0, mix(scanBeam, 1.0, scanPhase), uCrtEnabled * 0.28);
          // Soft peripheral falloff: clear center, slight black only near frame edges.
          vec2 vignetteUv = vUv * 2.0 - 1.0;
          vignetteUv.x *= 0.82;
          float vignette = smoothstep(${POV_VIGNETTE_INNER_RADIUS.toFixed(2)}, 1.18, length(vignetteUv));
          gradedColor *= 1.0 - vignette * uVignette;
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
    this.material.uniforms.uCurvature.value = curvature;
    this.material.uniforms.uChromatic.value = chromatic;
    this.material.uniforms.uCriticalRed.value = THREE.MathUtils.clamp(criticalRed, 0, 1);
    // Cap stays tight: film grain should grade the image, not read as dirt.
    this.material.uniforms.uGrain.value = THREE.MathUtils.clamp(grain, 0, 0.014);
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
