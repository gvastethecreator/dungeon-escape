# Revisión final de rendimiento — Dungeon Escape

- **Repositorio:** `X:\dungeon-escape`
- **Fecha:** 2026-08-01
- **Modo:** ejecución aprobada
- **Estado:** 10 de 10 mejoras cerradas
- **Idioma:** español
- **Baseline Git:** `34260ed`

## Resumen ejecutivo

El lote reduce trabajo de carga, audio, CPU y GPU sin bajar DPR, contenido, iluminación, VFX ni calidad de audio. En tres recorridos Frost/critical equivalentes, la mediana de carga del mapa baja de 968 a 431 ms (-55,5%), los draw calls de 425 a 265 (-37,6%) y el frame p95 de 30,0 a 10,1 ms (-66,3%). Los frames sobre 25 ms bajan de 55 a 0.

Welcome ya no descarga Three ni crea WebGL. Su JavaScript inicial de producción baja de 1.447,79 a 36,92 kB minificados (-97,45%). El gesto de audio pide 37 de 207 assets y 1,54 de 11,91 MB.

La equivalencia de calidad queda respaldada por la misma semilla, topología, escena, DPR 0,70, 16 luces, recorridos reales de Welcome/Play/Continue/Creation, capturas revisadas y cero errores de navegador/red. La suite termina con 901 pruebas verdes y los mismos dos fallos del baseline.

## Invariante de calidad protegido

- Misma lógica de juego, controles, colisiones, IA, guardado, minimapa y accesibilidad.
- Mismos pixels, materiales, luces, niebla, postproceso, animaciones, VFX y archivos de audio.
- Sin reducción de DPR, resolución, partículas, texturas, modelos o calidad de audio.
- Sin cambios de servidor, leaderboard, despliegue, dependencias o remotos.

## Entorno, método y límites

- Windows NT `10.0.26200.0`; AMD Ryzen 9 3900XT; 95,9 GiB RAM; NVIDIA GeForce RTX 3090.
- Bun `1.3.14`; Node `v26.5.0`; Chrome `150.0.7871.187`; Three.js `r185`.
- Runtime: Vite local en `127.0.0.1:24211`, Chrome headless nuevo y perfil frío por muestra.
- Workload: `frost`, seed `vfx-audit-2026-08-01`, `qaState=critical`, `perfAudit=1`, CRT desactivado, movimiento automático y 8 s registrados después de 1,8 s de warm-up.
- Tres muestras baseline y tres finales. Se informa mediana y rango. Las métricas de bundle provienen del build de producción.
- Confianza: comparación fuerte para esta máquina y workload; no generaliza por sí sola a otros GPU, Firefox, móvil o red real.

## Resultado agregado

| Métrica              | Baseline min / mediana / max |   Final min / mediana / max |     Delta mediano |
| -------------------- | ---------------------------: | --------------------------: | ----------------: |
| Carga total del mapa |         733 / 968 / 1.011 ms |          428 / 431 / 475 ms |  -537 ms (-55,5%) |
| Build del mundo      |           704 / 937 / 980 ms |          410 / 414 / 452 ms |  -523 ms (-55,8%) |
| Frame p50            |        10,0 / 10,1 / 10,1 ms |       10,0 / 10,0 / 10,0 ms |   -0,1 ms (-1,0%) |
| Frame p95            |        20,2 / 30,0 / 30,0 ms |       10,1 / 10,1 / 10,2 ms | -19,9 ms (-66,3%) |
| Frame p99            |        30,1 / 30,2 / 40,0 ms |       19,9 / 20,0 / 20,1 ms | -10,2 ms (-33,8%) |
| Frame máximo         |        40,1 / 40,2 / 49,9 ms |       20,1 / 20,1 / 20,3 ms | -20,1 ms (-50,0%) |
| Frames sobre 25 ms   |                 33 / 55 / 72 |                   0 / 0 / 0 |       -55 (-100%) |
| Draw calls           |              414 / 425 / 436 |             237 / 265 / 269 |     -160 (-37,6%) |
| Geometrías           |              554 / 554 / 554 |             403 / 403 / 403 |     -151 (-27,3%) |
| Texturas             |              103 / 103 / 103 |                93 / 93 / 93 |       -10 (-9,7%) |
| Materiales           |              357 / 357 / 357 |             336 / 336 / 336 |       -21 (-5,9%) |
| Programas            |                 63 / 63 / 63 |                60 / 60 / 60 |        -3 (-4,8%) |
| Triángulos visibles  |  298.678 / 303.766 / 305.162 | 304.834 / 319.434 / 319.986 |   +15.668 (+5,2%) |

