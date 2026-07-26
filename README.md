# Dungeon Escape

Juego de exploración de mazmorras en primera persona. Genera una mazmorra, permite editar su mapa, jugarla en WebGL y guardar una partida local.

## Requisitos

- Bun 1.3.14 o posterior
- Un navegador WebGL moderno

## Inicio

```bash
bun install
bun run dev
```

Abre `http://127.0.0.1:24211/`.

Entradas incluidas:

- `/` — editor, depuración y partida
- `/forge.html` — Forge del mapa
- `/reliquary.html` — vista de altar

## Controles

| Entrada                  | Acción                  |
| ------------------------ | ----------------------- |
| Click en ENTRAR o escena | Captura el cursor       |
| WASD o flechas           | Mover                   |
| Ratón                    | Mirar                   |
| Shift                    | Correr                  |
| Espacio                  | Saltar                  |
| M                        | Mapa                    |
| R                        | Reiniciar semilla       |
| Esc                      | Liberar cursor          |
| 1 / 2 / 3                | CREATION / DEBUG / PLAY |

Los controles táctiles incluyen movimiento, giro, interacción y salto.

## Calidad local

```bash
bun run test
bun run typecheck
bun run build
bun run lint
bun run fmt:check
```

## Estructura

```text
src/
  authority/       cliente HTTP opcional
  domain/          parámetros y simulación local de Dungeon
  dungeon/         generación e importación de mapas
  editor/          proyección y vista del editor
  world/           escena y sistemas Three.js
public/assets/     recursos que carga el juego
tests/             pruebas Bun
scripts/           procesos de assets y capturas
docs/              guías técnicas y migración
```

La partida funciona con estado local. Se puede enlazar una autoridad HTTP compatible con `?authority=https://servidor.example`; el servicio debe exponer `/health` y las rutas `/v0` usadas por `src/authority/client.ts`.

## Documentación

- [Editor, mundo y salto](docs/DUNGEON-EDITOR-WORLD-JUMP.md)
- [Rendimiento y topología](docs/DUNGEON-PERFORMANCE-TOPOLOGY.md)
- [Audio](docs/AUDIO.md)
- [Extracción standalone](docs/STANDALONE.md)
