# Quality review — 2026-07-27

## Scope

This pass covered the real welcome, Play, touch, save, renderer, worst-case 80-room route, reduced-motion path, editor asset loading, and code ownership. It preserved the active multi-task worktree. Publication, remote services, and asset rights stayed outside this pass.

## Changes

### Runtime and performance

- `src/main.ts` now records raw `requestAnimationFrame` gaps while the simulation delta remains capped at 50 ms.
- `src/editor/DungeonEditorView.ts` loads the active biome floor, wall, and enemy atlas on demand. Shared preview art loads once. Per-biome caches, in-flight de-duplication, stale-result guards, and fallbacks cover switches and failures.
- `src/world/EnemyMotionTrailVfx.ts` skips enemies beyond 16 m, removes per-frame string/`Set` work, tracks active slots, clears far trails once, and marks GPU buffers only after a real change.

### Play and recovery

- Touch Play now exposes 48 px `RUN` and `PAUSE` controls at 390×844. Pause clears held virtual actions and interaction pulses. Resume returns to touch input without requesting pointer lock.
- A changed cell schedules a local run save within one second. Later movement keeps the first deadline. `pagehide` and hidden-document events flush pending work.
- A failed local write shows one warning per failure run; a later successful write rearms the warning.

### Accessibility

- Reduced motion now removes camera bob, strafe lean, landing bounce, FOV changes, shake, and chromatic shift. The player can still move and look.

### Architecture

- `docs/architecture/architecture-review-2026-07-27.md` records six recommendations, proof, order, deletion tests, risks, and documentation follow-ups.
- The readable self-contained report is `.scratch/reports/architecture-dungeon-quality/index.html`.
- The owner still needs to accept the proposed architecture work. This pass applied no proposed architecture interface.

## Evidence

| Gate               | Result                                                                                             |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| Full tests         | 419 passed, 0 failed, 7,924 assertions across 84 files                                             |
| Typecheck          | Client, server, and worker passed through `bun run build`                                          |
| Production build   | Passed; 106 modules transformed                                                                    |
| Lint               | Passed with no warnings                                                                            |
| Diff whitespace    | `git diff --check` passed                                                                          |
| Global format      | Failed in 26 existing/shared WIP files; no broad rewrite was made                                  |
| Touch browser      | 390×844; ten 48 px targets; no HUD overlap; sprint, pause, and resume exercised                    |
| Save browser       | A real cell change persisted the exact live pose                                                   |
| Fresh network load | 314 → 151 resources; biome texture entries 24 → 6; mood enemy atlases 12 → 1                       |
| Architecture HTML  | HTML Lab valid; 1440×900 and 390×844; no page overflow or console messages; visible keyboard focus |
| Worst-case route   | 80 rooms, 132-cell exit route, 149 active enemies, no console or network errors                    |

### Worst-case development profile

The same route script and development server were used for both samples. The final player pose and visible scene differed, so draw-call and texture snapshots remain observations rather than clean A/B proof.

| Metric                |         Baseline |        Final |
| --------------------- | ---------------: | -----------: |
| frame gap p50         |          33.2 ms |      16.7 ms |
| frame gap p95         |          49.9 ms |      33.5 ms |
| frame gap p99         | 50.0 ms, old cap |      50.0 ms |
| frame gap max         | 50.0 ms, old cap | 83.3 ms, raw |
| gaps above 25 ms      |              497 |          313 |
| gaps above 33 ms      |              278 |          163 |
| long tasks            |               32 |           17 |
| longest task          |         1,706 ms |       106 ms |
| renderer programs     |              141 |          141 |
| end-snapshot calls    |              239 |          325 |
| end-snapshot textures |               60 |           69 |

The raw maximum closes a telemetry defect: the former sample could not report gaps above 50 ms. Program count stayed stable. End-snapshot calls and textures rose, so release performance needs a deterministic production trace before a public readiness claim.

## Residual risks and next work

1. Run a production, fixed-camera A/B profile with CPU and GPU timing. Compare trail enabled/disabled and record p95, p99, maximum, calls, textures, and memory.
2. Decide whether to accept architecture items A1 and A2. They offer the safest ownership gain. Keep A4 and A5 deferred until current runtime and world work reach a clean checkpoint.
3. Settle the 26-file format backlog in its own reviewed change. Several files contain active work from other tasks.
4. Audit the remaining active texture ownership. The editor no longer preloads every mood, while the world still needs its active and transition assets.
5. Keep the large `engine` and Three.js chunks on the release backlog. The build warns at the 500 kB threshold.

## Commit boundary

No commit was created. This checkout had broad, overlapping edits before this pass, including the same runtime, world, controller, style, and test files. A commit would mix work from several owners.
