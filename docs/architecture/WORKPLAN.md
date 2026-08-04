# Dungeon Escape architecture workplan

Source: [architecture review](architecture-review-2026-07-27.md)

Status: implemented and locally verified on 2026-07-27.

The owner accepted A7 and the startup portion of A8 on 2026-07-30. El usuario aceptó A9 el
2026-08-02 dentro de Resident Dungeon Load; su implementación sigue pendiente.

The separate 2026-07-30 deep-module batch is complete: ten accepted maintenance seams were implemented
and verified without accepting A7-A9. See the [completion report](architecture-review-2026-07-30.md).

## Resident Dungeon Load — 2026-08-02

El usuario aceptó A9 dentro de Resident Dungeon Load. El alcance aprobado está en el
[contrato](../../.scratch/planning/2026-08-02-dungeon-load-deep-audit-2026-08-02/contract.md) y el
[ticket RDL-03](../../.scratch/resident-dungeon-load/tickets.md). Esta aceptación no declara A9
implementado; autoriza el trabajo residente de cuatro pisos.

Las notas históricas inferiores que dicen que A9 estaba deferred describen el estado de su lote fechado,
no la decisión actual.

## Frontier

| ID  | Module                 | Status   | Depends on          | Acceptance proof                                                                                       |
| --- | ---------------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| A1  | Forge message intake   | accepted | —                   | Unknown, malformed, old, missing, and valid messages cross one public seam                             |
| A2  | Biome identity         | accepted | A1 terms            | Runtime, editor, Forge, and assets share IDs, order, labels, and support checks                        |
| A3  | Forge generation       | accepted | A1, A2              | Fixed seeds generate without DOM/WebGL and preserve host output                                        |
| A4  | Play runtime           | accepted | A1–A3               | Frame loop and tests use one runtime; browser adapters retain UI/audio/render duties                   |
| A5  | Static dungeon scene   | accepted | A4 checkpoint       | Build/clear move together; facade, collision, reservations, render inventory, and disposal stay stable |
| A6  | Editor CSS             | accepted | A4 shell checkpoint | One stylesheet owns mode-specific editor/debug layout with desktop, narrow, focus, and motion parity   |
| A7  | Runtime asset boundary | accepted | A2, A6              | Deploy contains only audited half-size WebP runtime rasters; source material stays outside `public/`   |
| A8  | Lazy startup lifecycle | accepted | A3-A5               | Welcome creates no world and campaign generation materializes only the requested floor                 |

## Decisions

- Preserve Forge payload v1 and current seed order during migration.
- Use the canonical ID-matched label for every biome; `grim` displays as `GRIM` in Forge and `Grim` in runtime copy.
- Keep Forge intake synchronous and stateless until a second protocol requires stored state.
- Keep the A3 extraction in JavaScript; split theme data, shared procedural primitives, and generation so the move does not also become a TypeScript port.
- Give `PlayRuntime` the world/session/quest order through a structural world port; keep browser presentation outside and return data effects to it.
- Keep long-lived world resources in `DungeonWorld`; `StaticDungeonScene` owns each fixed build, its placement ledger, borrowed handles, and cleanup behind the facade.
- Load `styles/editor.css` after the shared root sheet. The root keeps reusable option/form primitives; the new sheet owns mode-specific editor/debug layout and Forge host rules. Forge keeps its iframe sheet.
- Use expand-contract; remove old seams only after callers and tests migrate.
- Keep `DungeonWorld` as the Play facade. See [ADR 0002](../adr/0002-dungeon-world-remains-play-facade.md).
- Put Play order behind `PlayRuntime`. See [ADR 0001](../adr/0001-play-runtime-owns-play-order.md).
- Preserve unrelated dirty-tree work. Do not use broad formatting or cleanup to force green gates.

## Batch gates

- Per slice: focused public-seam tests, affected call-site inspection, focal format/diff check, Sol audit verdict.
- After multiple accepted slices: relevant integration tests and one batch typecheck.
- Final: full tests, client/server/worker types, lint, build, honest format state, browser Play/Creation proof, fixed worst-case profile, structural self-check, independent review, adversarial autopsy.

