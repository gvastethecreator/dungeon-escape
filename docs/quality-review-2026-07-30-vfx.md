# VFX and release quality review — 2026-07-30

Status: ready for the production runbook gate.

## Outcome

- Ambient light is world geometry: six open crossed strata, no camera-enclosing shell, one draw, 36 triangles.
- Collectible stones keep planted structure, a bounded practical, open ground contact, a narrow objective signal, and per-stone pooled collection color.
- Architecture follow-up completed exactly ten tickets and removed five duplicated fixed-scene actor interfaces from `DungeonWorld`.
- The future Vite native-loader warning was removed by making the shared Hall imports explicit `.ts` paths.

## Evidence

| Gate                   | Result                                                                            |
| ---------------------- | --------------------------------------------------------------------------------- |
| Focused VFX            | 42 passed, 13,616 assertions                                                      |
| Full suite             | 774 passed, 154,392 assertions                                                    |
| Types                  | client, server, worker passed                                                     |
| Lint                   | passed                                                                            |
| Build                  | production and code-verification builds passed; native-loader warning removed     |
| Runtime proof          | final godray two-angle and Ember Play captures; no browser/network errors         |
| 8-second runtime trace | 719 samples; p50 10 ms; p95 20.1 ms; p99 21.1 ms; max 30.1 ms; no gaps over 33 ms |
| Renderer snapshot      | 189 calls; 290,421 triangles; 636 geometries; 348 materials                       |
| HTML report            | containment validator, desktop and 390 px views passed                            |

## Adversarial autopsy

- Hard stepped edges remain visible by design; they stay fixed in local UV and do not form a closed perimeter.
- Ember remains the brightest stone, but its faceted form, cage, pedestal, and floor contact remain readable in the final capture.
- Live visual proof covers Ember; all four stones have structural, palette, resource, placement, and quest-state tests.
- The large vendor/shared chunk warning remains. Manual chunk reshaping was already rejected as an ownership fix; no release behavior depends on that warning.
- Repository-wide Oxfmt still reports 47 unrelated pre-existing files. Every file touched by this work passes targeted format and `git diff --check`.
- Independent review was unavailable; this is an internal adversarial pass.

## Production gate

Do not mutate D1 until the exact account resource, export/backup path, reset transaction, migrations, deploy target, and public health checks are verified. The production reset/deploy authorization does not extend to any other database or domain.
