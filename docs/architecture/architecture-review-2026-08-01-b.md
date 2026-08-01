# Informe de mejora arquitectónica B — Dungeon Escape

Fecha: 2026-08-01  
Modo: ejecución aprobada  
Estado: completado (10/10)  
Baseline fijo: `2112fe9e56b2bae5ed38db7b447fd09572f96c2b`  
Tracker: `.scratch/dungeon-architecture-batch-2026-08-01-b/`  
Compañero visual: `.scratch/reports/architecture-review-2026-08-01-b/index.html`

## Resumen ejecutivo

- Se completaron las diez mejoras aprobadas sin tocar A9, remotos, despliegue ni trabajo previo no relacionado.
- Cinco módulos anfitriones perdieron 678 líneas: `GameAudio` (-326), `main.ts` (-117), `DungeonWorld` (-220), `FirstPersonController` (-12) y `forge/main.js` (-3). La implementación movida quedó en módulos con interfaz y pruebas propias.
- El lote agrega 31 pruebas verdes al baseline: 889 pasan y permanecen los mismos 2 fallos previos. Las assertions subieron de 154.963 a 155.269.
- Tipos de cliente, servidor y worker, lint y build de producción pasan.
- No se ejecutó Play en navegador. El lote demuestra estructura, comportamiento determinista y empaquetado; no afirma prueba visual del producto.

## Alcance y método

Se inspeccionaron el contexto, ADRs, informes anteriores, llamadores activos, pruebas y el baseline antes de proponer cambios. Cristian aprobó un contrato de exactamente diez mejoras. Cada ticket movió una responsabilidad existente, eliminó su implementación anterior y se verificó en el punto de sustitución público más cercano. No se añadió una nueva función de juego.

El diff se revisó contra el baseline fijo `2112fe9`. Como el lote está sin commit por decisión de alcance, la revisión cubrió `git diff HEAD` y todos los archivos no rastreados. No se detectaron cambios fuera del contrato ni duplicados de las responsabilidades retiradas.

## Ledger de evidencia

| Evidencia | Baseline | Resultado final | Lectura |
| --- | ---: | ---: | --- |
| Pruebas que pasan | 858 | 889 | +31 pruebas en los nuevos puntos de sustitución |
| Pruebas que fallan | 2 | 2 | Sin regresiones nuevas en la suite completa |
| Assertions | 154.963 | 155.269 | +306 comprobaciones |
| `bun run typecheck:all` | pasa | pasa | Cliente, servidor y worker |
| `bun run lint` | pasa | pasa | `oxlint .` sin errores |
| `bun run build` | no usado como baseline | pasa | Vite 8.2.0, 187 módulos, 1,52 s |
| `git diff --check HEAD` | — | pasa | Solo avisos de normalización LF/CRLF de Git |

## Hallazgos e implementación

### ARC-B01 — Catálogo de assets de audio

**Estado:** completado.  
**Evidencia inicial:** `GameAudio` concentraba rutas, grupos, ganancias, perfiles espaciales y tablas de resolución junto al dispositivo Web Audio.  
**Implementación:** `src/audio/AudioAssetCatalog.ts` es el catálogo y `GameAudio` conserva mezcla, reproducción y estado del dispositivo.  
**Antes → después:** configuración y reproducción en una clase de 982 líneas → catálogo sustituible más reproductor de 656 líneas.  
**Beneficio técnico:** una sola interfaz describe el inventario completo y sus mapeos.  
**Valor práctico:** cambiar o auditar un sonido ya no exige navegar el ciclo de Web Audio.  
**Evidencia de valor:** las pruebas enfocadas cerraron con 19 pass, 0 fail y 835 assertions; tipos pasan.  
**Riesgo residual:** el catálogo sigue siendo código estático; añadir un asset requiere actualizar su definición y el archivo público de forma coordinada.

### ARC-B02 — Selector de tomas de criaturas

**Estado:** completado.  
**Evidencia inicial:** selección ponderada, tono por bioma y memoria de la última toma vivían dentro de `GameAudio`.  
**Implementación:** `src/audio/CreatureTakeSelector.ts` recibe el valor aleatorio, evita repetición inmediata y selecciona variantes temáticas.  
**Antes → después:** azar y memoria mezclados con reproducción → selector determinista con estado acotado.  
**Beneficio técnico:** la selección puede probarse sin `AudioContext`.  
**Valor práctico:** una nueva voz o balance de tomas puede verificarse sin reproducir audio real.  
**Evidencia de valor:** 23 pass, 0 fail y 851 assertions en el corte combinado; tipos pasan.  
**Riesgo residual:** la clave de no repetición es por criatura y rol, no por enemigo individual; conserva el comportamiento previo.

### ARC-B03 — Política de sonidos de interfaz