Los triángulos visibles suben 5,2%; no se contabilizan como mejora. El batching reduce submits y recursos, no la geometría visual. Cada captura final registró una long task de arranque de 128–140 ms; el baseline varió entre 0 y 1.056 ms. Tampoco se declara esa métrica como ganancia.

## Resultado de equivalencia de calidad

- Las seis muestras usan la misma topología, 16 habitaciones, 954 celdas de piso, 20 enemigos iniciales, 41 de reserva, 16 pickups y 338 props.
- DPR `0,70`, sombras desactivadas por el mismo perfil, CRT desactivado y 16 luces en baseline y final.
- Los inventarios finales no tienen texturas sin UV, UV degeneradas, texturas pendientes ni materiales iluminados sin textura.
- Capturas revisadas: Frost crítico, pickup dormido/activo, cofre cerrado/abierto, lantern, Welcome, Play y Creation.
- Corrección visual adicional solicitada: el logo de Welcome comparte borde con la tarjeta; Jacquard conserva texto mixto y no fuerza mayúsculas ni small caps.
- Chrome terminó todos los recorridos finales con cero errores de browser y red.

## Tickets cerrados

### PERF-01. Cargar el runtime Three.js por demanda

**Ticket / estado**

- `.scratch/dungeon-performance-batch-2026-08-01/issues/01-lazy-three-runtime.md`; cerrado.

**Baseline**

- Build de producción: 1.447,79 kB JS minificados / 419,85 kB gzip y 112,27 kB CSS / 22,50 kB gzip en el grafo inicial.

**Implementado**

- `src/shell.ts` posee Welcome, perfil, save, partículas y rutas. `src/shellRoute.ts` abre `import("./main")` solo cuando una ruta necesita Three. Creation CSS queda en el chunk diferido.

**Resultado final**

- JS inicial: 36,92 kB / 13,77 kB gzip; -1.410,87 kB (-97,45%) y -406,08 kB gzip (-96,72%).
- CSS inicial: 92,01 kB / 19,33 kB gzip; -20,26 kB (-18,05%) y -3,17 kB gzip (-14,09%).
- Welcome en Chrome: 0 contextos WebGL, 0 requests de Three/mundo y runtime `deferred`.

**Evidencia de calidad**

- Play, Continue y Creation recorrieron sus rutas reales. Welcome mantiene partículas, perfil, guardado, foco, audio y navegación.

**Verificación**

- `bun test tests/lazy-shell.test.ts tests/welcome-map-flow.test.ts`; Chrome CDP a 1600×900; `bun run build`.

**Riesgo residual**

- La ruta se midió en Vite local y build de producción; no se midió una CDN real.

### PERF-02. Cargar audio por demanda

**Ticket / estado**

- `.scratch/dungeon-performance-batch-2026-08-01/issues/02-demand-audio.md`; cerrado.

**Baseline**

- `GameAudio.unlock()` pedía y decodificaba 207 assets por 11.910.571 bytes.

**Implementado**

- Carga crítica por asset, música activa y voces del piso; deduplicación de one-shots pendientes, retry de fallos parciales y resto bajo demanda.

**Resultado final**

