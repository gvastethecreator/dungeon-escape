# Dungeon Escape architecture workplan

Source: [architecture review](architecture-review-2026-07-27.md)

Status: implemented and locally verified on 2026-07-27.

## Frontier

| ID  | Module               | Status   | Depends on          | Acceptance proof                                                                                       |
| --- | -------------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------------------ |
| A1  | Forge message intake | accepted | —                   | Unknown, malformed, old, missing, and valid messages cross one public seam                             |
| A2  | Biome identity       | accepted | A1 terms            | Runtime, editor, Forge, and assets share IDs, order, labels, and support checks                        |
| A3  | Forge generation     | accepted | A1, A2              | Fixed seeds generate without DOM/WebGL and preserve host output                                        |
| A4  | Play runtime         | accepted | A1–A3               | Frame loop and tests use one runtime; browser adapters retain UI/audio/render duties                   |
| A5  | Static dungeon scene | accepted | A4 checkpoint       | Build/clear move together; facade, collision, reservations, render inventory, and disposal stay stable |
| A6  | Editor CSS           | accepted | A4 shell checkpoint | One stylesheet owns mode-specific editor/debug layout with desktop, narrow, focus, and motion parity   |

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
