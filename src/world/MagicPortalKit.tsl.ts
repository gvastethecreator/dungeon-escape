/**
 * TSL / WebGPU port of MagicPortalKit field and spiral portal shaders (WGP-15).
 */

import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  Fn,
  abs,
  atan,
  exp,
  float,
  length,
  min,
  mix,
  pow,
  select,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec4,
} from "three/tsl";

import type {
  MagicPortalShaderVariant,
  MagicPortalUniformHandles,
} from "./MagicPortalKitShared";
import type { BiomePortalProfile } from "./BiomePortalProfile";

/** Literal copy of MAGIC_PORTAL_APERTURE — avoids circular import with MagicPortalKit.ts. */
const PORTAL_APERTURE_HALF_WIDTH = 0.7;
const PORTAL_APERTURE_BASE_Y = 0.2;
const PORTAL_APERTURE_SHOULDER_Y = 2.52;
const PORTAL_APERTURE_APEX_Y = 3.22;

const PORTAL_HEIGHT = PORTAL_APERTURE_APEX_Y - PORTAL_APERTURE_BASE_Y;
const PORTAL_SHOULDER_UV = float(
  (PORTAL_APERTURE_SHOULDER_Y - PORTAL_APERTURE_BASE_Y) / PORTAL_HEIGHT,
);
const PORTAL_HEIGHT_TO_RADIUS = float(PORTAL_HEIGHT / PORTAL_APERTURE_HALF_WIDTH);

const apertureEdgeDistance = /*@__PURE__*/ Fn(([uvIn]: [any]) => {
  const portalUv = vec2(uvIn);
  const normalizedX = portalUv.x.sub(0.5).mul(2.0);
  const sideDistance = float(1).sub(abs(normalizedX));
  const bottomDistance = portalUv.y.mul(2.0);
  const archY = portalUv.y.sub(PORTAL_SHOULDER_UV).mul(PORTAL_HEIGHT_TO_RADIUS);
  const archDistance = float(1).sub(length(vec2(normalizedX, archY)));
  return select(
    portalUv.y.lessThanEqual(PORTAL_SHOULDER_UV),
    min(sideDistance, bottomDistance),
    archDistance,
  );
});

function makePortalUniforms(profile: Readonly<BiomePortalProfile>) {
  const uTime = uniform(0);
  const uDeepColor = uniform(new THREE.Color(profile.deepColor));
  const uMagicColor = uniform(new THREE.Color(profile.magicColor));
  const uBrightColor = uniform(new THREE.Color(profile.brightColor));
  const uPrimaryArms = uniform(profile.primaryArms);
  const uSecondaryArms = uniform(profile.secondaryArms);
  const uRadialFrequency = uniform(profile.radialFrequency);
  const uFlowSpeed = uniform(profile.flowSpeed);
  const uCounterSpeed = uniform(profile.counterSpeed);
  const uSpiralSharpness = uniform(profile.spiralSharpness);
  const handles: MagicPortalUniformHandles = {
    uTime,
    uDeepColor,
    uMagicColor,
    uBrightColor,
    uPrimaryArms,
    uSecondaryArms,
    uRadialFrequency,
    uFlowSpeed,
    uCounterSpeed,
    uSpiralSharpness,
  };
  return {
    handles,
    uTime,
    uDeepColor,
    uMagicColor,
    uBrightColor,
    uPrimaryArms,
    uSecondaryArms,
    uRadialFrequency,
    uFlowSpeed,
    uCounterSpeed,
    uSpiralSharpness,
  };
}

function finalizePortalMaterial(
  material: MeshBasicNodeMaterial,
  profile: Readonly<BiomePortalProfile>,
  variant: MagicPortalShaderVariant,
  handles: MagicPortalUniformHandles,
): MeshBasicNodeMaterial {
  material.name =
    variant === "field"
      ? `${profile.biomeId} portal vortex field material (TSL)`
      : `${profile.biomeId} portal spiral current material (TSL)`;
  material.transparent = true;
  material.side = THREE.DoubleSide;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;
  material.toneMapped = false;
  material.userData.magicPortalHandles = handles;
  material.userData.shaderProgramMode = "tsl";
  material.userData.magicPortalVariant = variant;
  return material;
}

