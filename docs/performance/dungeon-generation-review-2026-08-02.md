# Revisión de generación y pisos múltiples — 2026-08-02

## Alcance

Esta revisión cubre la generación procedural, los shafts, la conectividad derivada, los colliders de pisos elevados y el build residente de tres o cuatro pisos.

La construcción visual completa fue ejercitada offline. La verificación visual y de frames en navegador sigue abierta porque el contexto de página actual no respondió a CDP.

## Flujo auditado

1. `generateCompletableDungeon` crea cada mapa y comprueba los objetivos.
2. `createDungeonFloorCampaign` materializa el stack completo antes de devolver el control a Play.
3. `planStairShafts` selecciona un footprint entre cada par de pisos.
4. `applyStairShaftCarves` abre el grid para las escaleras.
5. `StaticDungeonScene.buildStack` crea la escena de cada piso.
6. `DungeonWorld` crea el índice espacial de los colliders.
7. La altura de soporte del jugador sólo cambia el piso lógico activo; no reconstruye la escena.

## Hallazgos

### DG-01. Asignaciones durante la planificación de shafts

`planStairShafts` creaba un array, objetos y un `Set` para cada combinación de celda y orientación.

El perfil CPU señaló `buildFootprint` como el segundo foco del generador. Ahora la puntuación usa coordenadas escalares y sólo materializa el footprint ganador.

### DG-02. Buffers de rutas recreados por cada edge

`findRoute` creaba tres buffers del tamaño del mapa para cada ruta. Ahora el generador reutiliza un workspace con marcas por generación.

### DG-03. Trabajo evitable en conectividad y loops

El flood fill creaba cuatro objetos por celda visitada. La selección de vecinos locales también recorría todos los edges por cada habitación.

Ambos recorridos ahora usan buffers y contadores compactos.

### DG-04. Metadata incorrecta de shafts

Cada piso recibía los footprints de todos los enlaces del stack. Esto podía abrir huecos visuales que no pertenecían al piso.

Cada piso ahora recibe sólo los enlaces que lo conectan. La conectividad y las estadísticas también se recalculan después del carve.

### MF-01. Un collider por celda elevada

Los pisos elevados creaban un AABB por celda transitable. Obsidian podía superar tres mil colliders sólo para el deck.

Ahora cada fila continua usa un collider. Los huecos de shafts no reciben soporte.

### MF-02. Cambio de piso con una ruta de carga heredada

`main.ts` todavía mantenía un `FloorTransitionDirector` capaz de bloquear input, hacer fade y volver a ejecutar `activateDungeon` al cambiar de piso.

Ese cableado fue retirado. Subir o bajar ahora sólo hace `bindDungeon` y `rebindActiveDungeon` según la altura de soporte del jugador. No hay generación, carga, fade ni teletransporte entre plantas.

### MF-03. Huecos incorrectos en plantas intermedias

Una planta intermedia abría su deck y su techo con la unión de los dos shafts. Esto dejaba sin soporte la boca de la escalera que debía subir al piso siguiente.

Ahora el shaft entrante abre sólo el suelo y el shaft saliente abre sólo el techo. Las direcciones también quedaron normalizadas: `up` apunta al piso superior y `down` al inferior.

### MF-04. Cofres y puertas reconstruidos por planta

Cada cofre y puerta recreaba su árbol de geometría detallada. Además, los batches globales se cerraban dentro del build de cada piso, por lo que las plantas posteriores quedaban fuera del batch correcto.

Los cofres ahora clonan un prototipo runtime de cinco meshes, las puertas clonan un prototipo por estilo y ancho, y ambos batches se cierran una sola vez después de construir el stack completo.

### DG-05. Materialización ambigua y primer piso duplicado

El factory devolvía una campaña lazy y podía regenerar el primer mapa ya aceptado al ampliar un dungeon a varias plantas.

El factory ahora entrega todos los pisos generados y enlazados. Cuando recibe un primer mapa válido, lo reutiliza y genera sólo los pisos restantes.

## Mediciones del generador

