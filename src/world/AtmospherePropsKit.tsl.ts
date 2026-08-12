/**
 * TSL / WebGPU half of the cobweb silk material (WGP-16).
 * Loaded lazily by TslMaterialModules; the WebGL boot never imports it.
 */
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { Fn, abs, float, fract, length, max, smoothstep, uniform, uv, vec3, vec4 } from "three/tsl";
import { registerTslBuilder } from "../systems/TslMaterialModules";
import {
  applyCobwebMaterialMetadata,
  COBWEB_SILK_SHADER_FACTORY_ID,
  type CobwebVariant,
} from "./AtmospherePropsKit";

export function makeCobwebMaterialTsl(
  color = 0xb8b4a8,
  strength = 0.22,
  variant: CobwebVariant = 0,
): MeshBasicNodeMaterial {
  const uColor = uniform(new THREE.Color(color));
  const uStrength = uniform(strength);
  const uVariant = uniform(variant);

  const lineMask = Fn(([pointIn, slopeIn, widthIn]: [any, any, any]) => {
    const point = uv().toVar();
    point.assign(pointIn);
    const slope = float(slopeIn);
    const width = float(widthIn);
    const radial = max(length(point), float(0.001));
    const distanceToRay = abs(point.y.sub(point.x.mul(slope))).div(radial);
    return smoothstep(width, 0.0, distanceToRay).mul(smoothstep(1.05, 0.15, radial));
  });

  const sample = Fn(() => {
    const p = uv();
    const radial = length(p);
    const axisX = smoothstep(0.018, 0.0, abs(p.y)).mul(smoothstep(1.05, 0.15, radial));
    const axisY = smoothstep(0.018, 0.0, abs(p.x)).mul(smoothstep(1.05, 0.15, radial));
    const spokes = max(
      max(max(axisX, axisY), max(lineMask(p, 0.24, 0.018), lineMask(p, 0.5, 0.018))),
      max(lineMask(p, 1.0, 0.018), max(lineMask(p, 2.0, 0.018), lineMask(p, 4.16, 0.018))),
    );
    const arcs = smoothstep(0.012, 0.0, abs(fract(radial.div(0.14)).sub(0.5)).mul(0.14))
      .mul(smoothstep(0.05, 0.18, radial))
      .mul(smoothstep(1.02, 0.4, radial))
      .mul(float(0.55).add(spokes.mul(0.6)));
    const silk = max(spokes, arcs);
    const variantBoost = float(1).add(uVariant.mul(0.04));
    const alpha = silk.mul(uStrength).mul(variantBoost);
    return vec4(vec3(uColor as any), alpha);
  })();

  const material = new MeshBasicNodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.blending = THREE.NormalBlending;
  material.toneMapped = false;
  material.colorNode = sample.rgb;
  material.opacityNode = sample.a;
  material.alphaTest = 0.02;
  material.userData.cobwebSilkHandles = { uColor, uStrength, uVariant };
  return applyCobwebMaterialMetadata(material, "tsl", variant) as MeshBasicNodeMaterial;
}
registerTslBuilder(COBWEB_SILK_SHADER_FACTORY_ID, makeCobwebMaterialTsl);
