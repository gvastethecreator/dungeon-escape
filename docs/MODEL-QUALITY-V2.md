# Calidad de modelos 3D v2

Actualizado: 2026-07-28

Este documento fija el contrato de fuentes, reconstrucción, materiales, prueba visual y coste de los modelos low-poly v2. Las cifras describen el checkout actual. Los cierres globales quedan sujetos a las puertas pendientes del final.

## Estado del corte

| Puerta                                  | Estado                      | Prueba actual                                                          |
| --------------------------------------- | --------------------------- | ---------------------------------------------------------------------- |
| 55 referencias ImageGen                 | Verificada                  | 55 archivos, 55 estados `accepted-reference` y 55 SHA-256 válidos      |
| PBR compartido                          | Verificación focal          | 11 roles, 55 mapas de 512 px y hashes válidos                          |
| Puertas por bioma                       | Verificación focal          | 11 placas, 33 mapas y división central dentro de tolerancia            |
| Cofre de autor y lote de runtime        | Verificada                  | 131 mallas de autor; 5 mallas de runtime; pivote y sockets preservados |
| Model Lab                               | Verificación focal          | Catálogo de 55, seis cámaras, carga terminal y métricas por modelo     |
| Matriz del cofre Ancient/Frost/Obsidian | Parcial, 8/9                | Falta `frost/rear-left` en la carpeta de prueba actual                 |
| Familia `magic`                         | **PENDIENTE**               | Mantener abierta hasta recibir las cifras finales                      |
| Barrido de 55 modelos × 3 vistas        | **PENDIENTE: 165 capturas** | El comando existe; falta registrar el manifiesto final completo        |
| Rendimiento del mundo real              | **PENDIENTE**               | Hay línea base; faltan p95, p99, máximo y deltas finales comparables   |

Una puerta focal valida su porción y sus artefactos. El cierre del programa exige los tres pendientes anteriores, la ruta real, la suite final y la revisión visual.

## Contrato de las 55 referencias

La fuente canónica es `assets-source/imagegen/model-references-v2/manifest.json`. Cada entrada apunta a una hoja propia y conserva su SHA-256. El cofre aceptado en `carpentry/treasure-chest-three-view.png` fija estilo, fondo y composición.

| Categoría    | Cantidad |
| ------------ | -------: |
| Arquitectura |       12 |
| Carpintería  |       13 |
| Iluminación  |        6 |
| Magia        |        9 |
| Colgantes    |        7 |
| Ambiente     |        8 |
| **Total**    |   **55** |

El manifiesto también registra 34 objetos repetidos, 7 de ambiente y 14 héroe. Hay 42 reconstrucciones directas y 13 condicionales.

Cada hoja debe cumplir estas reglas:

- un objeto y tres vistas coherentes: frente, perfil derecho y tres cuartos trasero izquierdo;
- igual escala, altura de cámara, proporciones, piezas, materiales y desgaste en las tres vistas;
- frente y perfil sin deformación de perspectiva; la vista trasera debe mostrar montaje, bisagras, sockets o construcción oculta;
- forma low-poly con masas legibles, biseles medidos y uniones claras;
- acabado grim pixel-PBR sobre fondo gris cálido, luz pareja y sin escena, rótulos ni marco;
- albedo sin sombra dura, brillo o oclusión pintados;
- maestros y prompts bajo `assets-source/`; estas hojas quedan fuera del paquete `public/`.

La hoja completa guía el juicio visual. Los validadores reciben tres recortes, uno por vista, para evitar que las tres siluetas se lean como objetos separados.

## Flujo `img2threejs`

El cierre por objeto sigue este orden:

1. Probar la imagen y admitir cada recorte de vista.
2. Crear la evaluación previa con clase, complejidad, riesgos y contrato de calidad.
3. Registrar un inventario de detalle. Cada rasgo crítico debe llegar a una pieza o a una regla de material.
4. Crear el spec con jerarquía, dimensiones, materiales, pivotes, sockets, colliders, grupos de rotura y límites.
5. Ejecutar `forge/next.py`, validar el spec y pasar `--strict-quality`.
6. Extraer evidencia PBR por recorte. Una confianza menor que `0.7` pide mejor entrada o revisión.
7. Construir por pases bloqueados: bloque, estructura, forma, material, luz, interacción y ajuste de coste.
8. Comparar render y referencia en frente, perfil y tres cuartos. Cada pasada elige una acción: continuar, corregir spec, corregir código, pedir entrada o detenerse.
9. Probar montaje, acción y presupuesto en la factory que usa el juego.

