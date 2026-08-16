# Informe de rendimiento — dungeon-escape

Date: 2026-08-13
Mode: Execution
Status: Completed
Language: Spanish
Repository: `gvastethecreator/dungeon-escape`
Tracker: issues #14–#21, #23, #29 (parent #3), Project 5
HTML: `.scratch/reports/performance-2026-08-13/index.html`

## Resumen ejecutivo

Este lote entrega 10 mejoras de rendimiento. El invariante de calidad se mantiene: misma fidelidad visual y mismo combate. WebGL2 sigue default.

El lote cambia el schedule de boot y de frame. No hay perfil de hardware nuevo en esta sesión. Las ganancias de milisegundos se marcan como inferidas salvo donde el test prueba el mecanismo.

Baseline de topología previa (ADR 0009 / `docs/DUNGEON-PERFORMANCE-TOPOLOGY.md`): long-task ~5.5s, ~112 programs, renderer-ready ~12s. Esta sesión no re-midió esos números.

## Invariante de calidad

- Sin LOD que baje fidelidad
- Sin VFX borrados
- Dual GLSL/TSL
- `?renderer=webgpu` sigue disponible
- Pisos 2–4 quedan completos antes de uso

## Resultado agregado

Mecanismos verificados:

- Probe WebGPU omitido en boot WebGL2
- `compileAsync` y `PovPostFx.warmup` bajo cover
- 14 factory imports en `Promise.all`
- IBL diferido bajo cover
- Mist banks con un material
- Cache XZ de interact
- Dressing de piso diferido
- Scratch de aim / WorldUpdate
- Prefetch de shotgun tras pickup

Ganancia de wall-clock: no medida en este lote. Inferida del mecanismo.

## Resultados por ticket

### PERF-03. Saltar probe WebGPU en boot WebGL2

**Ticket / status**

- https://github.com/gvastethecreator/dungeon-escape/issues/14 — cerrado

**Baseline**

- `createPlayRendererHandle` esperaba `detectWebGpuAvailability` (hasta 1.5s) con flip desarmado.

**Implemented**

- Probe solo si `webgpu` o auto+prefer. Si no, `skippedWebGpuAvailability()` / `failureReason: "not-requested"`.

**Final result**

- Mecanismo verificado. Delta de `initDurationMs` no medido. Inferido: se evita el wait del adapter.

**Quality evidence**

- `?renderer=webgpu` sigue el probe. WebGL2 default no cambia.

**Verification**

- `tests/play-renderer-factory.test.ts`, flip policy

**Residual risk**

- Auto+prefer armado en el futuro vuelve a pagar el probe. Eso es el diseño.

### PERF-01. Warmup WebGL con compileAsync

**Ticket / status**

- https://github.com/gvastethecreator/dungeon-escape/issues/15 — cerrado

**Baseline**

- `startRendererWarmup` dibujaba una vez. `compileAsync` no se llamaba.

**Implemented**

- Warmup llama `compileAsync` cuando el renderer lo expone y el cap lo permite. Luego un render.

**Final result**

- Mecanismo verificado. `warmupWorkMs` / long-task no re-medidos.

**Quality evidence**

- Misma escena. Solo cambia el schedule de compile.

**Verification**

- Warmup source + suite

**Residual risk**

- `compileAsync` ausente: el path cae al render único previo.

### PERF-05. Llamar PovPostFx.warmup bajo cover

**Ticket / status**

- https://github.com/gvastethecreator/dungeon-escape/issues/16 — cerrado

**Baseline**

- CRT compilaba en el primer frame de input.

**Implemented**

- Cover warmup llama `povPost.warmup`.

**Final result**

- Mecanismo verificado. Hitch de primer CRT no medido.

**Quality evidence**

- Misma look CRT. Solo schedule.

**Verification**

- Warmup path + suite

**Residual risk**

- None observed

### PERF-02. Imports GLSL en paralelo

**Ticket / status**

- https://github.com/gvastethecreator/dungeon-escape/issues/23 — cerrado. Bloqueado por #22.

**Baseline**

- 14 `await import(...)` en serie en `main.ts`.

**Implemented**

- `Promise.all` sobre `PLAY_SHADER_FACTORY_LOADERS` en `bootPlayShaderMode`.

**Final result**

- Mecanismo verificado. Tiempo a `[renderer-init]` no re-medido.

**Quality evidence**

- Las mismas 14 factories. Dual mode intacto.

**Verification**

- `tests/play-shader-boot.test.ts`

**Residual risk**

- Un import lento sigue en el critical path. El lote no recorta factories.

### PERF-04. Diferir bindEnvironment bajo cover

**Ticket / status**

- https://github.com/gvastethecreator/dungeon-escape/issues/29 — cerrado. Bloqueado por #28.

**Baseline**

- PMREM sincrono en el hilo de boot.

**Implemented**

- Boot no hace IBL sincrono. Warmup llama `bindEnvironment` async bajo cover.

**Final result**

- Mecanismo verificado. Long-task de boot no re-medido.

**Quality evidence**

