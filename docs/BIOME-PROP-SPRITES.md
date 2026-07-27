# Props decorativos por bioma

## Alcance

Cada bioma tiene una lámina de seis props: tres para paredes y tres para suelos.
El runtime crea los props de pared como decals planos con normal fija hacia el
interior de la sala. Los props de suelo son tarjetas verticales que giran solo
en `Y` hacia el personaje. Son decorativos, no ocupan celdas físicas y respetan
las reservas de spawn, salida, objetivos, hazards y props sólidos.

## Atlas

- Tamaño: `1536 × 1024`.
- Rejilla: `3 × 2`.
- Celda: `512 × 512`.
- Marco transparente interior: `4 px`.
- Frames `0..2`: pared.
- Frames `3..5`: suelo.
- LOD de distancia: desactivado.
- Frustum culling: desactivado para evitar que props pequeños desaparezcan al
  cambiar el ángulo de cámara.
- Saturación del atlas: `0.38`.
- Brillo previo al tone mapping: `0.78`.
- Opacidad base de los props: `0.88`.
- Fade de suelo: `0.9 m` a `2.35 m`, con curva smoothstep y material por
  instancia.

El registro de props vive en `src/world/BiomeSpriteDecorKit.ts`. Frost usa un
altar bajo de hielo en el frame 4. El cofre generado fue retirado del roster.

## Producción de assets

1. ImageGen genera cada lámina sobre una placa gris neutra `#808080`.
2. Los originales quedan en `assets-source/imagegen/biome-props/`.
3. `scripts/birefnet-biome-prop-sheets.py` ejecuta `ZhengPeng7/BiRefNet` con
   el entorno local CUDA y crea los atlas transparentes en
   `public/assets/sprites/biome-props/`.
4. El script elimina la placa conectada a los bordes, corta un marco de 4 px y
   escribe `manifest.json` con el bbox y el estado alpha de cada frame.

Comando de reproceso:

```powershell
& 'D:\DEV\blackflag.club\apps\dungeon\.venv-pbr\Scripts\python.exe' `
  'scripts\birefnet-biome-prop-sheets.py' --device cuda
```

La validación exige seis bboxes por bioma y `edge_nonzero = 0` en todos los
frames. El procesamiento usa la lámina completa para dar a BiRefNet contexto
visual estable; después aplica la máscara de fondo por bordes.

## Colocación

`DungeonWorld.scatterBiomeSpriteProps` toma asientos de pared y de interior
por habitación. La selección usa la semilla del dungeon, limita el total a 48
sprites, mantiene libre la circulación y no añade colisión. Los materiales y
las texturas se reutilizan por bioma y frame.

Los asientos de pared se reservan entre cuadros clásicos, decorado mural y
props nuevos. El selector exige separación mínima entre asientos para evitar
que un cuadro quede dentro de otro sprite. Los decals de pared quedan a
`0.026 m` del plano de mampostería, usan `polygonOffset` y no escriben en el
buffer de profundidad para evitar clipping y z-fighting.

Los props de suelo usan un plano vertical con material iluminado. Su rotación
solo cambia en el eje `Y` hacia la posición del personaje; así se mantienen
erguidos cerca de la cámara. Al entrar en la banda de `0.9 m` a `2.35 m`, su
opacidad baja de forma continua hasta ocultarlos. El desplazamiento inferior
se calcula con el margen alpha medido en `manifest.json`, por lo que la parte
visible toca el suelo aunque cada frame tenga un recorte distinto.

El mismo tratamiento de tinte y desaturación se aplica a los atlas murales
existentes mediante `createWallSpriteMaterial`.