Los artefactos viven en `.scratch/img2threejs/model-references-v2/<categoria>/<id>/`. Según la familia, incluyen `views/`, `intake/`, `assessment.json`, `detail-inventory.json`, `spec.json`, `pbr-evidence.json`, `parts-manifest.json`, `renders/` y `review/`.

El spec debe describir forma y acción. Un JSON válido, una captura frontal o una puntuación global no cubren por sí solos el montaje ni las vistas laterales.

## Geometría y materiales

Las factories del juego conservan nombres de pieza, escala, collider, pivotes, sockets y estado. Las partes móviles quedan fuera de uniones estáticas. Los sólidos deben tener frente, costados, trasera y base cuando la referencia o la cámara de juego puedan verlos.

Los cortes ya revisados añadieron volumen cerrado, espesor trasero, uniones, herrajes y siluetas propias a carpintería, arquitectura, luces, colgantes y piezas de ambiente. La validación global de los 55 sigue abierta por `magic` y el barrido de 165.

### PBR compartido

`scripts/build-model-material-pbr.py` crea cinco canales independientes por rol: albedo, altura, normal, rugosidad y AO. El albedo usa color sRGB; los otros canales usan datos lineales. El runtime aplica `MirroredRepeatWrapping` a los cinco canales.

Los 11 roles actuales son:

`aged-oak`, `black-iron`, `dull-brass`, `dungeon-stone`, `ash-ceramic`, `aged-bone`, `woven-cloth`, `dungeon-ice`, `arcane-crystal`, `root-bark` y `ochre-painted-steel`.

El manifiesto de producción está en `assets-source/runtime-metadata/textures/model-materials-v2/manifest.json`: 11 roles × 5 mapas. Los WebP de runtime miden 256 px; el manifiesto conserva las métricas de los maestros de 512 px.

La textura aporta respuesta de superficie. La geometría sigue a cargo de la factory; un normal map no sustituye espesor, bisagras o una silueta válida.

## Puertas simples por bioma

Cada bioma usa una placa ImageGen cuadrada para el frente completo de dos hojas. La mitad izquierda ocupa `U 0..0.5`; la derecha ocupa `U 0.5..1`. Los mapas usan `ClampToEdgeWrapping`.

| Bioma     | Dirección de superficie                          |
| --------- | ------------------------------------------------ |
| Ancient   | Roble envejecido, bandas rúnicas e hierro opaco  |
| Molten    | Madera carbonizada, basalto e incrustación roja  |
| Frost     | Madera pálida tocada por hielo y metal azul frío |
| Grim      | Madera oscura gastada e hierro gris              |
| Verdant   | Madera oliva con musgo y bandas de enredadera    |
| Ash       | Madera gris ceniza y marcas de cobre gastado     |
| Iron      | Placas de hierro carbón y bandas remachadas      |
| Obsidian  | Placas violeta-negras y juntas talladas          |
| Sunken    | Madera teal gastada por agua y bronce opaco      |
| Fungal    | Madera púrpura y marcas fúngicas apagadas        |
| Backrooms | Paneles de acero ocre desgastado                 |

El constructor genera maestros de 512 px: 11 biomas × 3 mapas = 33. La división detectada queda a un máximo absoluto de 4 px del centro; el contrato admite hasta 8 px. Las fuentes y el manifiesto están en `assets-source/imagegen/biome-door-textures-v2/`; los mapas WebP de juego miden 256 px y están en `public/assets/textures/biomes/<bioma>/door*.webp`.

La puerta de mazmorra usa dos cajas cerradas, una por hoja, más marco y herrajes. La versión actual mide 5 mallas, 848 triángulos y 3 materiales. La puerta de oficina mide 5 mallas, 448 triángulos y 3 materiales. Los barriles de bisagra y anillas quedan como herraje 3D; la oficina conserva barras de empuje y placa baja.

La evidencia visual final de las once vistas frontales está en `.scratch/planning/2026-07-28-dungeon-models-low-poly/biome-door-runtime/final/`. Las tres vistas `*-v2.png` de Ancient, Frost, Obsidian y Backrooms están en la carpeta superior `biome-door-runtime/`.

## Cofre: detalle de autor y coste de runtime

El cofre de autor conserva una jerarquía completa para Model Lab y revisión:

| Medida            |                   Valor |
| ----------------- | ----------------------: |
| Mallas            |                     131 |
| Geometrías        |                     114 |
| Triángulos        |                   4.952 |
| Lotes de material |                       3 |
| Límites XYZ       | 1.409 × 1.119 × 0.857 m |