- Tras cover, IBL sigue el mood. Fallo: warn sin IBL.

**Verification**

- Warmup + lighting tests

**Residual risk**

- Cover corto en hardware lento puede mostrar un frame sin IBL. Input sigue bloqueado hasta cover.

### PERF-06. Compartir materiales de mist banks

**Ticket / status**

- https://github.com/gvastethecreator/dungeon-escape/issues/17 — cerrado

**Baseline**

- Cada mist bank tenía `SpriteMaterial` propio.

**Implemented**

- Un material compartido. Opacidad por `onBeforeRender`.

**Final result**

- Menos programas de mist. Conteo `programs` no re-medido.

**Quality evidence**

- Mismo motion/color. Tests de atmosphere.

**Verification**

- Atmosphere / mist tests

**Residual risk**

- `onBeforeRender` por sprite. Costo JS vs ahorro de programas: no perfilado.

### PERF-07. Cachear XZ de puertas, cofres y antorchas

**Ticket / status**

- https://github.com/gvastethecreator/dungeon-escape/issues/18 — cerrado

**Baseline**

- Interact llamaba `getWorldPosition` cada frame.

**Implemented**

- `WeakMap` XZ en doors/chests/torches.

**Final result**

- Menos trabajo JS por frame. GC / ms no medidos.

**Quality evidence**

- Distancias de interact iguales. Occupancy suite verde.

**Verification**

- Interact / occupancy tests

**Residual risk**

- Un objeto que se mueve sin invalidar cache queda con XZ viejo. Doors/chests/torches no se mueven en Play.

### PERF-08. Hidratar pisos 2–4 fuera del frame de subida

**Ticket / status**

- https://github.com/gvastethecreator/dungeon-escape/issues/19 — cerrado

**Baseline**

- Climb hidrataba dressing en el frame de subida (PERF-34).

**Implemented**

- Climb hidrata interactables. Dressing en `pendingFloorDressing`. `pumpDeferredFloorDressing(1)` desde `DungeonWorld.update`. Minimap se cachea en build y se recachea al hidratar.

**Final result**

- Climb no espera el dressing completo. Completitud antes de uso: tests de occupancy y resident-floor.

**Quality evidence**

- Tras hydrate + `flushDeferredFloorPresentation()`, occupancy Solid y contents coinciden. `partitionPresentation` no se usa: rompía parent de Atmosphere/doors/stairs.

**Verification**

- `tests/floor-occupancy-grid.test.ts`, `tests/resident-floor-effects-hazards.test.ts`, `tests/static-dungeon-scene.test.ts`

**Residual risk**

- Un test o caller que no hace flush ve minimap/dressing parcial. Play flushea al cambiar de piso.

### PERF-09. Reusar aim y WorldUpdate por frame

**Ticket / status**

- https://github.com/gvastethecreator/dungeon-escape/issues/20 — cerrado

**Baseline**

- Aim y WorldUpdate se asignaban de nuevo cada frame.

**Implemented**

- `aimScratch` / `worldUpdateScratch` reutilizados.

**Final result**

- Menos allocs. GC no medido.

**Quality evidence**

- Mismos eventos HUD.

**Verification**

- Architecture wiring + suite

**Residual risk**

- Un caller que guarda el objeto scratch entre frames ve datos del frame siguiente. El host no lo guarda.

### PERF-10. Prefetch de shotgun solo tras pickup

**Ticket / status**

- https://github.com/gvastethecreator/dungeon-escape/issues/21 — cerrado

**Baseline**

- El trio shotgun estaba en `PLAY_AUDIO_PREFETCH_ASSETS`.

**Implemented**

- Prefetch del trio tras pickup.

**Final result**

- Menos bytes en prefetch temprano. Tamaño no re-contado en este lote.

**Quality evidence**

- Primer disparo tras pickup sigue el path de audio existente.

**Verification**

- Audio prefetch tests

**Residual risk**

- Primera recámara en red lenta puede hitch. El lote no mide red.

## Experimentos fallidos o neutrales

- `partitionPresentation` en hydrate: falló tests de parent (Atmosphere, doors, stairs). Se dejó sin llamar. Neutral para rendimiento.

## Decisiones

- WebGL2 default. No re-armar WebGPU.
- No perfilar de nuevo la topología 5.5s / 12s en este lote.
- No frustum-cull de ground fog.

## Verificación de integración

| Check                       | Result | Notes                               |
| --------------------------- | ------ | ----------------------------------- |
| `bun run typecheck`         | pass   |                                     |
| `bun test tests`            | pass   | 1215 pass, 20 skip, 0 fail, 49.05s  |
| `bun run build`             | skip   | Solo release                        |
| Re-profile ADR 0009 numbers | skip   | Sin hardware capture en esta sesión |

## Riesgos residuales

- Ganancias de ms inferidas, no re-medidas.
- WebGPU+TSL IBL/partículas siguen rotos fuera de los seams ARCH-03/ARCH-10.
- Uncanny walls no se crean en `StaticDungeonScene`. Fuera de este lote.
