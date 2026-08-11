# Fuentes aprobadas de enemigos por bioma

Este paquete conserva las identidades aprobadas para los enemigos de Dungeon Escape.

El paquete contiene 121 identidades. Hay 11 enemigos para cada uno de los 11 biomas.

## Estructura

```text
biomes-v2/
  sources/<bioma>/<enemigo>.png
  prompts/<bioma>/<enemigo>.txt
  provenance/<bioma>/<enemigo>.json
  docs/ancient-animation-decisions.md
  manifest.json
  runtime-size-catalog.json
  verification-report.json
  ANIMATION-PLAN.md
```

`manifest.json` es el inventario principal. Cada entrada contiene las rutas, dimensiones, bytes y hashes SHA-256.

Los archivos de `sources/` son las identidades aprobadas. No contienen cuadros de animación.

`runtime-size-catalog.json` fija el ancho y el alto de las 121 identidades. También registra los límites del idle en el atlas actual.

Los archivos de `.scratch/biome-enemy-base-sprites/` conservan las iteraciones y los informes HTML. El runtime no depende de `.scratch`.

## Estado

- Identidades aprobadas: 121/121.
- Ancient: animaciones integradas en el runtime.
- Molten: 11/11 animaciones integradas vía Grok video + Lucida.
- Otros biomas: animaciones pendientes.

## Auditoría

Ejecuta esta instrucción desde la raíz del proyecto:

```powershell
python scripts/consolidate-biome-enemy-sources.py --verify-only
python scripts/generate-enemy-visual-size-catalog.py --check
```

La primera instrucción comprueba las fuentes aprobadas. La segunda comprueba el catálogo de tamaños y el archivo TypeScript generado.

CAUTION: No edites una fuente aprobada en el mismo archivo. Una modificación silenciosa invalida su identidad y su hash.

Si una identidad cambia, crea una versión nueva. Después, registra otra aprobación antes de producir animaciones.
