/**
 * Single owner for Play / model-lab shader-mode boot.
 * WebGL never value-imports `three/webgpu`; TSL siblings load only in `tsl` mode.
 */
import {
  createShaderProgramModeRegistry,
  setShaderProgramModeRegistry,
  type ShaderProgramMode,
} from "./ShaderProgramMode";
import { loadTslMaterialModules } from "./TslMaterialModules";

/**
 * Dual-mode factory modules. Import is the registration seam: each module
 * registers on load and again if the session registry is replaced.
 */
export const PLAY_SHADER_FACTORY_LOADERS = [
  () => import("../world/TextureTreatment"),
  () => import("../world/ProceduralFlameVfx"),
  () => import("../world/VolumetricBeam"),
  () => import("../world/EnemyBillboardMaterial"),
  () => import("../world/EnemyMotionTrailVfx"),
  () => import("../world/LiquidSectionKit"),
  () => import("../world/AtmospherePropsKit"),
  () => import("../world/UncannyWallRuntime"),
  () => import("../world/AnnihilationPulseVfx"),
  () => import("../world/PickupBurstPool"),
  () => import("../systems/SoftGroundFogMaterial"),
  () => import("../systems/BiomeParticleMaterial"),
  () => import("../world/LuminousWardVfx"),
  () => import("../world/BiomeDecorMaterial"),
] as const;

export function shaderProgramModeForBackend(isWebGpuRenderer: boolean): ShaderProgramMode {
  return isWebGpuRenderer ? "tsl" : "glsl";
}

/**
 * Install the session registry, load TSL builders when needed, then import
 * factory modules in parallel. Callers must not re-register the same factories.
 */
export async function bootPlayShaderMode(mode: ShaderProgramMode): Promise<ShaderProgramMode> {
  setShaderProgramModeRegistry(createShaderProgramModeRegistry(mode));
  if (mode === "tsl") await loadTslMaterialModules();
  await Promise.all(PLAY_SHADER_FACTORY_LOADERS.map((load) => load()));
  return mode;
}
