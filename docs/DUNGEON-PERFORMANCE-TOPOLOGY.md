# Rendimiento y topología del modo Dungeon

Actualizado: 2026-07-26

## Recorrido Play

- El controlador y la simulación reutilizan sus objetos temporales de frame.
- Los puntos de audio del mundo se actualizan cada 125 ms, no en cada frame.
- La colisión resuelve un avance bloqueado con siete pasos de aproximación. El jugador queda junto al volumen visible sin atravesarlo ni perder una franja de espacio.
- Play usa DPR máximo 1 en escritorio y 0,85 en móvil. El editor conserva su propio límite de calidad.
- Las antorchas lejanas dejan de crear geometría visible a 36 metros. La decoración atmosférica repetida se agrupa por plantilla.

## Forge

- La forma base de las salas es rectangular. Las octogonales son poco frecuentes y las elípticas quedan como excepción. Entrada y jefe siempre usan planta rectangular.
- La cantidad de decoración depende del área: dos props en salas pequeñas, tres en medianas y cuatro en grandes. Los props no ocupan agua ni hielo.
- Un arco exige una unión real entre sala y corredor: sala a un lado, corredor al lado opuesto y sin corredor paralelo. Forge incluye la normal hacia la sala para que el host sitúe el marco sobre el plano del muro.
- Los `POOL` importados se convierten a suelo navegable y mantienen su máscara visual líquida. Los lagos helados también son navegables.

## Verificación registrada

- El conteo de pruebas depende del punto de extracción. Ejecuta `bun run test` en este proyecto para el resultado actual.
- `bun run build`: correcto; Vite advierte que el chunk de Three supera 500 kB.
- Navegador, Play escritorio: 301 frames durante cinco segundos de avance; media 16,62 ms, p95 16,8 ms, máximo 16,9 ms y ningún frame superior a 20 ms.
- Navegador, Forge integrado: 42 salas, 3.197 celdas transitables y BFS completo.
- Navegador, Play móvil 390x844: DPR 0,85, 299 draw calls y controles táctiles de 48x48 px.

Las mediciones de este documento se tomaron con la autoridad HTTP ausente. Dungeon Escape conserva una partida local y el render sigue disponible.
