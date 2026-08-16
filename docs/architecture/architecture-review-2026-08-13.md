# Informe de arquitectura — dungeon-escape

Date: 2026-08-13
Mode: Execution
Status: Completed
Language: Spanish
Repository: `gvastethecreator/dungeon-escape`
Tracker: issues #22, #24–#28, #30–#33 (parent #3), Project 5
HTML: `.scratch/reports/architecture-2026-08-13/index.html`

Vocabulario: módulo, interfaz, implementación, profundidad, punto de sustitución (seam), adaptador, capacidad por interfaz, concentración del cambio.

## Resumen ejecutivo

Este lote entrega 10 profundizaciones. El resultado más fuerte: boot de shaders, IBL y presentación de Play cruzan puntos de sustitución con una interfaz cada uno. `DungeonWorld` sigue el facade (ADR 0002). Dual GLSL/TSL se conserva. WebGL2 sigue default.

Gate final: `bun run typecheck` pass. `bun test tests` 1215 pass, 20 skip, 0 fail.

## Beneficios y valor entregado

- **Users:** seams ARCH-03 y ARCH-10 corrigen albedo TSL y el camino PMREM. El look WebGPU completo no se declara verde. Inferido de contratos de source, no de sesión `?renderer=webgpu` humana.
- **Maintainers:** un módulo de boot de shaders, un helper de merge, un adaptador de Creation, un módulo de presentación de step. El cambio se concentra ahí.
- **Delivery / operations:** `?renderer=webgpu` sigue opt-in. El default no se re-arma.
- **Evidence:** 14 factories detrás de `bootPlayShaderMode`. Cuatro kits detrás de `normalizeGeometryForMerge`. `frame()` ya no lee `world.shotgunPumpRemaining`. Tests de wiring 2026-08-01 verdes.
- **Confidence:** estructura y tests medidos. Look WebGPU de metales en runtime humano no verificado en este lote.

## Resultados por ticket

### ARCH-01. Un módulo bootPlayShaderMode

**Ticket:** https://github.com/gvastethecreator/dungeon-escape/issues/22

**Status:** Completed

**Initial evidence**

- Play y model-lab duplicaban imports de factories.

**Implemented**

- Módulo `src/systems/PlayShaderBoot.ts`. Interfaz: `bootPlayShaderMode(mode)`.

**Technical benefit obtained**

- Profundidad: 14 loaders detrás de una función. Capacidad por interfaz en Play, model-lab y reliquary.

**Practical value**

- Un caller nuevo no copia la lista de factories.

**Value evidence**

- `PLAY_SHADER_FACTORY_LOADERS` tiene 14 entradas. Callers llaman `bootPlayShaderMode`.

**Before / After**

- Antes: lista en `main.ts`. Después: un punto de sustitución en `PlayShaderBoot`.

**Verification**

- `tests/play-shader-boot.test.ts`

**Documentation / decisions**

- Sin ADR nuevo. ADR 0009 sigue.

**Residual risk**

- None observed

### ARCH-02. Un dueño de registro de shaders

**Ticket:** https://github.com/gvastethecreator/dungeon-escape/issues/24 — bloqueado por #22

**Status:** Completed

**Initial evidence**

- El swap de registry podía exigir double-register en `main`.

**Implemented**

- `bootPlayShaderMode` instala el registry y carga factories. Callers no re-registran a mano.

**Technical benefit obtained**

- Concentración del cambio: un owner de registro.

**Practical value**

- Un factory nuevo se añade a `PLAY_SHADER_FACTORY_LOADERS`.

**Value evidence**

- `tests/play-renderer-factory.test.ts` espera `bootPlayShaderMode(shaderProgramMode)`.

**Before / After**

- Antes: boot + registro suelto. Después: un módulo.

**Verification**

- Shader factory / texture-seams

**Documentation / decisions**

- Ningún ADR.

**Residual risk**

- Un test que reemplaza el registry y no re-importa factories queda vacío. `resetShaderProgramModeRegistryForTests` sigue.

### ARCH-04. shaderProgramMode en PlayRendererHandle

**Ticket:** https://github.com/gvastethecreator/dungeon-escape/issues/25

**Status:** Completed

**Initial evidence**

- Callers derivaban `isWebGpuRenderer ? tsl : glsl`.

**Implemented**

- El factory escribe `handle.shaderProgramMode` una vez.

**Technical benefit obtained**

