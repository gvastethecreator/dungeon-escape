# Architecture improvement report — Dungeon Escape

Date: 2026-07-30
Mode: execution
Implementation cut: `5ca80ce`
Status: complete; exactly ten architecture improvements implemented and verified

## Executive summary

This batch completed exactly ten evidence-backed architecture improvements. Browser orchestration that had
been embedded in `src/main.ts` now crosses callable owners for launch policy, exploration, resume mapping,
save timing, Forge presentation, and run entry. Hall policy, authority concurrency, and Three.js disposal also
have one owner each.

The implementation cut adds 11 production files. Relative to baseline `8bd3914`, `src/main.ts` fell from
4,392 to 4,237 physical lines and `src/domain/bridge.ts` fell from 681 to 414. The code diff through `5ca80ce`
contains 50 files, 5,929 insertions, and 1,631 deletions, including tests and adversarial hardening.

The batch preserved routes, leaderboard outcomes, gameplay rules, and Forge protocol version 1. One explicit
compatibility decision changed: local run saves are now v4 so reproducible procedural custom runs can be
distinguished from imported Forge maps. Forge imports are session-only because the prior save could not
reconstruct their topology; ambiguous legacy custom saves fail closed. See ADR 0005.

Fresh independent and adversarial review found real lifecycle, hostile-input, migration, and cancellation
defects. All P1/P2 findings in the accepted seams were fixed before the final gates. **Postscript (2026-07-30/31):**
A7 and A8 were later accepted (ADR 0006). **Only A9 remains deferred** and still needs owner acceptance.
Residual wording later in this report that still lists A7–A9 as deferred is historical to the deep-module cut.

## Scope and method

The review covered owned code under `src/`, `server/`, and `worker/`; affected tests and migrations; domain
language in `CONTEXT.md`; ADRs; and local planning/tracker artifacts under `.scratch/`. Work followed an evidence
ledger, deletion tests, dependency-ordered local tickets, focused red/green tests, full integration gates,
installed-Chrome runtime checks, independent architecture review, and a separate adversarial pass.

Excluded: gameplay or visual redesign, dependency upgrades, deployment, remote issue/PR writes, broad formatting,
and the unrelated user-owned `.vscode/tasks.json`. No remote or production state was changed.

Confidence is high for the exercised contracts and installed-Chrome routes. It does not imply cross-browser,
production-network, storage-quota, or remote-authority certification.

## Evidence ledger

