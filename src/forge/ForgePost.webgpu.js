/**
 * WebGPU stage for the Forge presentation post pipeline (WGP-27).
 *
 * The WebGL path keeps the historical three-pass ShaderMaterial bloom. This
 * module is imported only when Forge boots on WebGPU, so the default editor
 * bundle never pulls in `three/webgpu`. The TSL graph fuses the bright pass,
 * a diagonal bloom blur and the tilt-shift/grade/gamma composite into one
 * RenderPipeline output pass.
 */
import { RenderPipeline } from "three/webgpu";
import {
  Fn,
  abs,
  dot,
  float,
  fract,
  length,
  max,
  min,
  mix,
  pass,
  pow,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import * as THREE from "three";

export function createForgePostStage(renderer, scene, camera) {
  const uTime = uniform(0);
  const uExposure = uniform(1.8);
  const uBloom = uniform(0.9);
  const uTilt = uniform(1.0);
  const uResolution = uniform(new THREE.Vector2(1, 1));

  const scenePass = pass(scene, camera);
  const sceneTex = scenePass.getTextureNode();

  // Bright pass — identical smoothstep luma gate to the GLSL thresh pass.
  const bright = Fn(() => {
    const c = sceneTex.rgb;
    const l = dot(c, vec3(0.299, 0.587, 0.114));
    return c.mul(smoothstep(float(0.58), float(0.95), l));
  })();

  // Bloom blur — one 4-tap diagonal kernel at quarter resolution, matching the
  // separable two-pass GLSL blur closely enough for the Forge showcase.
  const bloomBlur = Fn(([uvIn]) => {
    const px = vec2(1, 1).div(uResolution.mul(0.25));
    let c = bright.mul(0.227);
    c = c.add(bright.offset(uvIn.add(px.mul(1.384))).mul(0.316));
    c = c.add(bright.offset(uvIn.sub(px.mul(1.384))).mul(0.316));
    c = c.add(bright.offset(uvIn.add(px.mul(3.23))).mul(0.0703));
    return c;
  });

  const pipeline = new RenderPipeline(renderer);
  pipeline.outputNode = Fn(() => {
    const u = uv();
    let col = sceneTex.rgb;

    // Tilt-shift focus band.
    const band = smoothstep(float(0.15), float(0.52), abs(u.y.sub(0.5))).mul(uTilt);
    const r = band.mul(3.4);
    const px = vec2(1).div(uResolution);
    let b = col.mul(0.4);
    b = b.add(sceneTex.offset(u.add(vec2(r.mul(px.x), r.mul(px.y).mul(0.6)))).mul(0.15));
    b = b.add(sceneTex.offset(u.sub(vec2(r.mul(px.x), r.mul(px.y).mul(0.6)))).mul(0.15));
    b = b.add(sceneTex.offset(u.add(vec2(r.mul(px.x), r.mul(px.y).mul(0.6).negate()))).mul(0.15));
    b = b.add(sceneTex.offset(u.add(vec2(r.mul(px.x).negate(), r.mul(px.y).mul(0.6)))).mul(0.15));
    col = mix(col, b, min(float(1), band));

    col = col.add(bloomBlur(u).mul(uBloom));

    // Filmic exposure + cool/warm grade + saturation + contrast (GLSL final pass).
    col = vec3(1).sub(pow(float(Math.E), col.mul(uExposure).negate()));
    const lum = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(
      col,
      col.mul(vec3(0.9, 0.97, 1.12)),
      float(1)
        .sub(smoothstep(float(0), float(0.4), lum))
        .mul(0.38),
    );
    col = mix(
      col,
      col.mul(vec3(1.07, 1.01, 0.93)),
      smoothstep(float(0.45), float(1), lum).mul(0.28),
    );
    col = mix(vec3(lum), col, float(1.09));
    col = col.sub(0.5).mul(1.05).add(0.5);

    const vg = smoothstep(float(1.35), float(0.5), length(u.sub(vec2(0.5, 0.5)).mul(1.55)));
    col = col.mul(mix(float(0.78), float(1.02), vg));

    const gr = fract(
      sin(dot(u.mul(1024).add(uTime.mod(10).mul(37)), vec2(12.9898, 78.233))).mul(43758.5453),
    );
    col = col.add(gr.sub(0.5).mul(0.02));
    col = pow(max(col, vec3(0)), vec3(0.4545));
    return vec4(col, 1);
  })();

  return {
    render() {
      pipeline.render(scene, camera);
    },
    setSize(width, height) {
      uResolution.value.set(width, height);
    },
    setUniform(key, value) {
      if (key === "uTime") uTime.value = value;
      else if (key === "uExposure") uExposure.value = value;
      else if (key === "uBloom") uBloom.value = value;
      else if (key === "uTilt") uTilt.value = value;
    },
    dispose() {},
  };
}