- 37 assets y 1.535.664 bytes: -170 assets/buffers (-82,1%) y -10.374.907 bytes (-87,1%).
- Decode final mediano 459,4 ms, rango 440,9–564,3 ms.

**Evidencia de calidad**

- Se conservan catálogo, rutas, grupos, ganancias, música, ambiente, UI y cues. Los fallos parciales pueden reintentarse.

**Verificación**

- `bun test tests/game-audio.test.ts`; tres recorridos Frost; diagnósticos de audio y cero errores de red.

**Riesgo residual**

- El recorrido final no dispara los 207 cues; la cobertura del catálogo restante es estática y unitaria.

### PERF-03. Detener render fuera de superficies Three

**Ticket / estado**

- `.scratch/dungeon-performance-batch-2026-08-01/issues/03-demand-render-loop.md`; cerrado.

**Baseline**

- El `requestAnimationFrame` corría desde boot aunque Welcome o Main Menu cubrieran el renderer.

**Implementado**

- Scheduler idempotente ligado a superficie visible, Welcome y `document.visibilityState`; una sola reanudación al entrar en Play/Creation/Debug.

**Resultado final**

- Main Menu durante 10 s: 216 → 216 frames/renders. Welcome puro no carga Three. Play: 10 → 207 frames/renders en 2 s.

**Evidencia de calidad**

- Partículas de pantalla `active`, foco en Continue, audio y navegación activos; sin frame negro observado al volver.

**Verificación**

- `bun test tests/render-loop-demand.test.ts`; recorrido CDP Welcome → Play → Main Menu → Continue/Creation.

**Riesgo residual**

- El lifecycle `frozen` de CDP no simula todos los navegadores móviles.

### PERF-04. Indexar colliders por espacio

**Ticket / estado**

- `.scratch/dungeon-performance-batch-2026-08-01/issues/04-spatial-colliders.md`; cerrado.

**Baseline**

- Jugador y enemigos recorrían toda la lista de colliders por consulta.

**Implementado**

- `WorldColliderSpatialIndex` estático por buckets de celdas, compartido por jugador y enemigos y sin allocations por consulta.

**Resultado final**

- 100.000 consultas: 1,62× con 23 colliders; 2,09× con 43; 14,69× con 900. Medición sintética enfocada.

**Evidencia de calidad**

- Candidatos, bloqueo, posiciones y rangos verticales coinciden con la búsqueda completa.

**Verificación**

- `bun test tests/grid-collision.test.ts` y tests del controlador/enemigos; `bun run typecheck:all`.

**Riesgo residual**

- La ganancia pequeña en mapas chicos crece con densidad; no se atribuye todo el delta de frame al índice.

### PERF-05. Escalonar LOS de fuegos

**Ticket / estado**

- `.scratch/dungeon-performance-batch-2026-08-01/issues/05-stagger-fire-los.md`; cerrado.

**Baseline**

- 24 fuegos podían concentrar 24 comprobaciones LOS en el mismo frame.

**Implementado**

- `FireLosScheduler` limita seis checks por frame y prioriza fuentes antiguas y cercanas.

**Resultado final**

- p99/máximo de checks por frame: 24 → 6 (-75%). Total de checks sin cambio; edad máxima 276,7 ms en 600 frames con gaps de 160 ms.

**Evidencia de calidad**

- Se mantienen fórmula de luz, fade y resultado LOS; solo cambia el reparto temporal.

**Verificación**

- `bun test tests/fire-los-scheduler.test.ts` y pruebas de fuegos/LOD.

**Riesgo residual**

- Oclusiones muy rápidas pueden tardar hasta el límite medido en reflejarse.

### PERF-06. Ocultar mallas de pickups dormidos

**Ticket / estado**

- `.scratch/dungeon-performance-batch-2026-08-01/issues/06-hide-dormant-pickups.md`; cerrado.

**Baseline**

- Pickups cerrados o recogidos retenían meshes visibles después del warm-up.

