import type * as THREE from "three";

import { applyTextureSmoothingToTexture, textureHasRenderableImage } from "./TextureSmoothing";

interface LoadEventTarget {
  addEventListener(type: "load", listener: () => void, options?: AddEventListenerOptions): void;
  removeEventListener(type: "load", listener: () => void): void;
}

interface RegistryEntry {
  readonly texture: WeakRef<THREE.Texture>;
  group: RegistryGroup;
  pending: boolean;
}

interface RegistryGroup {
  readonly members: Set<WeakRef<THREE.Texture>>;
  readonly loadListeners: Map<LoadEventTarget, () => void>;
}

export interface SceneTextureRegistryDiagnostics {
  readonly smoothingEnabled: boolean;
  readonly registered: number;
  readonly pending: number;
}

/** Structural injection seam used by texture-owning libraries. */
export interface SceneTextureSink {
  register<T extends THREE.Texture>(texture: T): T;
  markRenderable(texture: THREE.Texture): boolean;
  unregister(texture: THREE.Texture): boolean;
}

function loadTargetFor(texture: THREE.Texture): LoadEventTarget | null {
  const image = texture.image as Partial<LoadEventTarget> | undefined;
  if (
    !image ||
    typeof image.addEventListener !== "function" ||
    typeof image.removeEventListener !== "function"
  ) {
    return null;
  }
  return image as LoadEventTarget;
}

/**
 * Non-owning texture index for applying sampling policy without scene traversals.
 * The registry never disposes a texture. Callers retain texture ownership.
 */
export class SceneTextureRegistry implements SceneTextureSink {
  private readonly references = new Set<WeakRef<THREE.Texture>>();
  private readonly entries = new WeakMap<THREE.Texture, RegistryEntry>();
  private readonly finalized = new FinalizationRegistry<WeakRef<THREE.Texture>>((reference) => {
    this.references.delete(reference);
  });
  private smoothingEnabled: boolean;

  constructor(smoothingEnabled = false) {
    this.smoothingEnabled = smoothingEnabled;
  }

  register<T extends THREE.Texture>(texture: T): T {
    const current = this.entries.get(texture);
    if (current) {
      this.refreshGroup(current.group);
      return texture;
    }
    const entry: RegistryEntry = {
      texture: new WeakRef(texture),
      group: { members: new Set(), loadListeners: new Map() },
      pending: false,
    };
    entry.group.members.add(entry.texture);
    this.entries.set(texture, entry);
    this.references.add(entry.texture);
    this.finalized.register(texture, entry.texture, entry);
    this.refreshGroup(entry.group);
    return texture;
  }

  /** Link a caller-owned clone to the readiness lifecycle of its source. */
  registerClone<T extends THREE.Texture>(source: THREE.Texture, clone: T): T {
    this.register(source);
    this.register(clone);
    const sourceEntry = this.entries.get(source)!;
    const cloneEntry = this.entries.get(clone)!;
    if (sourceEntry.group !== cloneEntry.group) {
      this.mergeGroups(sourceEntry.group, cloneEntry.group);
    }
    this.refreshGroup(sourceEntry.group);
    return clone;
  }

  /** Called by loader callbacks after image/source decode completes. */
  markRenderable(texture: THREE.Texture): boolean {
    const entry = this.entries.get(texture);
    if (!entry) return false;
    return this.refreshGroup(entry.group) > 0;
  }

  setSmoothing(enabled: boolean): number {
    this.smoothingEnabled = enabled;
    let changed = 0;
    const visited = new Set<RegistryGroup>();
    this.forEachLive((_texture, entry) => {
      if (visited.has(entry.group)) return;
      visited.add(entry.group);
      changed += this.refreshGroup(entry.group);
    });
    return changed;
  }

  unregister(texture: THREE.Texture): boolean {
    const entry = this.entries.get(texture);
    if (!entry) return false;
    const group = entry.group;
    group.members.delete(entry.texture);
    this.entries.delete(texture);
    this.references.delete(entry.texture);
    this.finalized.unregister(entry);
    this.refreshGroup(group);
    return true;
  }

  clear(): void {
    const groups = new Set<RegistryGroup>();
    this.forEachLive((texture, entry) => {
      groups.add(entry.group);
      this.entries.delete(texture);
      this.finalized.unregister(entry);
    });
    for (const group of groups) {
      this.detachGroupListeners(group);
      group.members.clear();
    }
    this.references.clear();
  }

  has(texture: THREE.Texture): boolean {
    return this.entries.has(texture);
  }

  diagnostics(): SceneTextureRegistryDiagnostics {
    let registered = 0;
    let pending = 0;
    this.forEachLive((_texture, entry) => {
      registered += 1;
      if (entry.pending) pending += 1;
    });
    return { smoothingEnabled: this.smoothingEnabled, registered, pending };
  }

  private refresh(texture: THREE.Texture, entry: RegistryEntry): boolean {
    if (textureHasRenderableImage(texture)) {
      entry.pending = false;
      return applyTextureSmoothingToTexture(texture, this.smoothingEnabled);
    }
    entry.pending = true;
    return false;
  }

  private refreshGroup(group: RegistryGroup): number {
    let changed = 0;
    const loadTargets = new Set<LoadEventTarget>();
    for (const reference of group.members) {
      const texture = reference.deref();
      if (!texture) {
        group.members.delete(reference);
        continue;
      }
      const entry = this.entries.get(texture);
      if (!entry || entry.group !== group) {
        group.members.delete(reference);
        continue;
      }
      if (this.refresh(texture, entry)) changed += 1;
      if (entry.pending) {
        const loadTarget = loadTargetFor(texture);
        if (loadTarget) loadTargets.add(loadTarget);
      }
    }
    this.reconcileGroupListeners(group, loadTargets);
    return changed;
  }

  private mergeGroups(target: RegistryGroup, source: RegistryGroup): void {
    this.detachGroupListeners(source);
    for (const reference of source.members) {
      const texture = reference.deref();
      if (!texture) continue;
      const entry = this.entries.get(texture);
      if (!entry || entry.group !== source) continue;
      entry.group = target;
      target.members.add(reference);
    }
    source.members.clear();
  }

  private reconcileGroupListeners(
    group: RegistryGroup,
    loadTargets: ReadonlySet<LoadEventTarget>,
  ): void {
    for (const [target, listener] of group.loadListeners) {
      if (loadTargets.has(target)) continue;
      target.removeEventListener("load", listener);
      group.loadListeners.delete(target);
    }
    for (const target of loadTargets) {
      if (group.loadListeners.has(target)) continue;
      const registry = new WeakRef(this);
      const groupReference = new WeakRef(group);
      const listener = (): void => {
        const liveRegistry = registry.deref();
        const liveGroup = groupReference.deref();
        if (liveRegistry && liveGroup) liveRegistry.refreshGroup(liveGroup);
      };
      group.loadListeners.set(target, listener);
      target.addEventListener("load", listener);
    }
  }

  private detachGroupListeners(group: RegistryGroup): void {
    for (const [target, listener] of group.loadListeners) {
      target.removeEventListener("load", listener);
    }
    group.loadListeners.clear();
  }

  private forEachLive(visitor: (texture: THREE.Texture, entry: RegistryEntry) => void): void {
    for (const reference of this.references) {
      const texture = reference.deref();
      if (!texture) {
        this.references.delete(reference);
        continue;
      }
      const entry = this.entries.get(texture);
      if (entry) visitor(texture, entry);
    }
  }
}
