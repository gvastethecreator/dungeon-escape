/**
 * Lazy loader for the TSL half of the dual-mode materials.
 *
 * `three/webgpu` carries the whole node-material runtime (~1 MB unminified).
 * Play boots WebGL by default, so no module on that path may import it
 * statically: every TSL builder lives in a `*.tsl.ts` sibling that registers
 * itself here, and those siblings are pulled in only once the renderer resolves
 * to WebGPU.
 */

type AnyTslBuilder = (...args: never[]) => unknown;

const builders = new Map<string, AnyTslBuilder>();
let loaded = false;
let loading: Promise<void> | null = null;

/** Called at module scope by each `*.tsl.ts` sibling. */
export function registerTslBuilder(id: string, builder: AnyTslBuilder): void {
  builders.set(id, builder);
}

export function getTslBuilder<T extends AnyTslBuilder>(id: string): T | null {
  return (builders.get(id) as T | undefined) ?? null;
}

/**
 * @throws When the TSL siblings were never loaded, which means a factory was
 * asked for `tsl` on a boot that never resolved to WebGPU.
 */
export function requireTslBuilder<T extends AnyTslBuilder>(id: string): T {
  const builder = builders.get(id) as T | undefined;
  if (!builder) {
    throw new Error(
      `TSL builder "${id}" is not loaded. Await loadTslMaterialModules() before building materials in "tsl" mode.`,
    );
  }
  return builder;
}

export function areTslMaterialModulesLoaded(): boolean {
  return loaded;
}

/** Idempotent; concurrent callers share one import batch. */
export async function loadTslMaterialModules(): Promise<void> {
  if (loaded) return;
  if (loading) return loading;

  loading = (async () => {
    await Promise.all([
      import("./BiomeParticleMaterial.tsl"),
      import("./PovPostFxTsl"),
      import("./SoftGroundFogMaterial.tsl"),
      import("../world/AnnihilationPulseVfx.tsl"),
      import("../world/AtmospherePropsKit.tsl"),
      import("../world/BiomeDecorMaterial.tsl"),
      import("../world/EnemyBillboardMaterial.tsl"),
      import("../world/EnemyMotionTrailVfx.tsl"),
      import("../world/LiquidSectionKit.tsl"),
      import("../world/LuminousWardVfx.tsl"),
      import("../world/MagicPortalKit.tsl"),
      import("../world/PickupBurstPool.tsl"),
      import("../world/ProceduralFlameVfx.tsl"),
      import("../world/RoomSurfaceMaterials.tsl"),
      import("../world/TextureTreatment.tsl"),
      import("../world/UncannyWallRuntime.tsl"),
      import("../world/VolumetricBeam.tsl"),
    ]);
    loaded = true;
  })();

  try {
    await loading;
  } finally {
    loading = null;
  }
}

export function resetTslMaterialModulesForTests(): void {
  // Registered builders are the import side effect that Play boot relies on, so
  // they stay; only the "already loaded" latch resets, letting the next test
  // re-run the (no-op) import batch instead of inheriting a peer's modules.
  loaded = false;
  loading = null;
}