**Implementado**

- Estado dormido oculta Mesh/Line/Points, conserva root y luces y restaura el ensamblaje al reveal.

**Resultado final**

- Ocho kits: 78 → 0 → 78 meshes; tres luces estables. Captura enfocada: 425 → 222 calls (-47,8%) y p99 30 → 20 ms.

**Evidencia de calidad**

- Reveal, pickup activo, luces, programas precalentados y VFX conservados.

**Verificación**

- `bun test tests/pickup-stutter.test.ts`; captura Frost/critical revisada.

**Riesgo residual**

- Ninguno observado en la ruta cubierta.

### PERF-07. Compartir batches de cofres

**Ticket / estado**

- `.scratch/dungeon-performance-batch-2026-08-01/issues/07-global-chest-batches.md`; cerrado.

**Baseline**

- Doce cofres construían 60 meshes/geometrías de cuerpo y tapa.

**Implementado**

- Cinco batches globales: tres de cuerpo y dos de tapa; cada actor conserva root, bisagra y actualización de su única matriz.

**Resultado final**

- 60 → 5 meshes/geometrías (-91,7%). Build aislado mediano 255,633 → 168,923 ms (-33,9%; 1,51×) en cinco procesos.

**Evidencia de calidad**

- Bounds exactos por instancia, materiales, socket, colisión, reveal y tapa animada conservados. Cofre real abierto y autoactivado en Chrome.

**Verificación**

- `bun test tests/runtime-model-batching.test.ts`; benchmark aislado y captura de cofre.

**Riesgo residual**

- El update de matrices sigue siendo O(1) por tapa que cambia; no se midió una escena con cientos de cofres animados a la vez.

### PERF-08. Compartir batches de fuegos de pared

**Ticket / estado**

- `.scratch/dungeon-performance-batch-2026-08-01/issues/08-global-fire-batches.md`; cerrado.

**Baseline**

- El bucket visible `wall-fire` tenía 23 calls en la captura comparable; 12 assemblies aislados creaban 275 drawables/geometrías.

**Implementado**

- Batches globales por tipo/material para fixtures rígidos, incluidos `InstancedMesh` anidados; VFX, actor, luz, halo y LOD quedan por fuego.

**Resultado final**

- `wall-fire` 23 → 8 calls (-65,2%); visible total 184 → 169. Aislado: 275 → 65 drawables/geometrías (-76,4%).

**Evidencia de calidad**

- Silueta, color, sockets, animación, distancia LOD y luz conservados; lantern Frost revisado; p99 estable en 10,1 ms en la captura enfocada.

**Verificación**

- `bun test tests/runtime-model-batching.test.ts`; benchmark y captura lantern.

**Riesgo residual**

- El micro-build aislado sube 41,591 → 47,784 ms (+6,2 ms). Se acepta por reducir submits persistentes durante todo el run.

### PERF-09. Invalidar el minimap por cambios

**Ticket / estado**

- `.scratch/dungeon-performance-batch-2026-08-01/issues/09-minimap-invalidation.md`; cerrado.

**Baseline**

- Hasta 4,5 redraws/s y recreación de features aunque mapa y entidades no cambiaran.

**Implementado**

- Caché de features estáticas, revisión de mundo y celdas mutables reutilizadas; render solo ante invalidación observable.

**Resultado final**

- Idle: 4,5 → 0 redraws/s. 100.000 polls sintéticos: 88,496 → 2,959 ms (-96,65%).

**Evidencia de calidad**

- Jugador, enemigos, puertas, pickups, escaleras, piedras y exploración invalidan la misma vista pública.

**Verificación**

- `bun test tests/minimap-layout.test.ts` y pruebas de minimap/features.

**Riesgo residual**

- La cifra de CPU es microbenchmark; no se traduce directamente a tiempo percibido.

### PERF-10. Publicar telemetría solo bajo demanda

**Ticket / estado**

