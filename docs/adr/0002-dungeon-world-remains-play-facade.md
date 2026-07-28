# DungeonWorld remains the Play facade

status: accepted

`DungeonWorld` remains the caller-facing world interface. Fixed scene build and cleanup move first into `StaticDungeonScene`; enemy, effect, interaction, audio-frame, and minimap behavior stay behind the facade until a later seam has two real adapters.

## Considered Options

- Split by file size: easy to start, shallow modules and leaked build order.
- Replace `DungeonWorld` with many caller-facing modules: smaller files, larger interface and weaker locality.
- Keep the facade and extract one deep fixed-scene module: accepted because callers retain one interface while build ownership gains a focused seam.

## Consequences

- Static build results include collision, occupied seats, and resources needed by Play.
- Build and cleanup move together.
- Each later extraction must pass the deletion test and preserve the facade.
