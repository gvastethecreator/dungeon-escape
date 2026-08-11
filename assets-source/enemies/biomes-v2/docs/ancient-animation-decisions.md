# Registro de decisiones para animaciones de enemigos

Este archivo conserva las decisiones visuales aprobadas y los errores rechazados.

## Uso obligatorio

1. Lee las reglas globales antes de preparar un prompt.
2. Lee la entrada de la criatura antes de regenerar una fila.
3. Registra cada rechazo con su causa visible.
4. Registra cada aprobación con el run aceptado.
5. No marques una criatura como aprobada sin confirmación del usuario.

## Reglas globales

- La cámara muestra la criatura completamente de frente y a la altura del jugador.
- No uses vista cenital, inclinación, perfil ni pose en 3/4.
- Conserva la identidad, la escala, el volumen y el centro del diseño base.
- La perspectiva puede ampliar una parte que avanza hacia la cámara.
- La perspectiva no puede escalar o aplastar el cuerpo completo.
- La fila de movimiento usa: idle, fase A, idle exacto, fase B.
- La fila de ataque usa: idle exacto, anticipación, contacto, idle exacto.
- Los idles compartidos deben ser idénticos por píxel.
- La locomoción debe mover extremidades completas desde sus articulaciones.
- Un movimiento leve de rodilla no cuenta como una zancada.
- Los bípedos alternan pies opuestos. Nombra el lado de pantalla en el prompt.
- El segundo idle de un bípedo debe tener ambos pies en posición neutral.
- Los voladores conservan el tamaño del cuerpo. El movimiento principal ocurre en las alas.
- Las alas de un volador se mueven de forma bilateral y coordinada.
- Los flotantes sin piernas usan su anatomía inferior. No simules pasos terrestres.
- Los ataques deben usar la anatomía y la personalidad de cada criatura.
- No repitas un golpe genérico con la mano derecha.
- Genera las hojas sobre negro puro.
- Usa Lucida con la revisión fijada y segmentación adaptativa.
- Revisa los cortes variables antes del registro.
- Registra a `512x512` y exporta cada celda por separado a `160x160`.
- Revisa el playback de runtime antes de mostrar un resultado.

## Ancient

### Carrion

- Estado: aprobado.
- Run: `carrion-v6-registered-512`.
- Movimiento: apoyos alternos y cambio claro de contacto.
- Ataque: garra frontal, contacto en el tercer cuadro y retirada estable.
- Conserva: baseline, frontalidad e idle exacto.

### Goblin

- Estado: aprobado.
- Run: `goblin-v9-registered-512`.
- Movimiento: avance frontal legible.
- Ataque: quick strike de garra.
- Decisión: el apoyo delantero funciona como anticipación del ataque.
- Rechazo: manos sobredimensionadas que cambian la identidad.

### Imp

- Estado: aprobado.
- Run: `imp-v15-registered-512`.
- Movimiento: vuelo con ambas alas coordinadas.
- Ataque: doble zarpazo con movimiento sutil de las alas.
- Rechazo: alternar un ala por cuadro.
- Rechazo: reducir el tamaño completo del cuerpo durante el vuelo.
- Rechazo: alas estáticas.

### Ghost

- Estado: aprobado.
- Run: `ghost-v3-registered-512`.
- Movimiento: compresión y extensión vertical del sudario inferior.
- Ataque: embestida frontal con ambas manos.
- Conserva: cabeza, torso, brazos, centro y escala.
- Rechazo: balanceo lateral del cuerpo completo.
- Rechazo: pasos terrestres.

### Husk

- Estado: aprobado.
- Run: `husk-v4-registered-512`.
- Movimiento: marcha pesada con apoyos anatómicos alternos.
- Ataque: agarre frontal con ambas manos.
- Conserva: frontalidad e idle exacto al terminar.
- Rechazo: golpe genérico con una sola mano.

### Ratling