**Estado:** completado.  
**Evidencia inicial:** `main.ts` poseía selectores CSS, prioridades de cue y semántica de controles bloqueados dentro de listeners DOM.  
**Implementación:** `src/ui/UiSoundPolicy.ts` resuelve target, click, hover y change; el adaptador conserva listeners, debounce y reproducción.  
**Antes → después:** política dispersa en eventos → interfaz pura sobre un target DOM mínimo.  
**Beneficio técnico:** la semántica de sonido tiene un dueño único sin acoplarse al documento global.  
**Valor práctico:** estados disabled y controles prioritarios mantienen una respuesta coherente.  
**Evidencia de valor:** 20 pass, 0 fail y 666 assertions; tipos pasan.  
**Riesgo residual:** los selectores siguen ligados al vocabulario CSS actual, por diseño.

### ARC-B04 — Altura canónica del jugador

**Estado:** completado.  
**Evidencia inicial:** `FirstPersonController` usaba `1.68` por defecto, mientras la pose de combate y el runtime activo usaban `1.62` mediante un override del shell.  
**Implementación:** `PLAYER_COMBAT_EYE_HEIGHT` alimenta el default de `FirstPersonController` y las transiciones; el override del shell pasó a ser redundante y se eliminó.  
**Antes → después:** default divergente más corrección del llamador → una constante canónica.  
**Beneficio técnico:** las poses de cámara y cambio de piso no pueden derivar por edición parcial.  
**Valor práctico:** evita saltos verticales al cambiar de piso tras ajustar la altura del jugador.  
**Evidencia de valor:** 10 pass, 0 fail y 65 assertions; tipos pasan.  
**Riesgo residual:** los ajustes explícitos de altura siguen permitidos para pruebas o consumidores especializados.

### ARC-B05 — Presentación de enemigos

**Estado:** completado.  
**Evidencia inicial:** `DungeonWorld.update` mezclaba simulación con matrices instanciadas, visibilidad, sombras, atlas, freeze y trails.  
**Implementación:** `src/world/EnemyPresentation.ts` proyecta el frame simulado; `DungeonWorld` conserva simulación, activación y resultados de juego.  
**Antes → después:** el facade escribía simulación y vista → una llamada de presentación con interfaz de frame explícita.  
**Beneficio técnico:** separa estado causal de combate de detalles Three.js y concentra el cambio visual.  
**Valor práctico:** animación o sombras pueden evolucionar sin tocar daño, persecución o reservas.  
**Evidencia de valor:** 48 pass, 0 fail y 633 assertions sobre matrices, atributos, materiales y trail; tipos pasan.  
**Riesgo residual:** el módulo usa Three.js deliberadamente porque es la capa de presentación, no una política pura.

### ARC-B06 — Efectos de escena fija

**Estado:** completado.  
**Evidencia inicial:** `DungeonWorld` actualizaba fuego, LOS, LOD, luz, beams, líquidos y sprites de piso junto al estado de juego.  
**Implementación:** `src/world/FixedSceneEffects.ts` posee esos actores decorativos; VFX temporales del jugador y hazards permanecen en el mundo.  
**Antes → después:** un update de mundo profundo → una implementación visual acotada y un facade 220 líneas menor.  
**Beneficio técnico:** reúne cálculos que cambian juntos y deja el estado de juego fuera.  
**Valor práctico:** ajustar fogatas o decoración de bioma reduce el riesgo de alterar combate.  
**Evidencia de valor:** 41 pass, 0 fail y 760 assertions; tipos pasan.  
**Riesgo residual:** LOS de fuego conserva su cadencia de 120 ms y requiere navegador para validar percepción final.

### ARC-B07 — Controlador de resultados de ronda

**Estado:** completado.  
**Evidencia inicial:** `main.ts` coordinaba retry por timeout, secuencias obsoletas, rank guardado y copy de seis estados del Hall.  
**Implementación:** `src/ui/RoundResultsController.ts` publica estados `loading`, `ranked`, `empty`, `outside`, `unavailable` y `custom`; el shell solo los aplica al DOM.  
**Antes → después:** asincronía y presentación concentradas en el shell → controlador con publisher mínimo.  
**Beneficio técnico:** las respuestas tardías no pisan una ronda nueva ni el rank ya guardado.  
**Valor práctico:** la comparación del Hall permanece estable bajo timeout, retry y navegación rápida.  
**Evidencia de valor:** 14 pass, 0 fail y 104 assertions; tipos pasan.  
**Riesgo residual:** la política de retry sigue siendo un único reintento solo para el mensaje de timeout conocido.

### ARC-B08 — Transacción de cambio de piso

**Estado:** completado.  
**Evidencia inicial:** el shell distribuía validación, checkpoint, fade, activación, warmup, recuperación e input sin un resultado explícito.  
**Implementación:** `src/game/FloorTransitionDirector.ts` serializa la operación y devuelve `completed`, `rejected` o `recovered`; un port browser-local adapta dominio, guardado, renderer y UI.  
**Antes → después:** efectos coordinados por convención → transacción con etapas y liberación garantizada de cover/input.  
**Beneficio técnico:** checkpoint ocurre antes del cover y la recuperación distingue piso fuente de piso destino.  
**Valor práctico:** un warmup degradado no bloquea controles y un fallo posterior a activación conserva una ruta de Continue.  
**Evidencia de valor:** 21 pass, 0 fail y 118 assertions; tipos pasan.  
**Riesgo residual:** no expone cancelación ni cola pública; el contrato aprobado rechaza llamadas concurrentes como `busy`.

