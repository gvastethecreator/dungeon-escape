# Plan de producción de animaciones

## Objetivo

Cada enemigo tendrá una animación de movimiento y una animación de ataque.

Cada estado usa cuatro cuadros. Para los diez biomas posteriores a Ancient, cada identidad parte de dos videos: uno de movimiento y uno de ataque. El selector analiza varios candidatos temporales y compone una hoja `2x2` por estado con los cuatro cuadros elegidos.

## Contrato fijo

- Cámara: frontal FPS, a la altura del jugador.
- Movimiento: `idle`, `fase A`, `idle exacto`, `fase B`.
- Ataque: `idle exacto`, `anticipación`, `contacto`, `idle exacto`.
- Fuente visual: `sources/<bioma>/<enemigo>.png`.
- Fondo normal: negro puro.
- Excepción: White-Eyed Shadow usa gris `#808080`.
- Recorte: Lucida, revisión `6ee11122534c8de59402a589d2293c198cfbf848`.
- Segmentación: adaptativa, con límites variables por cuadro.
- Registro de producción: celda `512x512`.
- Exportación runtime: celda `160x160`.
- Pivot runtime: X `80`, base `152`.
- Tamaño corporal: `runtime-size-catalog.json`.
- Proveedor principal de animación: Grok Imagine video.
- Límite de producción: exactamente dos videos por identidad; no regenerar después de sellar el lote.
- Reparación excepcional: Imagegen sobre la identidad base o una hoja `2x2`, con procedencia mixta registrada.

Los idles repetidos deben ser idénticos por píxel. La similitud visual no cumple este requisito.

## Escala corporal fija

Cada identidad usa el ancho y el alto de `runtime-size-catalog.json`.

La altura fija la escala corporal. El ancho conserva la proporción del sprite base aprobado.

Usa el mismo factor de escala en X e Y. No estires el cuadro para cubrir el ancho y el alto por separado.

Calcula el encuadre del atlas con el primer idle. No uses una zancada, un ala o un ataque para calcularlo.

Después de empaquetar un atlas, ejecuta esta instrucción:

```powershell
python scripts/generate-enemy-visual-size-catalog.py
```

Si cambia una fuente base aprobada, registra la nueva aprobación antes de ejecutar la instrucción.

## Contrato anatómico obligatorio

Antes de generar una criatura, registra estos campos:

1. Define la anatomía real de la identidad aprobada.
2. Define la fuente principal del movimiento.
3. Define la anatomía que produce el ataque.
4. Selecciona un ancla estable.
5. Lista los rasgos que deben permanecer iguales.
6. Lista los errores que invalidan la hoja.

No reutilices un movimiento bípedo para una criatura alada, flotante, amorfa o con varias patas.

No uses un golpe genérico con la mano derecha como ataque por defecto.

## Anclas por anatomía

| Anatomía      | Movimiento                                   | Ancla inicial               | Errores bloqueantes                                          |
| ------------- | -------------------------------------------- | --------------------------- | ------------------------------------------------------------ |
| Bípeda        | Pasos completos alternados y brazos opuestos | `body-bottom`               | Rodillas casi estáticas, pie repetido, torso aplastado       |
| Cuadrúpeda    | Grupos de apoyo y transferencia de peso      | `footprint` o `body-bottom` | Balanceo lateral, pose reflejada                             |
| Varias patas  | Grupos diagonales o alternados               | `body-bottom`               | Una pata móvil, un solo costado móvil                        |
| Alada         | Fases bilaterales coordinadas                | `center`                    | Alas estáticas, alternancia de una sola ala, cuerpo reducido |
| Flotante      | Sudario, membranas o zona inferior           | `center`                    | Pasos terrestres, balanceo completo                          |
| Amorfa        | Pliegues, ondas o contracciones localizadas  | `body-bottom` o `center`    | Pasos falsos, pérdida de masa                                |
| Personalizada | Mecánica declarada para esa identidad        | Pivot del juego             | Movimiento bípedo genérico                                   |

## Orden de producción