- `.scratch/dungeon-performance-batch-2026-08-01/issues/10-demand-diagnostics.md`; cerrado.

**Baseline**

- Un run normal ordenaba un snapshot y escribía 19 atributos `data-*` por segundo.

**Implementado**

- Publicación periódica solo con `perfAudit` o Debug; getters explícitos siguen disponibles.

**Resultado final**

- Run normal: 1 → 0 snapshots/s y 19 → 0 escrituras/s (-100%).

**Evidencia de calidad**

- QA, Debug, CRT adaptativo y las capturas de rendimiento conservan todos los campos cuando se solicitan.

**Verificación**

- Tests de telemetría/CRT y tres capturas finales con `perfAudit=1`.

**Riesgo residual**

- Ninguno observado.

## Verificación de integración

| Gate                                               | Resultado                                                             |
| -------------------------------------------------- | --------------------------------------------------------------------- |
| `bun test tests`                                   | 901 pass, 2 fail, 156.203 assertions, 9,73 s                          |
| `bun run typecheck:all`                            | pass                                                                  |
| `bun run lint`                                     | pass                                                                  |
| `bun run build`                                    | pass; 191 módulos; 1,49 s                                             |
| `git diff --check`                                 | pass; solo avisos LF/CRLF                                             |
| Chrome, tres muestras finales                      | pass; 0 errores de browser/red                                        |
| `bun run fmt:check`                                | fail; 80 archivos sin formato según defaults, sin configuración oxfmt |
| Archivos nuevos del lote, `oxfmt --check` enfocado | pass, 8 archivos                                                      |

Los dos fallos de tests son los mismos del baseline:

1. 15 WebP de pickup/stone sin registro en `assets-source/runtime-optimization-manifest.json`.
2. Golden de `StaticDungeonScene`: espera 14 pickups/173 props y el runtime existente produce 15/174.

## Experimentos neutrales o negativos

- PERF-08 añade 6,2 ms al micro-build de 12 fixtures; se conserva por la reducción persistente de 65,2% en calls visibles del bucket.
- Los triángulos visibles suben 5,2%; no es una ganancia y no implica más contenido creado. Los batches preservan geometría visual y reducen submits/recursos.
- La long task de arranque queda en 128–140 ms en las tres muestras. El baseline fue 0, 0 y 1.056 ms; la variación no permite afirmar mejora.
- No se aplicó `manualChunks` aislado porque no reduce bytes necesarios.
- Se rechazaron DPR, resolución, partículas, texturas o audio más bajos por romper el invariante de calidad.

## Decisiones y trade-offs

- Se aceptó el coste de build de PERF-08 por su beneficio continuo durante Play.
- A9 quedó fuera: `docs/architecture/WORKPLAN.md` exige aceptación separada.
- No se corrigieron los dos rojos baseline ni los 80 archivos de formato global porque no pertenecen al lote.
- No se hizo commit, push, deploy ni cambio remoto.

## Riesgos residuales

- Falta repetir el workload en Firefox, hardware integrado, móvil y una red/CDN real.
- La revisión visual fue humana sobre estados deterministas, no pixel diff exhaustivo.
- La cobertura de audio final no reproduce cada cue del catálogo.
- Los dos fallos baseline y el gate de formato global siguen abiertos y están fuera de este lote.

## Evidencia y artefactos

- Plan y mediciones: `.scratch/planning/2026-08-01-dungeon-performance-batch-2026-08-01/`
- Tickets: `.scratch/dungeon-performance-batch-2026-08-01/`
- Capturas finales: `.scratch/planning/2026-08-01-dungeon-performance-batch-2026-08-01/final/runtime-*/`
- Captura UI corregida: `.scratch/planning/2026-08-01-dungeon-performance-batch-2026-08-01/after-ui-alignment/welcome.png`
- HTML autocontenido: `.scratch/reports/performance-dungeon-escape-2026-08-01/index.html`