- Una derivación. Callers leen la interfaz del handle.

**Practical value**

- Un backend nuevo no exige grep de ternarios.

**Value evidence**

- `tests/play-renderer-factory.test.ts`

**Before / After**

- Antes: ternario en callers. Después: campo en el handle.

**Verification**

- Factory tests webgl/webgpu

**Documentation / decisions**

- Ningún ADR.

**Residual risk**

- None observed

### ARCH-05. normalizeGeometryForMerge compartido

**Ticket:** https://github.com/gvastethecreator/dungeon-escape/issues/26

**Status:** Completed

**Initial evidence**

- UV/normal/strip se copiaba en cuatro kits.

**Implemented**

- Módulo `src/world/MergeGeometryNormalize.ts`. Kits lo llaman.

**Technical benefit obtained**

- Concentración del cambio: una política de merge.

**Practical value**

- Un fix de UV llega a los cuatro kits.

**Value evidence**

- StaticDungeonScene, RuntimeModelBatching, DungeonPropKit, ImageSculptedClutterKit usan el helper.

**Before / After**

- Antes: cuatro copias. Después: un módulo.

**Verification**

- Props / static scene tests

**Documentation / decisions**

- Ningún ADR.

**Residual risk**

- None observed

### ARCH-07. WorldUpdate incluye pump de shotgun

**Ticket:** https://github.com/gvastethecreator/dungeon-escape/issues/27

**Status:** Completed

**Initial evidence**

- El HUD leía `world.shotgunPumpRemaining`. La interfaz de step estaba incompleta.

**Implemented**

- `WorldUpdate.shotgunPumpRemaining`. `frame()` no lee el getter del world.

**Technical benefit obtained**

- El facade `DungeonWorld` expone el pump en el snapshot de step (ADR 0002).

**Practical value**

- HUD y save leen un snapshot. ARCH-09 puede mapear sin getters sueltos.

**Value evidence**

- Architecture-batch-wiring. Source assert en `main.ts`.

**Before / After**

- Antes: getter suelto. Después: campo en `WorldUpdate`.

**Verification**

- Shotgun + wiring tests

**Documentation / decisions**

- ADR 0002 se conserva. `DungeonWorld` no se parte.

**Residual risk**

- None observed

### ARCH-03. Adaptadores PMREM WebGL y WebGPU

**Ticket:** https://github.com/gvastethecreator/dungeon-escape/issues/28

**Status:** Completed

**Initial evidence**

- WebGPU usaba `THREE.PMREMGenerator`. `.buffers` throw. Metales flat gray.

**Implemented**

- Módulo `src/systems/EnvironmentBind.ts`. `LightingRig.bindEnvironment` async. Adaptador WebGL: `THREE.PMREMGenerator`. Adaptador WebGPU: PMREM de `three/webgpu` por import lazy.

**Technical benefit obtained**

- Un punto de sustitución con dos adaptadores reales.

**Practical value**

- El host no elige el generador. El bind falla soft-continue.

**Value evidence**

- Source: WebGL path no value-importa `three/webgpu`. WebGPU no llama `THREE.PMREMGenerator`.

**Before / After**

- Antes: un generador WebGL en ambos backends. Después: dos adaptadores.

**Verification**

- Lighting / bind tests. Look de metales en runtime humano: no verificado en este lote.

**Documentation / decisions**

- ADR 0009 se conserva. Default WebGL2 no se re-arma.

**Residual risk**

- IBL WebGPU puede seguir incompleto (PMREM/partículas). El seam existe. El look full no está verde.

### ARCH-10. TSL de superficie conserva albedo

**Ticket:** https://github.com/gvastethecreator/dungeon-escape/issues/30

**Status:** Completed

**Initial evidence**

- `colorNode = materialColor.mul(variation)` reemplazaba el mapa. Paredes TSL sin masonry.

**Implemented**

- `material.colorNode = materialColor.mul(dungeonSurfaceMacroVariation())` con sample de mapa. `attribute("aTileUvOffset", "vec2" as const)`. Cache `dungeon-surface-tsl-v2`.

**Technical benefit obtained**

- El wrap TSL coincide con el multiply GLSL post-`map_fragment`.

**Practical value**

- WebGPU opt-in muestra albedo. No se declara flip default.

**Value evidence**

- `tests/texture-seams.test.ts`

**Before / After**

- Antes: colorNode tiraba el mapa. Después: mapa × variación.

