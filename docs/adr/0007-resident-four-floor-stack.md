# ADR 0007: Stack residente de hasta cuatro pisos

Status: accepted

Date: 2026-08-02

## Contexto

ADR 0004 limita la campaña a tres pisos residentes y deja un rebuild en la ruta normal de escaleras.
ADR 0006 materializa sólo el Active floor con un cache lazy determinista. El usuario decidió que una
`Dungeon floor campaign` puede tener de uno a cuatro pisos, con todos listos antes de que Play acepte input.

## Decisión

- Una `Dungeon floor campaign` contiene de uno a cuatro pisos hermanos en un `Dungeon floor stack`.
- Antes de que Play libere input, genera y construye todo el `Dungeon floor stack`. Cada piso queda
  residente durante la active run.
- La geometría de `Stair shaft` sigue caminable. El jugador sube sus treads de forma continua, sin prompt.
- La altura de soporte selecciona el `Active floor` y hace el rebind lógico. Sólo selecciona la lógica,
  visibilidad y updates de ese piso.
- `DungeonWorld` sigue como facade de Play según
  [ADR 0002](0002-dungeon-world-remains-play-facade.md). `PlayRuntime` sigue como owner del orden de Play según
  [ADR 0001](0001-play-runtime-owns-play-order.md).

### Ruta normal

La ruta normal de escaleras no ejecuta `load`, generación, regeneración, `fade` ni `teleport`. No
introduce streaming ni hydration. Sólo cambia el rebind lógico y la visibilidad y updates seleccionados
del stack residente.

### Recovery

`Floor transition transaction` sigue como ruta legacy de recovery. No forma parte de la ruta normal de
escaleras.

## Alcance de la supersession

Este ADR reemplaza sólo las cláusulas de ADR 0004 sobre límite de pisos y rebuild de la ruta normal, y
las cláusulas de ADR 0006 sobre materialización lazy. El resto de ambas decisiones sigue aceptado. En
particular, el contrato de runtime assets de ADR 0006 queda íntegro.

## Consecuencias

- Una ruta normal de escaleras 1→4→1 conserva los cuatro pisos residentes después de liberar input.
- El rebind del Active floor no crea una escena, no regenera un `Dungeon` ni restaura un piso.
- Recovery conserva su `Floor transition transaction` legacy separado.
