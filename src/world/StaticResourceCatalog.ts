import * as THREE from "three";

interface GeometryEntry {
  geometry: THREE.BufferGeometry;
  resourceType: string;
}

/** Read-only diagnostics for one world-owned static resource cache. */
export interface StaticResourceCatalogSnapshot {
  /** Sorted stable keys only; no mutable Three resources escape through this API. */
  readonly keys: readonly string[];
  readonly live: number;
  readonly hits: number;
  readonly misses: number;
}

/**
 * Owns immutable Three geometry that is shared by successive static-world builds.
 * Mounted scene roots only borrow these resources; the catalog is their sole disposer.
 */
export class StaticResourceCatalog {
  private readonly geometries = new Map<string, GeometryEntry>();
  private readonly keysByGeometry = new Map<THREE.BufferGeometry, string>();
  private hits = 0;
  private misses = 0;
  private disposed = false;

  borrowGeometry<TGeometry extends THREE.BufferGeometry>(
    key: string,
    factory: () => TGeometry,
    resourceType = "buffer-geometry",
  ): TGeometry {
    if (this.disposed) throw new Error("StaticResourceCatalog has been disposed.");
    const stableKey = key.trim();
    if (!stableKey) throw new Error("StaticResourceCatalog geometry keys cannot be empty.");
    const stableType = resourceType.trim();
    if (!stableType) throw new Error("StaticResourceCatalog resource types cannot be empty.");

    const existing = this.geometries.get(stableKey);
    if (existing) {
      if (existing.resourceType !== stableType) {
        throw new Error(
          `StaticResourceCatalog key collision for "${stableKey}": expected ${existing.resourceType}, received ${stableType}.`,
        );
      }
      this.hits += 1;
      return existing.geometry as TGeometry;
    }

    this.misses += 1;
    const geometry = factory();
    if (!(geometry instanceof THREE.BufferGeometry)) {
      throw new Error(`StaticResourceCatalog factory for "${stableKey}" did not create geometry.`);
    }
    const duplicateKey = this.keysByGeometry.get(geometry);
    if (duplicateKey) {
      throw new Error(
        `StaticResourceCatalog geometry for "${stableKey}" is already owned as "${duplicateKey}".`,
      );
    }
    this.geometries.set(stableKey, { geometry, resourceType: stableType });
    this.keysByGeometry.set(geometry, stableKey);
    return geometry;
  }

  ownsGeometry(geometry: THREE.BufferGeometry): boolean {
    return !this.disposed && this.keysByGeometry.has(geometry);
  }

  /** Safe, immutable cache accounting for focused tests and offline profiling. */
  snapshot(): StaticResourceCatalogSnapshot {
    return Object.freeze({
      keys: Object.freeze([...this.geometries.keys()].sort()),
      live: this.geometries.size,
      hits: this.hits,
      misses: this.misses,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const { geometry } of this.geometries.values()) geometry.dispose();
    this.geometries.clear();
    this.keysByGeometry.clear();
  }
}
