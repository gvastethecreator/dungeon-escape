/**
 * TSL / WebGPU half of the pickup spark burst (WGP-16).
 * Loaded lazily by TslMaterialModules; the WebGL boot never imports it.
 */
import * as THREE from "three";
import { PointsNodeMaterial } from "three/webgpu";
import {
  Fn,
  abs,
  clamp,
  float,
  instancedBufferAttribute,
  length,
  max,
  mix,
  select,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { registerTslBuilder } from "../systems/TslMaterialModules";
import {
  BURST_COLORS,
  BURST_PROFILES,
  PICKUP_BURST_SPARKS_SHADER_FACTORY_ID,
  SPARK_SHAPE_ID,
  type PickupSparkMaterial,
  type PickupSparkUniforms,
} from "./PickupBurstPool";

export function createSparkMaterialTsl(
  positionAttribute: THREE.InstancedBufferAttribute,
  seedAttribute: THREE.InstancedBufferAttribute,
): PickupSparkMaterial {
  const uColor = uniform(new THREE.Color(BURST_COLORS.stone));
  const uCoreColor = uniform(new THREE.Color(0xffffff));
  const uOpacity = uniform(0);
  const uPointSize = uniform(BURST_PROFILES.stone.pointSize);
  const uShape = uniform(SPARK_SHAPE_ID.diamond);
  const uTime = uniform(0);
  const uIntensity = uniform(1.18);
  const aPosition = instancedBufferAttribute<"vec3">(positionAttribute, "vec3");
  const aSeed = instancedBufferAttribute<"float">(seedAttribute, "float");

  const material = new PointsNodeMaterial();
  material.name = "Pickup spark burst material (TSL sprites)";
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.blending = THREE.AdditiveBlending;
  material.toneMapped = true;
  material.fog = true;
  material.sizeAttenuation = true;
  material.positionNode = aPosition as any;
  material.sizeNode = max(
    float(0.018),
    (uPointSize as any)
      .mul(float(0.58).add((aSeed as any).mul(0.22)))
      .mul(float(1.0).sub((uOpacity as any).mul(0.04))),
  );

  const sample = Fn(() => {
    const local = uv().sub(vec2(0.5));
    const angle = aSeed.mul(6.2831853);
    const pulse = float(0.84).add(
      sin(uTime.mul(float(1.2).add(aSeed.mul(0.8))).add(angle)).mul(0.16),
    );
    const d = length(local);
    const diamond = float(1).sub(smoothstep(0.24, 0.48, abs(local.x).add(abs(local.y))));
    const orb = max(
      smoothstep(0.38, 0.06, d),
      float(1).sub(smoothstep(0.035, 0.085, abs(d.sub(0.31)))),
    );
    const splinter = smoothstep(0.48, 0.08, length(vec2(local.x.mul(3.8), local.y.mul(0.78))));
    const rune = max(
      float(1).sub(smoothstep(0.025, 0.065, abs(max(abs(local.x), abs(local.y)).sub(0.29)))),
      float(1).sub(smoothstep(0.025, 0.065, abs(local.x.add(local.y.mul(0.42))))),
    );
    const flame = smoothstep(
      0.42,
      0.08,
      length(
        vec2(local.x.mul(float(1.55).add(max(local.y, float(0)))), local.y.mul(0.86).add(0.08)),
      ),
    );
    const voidRing = max(
      float(1).sub(smoothstep(0.035, 0.085, abs(d.sub(0.31)))),
      smoothstep(0.14, 0.05, d).mul(0.42),
    );
    const shaped = select(
      uShape.lessThan(0.5),
      diamond,
      select(
        uShape.lessThan(3.5),
        orb,
        select(
          uShape.lessThan(5.5),
          splinter,
          select(uShape.lessThan(7.5), rune, select(uShape.lessThan(9.5), flame, voidRing)),
        ),
      ),
    );
    const edge = smoothstep(0.0, 0.16, shaped);
    const core = float(1)
      .sub(smoothstep(0.2, 0.02, d))
      .mul(edge);
    const halo = float(1)
      .sub(smoothstep(0.5, 0.12, d))
      .mul(edge);
    const color = mix(uColor, uCoreColor, core.mul(0.82))
      .add(uCoreColor.mul(halo).mul(float(0.08).add(pulse.mul(0.12))))
      .mul(uIntensity);
    const alpha = edge.mul(uOpacity).mul(float(0.84).add(pulse.mul(0.16)));
    return vec4(vec3(color), clamp(alpha, 0.0, 1.0));
  })();
  material.colorNode = sample.rgb;
  material.opacityNode = sample.a;
  material.alphaTest = 0.015;
  const typed = material as unknown as PickupSparkMaterial;
  typed.uniforms = {
    uColor,
    uCoreColor,
    uOpacity,
    uPointSize,
    uShape,
    uTime,
    uIntensity,
  } as PickupSparkUniforms;
  typed.userData.shaderProgramMode = "tsl";
  typed.userData.pickupBurstSparks = true;
  typed.userData.sparkPrimitive = "sprite";
  return typed;
}

registerTslBuilder(PICKUP_BURST_SPARKS_SHADER_FACTORY_ID, createSparkMaterialTsl);
