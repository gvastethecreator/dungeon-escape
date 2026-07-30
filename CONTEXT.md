# Dungeon Escape Context

Dungeon Escape is a first-person run through a generated dungeon. Creation, Play, run state, and world presentation share one dungeon model.

## Language

**Dungeon**:
A connected set of rooms, corridors, features, entry, objectives, and exit used by Creation and Play.

**Dungeon floor set**:
A deterministic campaign-level collection of one to four sibling dungeons. `DungeonWorld` owns only the active floor; reciprocal stair anchors switch the active dungeon.

**Dungeon floor campaign**:
The deterministic, lazy cache that generates only the requested campaign floor. It preserves floor order and reciprocal stair anchors without building every sibling dungeon at run start.

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

**User settings**:
Browser-local music volume, effects volume, and texture-smoothing preference. Texture smoothing is off by default; audio mute state remains separate.

**Custom run**:
Custom Run, Forge apply, or Map Tools generation. Fully playable. **Never ranks** — victory shows a practice score only.
Procedural custom runs can Continue because their seed and parameters reproduce the map. Imported Forge maps
are session-only until the save format can carry their validated topology.

**Server runs** (optional):
Remote run list and sync when `?authority=` points at a compatible HTTP service, and only when Map tools are enabled. Code may still say authority for the client module; UI says Server.

**Hall application**:
The transport-neutral owner of Hall of Escapes request rules, validation, repository calls, and public outcomes. Node and Worker code only adapt their native request and response types.

**Authority write queue**:
The owner of ordered remote run mutations, revisions, coalescing, timeouts, authority replacement, draining, and reconciliation. The domain bridge keeps local simulation and hydration decisions.

**Launch configuration**:
The immutable, validated browser-query snapshot created once during boot. Runtime URL changes preserve unrelated query state without changing that snapshot.

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

**Floor exploration**:
The owner of active and per-floor visited cells, map visibility, floor switching, restoration, and defensive save snapshots.
It also supplies the explored ratio that tightens first-person fog on unknown space and restores the normal biome fog after enough traversal or an active-floor map reveal.

**Runtime asset boundary**:
Only deployable assets live under `public/`. Source sheets, raw generations, provenance, and production manifests live under `assets-source/`. Runtime rasters are half-size WebP files tracked by one optimization manifest and checked before deployment.

**Run resume activation plan**:
The pure projection that maps persisted run state into generation, session, runtime, player, and exploration inputs. Save parsing and effects remain outside it.

**Local run save coordinator**:
The owner of delayed local-save scheduling, explicit flush, disposal, and failure-notification latching. It does not own the save schema or UI copy.

**Forge frame client**:
The browser boundary for the Forge iframe source, trusted messages, versioned presentation commands, waits, cancellation, and cleanup.

**Run intro transaction**:
The serial, cancellable transition from New Game or Hall selection through Forge presentation, world preparation, Play activation, and final input focus.

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
