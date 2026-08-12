/**
 * TSL / WebGPU half of the uncanny wall atlas (WGP-16).
 * Loaded lazily by TslMaterialModules; the WebGL boot never imports it.
 */
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  attribute,
  dot,
  float,
  mix,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { registerTslBuilder } from "../systems/TslMaterialModules";
import {
  tagMaterial,
  UNCANNY_WALL_SHADER_FACTORY_ID,
  type UncannyWallVisualProfile,
} from "./UncannyWallRuntime";

export function createUncannyWallMaterialTsl(
  map: THREE.Texture,
  visualProfile: UncannyWallVisualProfile,
): MeshBasicNodeMaterial {
  const material = new MeshBasicNodeMaterial();
  material.name = "Uncanny wall atlas material (TSL)";
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.fog = true;
  material.toneMapped = true;
  material.side = THREE.FrontSide;
  material.polygonOffset = true;
  material.polygonOffsetFactor = -2;
  material.polygonOffsetUnits = -2;

  const uncannySurfaceShadow = uniform(new THREE.Color(visualProfile.shadow));
  const uncannySurfaceTint = uniform(new THREE.Color(visualProfile.propTint));
  const uncannySurfaceHighlight = uniform(new THREE.Color(visualProfile.highlight));
  const uncannyRow = attribute<"float">("uncannyRow", "float");
  const uncannyFrameA = attribute<"float">("uncannyFrameA", "float");
  const uncannyFrameB = attribute<"float">("uncannyFrameB", "float");
  const uncannyBlend = attribute<"float">("uncannyBlend", "float");
  const uncannyVisibility = attribute<"float">("uncannyVisibility", "float");

  const atlasUv = Fn(([frameIn]: [any]) => {
    const frame = float(frameIn);
    const sourceUv = uv();
    return vec2(
      frame.add(sourceUv.x).mul(0.25),
      float(3).sub(uncannyRow).add(sourceUv.y).mul(0.25),
    );
  });

  const sample = Fn(() => {
    const first = texture(map, atlasUv(uncannyFrameA));
    const second = texture(map, atlasUv(uncannyFrameB));
    const temporalBlend = smoothstep(0.0, 1.0, uncannyBlend);
    const color = mix(first, second, temporalBlend).toVar();
    const uncannyLuma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
    const uncannyCompressedValue = mix(
      float(0.28),
      float(0.74),
      smoothstep(0.04, 0.96, uncannyLuma),
    );
    const uncannySurfaceTone = mix(
      uncannySurfaceShadow,
      uncannySurfaceHighlight,
      uncannyCompressedValue,
    );
    const uncannyAuthoredHue = mix(vec3(uncannyLuma), color.rgb, 0.32);
    const rgb = mix(uncannySurfaceTone, uncannyAuthoredHue, 0.34).toVar();
    rgb.assign(
      mix(rgb, uncannySurfaceTint.mul(mix(float(0.72), float(1.04), uncannyCompressedValue)), 0.22),
    );
    const alpha = color.a.mul(uncannyVisibility);
    return vec4(rgb, alpha);
  })();

  material.colorNode = sample.rgb;
  material.opacityNode = sample.a;
  material.alphaTest = 0.08;
  material.userData.uncannyWallHandles = {
    uncannySurfaceShadow,
    uncannySurfaceTint,
    uncannySurfaceHighlight,
  };
  return tagMaterial(material, visualProfile, "tsl") as MeshBasicNodeMaterial;
}

registerTslBuilder(UNCANNY_WALL_SHADER_FACTORY_ID, createUncannyWallMaterialTsl);
