# Pipeline de enemigos por bioma

Las 121 identidades aprobadas viven en [`assets-source/enemies/biomes-v2`](../assets-source/enemies/biomes-v2/README.md).

El manifiesto durable contiene los hashes, dimensiones, prompts y registros de procedencia.

El [plan de animación](../assets-source/enemies/biomes-v2/ANIMATION-PLAN.md) define el orden de producción y las puertas de aprobación.

Los 11 biomas están integrados: 121/121 identidades tienen cuatro cuadros de movimiento y cuatro de ataque en los atlas runtime. Los diez biomas posteriores a Ancient usan dos videos Grok por identidad, selección dinámica de cuadros, Lucida y segmentación adaptativa. Imagegen queda reservado para reparar un cuadro excepcional sin consumir otra generación de video.

Ejecuta la auditoría antes de iniciar un lote:

```powershell
python scripts/consolidate-biome-enemy-sources.py --verify-only
```

No uses `.scratch` como fuente final. `.scratch` conserva runs, candidatos e informes de revisión.

Los paquetes durables y sus hashes viven en `assets-source/enemies/v8/*-enemies-animated.json`. Los atlas publicados viven en `public/assets/sprites/enemies-v8/biomes/`.

Audita los 11 paquetes y los 968 cuadros publicados con:

```powershell
bun run audit:enemy-atlases
```