`batchForgeChestForRuntime` une por material y estado de sombra, separado entre cuerpo y tapa. El resultado tiene 3 lotes de cuerpo y 2 de tapa: 5 mallas. Mantiene los mismos límites y materiales, el pivote de tapa con eje `[1, 0, 0]`, y los sockets `Chest loot socket` y `Chest interaction socket`. La integración ocurre antes de añadir y registrar el cofre en `StaticDungeonScene`.

Este lote reduce mallas y llamadas. Conserva los 4.952 triángulos. La prueba mueve la tapa tras unir geometría para verificar que el pivote sigue activo.

Las tres vistas PBR finales están en:

- `.scratch/img2threejs/model-references-v2/carpentry/treasure-chest/renders/final-v2-front-material.png`
- `.scratch/img2threejs/model-references-v2/carpentry/treasure-chest/renders/final-v2-right-material.png`
- `.scratch/img2threejs/model-references-v2/carpentry/treasure-chest/renders/final-v2-rear-three-quarter-material.png`

## Model Lab y matriz de biomas

`model-lab.html` carga la misma factory que usa el juego y publica `window.__MODEL_QA__`. Acepta:

```text
/model-lab.html?model=<id>&view=<front|right|back|left|rear-left|top>&mood=<bioma|neutral>
```

El estado terminal incluye modelo, vista, bioma, errores, límites y métricas de triángulos, geometrías, materiales, texturas y llamadas. La barrera de mapas espera hasta 20 s. El capturador CDP usa 1280 × 960, audita consola y red, y concede hasta 45 s para una carga fría.

`scripts/cdp-model-lab.ts --all` deriva 55 modelos del manifiesto y tres vistas por modelo. El resultado esperado son 165 PNG y un `capture-manifest.json`. Este barrido permanece **PENDIENTE**.

La matriz de estrés usa la luz real de `LightingRig` para Ancient, Frost y Obsidian. El cofre tiene este corte:

| Bioma    | Frente   | Perfil derecho | Trasera izquierda | Estado |
| -------- | -------- | -------------- | ----------------- | ------ |
| Ancient  | Presente | Presente       | Presente          | 3/3    |
| Frost    | Presente | Presente       | **Pendiente**     | 2/3    |
| Obsidian | Presente | Presente       | Presente          | 3/3    |

Los ocho archivos actuales están en `.scratch/planning/2026-07-28-dungeon-models-low-poly/material-mood-proof/<bioma>/`. Estas capturas prueban lectura del cofre bajo tres luces. El mundo real y el coste de frame requieren otra prueba.

La revisión final-v2 de iluminación está en:

- `.scratch/img2threejs/model-references-v2/lighting/visual-review.md`
- `.scratch/img2threejs/model-references-v2/lighting/captures/` — 18 vistas finales y reportes;
- `.scratch/img2threejs/model-references-v2/lighting/captures-runtime/` — pared, luz y cámara de juego para la linterna;
- `.scratch/img2threejs/model-references-v2/lighting/captures-model-lab/` — frente, derecha y trasera de la linterna en Model Lab.

La revisión aislada de las seis luces pasó sus 18 capturas. Su luz de revisión incluye relleno para inspeccionar forma. El reporte de runtime de la linterna usa la mezcla del juego y queda separado.

## Presupuestos y línea base

| Clase    | Objetivo de triángulos | Máximo | Máximo de lotes |
| -------- | ---------------------: | -----: | --------------: |
| Repetido |                  1.500 |  3.000 |               3 |
| Ambiente |                    800 |  1.200 |               3 |
| Héroe    |                  3.000 |  5.000 |               6 |

La línea base previa al cierre v2 registró:

| Ruta            | Llamadas | Triángulos | Geometrías | Texturas | Materiales | Programas |
| --------------- | -------: | ---------: | ---------: | -------: | ---------: | --------: |
| Mundo Frost     |      419 |    244.796 |        348 |       68 |        270 |       101 |
| Forge, 42 salas |      377 |   ~236.000 |          — |        — |          — |         — |

Estas cifras sirven como línea base. El resultado final de rendimiento permanece **PENDIENTE**. La medición debe repetir la misma ruta y registrar, como mínimo, frame gap p95, p99 y máximo; gaps sobre 25 y 33 ms; tareas largas; llamadas; triángulos; geometrías; materiales; texturas; programas y estabilidad tras calentamiento.

## Rutas de evidencia

