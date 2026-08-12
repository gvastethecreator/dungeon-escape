/**
 * TSL / WebGPU half of the luminous ward shield and particles (WGP-16).
 * Loaded lazily by TslMaterialModules; the WebGL boot never imports it.
 */
import * as THREE from "three";
import { MeshBasicNodeMaterial, PointsNodeMaterial } from "three/webgpu";
import {
  Fn,
  abs,
  cameraPosition,
  clamp,
  dot,
  float,
  instancedBufferAttribute,
  materialOpacity,
  max,
  mix,
  modelWorldMatrix,
  normalLocal,
  normalize,
  positionLocal,
  pow,
  sin,
  texture,
  uniform,
  vec4,
} from "three/tsl";
import { registerTslBuilder } from "../systems/TslMaterialModules";
import {
  LUMINOUS_WARD_MOTES_TSL_BUILDER_ID,
  LUMINOUS_WARD_SHIELD_SHADER_FACTORY_ID,
  LUMINOUS_WARD_TRAILS_SHADER_FACTORY_ID,
  WARD_COLOR,
  WARD_COLOR_CORE,
  type WardShieldMaterial,
  type WardShieldUniforms,
  type WardTrailMaterial,
  type WardTrailUniforms,
} from "./LuminousWardVfx";

export function createShieldMaterialTsl(): WardShieldMaterial {
  const uColor = uniform(new THREE.Color(WARD_COLOR));
  const uRimColor = uniform(new THREE.Color(WARD_COLOR_CORE));
  const uOpacity = uniform(0);
  const uPulse = uniform(1);
  const uTime = uniform(0);
  const nodeMaterial = new MeshBasicNodeMaterial();
  nodeMaterial.transparent = true;
  nodeMaterial.depthWrite = false;
  nodeMaterial.depthTest = true;
  nodeMaterial.side = THREE.DoubleSide;
  nodeMaterial.blending = THREE.AdditiveBlending;
  nodeMaterial.toneMapped = false;
  nodeMaterial.fog = false;
  const sample = Fn(() => {
    const worldPos = modelWorldMatrix.mul(vec4(positionLocal, 1.0)).xyz;
    const worldNormal = normalize(modelWorldMatrix.mul(vec4(normalLocal, 0.0)).xyz);
    const viewDir = normalize(cameraPosition.sub(worldPos));
    const ndotv = abs(dot(normalize(worldNormal), viewDir));
    const fresnel = pow(float(1).sub(ndotv), 2.35);
    const bands = float(0.55).add(sin(worldPos.y.mul(7.5).add(uTime.mul(1.8))).mul(0.45));
    const hex = float(0.72).add(
      sin(worldPos.x.add(worldPos.z).mul(4.2).sub(uTime.mul(1.1))).mul(0.28),
    );
    const shell = fresnel.mul(bands).mul(hex).mul(uPulse);
    const color = mix(uColor, uRimColor, clamp(fresnel.mul(1.15), 0.0, 1.0));
    return vec4(color as any, clamp(shell.mul(uOpacity), 0.0, 1.0));
  })();
  nodeMaterial.colorNode = sample.rgb as any;
  nodeMaterial.opacityNode = sample.a as any;
  nodeMaterial.alphaTest = 0.004;
  const material = nodeMaterial as WardShieldMaterial;
  material.uniforms = { uColor, uRimColor, uOpacity, uPulse, uTime } as WardShieldUniforms;
  material.userData.luminousWardShield = true;
  material.userData.shaderProgramMode = "tsl";
  return material;
}

export function createWardMoteSpriteMaterial(
  particleTexture: THREE.Texture,
  positionAttribute: THREE.InstancedBufferAttribute,
  sizeAttribute: THREE.InstancedBufferAttribute,
): PointsNodeMaterial {
  const aPosition = instancedBufferAttribute<"vec3">(positionAttribute, "vec3");
  const aSize = instancedBufferAttribute<"float">(sizeAttribute, "float");
  const uColor = uniform(new THREE.Color(WARD_COLOR_CORE));
  const material = new PointsNodeMaterial();
  const texel = texture(particleTexture);
  material.name = "Luminous ward floating mote material (TSL sprites)";
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;
  material.sizeAttenuation = true;
  material.toneMapped = false;
  material.alphaTest = 0.02;
  material.positionNode = aPosition as any;
  material.sizeNode = max(float(0.035), aSize.mul(1.1)) as any;
  material.colorNode = (uColor as any).mul(texel.rgb) as any;
  material.opacityNode = texel.a.mul(materialOpacity) as any;
  material.userData.luminousWardMotes = true;
  material.userData.shaderProgramMode = "tsl";
  material.userData.particlePrimitive = "sprite";
  return material;
}

export function createWardTrailMaterialTsl(
  particleTexture: THREE.Texture,
  positionAttribute: THREE.InstancedBufferAttribute,
  sizeAttribute: THREE.InstancedBufferAttribute,
  alphaAttribute: THREE.InstancedBufferAttribute,
): WardTrailMaterial {
  const uColor = uniform(new THREE.Color(WARD_COLOR));
  const uOpacity = uniform(0);
  const uPixelRatio = uniform(
    typeof window !== "undefined" ? Math.min(window.devicePixelRatio, 2) : 1,
  );
  const uBaseSize = uniform(110);
  const aPosition = instancedBufferAttribute<"vec3">(positionAttribute, "vec3");
  const aTrailSize = instancedBufferAttribute<"float">(sizeAttribute, "float");
  const aTrailAlpha = instancedBufferAttribute<"float">(alphaAttribute, "float");
  const nodeMaterial = new PointsNodeMaterial();
  const texel = texture(particleTexture);
  nodeMaterial.name = "Luminous ward motion trail material (TSL sprites)";
  nodeMaterial.transparent = true;
  nodeMaterial.depthWrite = false;
  nodeMaterial.depthTest = true;
  nodeMaterial.blending = THREE.AdditiveBlending;
  nodeMaterial.toneMapped = false;
  nodeMaterial.fog = false;
  nodeMaterial.sizeAttenuation = true;
  nodeMaterial.positionNode = aPosition as any;
  nodeMaterial.sizeNode = max(float(0.018), aTrailSize.mul(0.12).mul(uPixelRatio)) as any;
  nodeMaterial.colorNode = (uColor as any).mul(texel.rgb) as any;
  nodeMaterial.opacityNode = texel.a.mul(aTrailAlpha).mul(uOpacity) as any;
  nodeMaterial.alphaTest = 0.01;
  const material = nodeMaterial as WardTrailMaterial;
  material.uniforms = {
    map: { value: particleTexture },
    uColor,
    uOpacity,
    uPixelRatio,
    uBaseSize,
  } as WardTrailUniforms;
  material.userData.luminousWardTrails = true;
  material.userData.shaderProgramMode = "tsl";
  material.userData.particlePrimitive = "sprite";
  return material;
}

registerTslBuilder(LUMINOUS_WARD_SHIELD_SHADER_FACTORY_ID, createShieldMaterialTsl);
registerTslBuilder(LUMINOUS_WARD_MOTES_TSL_BUILDER_ID, createWardMoteSpriteMaterial);
registerTslBuilder(LUMINOUS_WARD_TRAILS_SHADER_FACTORY_ID, createWardTrailMaterialTsl);
