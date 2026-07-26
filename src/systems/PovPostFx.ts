import * as THREE from "three";

export const POV_VIGNETTE_STRENGTH = 0.1;
export const POV_VIGNETTE_INNER_RADIUS = 0.62;

/**
 * Full-screen post pass: mild outward (pincushion) lens warp + radial chromatic aberration.
 * Renders the main scene into a target, then composites to the canvas.
 */
export class PovPostFx {
  private readonly target: THREE.WebGLRenderTarget;
  private readonly fsScene = new THREE.Scene();
  private readonly fsCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly material: THREE.ShaderMaterial;
  private readonly mesh: THREE.Mesh;
  private width = 1;
  private height = 1;
  private enabled = true;
  private animateGrain = true;

  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.target.texture.generateMipmaps = false;
    this.target.texture.colorSpace = THREE.NoColorSpace;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: this.target.texture },
        uCurvature: { value: 0.032 },
        uChromatic: { value: 0 },
        uCriticalRed: { value: 0 },
        uGrain: { value: 0.011 },
        uVignette: { value: POV_VIGNETTE_STRENGTH },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision mediump float;
        uniform sampler2D tDiffuse;
        uniform float uCurvature;
        uniform float uChromatic;
        uniform float uCriticalRed;
        uniform float uGrain;
        uniform float uVignette;
        uniform float uTime;
        uniform vec2 uResolution;
        varying vec2 vUv;

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

        void main() {
          float k = uCurvature;
          float ca = uChromatic;

          vec2 uvG = pincushion(vUv, k);
          // Radial chromatic: R/B pull slightly along the same warp direction.
          vec2 centered = vUv * 2.0 - 1.0;
          float len = length(centered);
          vec2 radial = len > 1e-4 ? centered / len : vec2(0.0);
          vec2 uvR = pincushion(vUv + radial * ca, k);
          vec2 uvB = pincushion(vUv - radial * ca, k);

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
          float luma = dot(baseColor, vec3(0.299, 0.587, 0.114));
          vec3 criticalColor = vec3(
            max(baseColor.r, luma * 0.82),
            baseColor.g * 0.48,
            baseColor.b * 0.42
          );
          vec3 gradedColor = mix(baseColor, criticalColor, uCriticalRed);
          float grainSeed = dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233)) + floor(uTime * 24.0);
          float grain = fract(sin(grainSeed) * 43758.5453) - 0.5;
          gradedColor += grain * uGrain;
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

    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.fsScene.add(this.mesh);
  }

  setEnabled(value: boolean): void {
    this.enabled = value;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.target.setSize(w, h);
    this.material.uniforms.uResolution.value.set(w, h);
  }

  setParams(
    curvature: number,
    chromatic: number,
    criticalRed = 0,
    grain = 0.011,
    animateGrain = true,
  ): void {
    this.material.uniforms.uCurvature.value = curvature;
    this.material.uniforms.uChromatic.value = chromatic;
    this.material.uniforms.uCriticalRed.value = THREE.MathUtils.clamp(criticalRed, 0, 1);
    this.material.uniforms.uGrain.value = THREE.MathUtils.clamp(grain, 0, 0.018);
    this.animateGrain = animateGrain;
  }

  async compileAsync(renderer: THREE.WebGLRenderer): Promise<void> {
    await renderer.compileAsync(this.fsScene, this.fsCamera);
  }

  async compileSceneAsync(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
  ): Promise<void> {
    const previousTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    try {
      await renderer.compileAsync(scene, camera);
    } finally {
      renderer.setRenderTarget(previousTarget);
    }
  }

  /**
   * Draw scene → RT → fullscreen warp. When disabled, falls back to a normal render.
   */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    if (!this.enabled) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }

    const prevTarget = renderer.getRenderTarget();
    const prevTone = renderer.toneMapping;
    const prevAutoClear = renderer.autoClear;
    if (this.animateGrain) this.material.uniforms.uTime.value = performance.now() * 0.001;

    renderer.setRenderTarget(this.target);
    renderer.autoClear = true;
    renderer.clear();
    renderer.render(scene, camera);

    // Scene already tone-mapped into the RT; composite without a second grade.
    renderer.setRenderTarget(null);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.autoClear = true;
    renderer.render(this.fsScene, this.fsCamera);

    renderer.toneMapping = prevTone;
    renderer.autoClear = prevAutoClear;
    renderer.setRenderTarget(prevTarget);
  }

  dispose(): void {
    this.target.dispose();
    this.material.dispose();
    this.mesh.geometry.dispose();
    this.fsScene.remove(this.mesh);
  }
}