## Documentation links

- Domain language: [`CONTEXT.md`](../../CONTEXT.md)
- Quality baseline: [`docs/quality-review-2026-07-27.md`](../quality-review-2026-07-27.md)
- Execution state: `.scratch/planning/2026-07-27-accepted-architecture-a1-a6/`

## Accepted work, not yet implemented

| ID  | Candidate                           | Status              | Measured driver                          |
| --- | ----------------------------------- | ------------------- | ---------------------------------------- |
| A9  | Static scene plan then Three commit | accepted; pendiente | 3,973-line synchronous build transaction |

## Completed deep-module batch — 2026-07-30

| ID      | Owner                   | Result                                                                          |
| ------- | ----------------------- | ------------------------------------------------------------------------------- |
| ARCH-01 | Three resource disposal | World and static-scene cleanup share exactly-once ownership policy              |
| ARCH-02 | Hall persistence        | SQLite and D1 share one row, rank, binding, and star-folding contract           |
| ARCH-03 | Hall application        | Node and Worker transports share request and error policy                       |
| ARCH-04 | Authority write queue   | Remote mutation ordering and reconciliation left the mixed domain bridge        |
| ARCH-05 | Launch configuration    | Browser query semantics are parsed once and URL writes preserve unrelated state |
| ARCH-06 | Floor exploration       | Per-floor fog-of-war state has one pure lifecycle owner                         |
| ARCH-07 | Run resume mapping      | Capture and activation share one defensive projection seam                      |
| ARCH-08 | Local save coordinator  | Save timing, flush, disposal, and failure latching have one owner               |
| ARCH-09 | Forge frame client      | Iframe trust, protocol, presentation waits, and cleanup have one boundary       |
| ARCH-10 | Run intro director      | Run entry is one serial, cancellable transaction with explicit outcomes         |

Final proof: 760 tests / 153,878 assertions, all three TypeScript configs, lint, fresh code-verification,
complete production artifacts, and Chrome coverage for normal, reduced-motion, skipped, replacement-race,
and production paths. Adversarial hardening is in `f845974`, `93401bc`, `1d784a4`, and `5ca80ce`.
Imported Forge maps now fail closed as session-only under
[ADR 0005](../adr/0005-forge-imports-are-session-only.md). A7 and A8 were accepted afterward; see
[ADR 0006](../adr/0006-runtime-assets-and-lazy-campaign.md). A9 remains deferred and requires explicit owner acceptance.

## Completed maintenance deepenings — 2026-07-31

Exactly ten small/medium pure-module deepenings landed under
[architecture-review-2026-07-31.md](architecture-review-2026-07-31.md)
and `.scratch/dungeon-maint-architecture-batch/`. Covers timed HUD chips, enemy contact
vertical vault, combat pose constants, music track policy, creature voice / audio frame
projection, hazard traversal damage policy, enemy activation filters, play-step damage
intent, and interaction reach helpers. A9 remains deferred.

## Completed pure-module batch — 2026-08-01

Exactly ten pure-module deepenings landed under
[architecture-review-2026-08-01.md](architecture-review-2026-08-01.md)
and `.scratch/dungeon-arch-batch-2026-08-01/`. Covers audio threat policy, door open
hysteresis, interaction reach ownership, annihilation pulse hit eligibility, spike
exposure curve, biome-event surface composition, safe spawn distance composition,
minimap feature projection, pickup HUD feedback projection, and adaptive CRT hysteresis.
A9 remains deferred.

## Completed runtime batch C — 2026-08-02

Exactly ten accepted runtime deepenings are complete under
[architecture-review-2026-08-02.md](architecture-review-2026-08-02.md)
and `.scratch/dungeon-architecture-batch-2026-08-02/`.

