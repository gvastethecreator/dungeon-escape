# Informe de mejora arquitectónica C — Dungeon Escape

Fecha: 2026-08-02  
Modo: ejecución  
Estado: completado (10/10)  
Idioma: español  
Tracker: `.scratch/dungeon-architecture-batch-2026-08-02/`  
Plan durable: `.scratch/planning/2026-08-02-dungeon-architecture-batch-2026-08-02/`  
Compañero visual: `.scratch/reports/architecture-review-2026-08-02/index.html`

## Resumen ejecutivo

- Se completaron las diez mejoras aprobadas del lote C.
- Los relojes temporizados, la bolsa de poderes/maldiciones, la proyección de control, el despacho de pickups, la presentación de cofres/puertas/pickups y el HUD de estado de Play tienen dueños con interfaz pequeña.
- `DungeonWorld` bajó de ~1932 a ~1665 líneas; `main.ts` de ~4752 a ~4653.
- Integración final: **967 pass / 2 fail** (mismos dos fallos de baseline: provenance de assets y assertion estructural de reservas de sprites). Tipos y lint verdes.

## Beneficios y valor obtenido

- **Usuarios:** sin cambio de función de juego. Comportamiento de maldiciones, poderes y locomoción se preservó por diseño.
- **Mantenedores:** un reloj compartido evita copiar `activate/tick/isActive`; una bolsa concentra el estado de run; una tabla de sesión evita bloques repetidos en `RunSession`; la presentación de props interactivos sale del facade de Play.
- **Evidencia:** +22 pruebas netas (947 → 969), suite final 967 pass con los mismos 2 fail de baseline, `typecheck:all` y `lint` pasan.
- **Confianza:** comportamiento determinista verificado por unit tests; no se ejecutó Play en navegador.

## Hallazgos e implementación

### ARC-C01 — TimedSeconds

**Estado:** completado.  
**Implementación:** `src/game/TimedSeconds.ts`; maldiciones y poderes lo consumen.  
**Verificación:** `tests/timed-seconds.test.ts` + suites de freeze/ward/mobility/fog/curses.

### ARC-C03 — ControlModsProjection

**Estado:** completado.  
**Implementación:** `src/player/ControlModsProjection.ts`; el frame ya no duplica constantes de spin.  
**Verificación:** `tests/control-mods-projection.test.ts`.

### ARC-C05 — Pickup session effects table

**Estado:** completado.  
**Implementación:** `src/game/PickupSessionEffects.ts`; `RunSession.applyWorldUpdate` usa la tabla.  
**Verificación:** `tests/pickup-session-effects.test.ts` + `tests/run-session.test.ts`.

### ARC-C02 — RunPowerRuntime bag

**Estado:** completado.  
**Implementación:** `src/game/RunPowerRuntime.ts`; `DungeonWorld` guarda un `powers` bag.  
**Verificación:** `tests/run-power-runtime.test.ts` + play-runtime.

### ARC-C04 — PickupKind activation on bag

**Estado:** completado.  
**Implementación:** `applyPickupToRunPowers`; el mundo despacha piedra/resolve por separado.  
**Verificación:** runtime bag + curse mutual exclusion tests.

### ARC-C10 — LocomotionMods

**Estado:** completado.  
**Implementación:** `FirstPersonController.setLocomotionMods`; shell usa proyección + un apply.  
**Verificación:** typecheck + wiring en curse-chests structural test.

### ARC-C06 — ChestPresentation

**Estado:** completado.  
**Implementación:** `src/world/ChestPresentation.ts`.  
**Verificación:** `tests/chest-presentation.test.ts`.

### ARC-C07 — PickupMotionPresentation

**Estado:** completado.  
**Implementación:** `src/world/PickupMotionPresentation.ts`.  
**Verificación:** wired en `DungeonWorld`; idle/collect motion fuera del facade.

### ARC-C08 — DoorLeafPresentation

**Estado:** completado.  
**Implementación:** `src/world/DoorLeafPresentation.ts` tras `DoorOpenPolicy`.  
**Verificación:** `tests/door-leaf-presentation.test.ts`.

### ARC-C09 — PlayStatusHud

**Estado:** completado.  
**Implementación:** `src/ui/PlayStatusHud.ts`; `main.ts` sincroniza con un snapshot.  
**Verificación:** `tests/play-status-hud.test.ts`.

## Decisiones y trade-offs

- A9 sigue diferido (owner).
- El lote PERF multi-piso no se mezcló.
- No se fabricó provenance de assets.
- Los wrappers expand-contract de sync HUD individuales se eliminaron al migrar los call sites.
- No se creó ADR: cambios internos y reversibles.

## Verificación final

| Comando | Resultado |
| --- | --- |
| Pruebas enfocadas del lote | pasan |
| `bun test tests` | 967 pass, 2 fail, 969 tests, 156678 asserts |
| `bun run typecheck:all` | pasa |
| `bun run lint` | pasa (1 warning previo en MaterialLibrary, no del lote) |
| Navegador Play | no ejecutado |

Fallos residuales de baseline:

1. `runtime asset boundary` — iconos UI sin registros en el manifest.
2. `biome sprite decor atlas > shares object reservations…` — assertion de comentario/orden de colocación obsoleta en fuente.

## Riesgos residuales

- La sensación de control curses y motion de pickups no se validó en navegador.
- `setMobilityBoost` / `setSlowCurse` / `setControlMods` siguen como API expand-contract en el controller.
- A9 y PERF multi-piso permanecen fuera de este cierre.