export function createMagicPortalFieldMaterialTsl(
  profile: Readonly<BiomePortalProfile>,
): MeshBasicNodeMaterial {
  const uniforms = makePortalUniforms(profile);
  const {
    handles,
    uTime,
    uDeepColor,
    uMagicColor,
    uBrightColor,
    uPrimaryArms,
    uSecondaryArms,
    uRadialFrequency,
    uFlowSpeed,
    uCounterSpeed,
    uSpiralSharpness,
  } = uniforms;

  const material = new MeshBasicNodeMaterial();
  const sample = Fn(() => {
    const vUv = uv();
    const point = vec2(vUv.x.sub(0.5).mul(1.42), vUv.y.sub(0.46).mul(2.15));
    const radius = length(point);
    const angle = atan(point.y, point.x);
    const broadFlow = float(0.5).add(
      float(0.5).mul(
        sin(angle.mul(uPrimaryArms).sub(radius.mul(uRadialFrequency)).add(uTime.mul(uFlowSpeed))),
      ),
    );
    const counterFlow = float(0.5).add(
      float(0.5).mul(
        sin(
          angle
            .mul(uSecondaryArms)
            .add(radius.mul(uRadialFrequency).mul(0.72))
            .sub(uTime.mul(uCounterSpeed)),
        ),
      ),
    );
    const current = pow(broadFlow, uSpiralSharpness)
      .mul(0.72)
      .add(pow(counterFlow, uSpiralSharpness.add(1.35)).mul(0.28));
    const depthPulse = float(0.9).add(sin(uTime.mul(2.3).sub(radius.mul(5.0))).mul(0.1));
    const edgeGlow = float(1).sub(smoothstep(0.0, 0.16, apertureEdgeDistance(vUv)));
    const core = exp(radius.mul(-2.6));
    const color = mix(uDeepColor, uMagicColor, current.mul(0.82).add(core.mul(0.14)));
    const tinted = mix(color, uBrightColor, edgeGlow.mul(0.42));
    const alpha = float(0.5).add(current.mul(0.36)).add(edgeGlow.mul(0.12)).mul(depthPulse);
    return vec4(tinted, alpha);
  })();

  material.colorNode = sample.rgb;
  material.opacityNode = sample.a;
  return finalizePortalMaterial(material, profile, "field", handles);
}

export function createMagicPortalSpiralMaterialTsl(
  profile: Readonly<BiomePortalProfile>,
): MeshBasicNodeMaterial {
  const uniforms = makePortalUniforms(profile);
  const {
    handles,
    uTime,
    uMagicColor,
    uBrightColor,
    uPrimaryArms,
    uSecondaryArms,
    uRadialFrequency,
    uFlowSpeed,
    uCounterSpeed,
  } = uniforms;

  const material = new MeshBasicNodeMaterial();
  const sample = Fn(() => {
    const vUv = uv();
    const point = vec2(vUv.x.sub(0.5).mul(1.42), vUv.y.sub(0.46).mul(2.15));
    const radius = length(point);
    const angle = atan(point.y, point.x);
    const primaryWave = float(0.5).add(
      float(0.5).mul(
        sin(angle.mul(uPrimaryArms).sub(radius.mul(uRadialFrequency)).add(uTime.mul(uFlowSpeed))),
      ),
    );
    const secondaryWave = float(0.5).add(
      float(0.5).mul(
        sin(
          angle
            .mul(uSecondaryArms)
            .sub(radius.mul(uRadialFrequency).mul(1.52))
            .add(uTime.mul(uCounterSpeed)),
        ),
      ),
    );
    const primary = smoothstep(0.86, 0.99, primaryWave);
    const secondary = smoothstep(0.94, 0.995, secondaryWave).mul(0.38);
    const edgeEcho = float(1).sub(smoothstep(0.0, 0.055, apertureEdgeDistance(vUv)));
    const pulse = float(0.84).add(sin(uTime.mul(2.8).sub(radius.mul(4.0))).mul(0.16));
    const alpha = min(float(1), primary.add(secondary).add(edgeEcho.mul(0.24))).mul(pulse).mul(0.82);
    const color = mix(uMagicColor, uBrightColor, primary);
    return vec4(color, alpha);
  })();

  material.colorNode = sample.rgb;
  material.opacityNode = sample.a;
  return finalizePortalMaterial(material, profile, "spiral", handles);
}

export function createMagicPortalShaderMaterialTsl(
  profile: Readonly<BiomePortalProfile>,
  variant: MagicPortalShaderVariant,
): MeshBasicNodeMaterial {
  if (variant === "spiral") {
    return createMagicPortalSpiralMaterialTsl(profile);
  }
  return createMagicPortalFieldMaterialTsl(profile);
}
