/**
 * TSL / WebGPU half of the connected liquid surfaces (WGP-17).
 * Loaded lazily by TslMaterialModules; the WebGL boot never imports it.
 */
import type * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  Fn,
  float,
  materialColor,
  positionGeometry,
  sin,
  texture,
  uniform,
  uv,
  vec3,
} from "three/tsl";
import { registerTslBuilder } from "../systems/TslMaterialModules";
import { LIQUID_SHADER_FACTORY_ID, type LiquidKind } from "./LiquidSectionKit";

const liquidTimeUniformType = uniform(0);

function applyLiquidMaterialTsl(
  material: MeshStandardNodeMaterial,
  kind: LiquidKind,
  liquidTimeUniform: typeof liquidTimeUniformType,
  map: THREE.Texture,
): void {
  const lake = kind === "lake";
  const waveAmplitude = float(lake ? 0.006 : 0.01);
  const rippleStrength = float(lake ? 0.035 : 0.075);

  material.positionNode = Fn(() => {
    const wave = sin(positionGeometry.x.mul(1.65).add(liquidTimeUniform.mul(1.15))).add(
      sin(positionGeometry.z.mul(2.2).sub(liquidTimeUniform.mul(0.82))),
    );
    return positionGeometry.add(vec3(0, wave.mul(waveAmplitude), 0));
  })();

  const liquidUv = uv();
  const ripple = sin(liquidUv.x.mul(7.4).add(liquidTimeUniform.mul(0.95))).mul(
    sin(liquidUv.y.mul(9.1).sub(liquidTimeUniform.mul(0.72))),
  );
  material.colorNode = texture(map, liquidUv)
    .rgb.mul(materialColor)
    .mul(float(0.91).add(ripple.mul(rippleStrength)));
  material.customProgramCacheKey = () => `connected-liquid-wave-${kind}-tsl-v1`;
}

export function createLiquidMaterialTsl(
  params: THREE.MeshStandardMaterialParameters,
  kind: LiquidKind,
  liquidTime: { value: number },
  map: THREE.Texture,
): THREE.MeshStandardMaterial {
  const material = new MeshStandardNodeMaterial(params);
  const uLiquidTime = uniform(0);
  material.userData.liquidTime = liquidTime;
  material.userData.liquidTimeUniform = uLiquidTime;
  material.userData.liquidShaderMode = "tsl";
  applyLiquidMaterialTsl(material, kind, uLiquidTime, map);
  return material as unknown as THREE.MeshStandardMaterial;
}

registerTslBuilder(LIQUID_SHADER_FACTORY_ID, createLiquidMaterialTsl);
