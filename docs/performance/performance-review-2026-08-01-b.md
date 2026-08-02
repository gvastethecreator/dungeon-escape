# Revisión de rendimiento B — Dungeon Escape

- **Repositorio:** `X:\dungeon-escape`
- **Fecha:** 2026-08-01
- **Modo:** ejecución aprobada (plan detallado anti-error)
- **Estado:** lote implementado con experimentes revertidos
- **Idioma:** español
- **Baseline Git:** `198de82`

## Resumen ejecutivo

El segundo lote añade caches de plantillas y materiales, batch de marcos de puerta, early-out de VFX idle, presupuesto de sprites de bioma, warmup en dos frames y menos allocations en tiles de arquitectura.

Las ganancias medidas en el workload Frost/critical son **modestas y honestas**:

| Métrica | Baseline mediana | Final mediana | Delta |
|---|---:|---:|---:|
| Carga del mapa | 436 ms | 438 ms | ~0 (ruido) |
| Build de mundo | 417 ms | 420 ms | ~0 (ruido) |
| Draw calls | 285 | 275 | **-10 (-3,5%)** |
| Materiales | 336 | 333 | **-3 (-0,9%)** |
| Geometrías | 403 | 389 | **-14 (-3,5%)** |
| Programas | 62 | 61 | **-1** |
| Long task arranque | 861 ms | 832 ms | **-29 ms (-3,4%)** |
| Frame p95 | 10,1 ms | 10,1 ms | 0 |

Un experimento de **bake global de props clásicos por material (PERF-14)** subió `mapLoadWorldMs` de ~417 a ~503 ms. Se **revirtió**. Queda documentado como experimento negativo.

## Invariante de calidad

- Misma semilla, topología, luces y reglas de juego.
- Sin bajar DPR, texturas, partículas, audio o IBL.
- Capturas spawn Frost/critical revisadas; 0 errores browser/red en las muestras finales válidas.
- Suite: **904 pass, 2 fail** (los mismos dos fallos baseline: manifest WebP y golden StaticDungeonScene).

## Entorno y método

- Windows NT 10.0.26200; Ryzen 9 3900XT; RTX 3090; 95,9 GiB RAM.
- Bun 1.3.14; Chrome 150; Three.js r185.
- Workload: `PERF_SECONDS=8 BIOME=frost MOOD=frost QA_STATE=critical CRT=off` seed `vfx-audit-2026-08-01`.
- Tres muestras finales en `final/post-revert-{1,2,3}/`.

## Tickets

### PERF-16 — Cache de geometría de plantillas — cerrado

- `createStaticPropTemplateBatches(template, { cacheKey })` clona desde cache.
- Claves: `classic:*`, `forge:*`, `atmosphere:*`.
- Tests: `static-prop-batching.test.ts` (cache hit + clones independientes).

### PERF-13 — Variantes de material compartidas — cerrado

- `getDungeonMaterialVariant` en `MaterialLibrary.ts`.
- Bookshelf, urn, coffin y cage/pedestal de piedras usan cache.
- Materials 336 → 333 en el workload.

### PERF-14 — Classic bake por material — **revertido**

- Bake global midió **peor carga** (+~20% world ms).
- Código restaurado a InstancedMesh por `family:variant`.
- Material sharing de PERF-13 se conserva.

### PERF-11 — Marcos de puerta en batch — cerrado (parcial en inventario)

- `batchDoorFramesForRuntime`: frames globales; hojas en bisagras locales.
- Test: leaves intactas + batch count > 0.
- Bucket `doors-arches` sigue alto (~33) por **hojas y arcos**; no se reclama drop de bucket.

### PERF-12 — Piedras: materiales compartidos — cerrado (parcial)

- Pedestal/cage usan variantes cacheadas.
- No hay batch de mallas animadas (crystal/crown/glow) a propósito.
- Bucket `magic-stones` ~15 (vista-dependiente).

### PERF-15 — Atmosphere draws — parcial