- Estado: aprobado.
- Run: `ratling-v6-registered-512`.
- Movimiento: zancadas completas hacia cámara.
- Movimiento: pie delantero, pie trasero recogido, peso y brazos opuestos.
- Ataque: mordida frontal.
- Conserva: rostro frontal, baseline y cola con retraso.
- Rechazo: movimiento limitado a las rodillas.
- Rechazo: cuerpo aplastado durante la zancada.

### Zombie Orc

- Estado: aprobado.
- Run: `zombie-orc-v5-registered-512`.
- Movimiento: marcha pesada con pies opuestos.
- Fase A: avanza el pie derecho de pantalla.
- Fase B: avanza el pie izquierdo de pantalla.
- Ataque: cabezazo frontal.
- Decisión: la cabeza puede crecer por perspectiva durante el contacto.
- Conserva: altura, ancho y volumen del torso.
- Rechazo: repetir el mismo pie en las dos fases.
- Rechazo: segundo idle con una pierna adelantada.
- Rechazo: aplastar el cuerpo durante la marcha.

### Spider

- Estado: aprobado.
- Run aprobado: `spider-v4-body-aligned-512`.
- Movimiento: patrón diagonal y equilibrado.
- Fase A: L1+L3 y R2+R4 avanzan.
- Fase B: L2+L4 y R1+R3 avanzan.
- Cada fase mueve dos de las cuatro patas de cada lado.
- Conserva: cuerpo centrado, nivelado, frontal y sin inclinación.
- Alineación: conserva el desplazamiento global y corrige las fases activas contra el abdomen.
- Alineación: no uses `bbox-bottom` para criaturas con patas de extensión variable.
- Ataque actual: mordida frontal con patas delanteras.
- Rechazo: cuatro poses casi estáticas.
- Rechazo: mover una sola pata.
- Rechazo: mover un costado completo.
- Rechazo: inclinar el cuerpo.
- Rechazo: alinear cada cuadro por la punta más baja de sus patas.

### Bone Slime

- Estado: aprobado por usuario.
- Run actual: `bone-slime-v4-registered-512`.
- Movimiento: dos pulsos materiales localizados y no espejados en la parte inferior.
- Fase A: un labio viscoso central avanza de forma sutil.
- Fase B: la zona inferior central se contrae y forma pliegues hacia dentro.
- Conserva durante el movimiento: cráneo, cúpula, huesos laterales, escala, centro y silueta superior exactos.
- Ataque: los huesos inferiores anticipan la apertura y forman una mandíbula; el cráneo se proyecta sólo en el contacto.
- Conserva durante el ataque: la masa exterior completa del slime, el baseline y el centro.
- Método: genera sólo los dos cuadros activos como ediciones individuales; compón los idles desde la base exacta y limita cada edición a la región anatómica que actúa.
- Rechazo: alternar una cola viscosa izquierda y derecha como si fueran pasos.
- Rechazo: reflejar una misma pose para simular dos fases.
- Rechazo: convertir el cuerpo en un pseudópodo enorme o una ola dorsal que cambia la criatura.
- Rechazo: encoger o escalar el cuerpo completo durante el ataque.
- Rechazo: generar la hoja 2x2 completa de una vez cuando cada cuadro altera la identidad o la escala.
- Rechazo: componer un parche local sobre un cuadro ya generado cuando la transición se percibe como una costura.
- Decisión v4: regenera cada cuadro activo completo desde la base y acepta sólo una deformación continua dibujada por Imagegen.

### White-Eyed Shadow