**Verification**

- Texture-seams TSL contract

**Documentation / decisions**

- Ningún ADR. Flip sigue desarmado.

**Residual risk**

- Partículas biome TSL y otros huecos WebGPU siguen fuera de este ticket.

### ARCH-06. CreationParamsAdapter fuera de main

**Ticket:** https://github.com/gvastethecreator/dungeon-escape/issues/31

**Status:** Completed

**Initial evidence**

- CONTEXT nombraba Creation adapter. El form snapshot vivía en `main.ts`.

**Implemented**

- Módulo `src/editor/CreationParamsAdapter.ts`. Play recibe `DungeonParams`.

**Technical benefit obtained**

- El punto de sustitución de ADR 0008 tiene implementación.

**Practical value**

- Play campaign no lee el form.

**Value evidence**

- `main.ts` importa el adaptador. CONTEXT nombra el módulo.

**Before / After**

- Antes: readers en `main`. Después: un módulo.

**Verification**

- Editor params + wiring

**Documentation / decisions**

- `CONTEXT.md` actualiza Creation adapter y User settings.

**Residual risk**

- None observed

### ARCH-08. Presentación de enemigo sin EnemySimBody

**Ticket:** https://github.com/gvastethecreator/dungeon-escape/issues/32

**Status:** Completed

**Initial evidence**

- `EnemyPresentationActor extends EnemySimBody` filtraba sim a presentación.

**Implemented**

- Presentation no extiende sim. `ResidentEnemyActor = EnemySimBody & EnemyPresentationActor`.

**Technical benefit obtained**

- Interfaz de presentación sin campos de combate que no renderiza.

**Practical value**

- Un cambio de sim no obliga a recompilar presentación por herencia.

**Value evidence**

- Type shape + enemy presentation tests

**Before / After**

- Antes: extends. Después: intersección en el actor residente.

**Verification**

- Enemy presentation / resident-enemy

**Documentation / decisions**

- Ningún ADR.

**Residual risk**

- None observed

### ARCH-09. applyPlayStepPresentation fuera de frame()

**Ticket:** https://github.com/gvastethecreator/dungeon-escape/issues/33 — bloqueado por #27

**Status:** Completed

**Initial evidence**

- `frame()` mapeaba pickup/pulse/shotgun/phoenix y damage a HUD/audio/trauma.

**Implemented**

- Módulo `src/game/PlayStepPresentation.ts`: `collectPlayStepPresentation` + `applyPlayStepPresentation`. `frame()` orquesta.

**Technical benefit obtained**

- ADR 0001: el host sigue dueño del order. El mapping de step es un módulo.

**Practical value**

- Tests de HUD/damage cruzan el módulo, no el loop del renderer.

**Value evidence**

- `tests/architecture-batch-wiring-2026-08-01.test.ts` espera collect/apply. Damage tests leen `PlayStepPresentation.ts`.

**Before / After**

- Antes: mapping en `frame()`. Después: collect/apply.

**Verification**

- Architecture wiring + damage/hazard tests

**Documentation / decisions**

- ADR 0001 se conserva.

**Residual risk**

- `main.ts` sigue grande. El lote no parte el host.

## Verificación de integración

| Check                             | Result | Notes                                               |
| --------------------------------- | ------ | --------------------------------------------------- |
| `bun run typecheck`               | pass   |                                                     |
| `bun test tests`                  | pass   | 1215 pass, 20 skip, 0 fail, 49.05s                  |
| `bun run build`                   | skip   | Solo release                                        |
| Runtime `?renderer=webgpu` humano | skip   | Contratos de source. Sin sesión visual en este lote |

## Decisiones y trade-offs

- Aceptado: toast nuevo, skip probe, dual GLSL/TSL, ARCH-03 y ARCH-10 en el lote.
- Rechazado: re-armar WebGPU, borrar GLSL, partir `DungeonWorld`, Map tools en deploy.
- Diferido: rename VFX, type-only imports, Forge port, host renderer split.
- `partitionPresentation` existe y no se llama. Rompe parents de Atmosphere/doors/stairs.

## Riesgos residuales

- WebGPU+TSL no está listo como default (IBL/partículas).
- Uncanny walls no se instancian en `StaticDungeonScene`.
- `main.ts` y `StaticDungeonScene` siguen concentrados. ADR 0002 veta partir `DungeonWorld`.