Entorno: Bun 1.3.14, Windows, tres warmups y 15 muestras por carga.

| Carga     | Pisos | Mediana anterior | Mediana final | p95 anterior | p95 final |
| --------- | ----: | ---------------: | ------------: | -----------: | --------: |
| Ancient   |     1 |          1,49 ms |       1,01 ms |      2,58 ms |   1,63 ms |
| Grim      |     2 |          4,96 ms |       3,64 ms |      8,64 ms |   6,93 ms |
| Obsidian  |     3 |         17,33 ms |       7,31 ms |     21,47 ms |  13,53 ms |
| Backrooms |     3 |         37,39 ms |      15,15 ms |     73,98 ms |  18,09 ms |

Las series no fueron intercaladas. La reducción de asignaciones y los perfiles CPU explican la mejora, pero el ruido del sistema aún afecta los extremos.

El nuevo contrato Backrooms de cuatro pisos se midió además en cinco procesos Bun frescos. La generación completa dio mediana 75,0 ms y rango 66,3–90,6 ms. Esta serie no se compara directamente con la tabla de 15 muestras calientes.

## Mediciones del build offline

La carga `OFFLINE-obsidian` usó el mismo stack antes y después del cambio de deck.

| Métrica                       |   Anterior |    Final |
| ----------------------------- | ---------: | -------: |
| Build de mundo, muestra única | 2.644,2 ms | 957,5 ms |
| Colliders totales             |      2.981 |      757 |

La medición de tiempo es direccional porque tiene una muestra por versión. La cardinalidad es determinista para este seed.

La carga final `MF-PERF-OBSIDIAN-BASE` dio una mediana offline de 787,7 ms en cinco muestras. El rango fue 739,3–836,8 ms.

En esa carga, los colliders del deck bajaron de 3.134 a 672. La reducción del deck fue 78,6 %.

## Build residente de cuatro pisos

Carga direccional equivalente: `MF-BACKROOMS-4-BUILD`, cuatro mapas de 121×121, misma máquina y harness offline.

| Métrica             | Antes del batch global |      Final |      Delta |
| ------------------- | ---------------------: | ---------: | ---------: |
| Build del stack     |             3.797,7 ms | 1.449,9 ms |    -61,8 % |
| Objetos en escena   |                  6.012 |      4.804 |    -20,1 % |
| Colliders           |                  2.237 |      2.237 | sin cambio |
| Escaleras completas |                      3 |          3 | sin cambio |

Es una medición direccional de una muestra por versión. La cardinalidad es determinista para el seed.

Como cierre, `MF-BACKROOMS-4-FINAL` se ejecutó en cinco procesos frescos: mediana de build 1.062,3 ms, rango 1.007,4–1.165,5 ms. Cada resultado contenía cuatro pisos, tres vuelos completos, 2.448 colliders y 10.233 celdas de piso.

## Segunda pasada: carga percibida

La distribución del generador se amplió antes de dividir más módulos. En 400 pisos Backrooms de 121×121:

- mediana: 3,13 ms;
- p95: 6,40 ms;
- p99: 9,00 ms;
- máximo: 26,75 ms, correspondiente al primer caso frío;
- 400 de 400 layouts fueron completos con salt `0`, sin reintentos de completitud.

En 40 stacks de cuatro pisos, la mediana fue 26,29 ms, el p95 fue 35,12 ms y el máximo fue 41,05 ms. La cola del generador no explica la espera visible.

El perfil del build señaló dos costos repetidos: cada recompensa reconstruía geometría detallada y cada planta volvía a crear las plantillas de mobiliario que ya tenían batches cacheados.

Ahora:

- cada clase de recompensa conserva una plantilla geométrica;
- cada instancia clona su material para mantener opacidad, glow y recolección independientes;
- las plantillas de mobiliario clásico se reutilizan entre plantas y rebuilds;
- los cuatro grafos de piso permanecen residentes;
- el piso activo y sus vecinos directos quedan renderizables, de modo que el tramo de escalera siempre mantiene ambos extremos visibles;
- colliders, pickups, cofres, puertas y las tres escaleras siguen materializados desde el build inicial.

