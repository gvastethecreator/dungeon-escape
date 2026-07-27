# Dungeon editor, world signals and jump

## Map contract

`DungeonData` is the shared source for editor and play. When Forge posts a valid payload, the host
imports it at once as a preview. This does not start or replace the active run. The Play action then
activates that same object. A spawn edit on Map Preview updates the preview object, and Play keeps
that selected cell.

`DungeonEditorProjection` maps the runtime data to canvas layers:

- floor, corridor, wall and doorway cells;
- connected pool and lake cells;
- room bounds and special-room identity;
- torches, key props, threats and magic-stone rooms;
- spawn and exit.

The editor does not rebuild layout rules.

## World signals

- `LiquidSectionKit` groups adjacent liquid cells. Each group gets one continuous surface. Boundary
  instances give pools and frozen lakes a clear edge.
- `SpecialRoomSignalKit` places a low emissive ring and runes at grave, treasure, shrine, elite and
  boss room centers. Lake rooms use their liquid surface as the main signal.
- Wall torches use a forged shield plate, a curved iron bracket, a layered flame, radial halos and a
  bounded point light. The lantern variant uses the same room-scale light range.
- Magic stones share their deterministic room selection with the editor. Their point light stays
  parented to the pickup. A glow crown and an animated vertical signal make each stone visible from
  farther away.

## Jump contract

`Space` and the touch `Jump` button request a jump. `VerticalMotion` owns:

- one grounded jump at a time;
- vertical speed and gravity;
- a fixed floor at eye height;
- a ceiling with head clearance;
- jump, ceiling-hit and landing events.

The first-person controller keeps horizontal grid collision unchanged. Landing adds a small camera
dip and uses the existing step cue. Reduced-motion settings cut the camera dip. Platforms, slopes
and rigid-body physics stay outside this pass.

## Checks

From the repository root:

```bash
bun run test
bun run typecheck
bun run build
```

Browser proof covers the Forge source map, matching Map Preview, Forge Play, and the mobile touch
layout. Pointer-lock checks still depend on a browser that permits pointer capture.