- Estado: aprobado por usuario como aceptable.
- Run actual: `white-eyed-shadow-v7-registered-512`.
- Identidad: sombra bípeda terrestre, frontal, alta y estrecha; nunca fantasma flotante.
- Movimiento: caminata bípeda frontal normal con la estructura aprobada del Husk: idle exacto, pie izquierdo hacia cámara con brazo derecho opuesto, idle exacto y pie derecho hacia cámara con brazo izquierdo opuesto. El torso sólo se inclina levemente hacia delante y conserva su volumen.
- Ataque: agarre frontal con ambas manos usando la estructura aprobada del Husk. Las dos manos se reúnen bajo el pecho, ambos brazos se proyectan juntos hacia el jugador y la criatura vuelve al idle exacto.
- Conserva: cabeza, dos ojos, torso, escala, frontalidad, dos piernas separadas, dos pies y baseline 496/512.
- Fondo de generación: gris neutro `#808080`; excepción necesaria porque el cuerpo negro se perdería contra fondo negro. El resultado final sigue siendo RGBA transparente.
- Método: generar cada animación completa directamente como una hoja 2 × 2 en Imagegen; nunca generar los cuadros activos por separado. Luego Lucida fijada a `6ee11122534c8de59402a589d2293c198cfbf848`, segmentación adaptativa, registro `body-bottom` y pivot runtime 152/160.
- Rechazo: balanceo lateral, fase reflejada, marcha errática o deformaciones exageradas de miembros en lugar de pasos bípedos reales.
- Rechazo: manos en la cintura, guardia de boxeo o torso encogido durante la caminata.
- Rechazo: ataque de una sola mano, manos coloreadas, manos gigantes o estrelladas, gesto cómico o brazos extendidos lateralmente fuera de la lectura frontal FPS.
- Rechazo v3: generación cuadro por cuadro, marcha de articulaciones quebradas y ataque con garra frontal caricaturesca.
- Rechazo v4: cambios casi estáticos, estocada diagonal ambigua y ataque poco amenazante.
- Rechazo v5: pose de mano en cintura durante el movimiento y anticipación por encima de la cabeza que obligaba a encoger el cuerpo durante la extracción.
- Rechazo v6: acecho asimétrico y zarpazo unilateral; el usuario pidió volver a una caminata bípeda normal y a un ataque bilateral basado en el Husk.
- Aprendizaje v6: conservar la actuación 2×2, pero mantener todos los miembros dentro de la altura corporal normal para que Lucida + adaptive no alteren la escala.
- Decisión v7: usar una caminata bípeda normal y un agarre bilateral con la estructura temporal del Husk; esta decisión reemplaza el acecho deformado y el zarpazo unilateral.

### Carrion Stalker

- Estado: aprobado e integrado.
- Identidad base: aprobada en el lote de sprites base.
- Run actual: `carrion-stalker-v2-registered-512`.
- Movimiento: `idle`, apoyo diagonal de pantalla izquierda con la mano opuesta recogida, `idle` exacto y apoyo diagonal de pantalla derecha.
- Ataque: ambas garras cargan hacia atrás, la mandíbula se proyecta al frente y las dos manos convergen alrededor de la mordida.
- Conserva: cráneo estrecho, caja torácica larga, espina central, dos brazos largos, dos patas traseras cortas y lectura baja completamente frontal.
- Rechazo v1: las dos fases activas repetían prácticamente la misma pose; el gate comparativo detectó `0.000` de diferencia entre apoyos.
- Decisión v2: una mano larga debe abandonar por completo el suelo en cada fase. Los balances activos finales son opuestos (`-0.268` y `+0.272`) y el cuerpo permanece registrado por `body-bottom`.
- QA: Lucida + segmentación adaptativa sin cortes, baseline `496/512`, pivot runtime `152/160`. El proxy estándar de ancho superior falla por la convergencia de ambas garras junto al rostro; el gate pose-aware pasa con `max-proxy-spread 0.60` y el ancho de cabeza máximo es `1.11×`.
- Aprobación: el usuario aceptó v2 antes de la integración del atlas Ancient.

## Plantilla para nuevas criaturas

### Nombre

- Estado: pendiente, revisión o aprobado.
- Run:
- Movimiento:
- Ataque:
- Conserva:
- Rechazo:
