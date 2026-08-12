/**
 * TSL / WebGPU half of the annihilation burst particles (WGP-16).
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
  select,
  sin,
  smoothstep,
  uv,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { registerTslBuilder } from "../systems/TslMaterialModules";
import { ANNIHILATION_BURST_SHADER_FACTORY_ID } from "./AnnihilationPulseVfx";

export function createBurstMaterialTsl(attributes: {
  position: THREE.InstancedBufferAttribute;
  color: THREE.InstancedBufferAttribute;
  alpha: THREE.InstancedBufferAttribute;
  size: THREE.InstancedBufferAttribute;
  shape: THREE.InstancedBufferAttribute;
  spin: THREE.InstancedBufferAttribute;
}): PointsNodeMaterial {
  const aPosition = instancedBufferAttribute<"vec3">(attributes.position, "vec3");
  const aColor = instancedBufferAttribute<"vec3">(attributes.color, "vec3");
  const aAlpha = instancedBufferAttribute<"float">(attributes.alpha, "float");
  const aSize = instancedBufferAttribute<"float">(attributes.size, "float");
  const aShape = instancedBufferAttribute<"float">(attributes.shape, "float");
  const aSpin = instancedBufferAttribute<"float">(attributes.spin, "float");

  const material = new PointsNodeMaterial();
  material.name = "Biome annihilation enemy particle material (TSL sprites)";
  material.vertexColors = true;
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.NormalBlending;
  material.toneMapped = false;
  material.fog = false;
  material.sizeAttenuation = true;
  material.positionNode = aPosition;
  material.sizeNode = max(float(0.02), aSize.mul(1.2));

  const sample = Fn(() => {
    const local = uv().sub(vec2(0.5));
    const spinPulse = sin(aSpin).mul(0.08);
    const d = length(local);
    const splatter = smoothstep(
      float(0.38).add(spinPulse),
      0.06,
      length(vec2(local.x.mul(1.2), local.y.mul(0.9))),
    );
    const ember = max(
      float(1).sub(smoothstep(0.25, 0.48, abs(local.x).mul(1.1).add(abs(local.y).mul(1.45)))),
      smoothstep(0.2, 0.03, d),
    );
    const crystal = max(
      float(1).sub(smoothstep(0.28, 0.48, abs(local.x).mul(2.7).add(abs(local.y).mul(0.7)))),
      float(1).sub(smoothstep(0.02, 0.06, max(abs(local.x), abs(local.y)))),
    );
    const droplet = max(
      smoothstep(0.43, 0.08, length(vec2(local.x.mul(1.7), local.y.mul(0.8).add(0.09)))),
      smoothstep(0.2, 0.02, length(vec2(local.x.mul(2.6), local.y.add(0.3)))),
    );
    const bubble = max(
      float(1).sub(smoothstep(0.025, 0.075, abs(d.sub(0.31)))),
      smoothstep(0.11, 0.015, length(local.sub(vec2(-0.13, 0.13)))),
    );
    const spore = max(
      smoothstep(0.34, 0.08, d).mul(0.72),
      max(
        smoothstep(0.09, 0.02, length(local.sub(vec2(0.2, 0.08)))),
        smoothstep(0.075, 0.02, length(local.sub(vec2(-0.17, -0.14)))),
      ),
    );
    const shard = max(
      smoothstep(0.48, 0.08, length(vec2(local.x.mul(3.6), local.y.mul(0.74)))),
      float(1)
        .sub(smoothstep(0.02, 0.06, abs(local.x.add(local.y.mul(0.28)))))
        .mul(smoothstep(0.36, 0.08, d)),
    );
    const crumb = smoothstep(float(0.36).add(spinPulse), 0.08, d);
    const mask = select(
      aShape.lessThan(0.5),
      splatter,
      select(
        aShape.lessThan(1.5),
        ember,
        select(
          aShape.lessThan(2.5),
          crystal,
          select(
            aShape.lessThan(3.5),
            droplet,
            select(
              aShape.lessThan(4.5),
              bubble,
              select(aShape.lessThan(5.5), spore, select(aShape.lessThan(6.5), shard, crumb)),
            ),
          ),
        ),
      ),
    );
    const alpha = clamp(mask.mul(aAlpha), 0.0, 1.0);
    return vec4(vec3(aColor), alpha);
  })();
  material.colorNode = sample.rgb;
  material.opacityNode = sample.a;
  material.alphaTest = 0.015;
  material.userData.shaderProgramMode = "tsl";
  material.userData.annihilationBurstParticles = true;
  material.userData.particlePrimitive = "sprite";
  return material;
}

registerTslBuilder(ANNIHILATION_BURST_SHADER_FACTORY_ID, createBurstMaterialTsl);
