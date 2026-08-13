# Informe de experiencia de usuario — dungeon-escape

Date: 2026-08-13
Mode: Execution
Status: Completed
Language: Spanish
Repository: `gvastethecreator/dungeon-escape`
Tracker: issues #4–#13 (parent #3), Project 5
HTML: `.scratch/reports/user-experience-2026-08-13/index.html`

## Resumen ejecutivo

Este lote entrega 10 adiciones UX pequeñas. El jugador ve avisos, busy de Welcome, retry de pointer lock, muerte con progreso, FIRE/TAP táctil, ajustes persistentes, sensibilidad de look, shotgun vacío y revive phoenix.

`#status` sigue recortado en deploy. Map tools siguen locales. El HUD de combate y el analog stick no cambian.

Valor agregado: menos incertidumbre en boot, lock, muerte, touch y ajustes. Las pruebas cubren el comportamiento. Esta sesión no midió adopción ni tiempo ahorrado.

## Usuarios y rutas

- Jugador público en deploy Play
- Jugador que vuelve con Continue
- Jugador táctil / pointer coarse
- Operador local de Creation (sin Map tools en deploy)

Rutas: Welcome → New Game / Continue / Custom Run → Play. Pointer lock, HUD, interact, shotgun, muerte, Settings.

## Capacidades conservadas

Play, Hall, Creation local, mute de música, CRT adaptativo, clip de telemetría en `#status`, y el gate de Map tools siguen disponibles.

## Valor agregado

- Deploy muestra avisos de jugador sin abrir telemetría.
- Welcome busy y restore error son visibles.
- Pointer lock usa un solo mensaje de click.
- Muerte muestra piedras y tiempo.
- Touch dispara y muestra TAP.
- Mute master, CRT y sensibilidad sobreviven un reload.
- Shotgun vacío y revive phoenix son visibles.

## Resultados por ticket

### UX-01. Toast de jugador visible en deploy

**Ticket / status**
- https://github.com/gvastethecreator/dungeon-escape/issues/4 — cerrado

**Initial friction**
- Deploy recorta `#status`. Pickup, portal y pointer no se veían.

**Implemented addition**
- Canal `#play-toast` / `showPlayToast` para copy de jugador. `#status` sigue recortado.

**Value demonstrated**
- El jugador ve avisos cortos. Inferido de tests de HUD. Sin medición de sesión humana en este lote.

**Preserved value**
- Telemetría técnica sigue oculta en deploy. El lector de pantalla sigue el aviso.

**Affected states**
- Success: toast ≥1.5s. Error técnico: no usa el toast.

**Verification**
- `tests/play-hud.test.ts`

**Residual risk**
- Copy nuevo que no pasa el filtro de jugador queda invisible en deploy.

### UX-02. Welcome muestra busy y errores de restore

**Ticket / status**
- https://github.com/gvastethecreator/dungeon-escape/issues/5 — cerrado

**Initial friction**
- Continue y Custom Run marcaban `aria-busy` con status recortado. El menú parecía congelado.

**Implemented addition**
- Status de Welcome visible en busy y en error de restore. Botones disabled.

**Value demonstrated**
- El usuario ve Restoring / Creating o el error. Prueba: `tests/welcome-map-flow.test.ts`.

**Preserved value**
- New Game, Continue y Custom Run siguen. Enter redundante no vuelve.

**Affected states**
- Loading: busy visible. Error: mensaje visible. Success: el flujo entra a Play.

**Verification**
- `tests/welcome-map-flow.test.ts`

**Residual risk**
- Un error de restore sin copy mapeado puede quedar genérico.

### UX-03. Un mensaje para reintentar pointer lock

**Ticket / status**
- https://github.com/gvastethecreator/dungeon-escape/issues/6 — cerrado

**Initial friction**
- El controller decía Press Enter. El copy de Play decía click en la escena.

**Implemented addition**
- Un texto: Click the scene to retry. Click en la escena pide el lock.

**Value demonstrated**
- Un solo recovery path. Prueba de copy/controller.

**Preserved value**
- ESC sigue soltando el lock. Enter no es el retry.

**Affected states**
- Error de lock: toast/status de click. Recovery: click en la escena.

**Verification**
- Source assert + HUD tests

**Residual risk**
- Algunos navegadores bloquean lock sin gesto reciente. El copy no cambia esa regla.

### UX-04. Pantalla de muerte con piedras y tiempo

**Ticket / status**
- https://github.com/gvastethecreator/dungeon-escape/issues/7 — cerrado

**Initial friction**
- `loseCopy` vacío. El overlay no mostraba progreso.

**Implemented addition**
- Lead corto más piedras y tiempo. Hall submit sigue apagado.

**Value demonstrated**
- La muerte es un resultado, no un título vacío.

**Preserved value**
- No hay submit al Hall desde death.

**Affected states**
- Death overlay con progreso. Revive phoenix no usa esta pantalla.

**Verification**
- Death/copy HUD tests

**Residual risk**
- None observed

### UX-05. Botón FIRE táctil para shotgun

**Ticket / status**
- https://github.com/gvastethecreator/dungeon-escape/issues/8 — cerrado