En el mismo harness `LOAD-PROFILE-BACKROOMS-4`, la mediana caliente anterior era 746,25 ms. Cinco procesos finales dieron medianas de 481,30, 465,47, 454,87, 469,83 y 423,27 ms; la mediana de esas medianas es 465,47 ms. La reducción direccional es 37,6 % sin reducir meshes, pickups, colliders ni escaleras.

## Verificación

- `bun test tests/dungeon-floors.test.ts tests/multi-floor-smoke.test.ts tests/biome-campaign.test.ts tests/staircase-kit.test.ts tests/story-metrics.test.ts tests/run-resume-mapping.test.ts tests/static-dungeon-scene.test.ts tests/runtime-model-batching.test.ts tests/door-leaf-presentation.test.ts tests/chest-presentation.test.ts tests/chest-potion-flow.test.ts`
- Resultado: 52 pruebas pasan.
- `bun run build`
- Resultado: pasa; incluye los tres typechecks y el build Vite de producción.
- `bun run lint`
- Resultado: pasa con un warning heredado en `MaterialLibrary.ts`.
- `bun test tests`
- Resultado: 977 pruebas pasan y 2 fallan fuera de este cambio.

Los fallos completos son el assert de texto heredado en `biome-sprite-decor.test.ts` y registros faltantes del manifest de assets.

Las pruebas comprueban estos contratos:

- Los shafts sólo abren los pisos conectados.
- Las celdas nuevas quedan incluidas en distancias y estadísticas.
- Todos los decks transitables tienen soporte.
- Los huecos de shafts permanecen abiertos.
- El stack mantiene shafts recíprocos y deterministas.
- El factory devuelve cuatro pisos ya materializados y no duplica el primer mapa aceptado.
- Las tres escaleras físicas existen desde el build inicial.
- Todos los cofres y marcos de puerta de las cuatro plantas quedan dentro de su batch global.
- La ruta de rebind no puede llamar `activateDungeon`, `buildDungeon`, fade ni `setDungeon`.

### Segunda pasada

- `bun test tests/static-dungeon-scene.test.ts tests/multi-floor-smoke.test.ts tests/runtime-model-batching.test.ts tests/chest-presentation.test.ts tests/chest-potion-flow.test.ts`
- Resultado: 27 pruebas pasan.
- `bun test tests`
- Resultado: 977 pruebas pasan y permanecen los mismos 2 fallos heredados descritos arriba.
- `bun run build`
- Resultado: pasa los tres typechecks y el build Vite de producción.
- `bun run lint`
- Resultado: pasa con el mismo warning heredado en `MaterialLibrary.ts`.
- `git diff --check`
- Resultado: pasa; Git sólo informa la conversión de finales de línea ya existente en el checkout.

## Ledger del perfil

| Referencia                                                            | Usada | Evidencia                                       |
| --------------------------------------------------------------------- | ----- | ----------------------------------------------- |
| `threejs-debug-profiler/references/debug-profile-checklists.md`       | Sí    | Ruta reproducible, owner y límites de navegador |
| `threejs-debug-profiler/references/checklists/performance-profile.md` | Sí    | Generación, build, colliders y perfil CPU       |

Artefacto CPU: `.scratch/profiles/dungeon-generation-audit/CPU.71658019886.30664.cpuprofile`.

## Riesgo restante

La prueba de navegador no produjo métricas finales de frame, draw calls ni screenshots.

`Runtime.evaluate` agotó límites de 12, 20 y 45 segundos. El fallo ocurrió en Frost y Obsidian, en desarrollo y preview.

La segunda pasada también agotó 60 segundos tanto con Chrome instalado como con el Chromium empaquetado por Playwright. Ambos procesos de auditoría se cerraron después del timeout; no se obtuvo telemetría de renderer.

Este resultado impide atribuir el bloqueo a los pisos múltiples. Se necesita una sesión de navegador sin la contención actual para cerrar el gate visual y de frame.
