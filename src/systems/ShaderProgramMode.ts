/**
 * Material program mode registry for the expand phase of the WebGPU port.
 * Factories declare which modes they support; unsupported requests fail clearly
 * instead of returning a broken material.
 */

import { resetTslMaterialModulesForTests } from "./TslMaterialModules";

export type ShaderProgramMode = "glsl" | "tsl";

export interface VfxFactoryRegistration {
  readonly id: string;
  readonly supports: readonly ShaderProgramMode[];
}

export interface ShaderProgramModeRegistry {
  readonly mode: ShaderProgramMode;
  register(factory: VfxFactoryRegistration): void;
  supports(factoryId: string, mode?: ShaderProgramMode): boolean;
  require(factoryId: string, mode?: ShaderProgramMode): void;
  list(): readonly VfxFactoryRegistration[];
  countByMode(): Readonly<Record<ShaderProgramMode, number>>;
}

export class UnsupportedShaderProgramModeError extends Error {
  readonly factoryId: string;
  readonly mode: ShaderProgramMode;
  readonly supports: readonly ShaderProgramMode[];

  constructor(factoryId: string, mode: ShaderProgramMode, supports: readonly ShaderProgramMode[]) {
    super(
      `VFX factory "${factoryId}" does not support shader mode "${mode}" (supports: ${supports.join(", ") || "none"})`,
    );
    this.name = "UnsupportedShaderProgramModeError";
    this.factoryId = factoryId;
    this.mode = mode;
    this.supports = supports;
  }
}

export function createShaderProgramModeRegistry(
  mode: ShaderProgramMode = "glsl",
): ShaderProgramModeRegistry {
  const factories = new Map<string, VfxFactoryRegistration>();

  return {
    mode,
    register(factory) {
      factories.set(factory.id, {
        id: factory.id,
        supports: Object.freeze([...factory.supports]) as readonly ShaderProgramMode[],
      });
    },
    supports(factoryId, requested = mode) {
      const factory = factories.get(factoryId);
      return Boolean(factory?.supports.includes(requested));
    },
    require(factoryId, requested = mode) {
      const factory = factories.get(factoryId);
      if (!factory) {
        throw new UnsupportedShaderProgramModeError(factoryId, requested, []);
      }
      if (!factory.supports.includes(requested)) {
        throw new UnsupportedShaderProgramModeError(factoryId, requested, factory.supports);
      }
    },
    list() {
      return [...factories.values()];
    },
    countByMode() {
      const counts: Record<ShaderProgramMode, number> = { glsl: 0, tsl: 0 };
      for (const factory of factories.values()) {
        for (const supported of factory.supports) counts[supported] += 1;
      }
      return counts;
    },
  };
}

/** Session-wide registry. Mode is fixed at boot; do not mutate mid-run. */
let activeRegistry = createShaderProgramModeRegistry("glsl");

/** Optional post-swap hook so factories can re-bind after boot replaces the registry. */
const registryListeners = new Set<(registry: ShaderProgramModeRegistry) => void>();

export function getShaderProgramModeRegistry(): ShaderProgramModeRegistry {
  return activeRegistry;
}

export function onShaderProgramModeRegistryChange(
  listener: (registry: ShaderProgramModeRegistry) => void,
): () => void {
  registryListeners.add(listener);
  return () => {
    registryListeners.delete(listener);
  };
}

export function setShaderProgramModeRegistry(registry: ShaderProgramModeRegistry): void {
  activeRegistry = registry;
  for (const listener of registryListeners) listener(registry);
}

export function resetShaderProgramModeRegistryForTests(): void {
  setShaderProgramModeRegistry(createShaderProgramModeRegistry("glsl"));
  // Preloading the TSL siblings also flags them as loaded, so a later test that
  // asks a factory for `tsl` without preloading would otherwise build a node
  // material against a registry that never registered the builder. Resetting
  // the mode must reset that too; the builder map stays, so the next preload
  // in the same process is a no-op.
  resetTslMaterialModulesForTests();
}