- Sin consolidación agresiva de draws (evita coste de build).
- Relacionado: presupuesto de sprites (PERF-19).

### PERF-17 — Arquitectura build — cerrado (micro)

- `makeInstance` sin alloc por celda; quaternion de muro reutilizado.
- Geometrías de escena 403 → 389 (contribuyen también door frames).

### PERF-18 — VFX idle early-out — cerrado

- `LuminousWardVfx` y `AnnihilationPulseVfx` salen temprano cuando idle limpio.
- `MobilityBoostVfx` ya tenía el patrón.

### PERF-19 — Sprites de bioma — cerrado

- Update completo cerca; stagger fuera de 14 m cuando fade estable.
- Tests de fade existentes siguen verdes.

### PERF-20 — Warmup en dos frames — cerrado

- Frame 1: `setPickupEffectsWarmupVisible(true)`.
- Frame 2: render compile + hide.
- Long task mediana 861 → 832 ms (mejora pequeña; no se afirma eliminación).

## Verificación

| Gate | Resultado |
|---|---|
| Focused tests batching/materials/doors | pass |
| `bun test tests` | 904 pass, 2 fail (baseline) |
| `bun run typecheck` | pass |
| `bun run lint` | pass |
| Chrome 3 muestras post-revert | pass; 0 errores en muestras válidas |

## Experimentos negativos

1. **Classic material bake (PERF-14):** world build 503 ms vs 417 ms. Revertido.
2. **Bucket doors-arches:** no baja de forma clara tras solo batch de marcos.

## Gap review post-implementación (quality-obsessed)

Revisión rigurosa del diff encontró omisiones reales. Correcciones aplicadas de inmediato:

| Gap | Severidad | Corrección |
|---|---|---|
| `disposeDungeonMaterials` no limpiaba variantes cacheadas | Alta (use-after-free de texturas) | `clearDungeonMaterialVariantsFor` en dispose |
| Cache de plantillas sin token de materials | Alta (materiales de otro set) | `cacheKey` incluye `dungeonMaterialsCacheToken` |
| Cache de plantillas no se limpiaba al dispose del mundo | Media (fuga) | `clearStaticPropTemplateBatchCache` en `DungeonWorld.dispose` |
| `createDoorAppearance` clonaba iron/leaf por puerta | Media (fuga de materiales + omisión PERF-13) | `getDungeonMaterialVariant` para leaf y hardware; limpia maps de wood en leaf |
| `AnnihilationPulseVfx.setWarmupVisible` no reseteaba idle | Baja | `idleClean = false` en warmup |
| Tests insuficientes de isolation | Media | Tests de dispose, cache miss entre materials sets |

Wayfinder: `.scratch/wayfinder/dungeon-perf-b-gap-review/`  
Tickets: `.scratch/dungeon-perf-b-gap-fixes/tickets.md`

**Nota:** PERF-15 (consolidar draws de atmósfera) y batch rígido completo de piedras (más allá de materiales) siguen **parciales por decisión de coste**; no se reintroduce bake que empeore mapLoad.

## Riesgos residuales

- mapLoad no mejora de forma estable en este lote.
- Firefox/móvil no medidos.
- Revisión visual humana, no pixel-diff.
- Doors-arches y atmosphere-dressing siguen siendo buckets grandes para un lote futuro.
- Tras gap-fix, no se re-midió el workload completo de 3 muestras (solo tests + typecheck).

## Artefactos

- Plan: `.scratch/planning/2026-08-01-dungeon-performance-batch-2026-08-01-b/DETAILED_PLAN.md`
- Research: `.scratch/research/2026-08-01-performance-batch-b-seams.md`
- Wayfinder: `.scratch/wayfinder/dungeon-performance-batch-2026-08-01-b/`
- Tickets: `.scratch/dungeon-performance-batch-2026-08-01-b/`
- Muestras: `.scratch/planning/.../final/post-revert-*`