| Contenido                               | Ruta                                                                                    |
| --------------------------------------- | --------------------------------------------------------------------------------------- |
| Contrato y roster                       | `assets-source/imagegen/model-references-v2/README.md` y `manifest.json`                |
| Hojas y prompts                         | `assets-source/imagegen/model-references-v2/<categoria>/` y `prompts/`                  |
| Maestros PBR                            | `assets-source/imagegen/material-textures-v2/`                                          |
| Manifiesto PBR de producción            | `assets-source/runtime-metadata/textures/model-materials-v2/manifest.json`              |
| Maestros de puertas                     | `assets-source/imagegen/biome-door-textures-v2/`                                        |
| Specs y prueba por objeto               | `.scratch/img2threejs/model-references-v2/<categoria>/<id>/`                            |
| Métricas de colgantes y ambiente        | `.scratch/img2threejs/model-references-v2/runtime-metrics.json`                         |
| Revisión de arquitectura                | `.scratch/img2threejs/model-references-v2/architecture/ARCHITECTURE-REVIEW.md`          |
| Métricas de arquitectura                | `.scratch/img2threejs/model-references-v2/architecture/metrics-v2.json`                 |
| Contactos y renders de carpintería      | `.scratch/img2threejs/model-references-v2/carpentry/`                                   |
| Revisión y capturas de luz              | `.scratch/img2threejs/model-references-v2/lighting/`                                    |
| Línea base, puertas, Model Lab y matriz | `.scratch/planning/2026-07-28-dungeon-models-low-poly/`                                 |
| Estado durable                          | `.scratch/planning/2026-07-28-dungeon-models-low-poly/{task_plan,findings,progress}.md` |

## Comandos de validación

Reconstruir mapas deterministas:

```powershell
python scripts/build-model-material-pbr.py
python scripts/build-biome-door-textures.py
```

Validar un spec desde la skill:

```powershell
$img2threejs = 'D:\DEV\agents-matrix\skills\img2threejs'
python "$img2threejs\forge\next.py" '.scratch\img2threejs\model-references-v2\<categoria>\<id>\spec.json'
python "$img2threejs\forge\stage2_spec\validate_sculpt_spec.py" `
  '.scratch\img2threejs\model-references-v2\<categoria>\<id>\spec.json' --strict-quality
```

Prueba focal de contratos. Este comando pasó en el corte actual con 18 pruebas, 0 fallos y 1.008 comprobaciones:

```powershell
bun test tests/runtime-model-batching.test.ts `
  tests/model-material-textures-v2.test.ts `
  tests/biome-door-textures-v2.test.ts `
  tests/model-lab.test.ts
```

Pruebas de familias:

```powershell
bun test tests/model-architecture-v2.test.ts `
  tests/model-architecture-family-v2.test.ts `
  tests/model-carpentry-v2.test.ts `
  tests/model-lighting-v2.test.ts `
  tests/model-atmosphere-v2.test.ts `
  tests/runtime-model-batching.test.ts
```

Captura neutral completa, pendiente de cierre, con `bun run dev` activo en otra consola:

```powershell
bun run scripts/cdp-model-lab.ts `
  .scratch/model-quality-v2/final-neutral --all
```

Ejemplo de matriz por bioma en otra consola, con el servidor activo:

```powershell
$env:MODEL_QA_MOOD = 'ancient'
bun run scripts/cdp-model-lab.ts `
  .scratch/model-quality-v2/ancient `
  treasure-chest:front:chest-front `
  treasure-chest:right:chest-right `
  treasure-chest:rear-left:chest-rear-left
Remove-Item Env:MODEL_QA_MOOD
```

Puertas de cierre global, aún pendientes:

```powershell
bun run typecheck:all
bun run lint
bun run fmt:check
bun run test
bun run build
```

## Límites

- Una hoja de tres vistas deja zonas ocultas. Fondos, bases y uniones invisibles llevan una aproximación low-poly explícita.
- La extracción PBR infiere canales desde una imagen. Sus mapas y su confianza necesitan revisión en render.
- Model Lab prueba factories, mapas, cámaras y límites en una escena controlada. La ruta real añade paredes, sombras, VFX, interacción, carga y culling.
- El relleno de una escena de revisión ayuda a leer la forma y queda fuera de la prueba de luz del juego.
- Las capturas de Ancient, Frost y Obsidian son prueba visual. La matriz actual del cofre tiene 8 de 9 tomas.
- El lote del cofre reduce mallas y llamadas. Su coste de triángulos sigue en 4.952.
- Las líneas base de Frost y Forge no fijan el resultado v2. El cierre de rendimiento requiere una ruta repetible con p95, p99 y máximo.
- `magic`, el barrido de 165 y la medición final siguen abiertos. Este documento no atribuye resultados a esas puertas.
