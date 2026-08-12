import * as THREE from "three";

import { tintVolumetricBeamColor } from "./VolumetricBeam";

/**
 * Owned mood-time color contract for authored practical-light VFX.
 * Callers in scene assembly must not touch `material.uniforms` directly.
 */
export function tintAuthoredLightVfxColor(
  material: THREE.Material,
  color: THREE.Color,
  strength: number,
): boolean {
  if (tintVolumetricBeamColor(material, color, strength)) return true;
  if (!(material instanceof THREE.ShaderMaterial)) return false;
  const uniform = material.uniforms.uColor;
  if (!(uniform?.value instanceof THREE.Color)) return false;
  uniform.value.lerp(color, THREE.MathUtils.clamp(strength, 0, 1));
  return true;
}
