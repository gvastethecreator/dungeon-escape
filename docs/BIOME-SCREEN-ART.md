# Biome screen art

Dungeon Escape usa dos fondos por bioma:

- `main`: portada de bienvenida. Muestra al héroe huyendo.
- `ending`: cierre de victoria. Muestra al héroe llegando a la salida.

La fuente única de identidad y orden es `src/systems/BiomeIdentity.ts`. La
tabla de rutas, paletas, hitos, firma ambiental y referencias de enemigos vive
en `src/systems/BiomeScreenArt.ts` y en el manifiesto de
`assets-source/imagegen/biome-screen-art-v1/`.

## Selección en runtime

`mainScreenBiomeForPlayer()` toma el nombre guardado en
`dungeon-escape:leaderboard-name` y el agregado `playerBiomeStars` del Hall.
La portada empieza en `Ancient`. Cada escape de campaña guardado mueve la
portada a la siguiente frontera canónica. Cuando el jugador llega al último
bioma, la portada queda en `Backrooms`.

El cierre toma el bioma activo de la partida en `showEndOverlay()`. Una victoria
usa siempre la variante `ending` de ese bioma. El fondo se actualiza antes de
mostrar el panel de resultados.

## Partículas ambientales

Welcome y Ending montan un canvas decorativo con `BiomeScreenParticles`. El
sistema toma las tres capas de `BiomeParticleProfile.ts`: ambiente, firma y
caída de techo. Por eso cada portada conserva las mismas señales del mapa:
polvo y runas en Ancient, brasas en Molten, nieve en Frost, esporas en Fungal,
burbujas en Sunken y fallos de luz en Backrooms.

Cada canvas sigue el `data-biome-id` de su imagen. Welcome se activa mientras
el menú está abierto. Ending se activa sólo durante una victoria y usa el bioma
de la partida terminada. Las capas quedan bajo los degradados y paneles, no
reciben eventos del puntero y paran cuando la pantalla o la pestaña se ocultan.

El presupuesto visual es de hasta 54 partículas a 30 FPS en escritorio. Móvil
reduce la densidad y limita el DPR a 1.5. `prefers-reduced-motion` mantiene una
composición estática y tenue.

## Fuente de enemigos

El héroe común está en
`assets-source/imagegen/biome-screen-art-v1/references/runner-reference.png`.
Cada enemigo usado en las imágenes es un recorte del primer frame del atlas
final `public/assets/sprites/enemies-v8/biomes/<biome>-enemies.webp`.
Los nombres y las combinaciones por pantalla están en
`biome-screen-art-manifest.json` y en el README del set de fuente.

Cada bioma cambia el trío entre `main` y `ending`. Las imágenes no incluyen
texto, logo ni paneles; el HTML conserva el control de copy, foco y contraste.

## Archivos publicados

Los 22 WebP están en `public/assets/ui/biome-screens/` con el patrón:

```text
<biome>-main.webp
<biome>-ending.webp
```

Los fondos de runtime miden 836 × 470 px y se cargan con `preloadImage()` antes de
cambiar la imagen visible.