| ID | Módulo / interfaz | Resultado |
| --- | --- | --- |
| ARC-C01 | TimedSeconds | Reloj compartido para poderes y maldiciones |
| ARC-C02 | RunPowerRuntime | Bolsa de estado de run fuera de campos sueltos en el facade |
| ARC-C03 | ControlModsProjection | Proyección pura mirror/spin/slow/mobility |
| ARC-C04 | applyPickupToRunPowers | Activación por kind sobre la bolsa |
| ARC-C05 | PickupSessionEffects | Tabla de feedback de sesión por kind |
| ARC-C06 | ChestPresentation | Tapa y reveal fuera de `DungeonWorld.update` |
| ARC-C07 | PickupMotionPresentation | Idle y collect motion fuera del facade |
| ARC-C08 | DoorLeafPresentation | Damp de hojas tras DoorOpenPolicy |
| ARC-C09 | PlayStatusHud | Un snapshot sync/reset para chips de Play |
| ARC-C10 | setLocomotionMods | Un seam de locomoción en el controller |

Final proof: 967 tests pass and the same 2 baseline tests fail; client/server/worker types
and lint pass. A9 remains deferred.

## Completed responsibility batch B — 2026-08-01

Exactly ten accepted responsibility moves are complete under
[architecture-review-2026-08-01-b.md](architecture-review-2026-08-01-b.md)
and `.scratch/dungeon-architecture-batch-2026-08-01-b/`.

| ID | Módulo / interfaz | Resultado |
| --- | --- | --- |
| ARC-B01 | Audio asset catalog | Asset paths, groups, gains, spatial profiles, and mappings left `GameAudio` |
| ARC-B02 | Creature take selector | Weighted themed selection and no-repeat state have one deterministic owner |
| ARC-B03 | UI sound policy | Selector priority and disabled-control cues left the browser event adapter |
| ARC-B04 | Player combat eye height | Controller defaults and floor destinations share one canonical value |
| ARC-B05 | Enemy presentation | Simulation no longer owns billboard, shadow, animation, freeze, or trail writes |
| ARC-B06 | Fixed scene effects | Fires, beams, liquids, and biome floor sprites left `DungeonWorld` |
| ARC-B07 | Round results controller | Hall retries, stale requests, saved rank, and result states have one owner |
| ARC-B08 | Floor transition transaction | Checkpoint, cover, activation, warmup, recovery, and input release are serial |
| ARC-B09 | Forge presentation session | Iframe presentation identity and editor restoration reject late completion |
| ARC-B10 | Camera motion projection | Camera feel and reduced motion are a pure reusable frame step |

Final proof: 889 tests pass and the same 2 baseline tests fail; client/server/worker types,
lint, and the production build pass. The baseline failures are an asset-provenance gap and
a stale static-scene count contract; neither was rewritten without its missing owner evidence.
A9 remains deferred.

## Completed VFX architecture follow-up — 2026-07-30

Exactly ten improvements were completed and integrated. Canonical outcomes are in the
[architecture report](architecture-review-2026-07-30.md#vfx-follow-up-batch--2026-07-30); local lifecycle tickets are under `.scratch/dungeon-vfx-architecture-batch/`.

| ID          | Owner / seam     | Result                                                              |
| ----------- | ---------------- | ------------------------------------------------------------------- |
| VFX-ARCH-01 | Ambient topology | Open crossed strata remove camera-enclosing geometry                |
| VFX-ARCH-02 | Ambient material | World-local stepped response owns fog and output transforms         |
| VFX-ARCH-03 | Beam profiles    | Ambient, objective, and portal signal implementations stay isolated |
| VFX-ARCH-04 | Beam time        | Frame callers use one uniform-agnostic interface                    |
| VFX-ARCH-05 | Stone hierarchy  | Planted structure and animated crystal have separate owners         |
| VFX-ARCH-06 | Ground contact   | Open ritual geometry replaces a generic closed aura                 |
| VFX-ARCH-07 | Practical light  | Stone factory owns bounded local response                           |
| VFX-ARCH-08 | Effect identity  | Stone palette crosses the fixed-scene seam intact                   |
| VFX-ARCH-09 | Burst pool       | Per-stone color reuses fixed resources                              |
| VFX-ARCH-10 | Fixed actors     | Play facade consumes the canonical static-scene contracts           |

Final gate: 774 tests / 154,392 assertions, all TypeScript configs, lint, targeted format,
code-verification build, two-angle godray proof, and final Ember proof.
