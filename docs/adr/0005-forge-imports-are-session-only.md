# ADR 0005: Imported Forge maps are session-only

## Status

Accepted

## Context

The local run save can reproduce campaign and procedural custom maps from a seed and generation parameters.
An imported Forge map carries a validated grid, room graph, props, spawns, torches, pools, arches, and derived
topology that the current save does not store. Restoring only its seed and player progress builds a different
procedural map and applies progress to the wrong topology.

Older v3 custom saves do not identify whether their map was procedural or imported, so they cannot be migrated
safely from the stored record alone.

## Decision

- Local run save v4 records `customMapKind` as `procedural` or `forge`.
- Campaign saves and v4 procedural custom saves remain continuable.
- Imported Forge saves are marked session-only and never offered through Continue.
- Ambiguous v1-v3 records with `runSource: "custom"` fail closed. Legacy records without `runSource` retain the
  existing campaign-compatible behavior.
- The product states the Forge limit when the imported map starts.

## Consequences

- Continue never restores player, fog, timers, or enemies onto a different map topology.
- A legacy procedural custom save that used v3 is no longer continuable because it is indistinguishable from a
  Forge import. This is an explicit compatibility trade-off.
- Persisting imported Forge runs later requires a bounded, validated topology snapshot or another canonical
  reconstruction key; changing this policy requires a new ADR and storage-size proof.
