# Dungeon Escape Context

Dungeon Escape is a first-person run through a generated dungeon. Creation, Play, run state, and world presentation share one dungeon model.

## Language

**Dungeon**:
A connected set of rooms, corridors, features, entry, objectives, and exit used by Creation and Play.

**Dungeon floor set**:
A deterministic campaign-level collection of one to four sibling dungeons. `DungeonWorld` owns only the active floor; reciprocal stair anchors switch the active dungeon.

**Creation**:
The shell mode for building and previewing a map (`engineMode: "editor"` in code). UI label is Creation, not Authority.

**Debug**:
The shell mode for graph overlay, cell map, and renderer telemetry. Not the server panel. UI label is Debug.

**Play**:
The shell mode for the live first-person run.

**Map tools**:
The docked panel with generation controls, presets, camera, and optional server-run list. **Local developer chrome only** (`vite` dev or localhost). Hidden on public deploy so players cannot rewrite seeds into the leaderboard path.

**Campaign run**:
New Game (biome pick) or Hall seed replay. Eligible for the Hall of Escapes on a four-stone escape.

**Player profile**:
Validated browser-local identity and campaign progress: name, avatar, first-finished-game state,
highest unlocked biome rank, and per-biome clears. It is separate from the active run save. The Hall
of Escapes stays hidden until this profile has reached its first win or loss ending.

**Custom run**:
Custom Run, Forge apply, or Map Tools generation. Fully playable. **Never ranks** — victory shows a practice score only.

**Server runs** (optional):
Remote run list and sync when `?authority=` points at a compatible HTTP service, and only when Map tools are enabled. Code may still say authority for the client module; UI says Server.

**Forge message**:
A versioned browser message that carries a Forge payload from Dungeon Creation into the game host.

**Forge payload**:
The validated dungeon, generation parameters, and metadata carried by a Forge message.

**Biome identity**:
The stable ID, order, display label, and supported-surface meaning shared by Creation, Play, editor previews, and assets.
_Avoid_: Theme when referring to the shared identity.

**Forge generation**:
The deterministic transformation from generation parameters and random state into a complete Forge payload.

**Play runtime**:
The owner of Play order and live run transitions across the world, run session, and quest state.

**Run session**:
The live run state for health, rewards, outcome, and elapsed time.

**Quest state**:
The four-stone objective state, stone timing, and portal readiness within a run.

**Static dungeon scene**:
The fixed scene, collision, occupied seats, and cleanup produced from one dungeon before Play updates begin.

**Enemy biome mods**:
Live combat stats and pursuit behavior resolved from the base enemy archetype, active biome profile, and run difficulty (`applyBiomeEnemyMods`). Presentation size stays on the base archetype.

**Biome event**:
A deterministic, time-bounded modifier for one biome that changes pressure, movement, or floor-hazard damage and exposes one HUD/visual state.

**Utility pickup**:
The map or mobility item. Map reveals the active floor; mobility boosts speed and stamina while granting floor-trap immunity. Both persist in the active run.