**Initial friction**
- El pad táctil no tenía `data-move=fire`. G no existe en coarse.

**Implemented addition**
- Botón FIRE cuando el shotgun está equipado. Mismo path que G.

**Value demonstrated**
- Combate táctil con shotgun. Prueba de virtual fire.

**Preserved value**
- G y LMB siguen en fine pointer.

**Affected states**
- Shotgun equipped: FIRE visible. Unequipped: FIRE oculto.

**Verification**
- FirstPersonController virtual fire + markup

**Residual risk**
- El analog stick no cambia. Fuera de alcance.

### UX-06. Prompt TAP en pointer coarse

**Ticket / status**
- https://github.com/gvastethecreator/dungeon-escape/issues/9 — cerrado

**Initial friction**
- El prompt de cofre/antorcha mostraba F en coarse.

**Implemented addition**
- TAP o Interact en coarse. `kbd` F en fine.

**Value demonstrated**
- El affordance coincide con el input real.

**Preserved value**
- F sigue en teclado.

**Affected states**
- Coarse prompt sin keycap F. Fine prompt con F.

**Verification**
- Prompt copy / pointer type tests

**Residual risk**
- Un pointer que cambia fine/coarse a mitad de prompt puede quedar un frame desfasado.

### UX-07. Persistir mute master y CRT

**Ticket / status**
- https://github.com/gvastethecreator/dungeon-escape/issues/10 — cerrado

**Initial friction**
- `UserSettings` guardaba volúmenes y smoothing. Mute master y CRT no.

**Implemented addition**
- `audioMuted` y `crtEnabled` en ajustes. Boot restaura ambos.

**Value demonstrated**
- Los ajustes sobreviven un reload. Prueba round-trip.

**Preserved value**
- Mute de música y política CRT adaptativa siguen. `crtEnabled: null` sigue la política.

**Affected states**
- Success: restore. Storage fail: el fallo es visible en Settings o pause.

**Verification**
- `tests/user-settings.test.ts`

**Residual risk**
- Storage privado o quota llena vuelve a defaults.

### UX-08. Slider de sensibilidad de look

**Ticket / status**
- https://github.com/gvastethecreator/dungeon-escape/issues/11 — cerrado

**Initial friction**
- El copy de Settings hablaba de feel. No había control.

**Implemented addition**
- Slider 0.5–1.5. `FirstPersonController` lee `lookSensitivity`. Persiste.

**Value demonstrated**
- El look se escala al instante y en el siguiente boot.

**Preserved value**
- Default 1.0. El analog stick no cambia.

**Affected states**
- Settings: slider. Play: look escala. Reload: valor restaurado.

**Verification**
- `tests/user-settings.test.ts`

**Residual risk**
- None observed

### UX-09. HUD shotgun vacío visible

**Ticket / status**
- https://github.com/gvastethecreator/dungeon-escape/issues/12 — cerrado

**Initial friction**
- El chip de shotgun se ocultaba en 0 shells.

**Implemented addition**
- Chip visible en 0 / EMPTY tras dry-fire. `aria-label` describe empty.

**Value demonstrated**
- El arma vacía es legible.

**Preserved value**
- El chip se puede ocultar tras timeout si unequipped.

**Affected states**
- Dry-fire: chip visible. Unequipped: chip puede ocultarse.

**Verification**
- `tests/play-status-hud.test.ts`

**Residual risk**
- None observed

### UX-10. Banner de revive phoenix

**Ticket / status**
- https://github.com/gvastethecreator/dungeon-escape/issues/13 — cerrado. Bloqueado por #4.

**Initial friction**
- Gastar el huevo no tenía banner. El status recortado no bastaba.

**Implemented addition**
- Banner centrado con copy de rebirth más toast. El chip phoenix se limpia.

**Value demonstrated**
- El save más fuerte es visible.

**Preserved value**
- El huevo y el revive sim no cambian.

**Affected states**
- Success: banner + toast. Después: chip hidden.

**Verification**
- HUD phoenix + `tests/play-hud.test.ts`

**Residual risk**
- None observed

## Verificación de integración

| Check | Result | Notes |
|---|---|---|
| `bun run typecheck` | pass | `tsc -p tsconfig.json --noEmit` |
| `bun test tests` | pass | 1215 pass, 20 skip, 0 fail, 49.05s |
| `bun run build` | skip | Solo release |
| Browser Play deploy | skip | Inferido de tests de HUD/Welcome. Sin sesión humana en este lote |

## Accesibilidad y compatibilidad

- Toast y Welcome busy siguen anunciables.
- FIRE y TAP cubren coarse pointer.
- `#status` recortado en deploy se conserva a propósito.
- WebGL2 sigue default. Dual GLSL/TSL se conserva.

## Decisiones y adiciones rechazadas

- Canal toast nuevo. No se destapa `#status`.
- No se re-arma WebGPU.
- No se exponen Map tools en deploy.
- No se rediseña pause, HUD o analog stick.

## Riesgos residuales

- Valor de sesión humana no medido.
- Copy nuevo fuera del filtro de jugador queda invisible en deploy.
- Lock del navegador sigue exigiendo gesto.