| Evidence                                          | Observation                                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git diff --stat 8bd3914..5ca80ce`                | 50 files changed; 5,929 insertions; 1,631 deletions.                                                                                                                                                                                                                                |
| Physical line comparison                          | `src/main.ts`: 4,392 → 4,237; `src/domain/bridge.ts`: 681 → 414.                                                                                                                                                                                                                    |
| Production additions                              | 11 files under `src/`: ten selected owners, with ARCH-09 intentionally using separate protocol and client files.                                                                                                                                                                    |
| `.scratch/dungeon-architecture-batch/tickets.md`  | Exactly ten top-level rows; the index `State` is `completed` for every row.                                                                                                                                                                                                         |
| `.scratch/dungeon-architecture-batch/issues/*.md` | Each issue has `Work state: completed`, checked acceptance, evidence, and a 1:1 implementation commit.                                                                                                                                                                              |
| Ticket-focused suites                             | Every new owner has direct tests; affected public seams and adapters are included.                                                                                                                                                                                                  |
| `bun test tests`                                  | 760 tests, 153,878 assertions, zero failures across 140 files.                                                                                                                                                                                                                      |
| `bun run typecheck:all`                           | Client, server, and worker TypeScript configurations pass.                                                                                                                                                                                                                          |
| `bun run lint`                                    | Repository Oxlint passes without warnings or errors.                                                                                                                                                                                                                                |
| `bun run build:code`                              | Fresh final-cut build passes; 151 modules transformed.                                                                                                                                                                                                                              |
| `bun run build`                                   | Fresh final-cut `dist` completed with the same code chunks as the green 151-module build; all 1,169 public files match by path, size, and SHA-256; preview passes. The wrapper timed out after 10 minutes during the 428 MB copy, so its eventual child exit code was not captured. |
| Chrome runtime proof                              | Batch paths cover normal, reduced-motion, and skip. Final-cut production Skip and exact A→B (`ASH-1DKETAU` → `ASH-13ZIHKY`) reach focused Play with no page/request/console errors and zero invalid-program warnings.                                                               |
| `git diff --check`                                | Passes. Repo-wide Oxfmt remains a recorded pre-existing whole-file baseline, not a green claim.                                                                                                                                                                                     |

## Findings

### ARCH-01 — Three resource disposal had two policies

**Severity:** medium lifecycle risk.
**Evidence / root cause:** `DungeonWorld` and `StaticDungeonScene` traversed Three.js trees separately, with
different duplicate and shared-material behavior.
**Implemented:** `ThreeResourceDisposer` owns traversal, per-cleanup ledgers, shared-library exclusions, and
explicit disposal by the cache owner. Mounted cached materials now dispose exactly once.
**Before / after:** two drifting cleanup implementations → one cleanup contract used by both lifecycle owners.
**Ticket / status:** `.scratch/dungeon-architecture-batch/issues/01-three-resource-disposal.md`; completed;
`de44747` (1:1), hardened in `93401bc`.
**Verification:** direct disposer and static-scene lifecycle regressions, client typecheck, call-site inspection.
**Documentation / decisions:** `CONTEXT.md` static-scene term; ADR 0002 keeps `DungeonWorld` as the facade.
**Residual:** callers must create one disposer per cleanup lifecycle.

### ARCH-02 — Hall repositories duplicated persistence policy

**Severity:** high deployed-parity risk.
**Evidence / root cause:** SQLite and D1 repeated the 14-column projection, bindings, rank order, row mapping,
and biome-star fold.
**Implemented:** `hallPersistence` owns complete statements and pure mapping/folding policy; adapters retain
native execution. Local SQLite now upgrades the room-count constraint with migration 0004, preserves portraits,
and closes its handle on failed initialization.
**Before / after:** two schema-policy owners → one policy with two native adapters.
**Ticket / status:** `.scratch/dungeon-architecture-batch/issues/02-hall-persistence-contract.md`; completed;
`22ee5c2` (1:1), hardened in `f845974`.
**Verification:** pure contract tests, real in-memory/disk SQLite migration tests, all TypeScript configs.
**Documentation / decisions:** shared Hall language in `CONTEXT.md`; migration is expand-contract.
**Residual:** schema changes still require both platform migration files.

### ARCH-03 — Hall transports duplicated application rules

**Severity:** high API-parity risk.
**Evidence / root cause:** Node and Worker repeated method routing, JSON semantics, validation, timestamps, status
mapping, and repository failures.
**Implemented:** a transport-neutral Hall application owns use cases/outcomes; adapters only enforce their body
boundary and map native request/response types. The Worker now counts and cancels an oversized stream while
reading instead of buffering it first.
**Before / after:** duplicated endpoint policy → one application with Node and Fetch adapters.
**Ticket / status:** `.scratch/dungeon-architecture-batch/issues/03-hall-application.md`; completed; `5229ec8`
(1:1), hardened in `f845974`.
**Verification:** direct application and adapter-parity tests cover GET, malformed/oversized bodies, method and
repository failures, including early stream cancellation.
**Documentation / decisions:** Hall application term in `CONTEXT.md`.
**Residual:** Node and Worker intentionally retain platform stream plumbing.

### ARCH-04 — Remote write concurrency lived in the domain bridge

**Severity:** high state-integrity risk.
**Evidence / root cause:** revisions, coalescing, epochs, aborts, drains, timeouts, and reconciliation occupied
roughly 250 lines beside local simulation and hydration.
**Implemented:** `AuthorityWriteQueue` owns the mutation state machine; the bridge retains commands and hydrate
decisions behind its existing public interface.
**Before / after:** mixed closure state → explicit queue owner and 267 fewer physical lines in the bridge.
**Ticket / status:** `.scratch/dungeon-architecture-batch/issues/04-authority-write-queue.md`; completed;
`292c130` (1:1).
**Verification:** direct concurrency plus full bridge-integrity coverage for replacement, late callbacks,
coalescing, timeout, drain, and reconciliation.
**Documentation / decisions:** Authority write queue term in `CONTEXT.md`.
**Residual:** availability still depends on the configured authority service.

### ARCH-05 — Launch query semantics were parsed repeatedly

**Severity:** medium boot-consistency risk.
**Evidence / root cause:** seed, mood aliases, authority, intro, QA, audit, and render flags were interpreted across
several owners.
**Implemented:** `LaunchConfiguration` creates one frozen boot snapshot and a pure seed/mode URL update.
**Before / after:** repeated browser-query policy → one parse plus structured subsystem inputs.
**Ticket / status:** `.scratch/dungeon-architecture-batch/issues/05-launch-configuration.md`; completed;
`26b2acd` (1:1).
**Verification:** launch, render, QA, domain, intro, and photo-path suites plus structural search.
**Documentation / decisions:** Launch configuration term in `CONTEXT.md`.
**Residual:** isolated compatibility helpers may still parse supplied strings in tests or standalone APIs.

### ARCH-06 — Floor exploration had no lifecycle owner

**Severity:** high multi-floor save risk.
**Evidence / root cause:** active/per-floor cells, map reveal, and last-cell tracking were host globals modified by
save, minimap, activation, and transitions.
**Implemented:** `FloorExploration` owns start, atomic restore, reveal, floor switch, visibility, stable views, and
defensive snapshots. Restore rejects malformed/out-of-bounds/wall cells and validates cells again at a switch.
**Before / after:** callers edited raw sets/maps → callers request lifecycle operations from one pure owner.
**Ticket / status:** `.scratch/dungeon-architecture-batch/issues/06-floor-exploration.md`; completed; `97cf67d`
(1:1), hardened in `93401bc`.
**Verification:** direct lifecycle, minimap, local-save, and campaign-floor regressions.
**Documentation / decisions:** `CONTEXT.md`; ADR 0004 active-floor contract.
**Residual:** minimap compatibility exports remain for current extensions and tests.

### ARCH-07 — Resume state was reconstructed by several callers

**Severity:** high persistence-evolution and hostile-input risk.
**Evidence / root cause:** capture, Continue, hydration, loaded restore, and floor transitions each knew parts of
the persisted-to-live mapping. Invalid seats could also affect world pressure before the controller rejected them.
**Implemented:** `RunResumeMapping` owns capture and activation plans. `LocalRunSave` validates the versioned JSON,
effect durations, coordinates, and distance. The controller validates occupancy first; the world restores pressure
from that canonical seat. Mid-jump height resumes grounded.
**Before / after:** coordinated field spreads → one projection seam plus a single hostile-input boundary.
**Ticket / status:** `.scratch/dungeon-architecture-batch/issues/07-run-resume-mapping.md`; completed; `75d2f6d`
(1:1), hardened in `93401bc`.
**Verification:** mapper, save, controller-pose, PlayRuntime, exploration, and campaign-floor tests.
**Documentation / decisions:** `CONTEXT.md`; ADR 0004; ADR 0005 for save v4/custom-map compatibility.
**Residual:** adding a persisted field still requires schema validation and this mapping contract.

### ARCH-08 — Local-save timing and feedback were browser globals

**Severity:** high data-loss and feedback-spam risk.
**Evidence / root cause:** first-deadline timing, flush rules, and a failure latch lived in `main.ts`. A direct
floor-transition write could race a queued autosave.
**Implemented:** `LocalRunSaveCoordinator` owns schedule, flush, disposal, active gating, and failure rearming.
Floor transitions flush through this owner, preserve an exact in-memory recovery candidate if storage fails, and
keep that failure visible without blocking the staircase. Save v4 marks Forge imports session-only.
**Before / after:** raw host timers/direct writes → one fake-clock-tested owner and explicit recovery policy.
**Ticket / status:** `.scratch/dungeon-architecture-batch/issues/08-local-save-coordinator.md`; completed;
`bcc1e58` (1:1), hardened in `93401bc`.
**Verification:** coordinator, save schema, browser lifecycle, custom-map kind, and floor recovery tests.
**Documentation / decisions:** `CONTEXT.md`; ADR 0004; ADR 0005.
**Residual:** quota/privacy failures can still prevent persistence; the current session remains playable.

### ARCH-09 — Forge iframe lifecycle and trust were spread through the host

**Severity:** high protocol and cancellation risk.
**Evidence / root cause:** source, load state, same-origin/current-window trust, posts, waits, visibility, and teardown
had several callers. Uncorrelated late completion and failed loads could poison later presentations.
**Implemented:** `ForgeFrameProtocol` and `ForgeFrameClient` own one presentation lifecycle. Additive v1
`presentationId` correlation rejects late completion; legacy uncorrelated completion is accepted once; a failed
load can remount; stop/dispose paths settle exactly once.
**Before / after:** raw iframe coordination in the host → one tested protocol client.
**Ticket / status:** `.scratch/dungeon-architecture-batch/issues/09-forge-frame-client.md`; completed; `d1dfb32`
(1:1), hardened in `93401bc`.
**Verification:** fake-frame lifecycle, hostile origin/source, timeout/retry, correlated/legacy completion, intake,
and live Chrome routes.
**Documentation / decisions:** Forge frame client term in `CONTEXT.md`; protocol remains v1 with an additive field.
**Residual:** a truly legacy frame can complete only its first uncorrelated presentation; later attempts safely
degrade through timeout/fallback.

### ARCH-10 — Run entry was one long host procedure

**Severity:** critical interaction-state risk.
**Evidence / root cause:** one host procedure mixed cancellation, fades, Forge theater, build, warmup, fallback,
recovery, Play activation, input, and focus. Failure could leave an opaque overlay or a replacement unowned.
**Implemented:** `RunIntroDirector` owns one serial abortable transaction with semantic effects and explicit
outcomes. A pending replacement is cancellable before prior cleanup completes; unexpected failure resets the
overlay. Renderer warmup draws only the live frame: both explicit scene precompiles were removed so offscreen
program handles cannot cross replacement, and a sequence guard rejects stale queued frames. Post-FX restores
render target, tone mapping, and clear state after every failed pass.
**Before / after:** implicit ordering in a large host → direct state-machine and renderer-work contracts.
**Ticket / status:** `.scratch/dungeon-architecture-batch/issues/10-run-intro-director.md`; completed; `2c75732`
(1:1), hardened in `93401bc`, `1d784a4`, and `5ca80ce`.
**Verification:** fake-port failure/cancel/supersede paths, live-frame warmup and post-FX failure tests,
normal/reduced/skip/replacement Chrome routes, Play focus, and clean captured errors.
**Documentation / decisions:** Run intro transaction term in `CONTEXT.md`.
**Residual:** the live-frame warmup draw is synchronous, so it is not cancellable or timeout-bounded.

## Decisions

- Accepted exactly ten deep owners; browser, database, storage, and transport effects stay in concrete adapters.
- Accepted additive Forge v1 presentation correlation and one-shot legacy completion compatibility.
- Accepted local save v4 and session-only imported Forge maps. ADR 0005 records the intentional loss of Continue
  for ambiguous legacy custom saves rather than restoring progress onto the wrong topology.
- Accepted one live-frame warmup draw with no explicit scene precompile. No compiler work crosses a replaceable
  world lifecycle; a queued frame still has a generation guard and post-FX restores renderer state on failure.
- Accepted expand-contract compatibility exports where immediate deletion would break current extensions.
- Rejected shallow helpers, concern-only file splits, a speculative generic database port, and manual vendor-chunk
  reshaping as an ownership fix.
- Deferred A7 runtime-only assets, A8 lazy Play/Creation lifecycle, and A9 static-scene planning. They remain
  broader owner decisions, not incomplete tickets in this batch.
- Preserved the unrelated `.vscode/tasks.json`; no deploy, push, remote tracker, or PR mutation occurred.

## Workplan

| Order | Ticket                       | Dependency       | Acceptance proof                             | State    |
| ----: | ---------------------------- | ---------------- | -------------------------------------------- | -------- |
|     1 | ARCH-01 Three disposal       | none             | exactly-once tests and both owners           | complete |
|     2 | ARCH-02 Hall persistence     | none             | shared mapping plus SQLite/D1 paths          | complete |
|     3 | ARCH-03 Hall application     | ARCH-02          | direct policy and adapter parity             | complete |
|     4 | ARCH-04 Authority queue      | none             | direct concurrency and bridge integrity      | complete |
|     5 | ARCH-05 Launch configuration | none             | direct parsing and affected subsystem suites | complete |
|     6 | ARCH-06 Floor exploration    | none             | lifecycle and multi-floor integration        | complete |
|     7 | ARCH-07 Resume mapping       | ARCH-06          | round trip, hostile input, canonical seat    | complete |
|     8 | ARCH-08 Save coordinator     | ARCH-07          | fake clock, page/floor lifecycle, v4 policy  | complete |
|     9 | ARCH-09 Forge frame client   | ARCH-05          | hostile input, retries, correlation, browser | complete |
|    10 | ARCH-10 Run intro director   | ARCH-05, ARCH-09 | explicit outcomes and live routes            | complete |

The next safe decision is A7. A8 should follow a stable runtime-asset boundary; A9 should follow stable
experience lifecycle ownership.

## Verification

| Check                           | Result                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Ten focused ticket sets         | passed; evidence in `.scratch/dungeon-architecture-batch/issues/`                                                                               |
| `bun test tests`                | passed: 760 tests, 153,878 assertions, 0 failures, 140 files                                                                                    |
| `bun run typecheck:all`         | passed: client, server, worker                                                                                                                  |
| `bun run lint`                  | passed: no warnings or errors                                                                                                                   |
| `bun run build:code`            | passed: 151 modules transformed                                                                                                                 |
| `bun run build`                 | artifact verified: final-cut `dist` emitted and previewed; wrapper timed out during public copy, so the child exit code was not captured        |
| Chrome development              | passed during the batch: normal, reduced, skip, replacement race, Play focus, clean captured errors                                             |
| Chrome final-cut production     | passed: Skip and exact A→B replacement end in focused Play; no page/request/console errors and zero `GL_INVALID_VALUE`/too-many-errors warnings |
| `git diff --check`              | passed                                                                                                                                          |
| Repo-wide Oxfmt                 | not a green claim; current defaults report pre-existing whole-file debt                                                                         |
| Structural self-check           | passed: old ownership markers removed; all new owners have production callers                                                                   |
| Independent architecture review | passed after report reconciliation                                                                                                              |
| Adversarial autopsy             | passed after P1/P2 remediation; remaining items are listed below                                                                                |
| Self-contained HTML             | companion report validated and inspected at desktop and narrow widths                                                                           |

## Residual risks

- D1 Hall GET performs entry and biome-star reads separately; a concurrent POST can make those two result sets
  reflect adjacent snapshots. This is a P3 consistency limitation, not a contract mismatch in tested serial use.
- The live-frame warmup draw is synchronous and is not cancellable or timeout-bounded; slow GPU/driver
  combinations need wider field evidence.
- Floor-transition recovery and warmup host integration still rely partly on structural source assertions. Their
  owners have direct tests, but real browser interleaving coverage is narrower than the unit/state-machine proof.
- Save v4 cannot recover ambiguous v1-v3 records explicitly marked `runSource: "custom"`. This fail-closed choice
  is documented in ADR 0005.
- The build retains future native-loader extension warnings and one chunk above 500 kB. Its 428 MB public copy
  outlived the 10-minute shell wrapper under concurrent workspace I/O; the completed artifact and preview are
  verified, but that child process's exit code was not captured.
- `src/main.ts`, `StaticDungeonScene`, and the eager experience graph remain large. Deferred A7-A9 describe the
  next deep boundaries rather than unfinished work in this exact-ten batch.
- `public/` still includes about 200.50 MiB of non-runtime inputs; A7 is the measured build/deploy opportunity.
- Browser proof used installed Chrome. It does not certify every browser engine, device, storage mode, production
  network, or remote authority.
- Chrome's shader compiler emits one non-fatal double-precision representation warning on first link. It is
  recorded separately from the eliminated invalid-program polling warnings.
- Repository-wide formatting debt remains outside this batch; `git diff --check` and Oxlint are green.
- The unrelated `.vscode/tasks.json` remains untracked and untouched.

## VFX follow-up batch — 2026-07-30

Mode: Execution

Status: Completed — exactly ten improvements

### Summary

The godray and collectible-stone recovery now has explicit geometry, material, animation, event, pooling, and fixed-scene ownership. Nine improvements were implemented through the visual recovery cut `81e7497`; the architecture pass then removed the five drifting actor interfaces duplicated by `DungeonWorld`.

### VFX-ARCH-01. Own open ambient topology

**Ticket / status:** `.scratch/dungeon-vfx-architecture-batch/issues/01-open-ambient-topology.md`; completed.

**Initial evidence:** a closed cone could contain the camera and turn into a screen wash.

**Implemented / before-after:** scattered shell assumptions became one deep geometry module inside the beam factory: six open strata, one draw, 36 triangles.

**Verification:** ambient topology tests and two-angle Play proof.

**Documentation / residual:** `ambient-godrays.md`; no geometry risk observed inside the tested profile.

### VFX-ARCH-02. Own ambient shader response

**Ticket / status:** `.scratch/dungeon-vfx-architecture-batch/issues/02-ambient-shader-response.md`; completed.

**Initial evidence:** shell material policy produced flat overlays and camera-dependent failure.

**Implemented / before-after:** the material module now absorbs local Bayer flow, stepped density, fog, tone mapping, and normal blending behind one profile selection.

**Verification:** shader contract tests and browser-error-free Play capture.

**Documentation / residual:** local UV prevents screen swim; low-end GPU coverage remains field work.

### VFX-ARCH-03. Isolate portal and objective profiles

**Ticket / status:** `.scratch/dungeon-vfx-architecture-batch/issues/03-profile-isolation.md`; completed.

**Initial evidence:** environment, stone, and portal signals had incompatible visual needs.

**Implemented / before-after:** one factory now selects ambient strata, objective strata, or smooth signal implementation while the portal caller retains its interface.

**Verification:** profile isolation tests prove the portal remains smooth.

**Documentation / residual:** no observed cross-profile regression.

### VFX-ARCH-04. Hide beam time uniforms behind one seam

**Ticket / status:** `.scratch/dungeon-vfx-architecture-batch/issues/04-beam-time-seam.md`; completed.

**Initial evidence:** frame callers must not depend on shader uniform layout.

**Implemented / before-after:** `tickVolumetricBeamTime` remains the single time interface for all three material adapters.

**Verification:** production call-site inspection and beam tests.

**Documentation / residual:** malformed third-party materials are safely ignored.

### VFX-ARCH-05. Separate planted and animated stone nodes

**Ticket / status:** `.scratch/dungeon-vfx-architecture-batch/issues/05-stone-node-ownership.md`; completed.

**Initial evidence:** world animation moved the pedestal, cage, light, and contact signal as one loose icon.

**Implemented / before-after:** the stone factory exposes one crystal assembly; the world animates it while structural nodes stay planted.

**Verification:** hierarchy tests and final Ember Play proof.

**Documentation / residual:** animation still intentionally lives in the Play facade.

### VFX-ARCH-06. Own ritual ground-contact geometry

**Ticket / status:** `.scratch/dungeon-vfx-architecture-batch/issues/06-ground-contact-owner.md`; completed.

**Initial evidence:** a generic closed aura leaked visual policy into every stone.

**Implemented / before-after:** one factory implementation generates open rings and stone-specific ticks behind the existing glow handle.

**Verification:** all-four geometry contracts.

**Documentation / residual:** none observed.

### VFX-ARCH-07. Bound stone practical lighting in the factory

**Ticket / status:** `.scratch/dungeon-vfx-architecture-batch/issues/07-stone-practical-light.md`; completed.

**Initial evidence:** a room-scale practical flattened the crystal and floor.

**Implemented / before-after:** intensity, inverse-square decay, short reach, emissive response, and crown response have one locality in `MagicStoneKit`.

**Verification:** bounded-light tests and Play proof.

**Documentation / residual:** other biome palettes have structural rather than per-biome screenshot proof.

### VFX-ARCH-08. Carry stone identity through pickup events

**Ticket / status:** `.scratch/dungeon-vfx-architecture-batch/issues/08-stone-effect-identity.md`; completed.

**Initial evidence:** collection dropped each stone's authored palette at the static-scene seam.

**Implemented / before-after:** `effectColor` now travels from factory to fixed scene, Play world, and burst trigger.

**Verification:** four distinct colors plus call-site tests.

**Documentation / residual:** none observed.

### VFX-ARCH-09. Recolor pooled bursts without allocations

**Ticket / status:** `.scratch/dungeon-vfx-architecture-batch/issues/09-pooled-burst-color.md`; completed.

**Initial evidence:** authored color could have required per-event materials or geometry.

**Implemented / before-after:** the fixed pool mutates existing color and peak-opacity state while preserving object identity.

**Verification:** repeated four-stone trigger test keeps all materials and geometries stable.

**Documentation / residual:** pool capacity remains the intentional upper bound.

### VFX-ARCH-10. Reuse fixed-scene actor contracts

**Ticket / status:** `.scratch/dungeon-vfx-architecture-batch/issues/10-fixed-scene-contracts.md`; completed.

**Initial evidence:** `DungeonWorld` repeated five interfaces exported by `StaticDungeonScene`; stone-signal additions had to be edited twice.

**Implemented / before-after:** roughly 80 lines of duplicate shape knowledge were deleted; the Play facade consumes the five canonical fixed-scene contracts.

**Verification:** 11 focused world tests, 774 full tests, all three TypeScript configs, lint, targeted format, and code-verification build pass.

**Documentation / residual:** `StaticDungeonScene` remains the contract owner under ADR 0002; no new domain term or ADR was needed.

### Follow-up integration verification

| Check              | Result                                                                            |
| ------------------ | --------------------------------------------------------------------------------- |
| Exact ticket count | 10 completed under `.scratch/dungeon-vfx-architecture-batch/`                     |
| Full tests         | 774 passed, 154,392 assertions, 0 failed                                          |
| Types              | client, server, and worker passed                                                 |
| Lint               | passed                                                                            |
| Build              | code-verification passed; 154 modules transformed                                 |
| Runtime            | final godray and Ember captures; 0 browser and 0 network errors                   |
| Renderer snapshot  | 189 calls, 290,421 triangles, 636 geometries, 348 materials                       |
| Format             | all touched files pass; repository-wide baseline still reports 47 unrelated files |
| Independent review | unavailable; internal adversarial review only                                     |

### Follow-up decisions and residual risks

- Kept the portal's smooth signal profile and `DungeonWorld` as the Play facade.
- Rejected extra post-processing, closed volumes, generic sphere auras, and a broad static-scene move.
- A9 static-scene planning remains deferred; this batch only removed duplicate contract knowledge.
- Visual proof covers one live stone representative plus structural coverage for all four palettes.
