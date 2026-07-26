# Extracción standalone

## Objetivo

`D:\DEV\dungeon-escape` contiene una copia autónoma de Dungeon Escape. El árbol de origen en `D:\DEV\blackflag.club\apps\dungeon` sigue intacto para proteger trabajo concurrente.

## Contenido trasladado

- Código de juego, editor, Forge y vista de reliquario.
- Assets públicos, fuentes de assets, scripts, pruebas y documentación.
- Contratos de parámetros, simulación de Dungeon y cliente de autoridad dentro de `src/`.

## Directorios excluidos

La extracción omite directorios generados o ligados a una máquina: `node_modules`, `dist`, `.venv-pbr`, `.scratch` y `.proof-hud`.

## Fronteras actuales

| Área                         | Propietario local           | Uso                                       |
| ---------------------------- | --------------------------- | ----------------------------------------- |
| Parámetros y contratos base  | `src/domain/core.ts`        | Validación y valores de generación        |
| Estado y comandos de Dungeon | `src/domain/runtime.ts`     | Estado local, proyección y sincronización |
| Autoridad remota opcional    | `src/authority/client.ts`   | API HTTP bajo demanda                     |
| Escena y controles           | `src/world/`, `src/player/` | Presentación Three.js                     |

El juego comienza en estado local. El parámetro `authority` activa el cliente HTTP cuando existe un servicio compatible.

## Próximo corte seguro

Tras validar el proyecto nuevo en el entorno objetivo, se puede decidir si el monorepo conserva su copia como referencia o si se retira mediante una tarea separada. Esa decisión requiere revisar el trabajo concurrente del árbol original.
