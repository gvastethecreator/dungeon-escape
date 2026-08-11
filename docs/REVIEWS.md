# Architecture, performance, and UX review

Reviewed: 2026-08-09.

## Architecture

- Procedural generation is owned by `DungeonGenerationEngine`; the entrypoint consumes its result instead of owning generation policy.
- `LazyDungeonEditorView` keeps the editor implementation behind a small lifecycle boundary and loads it only when needed.
- Runtime asset optimization now has an explicit authored-size policy. This prevents metadata repair from silently changing animation atlases or HUD icons.
- Remote database migration and deployment are kept outside the normal check path.

The generation/editor boundary is documented in [ADR 0008](adr/0008-generation-engine-editor-boundary.md).

## Performance

- Static detailed props are collapsed into material batches while movable lids, leaves, sockets, collision anchors, and reward anchors retain ownership.
- Enemy visuals use resident floor-local batches and shared billboard geometry.
- Editor code is deferred from the default play path.
- Vite 8.2.1 includes a pure-CSS chunk lookup improvement, and Wrangler 4.120.0 batches local observability writes.

Large Three.js and material chunks remain visible in build output. They are isolated by entry and feature boundaries; hiding the warning would not improve runtime cost. Future work should use browser traces before splitting shared render code further.

## User experience

- The real play flow, Forge editor, multi-floor stairs, touch controls, and keyboard flows are covered by browser smokes and focused tests.
- `smoke:mobile` checks the welcome and biome-pick flows at phone and tablet widths for overflow, missing labels, action target height, and the complete eleven-biome catalog.
- Runtime asset checks now protect the full icon and enemy-atlas set, so a missing or stale visual fails before deployment.
- Human visual approval remains open for unapproved enemy animation candidates; technical checks do not substitute for that decision.

## Evidence gate

The 2026-08-09 maintenance pass finished with:

- Frozen install: 77 installs across 213 packages, no lock changes.
- Dependency status: no outdated packages and no reported vulnerabilities.
- Integration gate: 1,103 tests across 203 files, with zero failures; browser, server, and Worker type checks; lint; format; runtime asset audit; and code-only build all passed.
- Runtime assets: 733 published files, 69,487,074 bytes, with no missing files, source leaks, orphan atlases, unoptimized rasters, or manifest drift.
- Production build: 227 modules and all four HTML entries built with Vite 8.2.1.
- Multi-floor browser smoke: no editor renderer chunks on the Play path, two walkable stair roots, floor 1 to 2 traversal and return, and no severe browser or network errors.
- Mobile browser smoke: 390×844 and 768×1024 passed with no horizontal overflow, no unlabeled visible controls, action heights of at least 48.8 px, and all eleven biome choices visible.
- Code map: 20 nodes, 85 verified edges, five flows, no unknown edges; static and browser interaction validation passed.

The production build still reports two chunks above 500 kB. The map-load benchmark recorded a 307 ms hot median for the current large fixture and a 21 ms median for door and room-prop placement on this machine. The warning remains visible until a browser trace proves a safe split. Human approval of pending enemy animation candidates also remains open.
