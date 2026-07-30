# ADR 0006: Audit runtime assets and generate campaign floors lazily

Status: accepted

Date: 2026-07-30

## Context

`public/` mixed deployable files with raw enemy sources and production metadata. It held 1,169 files and 408.26 MiB. New Game also generated every campaign floor before the player used one.

## Decision

- `public/` contains deployable files only. Raw/source material and production metadata live under `assets-source/`.
- Runtime rasters use WebP at half the source width and height. Pixel art uses nearest-neighbor sampling; continuous art uses Lanczos.
- `assets-source/runtime-optimization-manifest.json` records the source and output dimensions, hashes, byte sizes, resampling, and encoding.
- Deployment fails unless `audit:runtime-assets` validates the full public boundary and every optimized raster.
- Campaign floors are generated through a deterministic lazy cache. Only the active floor is materialized; revisiting a floor returns the cached dungeon.

## Consequences

The public package is about 49.92 MiB and no longer exposes raw enemy inputs. Optimized runtime rasters save 78.25% against their recorded source bytes. New Game avoids generating unused floors at startup. Asset-production scripts must publish into the documented runtime paths and keep metadata outside `public/`.