### ARC-B09 — Sesión de presentación en Forge

**Estado:** completado.  
**Evidencia inicial:** `forge/main.js` mantenía flags y dungeon retenido sueltos para correlacionar presentación, animación y restauración.  
**Implementación:** `src/forge/ForgePresentationSession.ts` posee identidad activa, completion único, reemplazo y editor retenido; Three.js, DOM y `postMessage` quedan en el adaptador.  
**Antes → después:** variables globales relacionadas por convención → sesión pequeña con transición explícita.  
**Beneficio técnico:** una finalización tardía no cierra ni restaura una presentación más nueva.  
**Valor práctico:** el teatro de New Game evita pop-in o retorno al mapa equivocado durante reemplazos rápidos.  
**Evidencia de valor:** 19 pass, 0 fail y 118 assertions; tipos y build confirman el import JS→TS.  
**Riesgo residual:** la ruta perceptual del iframe no se ejecutó en navegador en este lote.

### ARC-B10 — Proyección de movimiento de cámara

**Estado:** completado.  
**Evidencia inicial:** `FirstPersonController` calculaba bob, respiración, aterrizaje, lean, boost, reduced motion y FOV dentro de la escritura Three.js.  
**Implementación:** `src/player/CameraMotionProjection.ts` calcula un frame puro; el controller reutiliza buffers y aplica la proyección.  
**Antes → después:** sensación y mutación de cámara inseparables → paso puro más adaptador Three.js.  
**Beneficio técnico:** la matemática de cámara se prueba sin navegador y sin asignaciones por frame en el llamador.  
**Valor práctico:** reduced motion neutraliza offsets, roll y FOV de manera verificable.  
**Evidencia de valor:** 24 pass, 0 fail y 75 assertions; tipos pasan.  
**Riesgo residual:** la sensación final necesita una sesión humana en Play; aquí solo se probó la proyección.

## Decisiones y trade-offs

- Se mantuvo A9 fuera del lote: el plan-then-Three-commit de la escena estática continúa diferido por el dueño.
- Se prefirieron módulos de responsabilidad acotada a reescrituras de `main.ts`, `DungeonWorld`, `StaticDungeonScene` o Forge.
- Para ARC-B08 se compararon tres interfaces. Se eligió una transacción mínima con resultado explícito, sin cola, cancelación, registry ni eventos públicos.
- `EnemyPresentation` y `FixedSceneEffects` dependen de Three.js porque son adaptadores visuales; sus decisiones de juego permanecen fuera.
- No se creó ADR: los diez cambios son internos, reversibles y preservan contratos públicos existentes.
- No se inventó provenance para hacer verde el gate de assets ni se actualizaron conteos de escena sin confirmar el contrato esperado.

## Workplan priorizado

Los diez tickets aprobados están cerrados. El siguiente trabajo no forma parte de este lote:

1. **Owner de assets:** registrar fuentes y transformaciones reales de los 15 iconos WebP antes de editar `runtime-optimization-manifest.json`.
2. **Owner de escena estática:** confirmar si el seed canónico debe producir 15 pickups y 174 props antes de actualizar el golden.
3. **Prueba de producto:** ejecutar Play, Hall, cambio de piso, Forge y reduced motion en navegador si se necesita evidencia perceptual antes de release.

## Verificación final

| Comando | Resultado |
| --- | --- |
| Pruebas enfocadas por ticket | pasa; 10/10 tickets con prueba cercana |
| `bun test tests` | 889 pass, 2 fail, 155.269 assertions, 891 pruebas / 173 archivos, 10,90 s |
| `bun run lint` | pasa |
| `bun run build` | pasa; incluye `bun run typecheck:all` |
| Tipos cliente / servidor / worker | pasa / pasa / pasa |
| `git diff --check HEAD` | pasa; solo avisos LF→CRLF |
| Revisión de responsabilidades antiguas con `rg` | pasa; sin coincidencias |
| Navegador del producto | no ejecutado |

El build conserva un aviso no bloqueante: el chunk `BufferGeometryUtils` mide 592,60 kB y supera el umbral informativo de 500 kB.

## Riesgos residuales

- `tests/runtime-asset-boundary.test.ts` falla porque 15 iconos UI WebP no tienen registros verificables en `assets-source/runtime-optimization-manifest.json`. Faltan fuentes/provenance; el lote no los fabricó.
- `tests/static-dungeon-scene.test.ts` espera 14 pickups y 173 props, mientras el resultado determinista actual entrega 15 y 174. Actualizar el esperado sin decisión del owner ocultaría si el cambio es correcto.
- No existe prueba visual de Play, Hall, cambio de piso, iframe Forge o sensación de cámara en este cierre.
- Los cambios están deliberadamente sin commit, stage, push ni deploy.
