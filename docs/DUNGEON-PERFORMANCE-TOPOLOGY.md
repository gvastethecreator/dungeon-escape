# Dungeon performance and topology

Updated: 2026-07-28

## Play path

- The controller and simulation reuse frame-temporary objects.
- World audio anchors update every 125 ms instead of every frame.
- Collision resolves a blocked move with seven approach steps, keeping the player against visible geometry.
- Play caps device pixel ratio at 1 on desktop and 0.85 on mobile. The editor has its own quality cap.
- Distant torches stop creating visible geometry at 36 metres. Repeated atmosphere decoration is grouped by template.

## Browser paths (`RenderCapabilities`)

- Chrome/Edge desktop: full `compileAsync` warmup, CRT history on, DPR cap 1.25, `powerPreference: high-performance`.
- Firefox (and low-end / `?safeRender=1`): skip `compileAsync` (one warmup draw only), CRT off by default, DPR cap 1, `powerPreference: default`, warmup timeout 2s.
- Production Chrome sample (2026-07-28): renderer ready ~12s, longest long-task ~5.5s, ~112 programs — that precompile freezes Firefox hard enough to look dead.
- Overrides: `?quality=1` forces the high path; `?crt=0` / `?crt=1` force CRT; `?safeRender=1` forces the constrained path.
- Runtime: if smoothed frame time stays above the path budget (~28–36 ms), CRT auto-disables until frames recover (manual CRT toggle wins).

## Forge

- Rooms are primarily rectangular. Octagons are rare and ellipses remain exceptional. Entrance and boss rooms stay rectangular.
- Decoration follows room area: two props in small rooms, three in medium rooms, and four in large rooms. Props avoid water and ice.
- An arch needs a real room-to-corridor junction. Forge includes the room-facing normal so the host can place the frame on the wall plane.
- Imported `POOL` cells become walkable floor while retaining their liquid visual mask. Frozen lakes are also walkable.

## Recorded evidence

- Run `bun run test` for the current test count in this checkout.
- `bun run build` passes and Vite warns that the Three.js chunk exceeds 500 kB.
- Desktop Play sample: 301 frames over five seconds of movement, 16.62 ms mean, 16.8 ms p95, 16.9 ms maximum, and no frame over 20 ms.
- Integrated Forge sample: 42 rooms, 3,197 walkable cells, and complete BFS coverage.
- Mobile Play sample at 390×844: DPR 0.85, 299 draw calls, and 48×48 px touch controls.

These measurements ran without an authority service. Local state and rendering remained available.
