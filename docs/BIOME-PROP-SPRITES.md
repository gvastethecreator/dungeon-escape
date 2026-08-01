# Props decorativos por bioma

## Alcance

Cada bioma tiene una lámina de seis props: tres anclados a paredes y tres
props de suelo. El registro conserva una clasificación por frame para que la
geometría siga la forma del objeto:

- `wall-decal`: plano vertical pegado al muro, con normal fija hacia la sala.
- `floor-decal`: plano horizontal para restos, manchas o piezas de poca
  altura. Tiene un pequeño desplazamiento sobre el piso y recibe sombra.
- `floor-standing`: tarjeta vertical con base en el piso. Gira en `Y` hacia el
  personaje y conserva su base aunque la cámara se acerque.
- `corner-standing`: tarjeta vertical en una esquina. Su orientación busca al
  personaje dentro del sector libre entre los dos muros.

Todos los props generados quedan fuera del LOD y del frustum culling. Los
props de suelo, incluidos los planos horizontales, aplican un fade suave entre
`0.9 m` y `2.35 m` para limpiar la lectura cuando el personaje entra en su
espacio inmediato. Los decals de pared usan `fog: true` y un boost de niebla
en el fragment shader para que las siluetas `alphaTest` no se lean a distancia
a través del muro de niebla de exploración.

## Clasificación de los frames

| Bioma     | Plano sobre suelo           | Erguido en suelo                | Esquina con giro limitado |
| --------- | --------------------------- | ------------------------------- | ------------------------- |
| Ancient   | —                           | Broken column, Funerary urns    | Rune tablet               |
| Molten    | Cooling magma rocks         | Copper slag bowl                | Scorched anvil            |
| Frost     | Frozen floor altar          | Ice shard pile                  | Snow rune stone           |
| Grim      | Rusted chain coil           | Bone heap                       | Gravestone fragment       |
| Verdant   | —                           | Mossy standing stone, Seed pods | Root cluster              |
| Ash       | Cinder rubble               | Ash urn                         | Charred crate             |
| Iron      | Gear scraps                 | Pressure valve                  | Iron storage crate        |
| Obsidian  | —                           | Purple crystals, Ritual prism   | Obsidian rock             |
| Sunken    | Coral rubble                | Barnacle pot                    | Waterlogged crate         |
| Fungal    | —                           | Mushroom cluster, Spore pod     | Mycelium stone            |
| Backrooms | Carpet debris, Cable bundle | —                               | Office phone              |

La clasificación se guarda junto a `surface` en
`src/world/BiomeSpriteDecorKit.ts`. Frost usa un altar de hielo en el frame 4;
el cofre generado fue retirado del roster.

## Atlas

- Tamaño runtime: `768 × 512`.
- Rejilla: `3 × 2`.
- Celda runtime: `256 × 256`.
- Marco transparente interior: `4 px`.
- Frames `0..2`: decals de pared.
- Frames `3..5`: candidatos de suelo; su plano final depende de `placement`.
- LOD de distancia: desactivado.
- Frustum culling: desactivado para evitar que props pequeños desaparezcan al
  cambiar el ángulo de cámara.
- Saturación del atlas: `0.38`.
- Brillo previo al tone mapping: `0.78`.
- Opacidad de mezcla: `0.76` en pared, `0.76` en tarjetas erguidas,
  `0.72` en esquinas y `0.56` en planos sobre suelo.

## Producción de assets

1. ImageGen genera cada lámina sobre una placa gris neutra `#808080`.
2. Los originales quedan en `assets-source/imagegen/biome-props/`.
3. `scripts/birefnet-biome-prop-sheets.py` ejecuta
   `ZhengPeng7/BiRefNet` con el entorno local CUDA y crea los atlas
   transparentes y publica WebP a mitad de tamaño en `public/assets/sprites/biome-props/`.
4. El script elimina la placa conectada a los bordes, corta el marco y escribe el
   manifiesto de producción en `assets-source/runtime-metadata/sprites/biome-props/manifest.json`.

Comando de reproceso:

```powershell
& 'D:\DEV\blackflag.club\apps\dungeon\.venv-pbr\Scripts\python.exe' `
  'scripts\birefnet-biome-prop-sheets.py' --device cuda
```

La validación exige seis bboxes por bioma y `edge_nonzero = 0` en todos los
frames. El procesamiento usa la lámina completa para dar a BiRefNet contexto
visual estable; después aplica la máscara de fondo por bordes.

## Colocación y mezcla

`DungeonWorld.scatterBiomeSpriteProps` separa los asientos de pared, esquina
e interior. Cada celda se reserva en el mismo registro usado por props sólidos,
cofres, pickups y enemigos. Así la decoración no puede compartir celda con un
objeto interactivo o un spawn.

Los decals de pared se agrupan por frame, quedan a `0.026 m` del plano de
mampostería, usan `polygonOffset` y no escriben en el buffer de profundidad.
Los objetos de esquina se desplazan hacia los dos muros y usan un bisector
interior. Su yaw se limita a `π/4 - 0.08`, con lo que la tarjeta mantiene un
margen dentro del sector abierto y evita atravesar la pared al seguir al
personaje.

Los planos `floor-decal` se rotan a `-π/2` en X y mantienen una orientación
determinista. Los objetos `floor-standing` y `corner-standing` usan un plano
vertical con el margen alpha inferior medido en `manifest.json`. Todos reciben
el mismo tratamiento de tinte: mezcla de color del bioma, saturación `0.38`,
brillo `0.78`, roughness alta, fog y opacidad por tipo.

El mismo tinte y desaturación se aplica a los atlas murales existentes mediante
`createWallSpriteMaterial`.
