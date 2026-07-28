# Play runtime owns Play order

status: accepted

`PlayRuntime` owns the order of world updates, run-session transitions, quest transitions, snapshots, and disposal. Browser DOM, audio, input, and renderer work remain adapters so Play rules have one owner and tests can cross the same seam as the frame loop.

## Considered Options

- Keep Play order in `main.ts`: lowest migration cost, continued state mirrors and broad caller knowledge.
- Move all browser work into the runtime: fewer host calls, weaker locality for domain rules and harder headless tests.
- Own Play rules in the runtime and keep browser work in adapters: accepted for depth, locality, and a small test surface.

## Consequences

- Migration uses expand-contract and preserves the current frame order at each slice.
- Pointer lock, touch, pause, audio, renderer warmup, and HUD remain browser concerns.
- The runtime interface stays small; thin pass-through methods do not earn a place.