| Orden | Bioma     | Estado           |
| ----: | --------- | ---------------- |
|     1 | Ancient   | Integrado        |
|     2 | Molten    | 11/11 integradas |
|     3 | Frost     | 11/11 integradas |
|     4 | Grim      | 11/11 integradas |
|     5 | Verdant   | 11/11 integradas |
|     6 | Ash       | 11/11 integradas |
|     7 | Iron      | 11/11 integradas |
|     8 | Obsidian  | 11/11 integradas |
|     9 | Sunken    | 11/11 integradas |
|    10 | Fungal    | 11/11 integradas |
|    11 | Backrooms | 11/11 integradas |

Termina un bioma antes de iniciar el siguiente. Mantén la aprobación individual por criatura.

## Preparación del lote Molten

| Enemigo           | Anatomía inicial | Fuente de movimiento                 | Dirección inicial del ataque             |
| ----------------- | ---------------- | ------------------------------------ | ---------------------------------------- |
| Carrion           | Cuadrúpeda baja  | Antebrazos y apoyos traseros         | Presión frontal y mordida térmica        |
| Goblin            | Bípeda           | Pasos alternados                     | Ataque corto según sus manos y mandíbula |
| Ghost             | Flotante         | Pulso de membranas inferiores        | Convergencia frontal de membranas        |
| Ratling           | Corredora baja   | Patas alternadas y retraso de cola   | Mordida o embestida frontal              |
| Husk              | Bípeda alta      | Marcha pesada alternada              | Alcance frontal de ambos brazos          |
| Imp               | Alada            | Batido bilateral                     | Ataque frontal con alas activas          |
| Zombie Orc        | Bípeda pesada    | Pasos completos alternados           | Ataque de orco según su equipo visible   |
| Spider            | Varias patas     | Grupos diagonales                    | Boca central y patas delanteras          |
| Bone Slime        | Amorfa           | Contracciones inferiores localizadas | Jaula ósea y masa frontal                |
| White-Eyed Shadow | Bípeda           | Caminata frontal sutil               | Agarre bilateral amenazante              |
| Carrion Stalker   | Cuadrúpeda baja  | Apoyos diagonales                    | Mordida y convergencia de extremidades   |

Esta tabla es un borrador técnico. La revisión visual de cada identidad fija el contrato final.

## Flujo por criatura

1. Crea un run nuevo bajo `.scratch/biome-enemy-animation-spritesheets/runs/<bioma>/`.
2. Usa la fuente durable como `identity-anchor`.
3. Escribe `creature_motion` antes de generar imágenes.
4. Prepara dos prompts anatómicos con `spritesheet-expert`: movimiento y ataque, cámara fija y fondo negro.
5. Genera exactamente un video por estado.
6. Analiza todos los cuadros y conserva varios ciclos candidatos, no sólo una muestra uniforme.
7. Usa el selector/editor mínimo para elegir cuatro cuadros cronológicos por estado y componer las hojas `2x2`.
8. Registra los videos, los cuadros elegidos, sus tiempos y la procedencia exacta.
9. Ejecuta Lucida antes de la segmentación adaptativa.
10. Revisa el matte, los límites variables y que ninguna anatomía toque el borde.
11. Registra los cuadros con el ancla anatómica aprobada sin deformar ni cambiar la escala corporal.
12. Produce el atlas, el playback, los onion skins y el workbench.
13. Ejecuta los controles de identidad, alineación, movimiento y ataque.
14. Registra la revisión visual ligada a hashes; una reparación invalida la revisión anterior.
15. Promueve sólo el candidato aprobado al paquete durable y al runtime.

## Evidencia obligatoria

Cada candidato debe incluir estos archivos:

- `sprite-request.json`.
- `source-provenance.json`.
- Los dos videos originales y sus manifiestos de proveedor.
- Las hojas `2x2` compuestas con los cuadros elegidos y sus tiempos.
- La fuente Imagegen y su plan de reparación cuando exista una excepción.
- El manifiesto de cuadros segmentados.
- La revisión del matte.
- La revisión de segmentación adaptativa.
- La superposición de registro.
- Los onion skins.
- Los playbacks de movimiento y ataque.
- El informe de identidad.
- El informe de contratos de animación.
- `qa/preview-workbench/index.html`.
- El candidato runtime `640x320`.

## Puertas de aprobación

Una comprobación numérica no aprueba una animación. La reproducción cronológica y la revisión del usuario cierran cada criatura.

No promociones una hoja con cortes, escala variable, anatomía incorrecta, vista 3/4 o alineación inestable.
