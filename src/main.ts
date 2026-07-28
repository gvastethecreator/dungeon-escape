import * as THREE from "three";

import { GameAudio, type AudioCue, type MusicTrack } from "./audio/GameAudio";
import { footstepSurfaceAt } from "./audio/FootstepSurface";
import { createAuthorityClient } from "./authority/client";
import {
  createDomainBridge,
  readMoodFromUrl,
  readSeedFromUrl,
  roomLabelForCell,
  writeModeToUrl,
  writeSeedToUrl,
  type DomainBridge,
  type DungeonDomainState,
} from "./domain/bridge";
import { DUNGEON_PRESETS, type DungeonEditorParams, type DungeonPresetId } from "./editor/presets";
import { generateCompletableDungeon } from "./dungeon/completeness";
import { exportPlayDungeonToForgePresentation } from "./dungeon/exportPlayDungeonToForge";
import { setDungeonSpawn } from "./dungeon/generateDungeon";
import { hashSeed } from "./core/random";
import { parseForgeDungeonMessage, type ForgeDungeonIntakeValue } from "./dungeon/forgeIntake";
import type { DungeonData } from "./dungeon/types";
import { DungeonEditorView } from "./editor/DungeonEditorView";
import { type EngineMode, isEngineMode, shouldMountForge } from "./game/EngineMode";
import {
  difficultyLabel,
  formatRunClock,
  type DifficultySnapshot,
} from "./game/DifficultyDirector";
import { isLocalDevToolsEnabled, readLocalDevToolsEnv } from "./game/LocalDevTools";
import { FirstPersonController, type PlayerAction } from "./player/FirstPersonController";
import { AtmosphereSystem } from "./systems/AtmosphereSystem";
import {
  getDungeonMood,
  parseDungeonMoodId,
  resolveDungeonMood,
  type DungeonMoodId,
} from "./systems/DungeonMood";
import { LightingRig } from "./systems/LightingRig";
import { resolveDungeonExposure } from "./systems/LightTuning";
import { PovPostFx } from "./systems/PovPostFx";
import { computeCriticalHealthFeel } from "./systems/CriticalHealthFeel";
import {
  computeHazardFeel,
  decayHazardHitBoost,
  resolveDamageWashKind,
  type DamageWashKind,
} from "./systems/HazardFeel";
import { FrameGapProfiler, type FrameGapSnapshot } from "./systems/FrameGapProfiler";
import {
  detectRenderCapabilities,
  raceWithTimeout,
} from "./systems/RenderCapabilities";
import { collectVisibleRenderInventory } from "./systems/RenderInventory";
import { resolveRenderPixelRatio } from "./systems/RenderScale";
import { readVisualQaSeed, readVisualQaState } from "./systems/VisualQaState";
import {
  computePovFeel,
  decayExhaustionTrauma,
  decayHitTrauma,
  PovFeelState,
  samplePovShake,
} from "./systems/povFeel";
import { collectExploredAround, drawMinimap, MINIMAP_REVEAL_RADIUS } from "./ui/drawMinimap";
import { COPY, formatTime, type StoneId } from "./ui/copy";
import { BiomeScreenParticles } from "./ui/BiomeScreenParticles";
import { createMinimapLayoutScheduler } from "./ui/minimapLayout";
import {
  PlayRuntime,
  type PersistedRunSession,
  type PlayRuntimeProgress,
} from "./game/PlayRuntime";
import { shouldAdoptHydratedSeed } from "./game/hydratePolicy";
import { nextProceduralSeed } from "./game/SeedFactory";
import {
  canContinueDomainRun,
  canContinueLocalRun,
  readLocalRunSave,
  runSourceFromLocalSave,
  writeLocalRunSave,
  type LocalRunResumeState,
} from "./game/LocalRunSave";
import { isLeaderboardEligible, runSourceForDungeon, type RunSource } from "./game/RunSource";
import { loadLeaderboard, submitLeaderboardEntry } from "./leaderboard/client";
import {
  computeLeaderboardScore,
  emptyPlayerBiomeStars,
  normalizePlayerName,
  type LeaderboardEntry,
  type LeaderboardSubmissionInput,
  type PlayerBiomeStars,
} from "./leaderboard/contract";
import {
  LEADERBOARD_PORTRAIT_COUNT,
  frameForRank,
  portraitForIndex,
  portraitForName,
  portraitIndexForName,
} from "./leaderboard/portraits";
import { biomeCampaignParams, nextBiomeId } from "./systems/BiomeCampaign";
import { listBiomeIdentities, type BiomeId } from "./systems/BiomeIdentity";
import { biomeScreenArtSrc, mainScreenBiomeForPlayer } from "./systems/BiomeScreenArt";
import { biomeHoverColor, biomeIconSrc, expandBiomeStars } from "./systems/BiomeUi";
import { DungeonWorld } from "./world/DungeonWorld";
import type { HazardSurfaceEffect } from "./world/HazardTileSystem";
import { WORLD_TILE_SIZE, WORLD_WALL_HEIGHT } from "./world/WorldMetrics";
import "./styles.css";
import "./styles/editor.css";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}.`);
  return element;
}

const elements = {
  shell: requireElement<HTMLElement>(".app-shell"),
  scene: requireElement<HTMLCanvasElement>("#scene"),
  welcomeScreen: requireElement<HTMLElement>("#welcome-screen"),
  welcomeArt: requireElement<HTMLImageElement>(".welcome-art"),
  welcomeParticles: requireElement<HTMLCanvasElement>("#welcome-particles"),
  welcomeHome: requireElement<HTMLElement>("#welcome-home"),
  welcomeNew: requireElement<HTMLButtonElement>("#welcome-new"),
  welcomeContinue: requireElement<HTMLButtonElement>("#welcome-continue"),
  welcomeCustom: requireElement<HTMLButtonElement>("#welcome-custom"),
  welcomeStatus: requireElement<HTMLElement>("#welcome-status"),
  welcomeBiomePicker: requireElement<HTMLElement>("#welcome-biome-picker"),
  biomePickerGrid: requireElement<HTMLElement>("#biome-picker-grid"),
  biomePickerBack: requireElement<HTMLButtonElement>("#biome-picker-back"),
  leaderboardList: requireElement<HTMLOListElement>("#leaderboard-list"),
  leaderboardStatus: requireElement<HTMLElement>("#leaderboard-status"),
  generationForm: requireElement<HTMLFormElement>("#generation-form"),
  seed: requireElement<HTMLInputElement>("#seed"),
  roomCount: requireElement<HTMLInputElement>("#room-count"),
  roomCountLabel: requireElement<HTMLOutputElement>("#room-count-label"),
  loopRate: requireElement<HTMLInputElement>("#loop-rate"),
  loopRateLabel: requireElement<HTMLOutputElement>("#loop-rate-label"),
  mapWidth: requireElement<HTMLInputElement>("#map-width"),
  mapWidthLabel: requireElement<HTMLOutputElement>("#map-width-label"),
  mapHeight: requireElement<HTMLInputElement>("#map-height"),
  mapHeightLabel: requireElement<HTMLOutputElement>("#map-height-label"),
  minRoom: requireElement<HTMLInputElement>("#min-room"),
  minRoomLabel: requireElement<HTMLOutputElement>("#min-room-label"),
  maxRoom: requireElement<HTMLInputElement>("#max-room"),
  maxRoomLabel: requireElement<HTMLOutputElement>("#max-room-label"),
  corridorRadius: requireElement<HTMLInputElement>("#corridor-radius"),
  corridorLabel: requireElement<HTMLOutputElement>("#corridor-label"),
  roomPadding: requireElement<HTMLInputElement>("#room-padding"),
  paddingLabel: requireElement<HTMLOutputElement>("#padding-label"),
  decorDensity: requireElement<HTMLInputElement>("#decor-density"),
  decorDensityLabel: requireElement<HTMLOutputElement>("#decor-density-label"),
  enemyDensity: requireElement<HTMLInputElement>("#enemy-density"),
  enemyDensityLabel: requireElement<HTMLOutputElement>("#enemy-density-label"),
  lightLevel: requireElement<HTMLInputElement>("#light-level"),
  lightLevelLabel: requireElement<HTMLOutputElement>("#light-level-label"),
  profileSelect: requireElement<HTMLSelectElement>("#profile-select"),
  runSelect: requireElement<HTMLSelectElement>("#run-select"),
  runNew: requireElement<HTMLButtonElement>("#run-new"),
  runRefresh: requireElement<HTMLButtonElement>("#run-refresh"),
  pushServer: requireElement<HTMLButtonElement>("#push-server"),
  cameraSensitivity: requireElement<HTMLInputElement>("#camera-sensitivity"),
  cameraSensitivityLabel: requireElement<HTMLOutputElement>("#camera-sensitivity-label"),
  cameraMotion: requireElement<HTMLInputElement>("#camera-motion"),
  cameraMotionLabel: requireElement<HTMLOutputElement>("#camera-motion-label"),
  reroll: requireElement<HTMLButtonElement>("#reroll"),
  runStats: requireElement<HTMLParagraphElement>("#run-stats"),
  position: requireElement<HTMLParagraphElement>("#position-readout"),
  serverReadout: requireElement<HTMLParagraphElement>("#server-readout"),
  presetButtons: [...document.querySelectorAll<HTMLButtonElement>("[data-dungeon-preset]")],
  status: requireElement<HTMLParagraphElement>("#status"),
  resolveValue: requireElement<HTMLOutputElement>("#resolve-value"),
  resolveFill: requireElement<HTMLElement>("#resolve-fill"),
  healthOrb: requireElement<HTMLElement>(".health-orb"),
  staminaMeter: requireElement<HTMLElement>("#stamina-meter"),
  staminaFill: requireElement<HTMLElement>("#stamina-fill"),
  playVitals: requireElement<HTMLElement>(".play-vitals"),
  runTimer: requireElement<HTMLTimeElement>("#run-timer"),
  timeFreezeStatus: requireElement<HTMLElement>("#time-freeze-status"),
  timeFreezeValue: requireElement<HTMLTimeElement>("#time-freeze-value"),
  luminousWardStatus: requireElement<HTMLElement>("#luminous-ward-status"),
  luminousWardValue: requireElement<HTMLTimeElement>("#luminous-ward-value"),
  annihilationPulseStatus: requireElement<HTMLElement>("#annihilation-pulse-status"),
  annihilationPulseValue: requireElement<HTMLTimeElement>("#annihilation-pulse-value"),
  hazardStatus: requireElement<HTMLElement>("#hazard-status"),
  hazardOverlay: requireElement<HTMLElement>("#hazard-overlay"),
  playObjective: requireElement<HTMLElement>("#play-objective"),
  stoneCount: requireElement<HTMLElement>("#stone-count"),
  stoneSockets: [...document.querySelectorAll<HTMLElement>(".stone-socket")],
  damage: requireElement<HTMLElement>("#damage-vignette"),
  eventFlash: requireElement<HTMLElement>("#event-flash"),
  pickupFeedback: requireElement<HTMLElement>("#pickup-feedback"),
  pickupFeedbackKicker: requireElement<HTMLElement>("#pickup-feedback-kicker"),
  pickupFeedbackText: requireElement<HTMLElement>("#pickup-feedback-text"),
  interactionPrompt: requireElement<HTMLButtonElement>("#interaction-prompt"),
  mapPanel: requireElement<HTMLElement>("#map-panel"),
  mapToggle: requireElement<HTMLButtonElement>("#map-toggle"),
  minimap: requireElement<HTMLCanvasElement>("#minimap"),
  touchButtons: [...document.querySelectorAll<HTMLButtonElement>("[data-move]")],
  touchPause: requireElement<HTMLButtonElement>("#touch-pause"),
  endOverlay: requireElement<HTMLElement>("#end-overlay"),
  endArt: requireElement<HTMLImageElement>(".end-art"),
  endParticles: requireElement<HTMLCanvasElement>("#end-particles"),
  endKicker: requireElement<HTMLElement>("#end-kicker"),
  endTitle: requireElement<HTMLElement>("#end-title"),
  endCopy: requireElement<HTMLElement>("#end-copy"),
  endResults: requireElement<HTMLElement>("#end-results"),
  endTime: requireElement<HTMLElement>("#end-time"),
  endScore: requireElement<HTMLElement>("#end-score"),
  endStones: requireElement<HTMLElement>("#end-stones"),
  endDistance: requireElement<HTMLElement>("#end-distance"),
  endBiome: requireElement<HTMLElement>("#end-biome"),
  endSeed: requireElement<HTMLElement>("#end-seed"),
  endLeaderboardForm: requireElement<HTMLFormElement>("#end-leaderboard-form"),
  endLeaderboardNote: requireElement<HTMLElement>("#end-leaderboard-note"),
  leaderboardName: requireElement<HTMLInputElement>("#leaderboard-name"),
  leaderboardPortraitPreview: requireElement<HTMLImageElement>("#leaderboard-portrait-preview"),
  leaderboardPortraitPreviewFace: requireElement<HTMLElement>("#leaderboard-portrait-preview-face"),
  leaderboardSubmit: requireElement<HTMLButtonElement>("#leaderboard-submit"),
  leaderboardSubmitStatus: requireElement<HTMLElement>("#leaderboard-submit-status"),
  endNextBiome: requireElement<HTMLButtonElement>("#end-next-biome"),
  retry: requireElement<HTMLButtonElement>("#retry"),
  newDungeon: requireElement<HTMLButtonElement>("#new-dungeon"),
  optionsMenu: requireElement<HTMLElement>("#options-menu"),
  optionsCard: requireElement<HTMLElement>("#options-card"),
  optionsTitle: requireElement<HTMLElement>("#options-title"),
  optionsResume: requireElement<HTMLButtonElement>("#options-resume"),
  optionsRestart: requireElement<HTMLButtonElement>("#options-restart"),
  optionsHome: requireElement<HTMLButtonElement>("#options-home"),
  recordPanel: requireElement<HTMLDetailsElement>(".record-panel"),
  modeButtons: [...document.querySelectorAll<HTMLButtonElement>("[data-engine-mode]")],
  audioToggle: requireElement<HTMLButtonElement>("#audio-toggle"),
  musicToggle: requireElement<HTMLButtonElement>("#music-toggle"),
  welcomeMusicToggle: requireElement<HTMLButtonElement>("#welcome-music-toggle"),
  bootScreen: requireElement<HTMLElement>("#boot-screen"),
  bootFill: requireElement<HTMLElement>("#boot-fill"),
  bootStatus: requireElement<HTMLElement>("#boot-status"),
  sceneFade: requireElement<HTMLElement>("#scene-fade"),
  runIntroStatus: requireElement<HTMLElement>("#run-intro-status"),
  crtToggle: requireElement<HTMLButtonElement>("#crt-toggle"),
  editorWorkspace: requireElement<HTMLElement>("#editor-workspace"),
  editorMap: requireElement<HTMLCanvasElement>("#editor-map"),
  editorRuntimeSurface: requireElement<HTMLElement>("#editor-runtime-surface"),
  editorForgeSurface: requireElement<HTMLElement>("#editor-forge-surface"),
  editorViewButtons: [...document.querySelectorAll<HTMLButtonElement>("[data-editor-view]")],
  forgeFrame: requireElement<HTMLIFrameElement>("#dungeon-forge"),
  forgeStatus: requireElement<HTMLElement>("#forge-status"),
  forgeApply: requireElement<HTMLButtonElement>("#forge-apply"),
  editorTitle: requireElement<HTMLElement>("#editor-title"),
  editorCell: requireElement<HTMLElement>("#editor-cell"),
  debugPanel: requireElement<HTMLElement>("#debug-panel"),
  debugMode: requireElement<HTMLElement>("#debug-mode"),
  debugFps: requireElement<HTMLElement>("#debug-fps"),
  debugFrame: requireElement<HTMLElement>("#debug-frame"),
  debugCalls: requireElement<HTMLElement>("#debug-calls"),
  debugTris: requireElement<HTMLElement>("#debug-tris"),
  debugTextures: requireElement<HTMLElement>("#debug-textures"),
  debugLights: requireElement<HTMLElement>("#debug-lights"),
};

const welcomeScreenParticles = new BiomeScreenParticles(elements.welcomeParticles, "ancient", {
  density: 1,
  seedSalt: 17,
});
const endScreenParticles = new BiomeScreenParticles(elements.endParticles, "ancient", {
  density: 0.9,
  seedSalt: 43,
});

const TILE_SIZE = WORLD_TILE_SIZE;
const PLAYER_MOVE_SPEED = 4.25;
const PLAYER_SPRINT_MULT = 1.48;

// Local domain bridge keeps seed, floor, exploration, and engine mode coherent.
const urlSeed = readSeedFromUrl() ?? (elements.seed.value.trim() || COPY.hud.seedDefault);
elements.seed.value = urlSeed;
/** Map Tools + Server Runs only on local dev hosts — never on public deploy. */
const localDevTools = isLocalDevToolsEnabled(readLocalDevToolsEnv());
const authorityBaseUrl = localDevTools
  ? (new URLSearchParams(window.location.search).get("authority")?.trim() ?? "")
  : "";
const authority = createAuthorityClient({ baseUrl: authorityBaseUrl });
const domainBridge: DomainBridge = createDomainBridge({
  initialSeed: urlSeed,
  authority: authorityBaseUrl ? authority : null,
});
const visitedCells = new Set<string>();
let lastExploreCellKey = "";

function applyLocalDevToolsChrome(): void {
  elements.shell.dataset.localDevTools = localDevTools ? "true" : "false";
  elements.recordPanel.hidden = !localDevTools;
  elements.recordPanel.setAttribute("aria-hidden", localDevTools ? "false" : "true");
  if (!localDevTools) elements.recordPanel.open = false;
}

/** Open Map Tools only when local developer chrome is enabled. */
function setMapToolsOpen(open: boolean): void {
  elements.recordPanel.open = localDevTools && open;
}

applyLocalDevToolsChrome();

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 120);
const renderCaps = detectRenderCapabilities();
function createPlayRenderer(): THREE.WebGLRenderer {
  const common = {
    canvas: elements.scene,
    antialias: false as const,
  };
  try {
    return new THREE.WebGLRenderer({
      ...common,
      // Firefox dual-GPU + high-performance often picks a dead adapter (black canvas).
      powerPreference: renderCaps.preferDefaultGpu ? "default" : "high-performance",
    });
  } catch (error) {
    console.warn("Primary WebGL context failed; retrying with defaults", error);
    return new THREE.WebGLRenderer(common);
  }
}
const renderer = createPlayRenderer();
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
// Soft shadows + many torch lights stutter on mid GPUs; keep maps off for play smoothness.
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setPixelRatio(resolveRenderPixelRatio(window.devicePixelRatio, renderCaps.pixelRatioCap));
// The CRT path draws the scene plus two full-screen passes. Keep renderer.info across all draws, then
// reset once per animation frame so diagnostics describe the real scene cost.
renderer.info.autoReset = false;

const lighting = new LightingRig(scene);
// Neutral IBL so MeshStandard metals leave flat gray (low mood intensity keeps interiors grim).
try {
  lighting.bindEnvironment(renderer);
} catch (error) {
  // PMREM/RoomEnvironment can fail on broken Firefox WebGL adapters; continue without IBL.
  console.warn("Environment bind failed; continuing without IBL", error);
}
const world = new DungeonWorld(scene, { tileSize: TILE_SIZE, wallHeight: WORLD_WALL_HEIGHT });
const playRuntime = new PlayRuntime(world);
// Fog column shares WorldMetrics with the architecture stack.
const atmosphere = new AtmosphereSystem(scene, TILE_SIZE, WORLD_WALL_HEIGHT);
const povPost = new PovPostFx();
// CRT history + multi-sample composite is the usual Firefox stutter source.
povPost.setCrtEnabled(renderCaps.enableCrtByDefault);
const povFeel = new PovFeelState();
const audio = new GameAudio();
const playerPosition = new THREE.Vector3();
const audioForward = new THREE.Vector3();
const lanternForward = new THREE.Vector3();
const cameraShakeEuler = new THREE.Euler(0, 0, 0, "YXZ");
// Cached once — reading matchMedia every frame is wasteful and some browsers do
// non-trivial work on each call. The live MediaQueryList keeps .matches current.
const REDUCED_MOTION_QUERY = window.matchMedia("(prefers-reduced-motion: reduce)");
let dungeon: DungeonData | null = null;
let mapExpanded = false;
let lastMapDraw = 0;
let lastRunTimerSecond = -1;
let lastTimeFreezeDisplay = "";
let lastLuminousWardDisplay = "";
let lastAnnihilationPulseDisplay = "";
let lastHazardKind: HazardSurfaceEffect["kind"] | undefined;
/**
 * Cached minimap viewport (CSS size + clamped DPR). Refreshed on resize so the
 * per-frame drawMinimap call never triggers a getBoundingClientRect reflow even
 * when crossing cells rapidly. Initial values are placeholders; refreshed below.
 */
const minimapViewport = { width: 0, height: 0, pixelRatio: 1 };
const minimapLayout = createMinimapLayoutScheduler({
  measure: refreshMinimapViewport,
  draw: drawMap,
  requestFrame: window.requestAnimationFrame.bind(window),
  cancelFrame: window.cancelAnimationFrame.bind(window),
});
let smoothedFrameMs = 16.67;
const frameGapProfiler = new FrameGapProfiler();
let profileWarmupUntil = Number.POSITIVE_INFINITY;
let profileSimulationActive = false;
let lastPerformancePublish = 0;
const lastRenderSnapshot = { calls: 0, triangles: 0, points: 0, lines: 0 };
const longTaskObserver =
  typeof PerformanceObserver === "function"
    ? new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) frameGapProfiler.recordLongTask(entry.duration);
      })
    : null;
try {
  longTaskObserver?.observe({ entryTypes: ["longtask"] });
} catch {
  // Long-task entries are optional. Frame-gap percentiles remain available.
}
let damageTimer = 0;
/** Brief boost for hazard post-FX right after a surface damage tick (0..1). */
let hazardHitBoost = 0;
/** Active surface for continuous hazard lens grade (toxin DoT keeps "toxin"). */
let activeHazardKind: HazardSurfaceEffect["kind"] = null;
/** Residual camera trauma after a hit (0..1); keeps shaking for a few seconds. */
let hitTrauma = 0;
/** Residual camera wobble after sprint stamina empties (0..1). */
let exhaustionTrauma = 0;
/** Dirty cache for stamina HUD updates. */
let lastStaminaHudKey = "";
let touchSessionActive = false;
let resumeTouchControls = false;
let uiInteractQueued = false;
let engineMode: EngineMode = "editor";
let crtEnabled = renderCaps.enableCrtByDefault;
/** When frame time stays above budget, drop CRT without fighting a manual toggle. */
let crtAutoDisabled = false;
let crtManualOverride = false;
let optionsOpen = false;
let welcomeOpen = true;
const LAST_LEADERBOARD_NAME_KEY = "dungeon-escape:leaderboard-name";
const MUSIC_MUTED_KEY = "dungeon-escape:music-muted";
const LOCAL_RUN_SAVE_DELAY_MS = 1_000;
let leaderboardLoadSequence = 0;
let pendingLeaderboardSubmission: Omit<LeaderboardSubmissionInput, "playerName"> | null = null;
/**
 * Campaign (New Game / Hall seed / eligible continue) may rank.
 * Custom (Custom Run, Forge, Map Tools) never ranks.
 */
let runSource: RunSource = "campaign";
/** When set, NEW GAME forces this biome instead of seed-random mood. */
let forcedPlayMoodId: DungeonMoodId | null = null;
/** Aggregate stars from every saved escape (player → biome label → count). */
let playerBiomeStars: PlayerBiomeStars = emptyPlayerBiomeStars();
let welcomeArtSequence = 0;
let continueDomainState: DungeonDomainState | null = null;
let localSaveTimer: ReturnType<typeof setTimeout> | null = null;
let localSaveFailureNotified = false;
let runHasStarted = false;
let renderWarmupReady = false;
let renderWarmupSequence = 0;
let lastDebugDraw = 0;
let regenerateTimer = 0;
let currentThreatDistance: number | null = null;
let editorSurface: "runtime" | "forge" = "forge";
let forgeIntake: ForgeDungeonIntakeValue | null = null;
let forgePreviewDungeon: DungeonData | null = null;
let lastProceduralSeed = 0;
let pendingProceduralSeed: number | null = null;
/** Bumps to cancel an in-flight new-game map theater sequence. */
let runIntroToken = 0;
let runIntroActive = false;
/** Resolvers waiting for Forge build-reveal completion (or timeout). */
const forgeAnimWaiters = new Set<() => void>();
type EditorSurfaceState = "idle" | "loading" | "updating" | "ready" | "error";
const editorSurfaceStatus: Record<
  "runtime" | "forge",
  { message: string; state: EditorSurfaceState }
> = {
  runtime: { message: "MAP PREVIEW · WAITING", state: "idle" },
  forge: { message: "DUNGEON CREATION · LOADING", state: "loading" },
};

function renderEditorSurfaceStatus(): void {
  const status = editorSurfaceStatus[editorSurface];
  elements.editorWorkspace.dataset.editorSurface = editorSurface;
  elements.editorWorkspace.dataset.editorState = status.state;
  elements.forgeStatus.dataset.state = status.state;
  elements.forgeStatus.textContent = status.message;
  elements.forgeStatus.classList.toggle("is-ready", status.state === "ready");
}

function setEditorSurfaceStatus(
  surface: "runtime" | "forge",
  message: string,
  state: EditorSurfaceState,
): void {
  editorSurfaceStatus[surface] = { message, state };
  if (surface === editorSurface) renderEditorSurfaceStatus();
}

const controller = new FirstPersonController(camera, elements.scene, {
  tileSize: TILE_SIZE,
  eyeHeight: 1.62,
  moveSpeed: PLAYER_MOVE_SPEED,
  sprintMultiplier: PLAYER_SPRINT_MULT,
  acceleration: 12.5,
  deceleration: 17,
  mouseSensitivity: 0.00155,
  cameraMotion: 0.72,
  lookResponse: 38,
  ceilingHeight: WORLD_WALL_HEIGHT,
  jumpSpeed: 5.8,
  gravity: 17,
  onLockChange(locked, message) {
    const hasActivePlayInput = locked || touchSessionActive;
    audio.setPaused(!hasActivePlayInput || engineMode !== "play" || optionsOpen);
    // ESC releases pointer lock → open options in play.
    // Pointer lock can fail on touch browsers. Keep an armed touch session in
    // play instead of reopening the pause panel over its controls.
    if (!hasActivePlayInput && engineMode === "play" && playRuntime.state().runMode === "playing") {
      setOptionsOpen(true);
    } else if (locked) {
      setOptionsOpen(false);
    }
    setStatus(message);
  },
});

const editorView = new DungeonEditorView(elements.editorMap, { onSelectSpawn: selectEditorSpawn });

let objectiveBannerTimer: ReturnType<typeof setTimeout> | null = null;
let objectiveFadeTimer: ReturnType<typeof setTimeout> | null = null;
let lastPortalBanner = false;

/**
 * Player-facing status stays short. Tech telemetry (renderer ms, profile keys)
 * only surfaces when local developer chrome is on.
 */
function isPlayerFacingStatus(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (/renderer ready|warmup|preparing renderer|compile/i.test(text)) return false;
  if (/^profile\s+/i.test(text)) return false;
  if (/\bmood\b/i.test(text) && /collect four stones/i.test(text)) return false;
  if (/topology|draw calls|programs|long.?task/i.test(text)) return false;
  return true;
}

function setStatus(message: string, options: { forceDev?: boolean } = {}): void {
  if (options.forceDev && !localDevTools) return;
  if (!localDevTools && !isPlayerFacingStatus(message)) {
    if (import.meta.env.DEV) console.info("[status:dev]", message);
    return;
  }
  elements.status.textContent = message;
}

function setToggleValue(button: HTMLButtonElement, on: boolean, onLabel: string, offLabel: string): void {
  const value = button.querySelector<HTMLElement>("[data-toggle-value]");
  const label = on ? onLabel : offLabel;
  if (value) value.textContent = label;
  else button.textContent = label;
  button.classList.toggle("is-active", on);
  button.setAttribute("aria-pressed", String(on));
}

function currentDomainSave(): DungeonDomainState {
  const persisted = playRuntime.snapshot();
  return {
    ...domainBridge.getDungeon(),
    ...persisted,
    engineMode,
  };
}

function captureLocalRunResume(): LocalRunResumeState | undefined {
  const state = playRuntime.state();
  if (!dungeon || state.runMode !== "playing") return undefined;
  const player = controller.getState();
  const difficulty = world.getDifficultyState();
  const questSnap = playRuntime.snapshot();
  return {
    runSeconds: questSnap.runSeconds,
    difficultyElapsed: difficulty.elapsedSeconds,
    player: {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: player.lookYaw,
      pitch: player.lookPitch,
      distanceTravelled: player.distanceTravelled,
    },
    visitedCells: [...visitedCells],
    timeFreezeRemaining: world.timeFreezeRemaining,
    luminousWardRemaining: world.luminousWardRemaining,
    annihilationPulseRemaining: world.annihilationPulseRemaining,
    perStoneSeconds: questSnap.perStoneSeconds,
  };
}

function domainToPersistedSession(
  state: DungeonDomainState,
  resume?: LocalRunResumeState,
): PersistedRunSession {
  return {
    resolve: state.resolve,
    foundStoneIds: [...state.foundStoneIds] as StoneId[],
    portalOpen: state.portalOpen,
    runMode: state.runMode,
    exitReached: state.exitReached,
    runSeconds: resume?.runSeconds ?? 0,
    perStoneSeconds: resume?.perStoneSeconds,
  };
}

function runtimeProgressFromResume(
  resume: LocalRunResumeState | undefined,
): PlayRuntimeProgress | undefined {
  if (!resume) return undefined;
  return {
    progress: {
      difficultyElapsed: resume.difficultyElapsed,
      timeFreezeRemaining: resume.timeFreezeRemaining,
      luminousWardRemaining: resume.luminousWardRemaining,
      annihilationPulseRemaining: resume.annihilationPulseRemaining,
    },
    player: { x: resume.player.x, z: resume.player.z },
  };
}

function applyLocalRunResume(resume: LocalRunResumeState | undefined): void {
  if (!resume || !dungeon) return;
  visitedCells.clear();
  for (const key of resume.visitedCells) visitedCells.add(key);
  if (visitedCells.size === 0) {
    revealMinimapCell(dungeon.spawn);
  }
  controller.restorePose(resume.player);
  lastRunTimerSecond = -1;
}

function setRunSource(next: RunSource, hasForge = Boolean(dungeon?.forge)): void {
  runSource = runSourceForDungeon(next, hasForge);
  elements.shell.dataset.runSource = runSource;
}

function persistCurrentRun(): void {
  if (!dungeon) return;
  const saved = writeLocalRunSave(
    currentDomainSave(),
    localStorage,
    Date.now(),
    captureLocalRunResume(),
    runSource,
  );
  if (saved) {
    localSaveFailureNotified = false;
    return;
  }
  if (localSaveFailureNotified) return;
  localSaveFailureNotified = true;
  setStatus("Could not save this run locally. Continue may not be available.");
}

function scheduleLocalRunSave(delay = LOCAL_RUN_SAVE_DELAY_MS): void {
  if (!runHasStarted || localSaveTimer !== null) return;
  localSaveTimer = setTimeout(() => {
    localSaveTimer = null;
    persistCurrentRun();
  }, delay);
}

function flushLocalRunSave(): void {
  if (localSaveTimer !== null) {
    clearTimeout(localSaveTimer);
    localSaveTimer = null;
  }
  if (runHasStarted) persistCurrentRun();
}

function flushLocalRunSaveWhenHidden(): void {
  if (document.visibilityState === "hidden") flushLocalRunSave();
}

function setContinueCandidate(state: DungeonDomainState | null, status: string): void {
  continueDomainState = canContinueDomainRun(state) ? state : null;
  elements.welcomeContinue.disabled = continueDomainState === null;
  elements.welcomeStatus.textContent = status;
}

function setWelcomeOpen(open: boolean): void {
  welcomeOpen = open;
  elements.welcomeScreen.hidden = !open;
  welcomeScreenParticles.setActive(open);
  elements.shell.classList.toggle("is-welcome", open);
  if (open) {
    controller.releasePointerLock();
    audio.setPaused(true);
    setMusicBed("menu");
    showWelcomeHome();
    window.requestAnimationFrame(() => elements.welcomeNew.focus());
  } else {
    elements.scene.focus({ preventScroll: true });
    // Leaving the welcome screen for play or editor stops the menu bed.
    if (playRuntime.state().runMode === "playing") setMusicBed(null);
  }
}

function showWelcomeHome(): void {
  elements.welcomeHome.hidden = false;
  elements.welcomeBiomePicker.hidden = true;
}

function storedLeaderboardName(): string | null {
  try {
    return normalizePlayerName(localStorage.getItem(LAST_LEADERBOARD_NAME_KEY) ?? "");
  } catch {
    return null;
  }
}

function syncWelcomeArt(): void {
  const biomeId = mainScreenBiomeForPlayer(storedLeaderboardName(), playerBiomeStars);
  const src = biomeScreenArtSrc(biomeId, "main");
  if (
    elements.welcomeArt.dataset.biomeId === biomeId &&
    elements.welcomeArt.getAttribute("src") === src
  ) {
    welcomeScreenParticles.setBiome(biomeId);
    return;
  }
  const sequence = ++welcomeArtSequence;
  void preloadImage(src).then(() => {
    if (sequence !== welcomeArtSequence) return;
    elements.welcomeArt.src = src;
    elements.welcomeArt.dataset.biomeId = biomeId;
    welcomeScreenParticles.setBiome(biomeId);
  });
}

function showBiomePicker(): void {
  renderBiomePicker();
  elements.welcomeHome.hidden = true;
  elements.welcomeBiomePicker.hidden = false;
  // Warm the Forge iframe while the player picks a biome so New Game does not
  // stall on a cold WebGL load under the black curtain.
  void ensureForgeFrameLoaded(8_000, { presentation: true });
  window.requestAnimationFrame(() => elements.biomePickerBack.focus());
}

function formatStarLabel(count: number): string {
  if (count <= 0) return "—";
  if (count <= 5) return "★".repeat(count);
  return `★ ${count}`;
}

function renderBiomePicker(): void {
  const name = storedLeaderboardName() ?? "";
  const starsForPlayer = name ? (playerBiomeStars[name] ?? {}) : {};
  const fragment = document.createDocumentFragment();
  for (const biome of listBiomeIdentities()) {
    const button = document.createElement("button");
    const icon = document.createElement("img");
    const label = document.createElement("span");
    const stars = document.createElement("span");
    const count = starsForPlayer[biome.label] ?? 0;
    button.type = "button";
    button.className = "biome-picker-option";
    button.dataset.biomeId = biome.id;
    button.style.setProperty("--biome-hover", biomeHoverColor(biome.id));
    button.setAttribute("role", "listitem");
    icon.className = "biome-picker-option__icon";
    icon.src = biomeIconSrc(biome.id);
    icon.alt = "";
    icon.width = 32;
    icon.height = 32;
    icon.decoding = "async";
    icon.draggable = false;
    label.className = "biome-picker-option__name";
    stars.className =
      count > 0 ? "biome-picker-option__stars" : "biome-picker-option__stars is-empty";
    label.textContent = biome.label;
    stars.textContent = formatStarLabel(count);
    stars.title = count > 0 ? `${count} clear${count === 1 ? "" : "s"}` : "No clears yet";
    button.append(icon, label, stars);
    button.addEventListener("click", () => {
      startNewGameWithBiome(biome.id);
    });
    fragment.append(button);
  }
  elements.biomePickerGrid.replaceChildren(fragment);
}

function startNewGameWithBiome(biomeId: BiomeId): void {
  forcedPlayMoodId = biomeId;
  void audio.unlock();
  // Apply the campaign ramp for this biome (Ancient soft → Backrooms brutal).
  applyEditorParamsToForm(biomeCampaignParams(biomeId));
  setRunSource("campaign", false);
  const visualQaSeed = readVisualQaSeed(window.location.search);
  void startPlayWithSeed(visualQaSeed ?? makeSeed(), {
    refreshProcedural: true,
    runSource: "campaign",
  }).then(() => {
    setStatus(`New game · ${getDungeonMood(biomeId).label}. Click the scene to look.`);
  });
}

/** Soft 8-bit scene beds. Menu / end screens keep music while play SFX are paused. */
function setMusicBed(track: MusicTrack | null): void {
  audio.setMusicTrack(track);
}

function readStoredMusicMuted(): boolean {
  try {
    return localStorage.getItem(MUSIC_MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredMusicMuted(muted: boolean): void {
  try {
    localStorage.setItem(MUSIC_MUTED_KEY, muted ? "1" : "0");
  } catch {
    // Private mode / blocked storage: preference stays in memory for this session.
  }
}

function syncMusicToggleUi(): void {
  const muted = audio.isMusicMuted;
  const title = muted ? "Enable music" : "Disable music";
  setToggleValue(elements.musicToggle, !muted, COPY.hud.musicOn, COPY.hud.musicOff);
  elements.musicToggle.title = title;

  // Welcome uses a note icon; keep the glyph and only update a11y state.
  elements.welcomeMusicToggle.setAttribute("aria-pressed", String(!muted));
  elements.welcomeMusicToggle.setAttribute("aria-label", title);
  elements.welcomeMusicToggle.classList.toggle("is-active", !muted);
  elements.welcomeMusicToggle.classList.toggle("is-muted", muted);
  elements.welcomeMusicToggle.title = title;
}

function setMusicMutedPreference(muted: boolean, options: { playClick?: boolean } = {}): void {
  audio.setMusicMuted(muted);
  writeStoredMusicMuted(muted);
  syncMusicToggleUi();
  if (options.playClick !== false && !audio.isMuted) audio.play("uiToggle");
  setStatus(muted ? "Music off." : "Music on.");
}

function readSkipRunIntroFromUrl(search = window.location.search): boolean {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  return params.get("skipRunIntro") === "1" || params.get("skipRunIntro") === "true";
}

function setRunIntroActive(active: boolean, statusText = ""): void {
  runIntroActive = active;
  if (active) {
    elements.shell.dataset.runIntro = "true";
    elements.editorWorkspace.hidden = false;
    elements.editorWorkspace.setAttribute("aria-busy", "true");
    // Status is screen-reader only — the generation view is map-only, no chrome.
    elements.runIntroStatus.hidden = false;
    elements.runIntroStatus.textContent = statusText || COPY.status.forgingMap;
  } else {
    delete elements.shell.dataset.runIntro;
    elements.editorWorkspace.removeAttribute("aria-busy");
    elements.runIntroStatus.hidden = true;
    elements.runIntroStatus.textContent = "";
  }
}

function setRunIntroStatus(statusText: string): void {
  if (!runIntroActive) return;
  elements.runIntroStatus.hidden = false;
  elements.runIntroStatus.textContent = statusText;
}

function notifyForgeAnimComplete(): void {
  if (forgeAnimWaiters.size === 0) return;
  const waiters = [...forgeAnimWaiters];
  forgeAnimWaiters.clear();
  for (const resolve of waiters) resolve();
}

/** Soft crossfade between map theater and Play — keep short so black never feels stuck. */
const SCENE_FADE_OUT_MS = 260;
const SCENE_FADE_IN_MS = 300;

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, Math.max(0, ms));
  });
}

async function setSceneFadeOpaque(
  opaque: boolean,
  options: { instant?: boolean; durationMs?: number } = {},
): Promise<void> {
  const fade = elements.sceneFade;
  const instant = Boolean(options.instant) || REDUCED_MOTION_QUERY.matches;
  const durationMs = options.durationMs ?? (opaque ? SCENE_FADE_OUT_MS : SCENE_FADE_IN_MS);
  if (opaque) {
    fade.hidden = false;
    fade.setAttribute("aria-hidden", "false");
    if (instant) {
      fade.classList.add("is-instant");
      fade.classList.add("is-opaque");
      void fade.offsetWidth;
      fade.classList.remove("is-instant");
      return;
    }
    fade.style.transitionDuration = `${durationMs}ms`;
    // Force reflow so the opacity transition always runs from 0.
    void fade.offsetWidth;
    fade.classList.add("is-opaque");
  } else {
    if (instant) {
      fade.classList.add("is-instant");
      fade.classList.remove("is-opaque");
      void fade.offsetWidth;
      fade.classList.remove("is-instant");
      fade.style.transitionDuration = "";
      fade.hidden = true;
      fade.setAttribute("aria-hidden", "true");
      return;
    }
    fade.style.transitionDuration = `${durationMs}ms`;
    fade.classList.remove("is-opaque");
  }
  await waitMs(durationMs);
  if (!opaque) {
    fade.hidden = true;
    fade.setAttribute("aria-hidden", "true");
    fade.style.transitionDuration = "";
  }
}

function forgeFrameSrc(presentation: boolean): string {
  const base = elements.forgeFrame.dataset.src ?? "/forge.html";
  if (!presentation) return base;
  const url = new URL(base, window.location.origin);
  url.searchParams.set("presentation", "1");
  return `${url.pathname}${url.search}`;
}

async function ensureForgeFrameLoaded(
  timeoutMs = 8_000,
  options: { presentation?: boolean } = {},
): Promise<boolean> {
  if (elements.forgeFrame.dataset.loaded === "true") return true;
  if (!elements.forgeFrame.hasAttribute("src")) {
    elements.forgeFrame.src = forgeFrameSrc(Boolean(options.presentation));
  }
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    if (elements.forgeFrame.dataset.loaded === "true") return true;
    await waitAnimationFrames(1);
  }
  return elements.forgeFrame.dataset.loaded === "true";
}

/**
 * Build the playable world while the map theater is on screen so the black
 * gap between map and first-person is only a short crossfade, not a long hang.
 */
async function buildPlayWorldForIntro(
  seed: string,
  token: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  // One frame so the map can paint before the main-thread build.
  await waitAnimationFrames(1);
  if (token !== runIntroToken) return { ok: false, message: "cancelled" };
  try {
    buildDungeon(seed);
    if (token !== runIntroToken) return { ok: false, message: "cancelled" };
    await waitForRendererWarmup(10_000);
    if (token !== runIntroToken) return { ok: false, message: "cancelled" };
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Could not generate the dungeon.",
    };
  }
}

function postForgeMessage(payload: Record<string, unknown>): void {
  elements.forgeFrame.contentWindow?.postMessage(payload, location.origin);
}

function postForgePresentation(options: {
  enabled: boolean;
  animate: boolean;
  seed?: number;
  themeKey?: string | null;
  dungeon?: ReturnType<typeof exportPlayDungeonToForgePresentation>;
}): void {
  postForgeMessage({
    type: "black-flag:forge-presentation",
    version: 1,
    enabled: options.enabled,
    animate: options.animate,
    seed: options.seed,
    themeKey: options.themeKey ?? undefined,
    dungeon: options.dungeon,
  });
}

function waitForForgeAnimComplete(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      forgeAnimWaiters.delete(done);
      resolve();
    };
    forgeAnimWaiters.add(done);
    const timer = window.setTimeout(done, Math.max(200, timeoutMs));
  });
}

function resolveIntroThemeKey(): string {
  if (forcedPlayMoodId) return forcedPlayMoodId;
  return readMoodFromUrl() || "ancient";
}

/**
 * Campaign New Game / Hall seed: build the real play map, show it isometrically
 * in Forge (same topology), then fade into first-person Play.
 */
async function startPlayWithSeed(
  seed: string,
  options: { refreshProcedural?: boolean; runSource?: RunSource } = {},
): Promise<void> {
  const token = ++runIntroToken;
  // Free any waiter from a previous intro so it can exit on the token check.
  notifyForgeAnimComplete();
  void audio.unlock();
  if (options.runSource) setRunSource(options.runSource, false);
  const normalizedSeed = seed.trim() || COPY.hud.seedDefault;
  elements.seed.value = normalizedSeed;
  const skipIntro = readSkipRunIntroFromUrl();
  const animateMap = !skipIntro && !REDUCED_MOTION_QUERY.matches;
  const introThemeKey = resolveIntroThemeKey();

  setWelcomeOpen(false);
  setMusicBed(null);
  controller.setEnabled(false);
  closeEndOverlay();
  setOptionsOpen(false);

  if (skipIntro) {
    if (options.refreshProcedural) {
      pendingProceduralSeed = makeProceduralSeed();
      postPendingProceduralSeed();
    }
    buildDungeon(normalizedSeed);
    setEngineMode("play", { hydrate: false });
    setStatus(COPY.status.enterPlay);
    return;
  }

  // Full black first — no menu flash, no chrome, no status labels on screen.
  await setSceneFadeOpaque(true, { instant: true });
  if (token !== runIntroToken) return;

  // Map theater uses the editor workspace; stay out of Play until the fade.
  if (engineMode === "play") {
    setEngineMode("editor", { hydrate: false, persist: false });
  }
  setRunIntroActive(true, COPY.status.forgingMap);
  setEditorSurface("forge");
  setMapToolsOpen(false);
  playCue("forge");

  await waitAnimationFrames(1);
  if (token !== runIntroToken) return;

  // Build the exact dungeon the player will explore first.
  const world = await buildPlayWorldForIntro(normalizedSeed, token);
  if (token !== runIntroToken) return;
  if (!world.ok) {
    setRunIntroActive(false);
    await setSceneFadeOpaque(false, { durationMs: SCENE_FADE_IN_MS });
    setWelcomeOpen(true);
    if (world.message !== "cancelled") setStatus(world.message);
    return;
  }
  if (!dungeon) {
    setRunIntroActive(false);
    await setSceneFadeOpaque(false, { durationMs: SCENE_FADE_IN_MS });
    setWelcomeOpen(true);
    setStatus("Could not generate the dungeon.");
    return;
  }

  const forgeReady = await ensureForgeFrameLoaded(6_000, { presentation: true });
  if (token !== runIntroToken) return;

  const presentationDungeon = exportPlayDungeonToForgePresentation(dungeon, introThemeKey);
  let mapShown = false;
  if (forgeReady) {
    postForgeMessage({ type: "black-flag:forge-visibility", visible: true });
    const settled = waitForForgeAnimComplete(animateMap ? 10_000 : 800);
    postForgePresentation({
      enabled: true,
      animate: animateMap,
      seed: hashSeed(normalizedSeed) % 999_999 || 1,
      themeKey: introThemeKey,
      dungeon: presentationDungeon,
    });
    await waitAnimationFrames(2);
    if (token !== runIntroToken) return;
    await setSceneFadeOpaque(false, { durationMs: SCENE_FADE_IN_MS });
    mapShown = true;
    await settled;
  } else {
    // No Forge iframe: still hold a beat so the handoff does not snap.
    await setSceneFadeOpaque(false, { durationMs: SCENE_FADE_IN_MS });
    await waitMs(animateMap ? 900 : 320);
  }
  if (token !== runIntroToken) return;

  setRunIntroStatus(COPY.status.enteringDungeon);
  await setSceneFadeOpaque(true, { durationMs: SCENE_FADE_OUT_MS });
  if (token !== runIntroToken) return;

  postForgePresentation({ enabled: false, animate: false });
  postForgeMessage({ type: "black-flag:forge-visibility", visible: false });
  setRunIntroActive(false);
  setEngineMode("play", { hydrate: false });
  if (!renderWarmupReady) await waitForRendererWarmup(4_000);
  if (token !== runIntroToken) return;

  setStatus(COPY.status.enterPlay);
  await setSceneFadeOpaque(false, { durationMs: SCENE_FADE_IN_MS });
  controller.setEnabled(canEnablePlayController());
  elements.scene.focus({ preventScroll: true });
  void mapShown;
}

let currentSelectedPortraitIndex: number | null = null;
let hasCustomPortraitSelection = false;

function updateLeaderboardPortraitPreview(rawName: string, forceReset = false): void {
  const name = normalizePlayerName(rawName) ?? (rawName.trim() || "Wanderer");
  if (!hasCustomPortraitSelection || forceReset) {
    currentSelectedPortraitIndex = portraitIndexForName(name);
  }
  if (currentSelectedPortraitIndex === null) {
    currentSelectedPortraitIndex = portraitIndexForName(name);
  }
  const portrait = portraitForIndex(currentSelectedPortraitIndex);
  if (elements.leaderboardPortraitPreview.getAttribute("src") !== portrait.src) {
    elements.leaderboardPortraitPreview.src = portrait.src;
  }
}

function cycleLeaderboardPortrait(): void {
  const rawName = elements.leaderboardName.value || "Wanderer";
  const name = normalizePlayerName(rawName) ?? (rawName.trim() || "Wanderer");
  if (currentSelectedPortraitIndex === null) {
    currentSelectedPortraitIndex = portraitIndexForName(name);
  }
  currentSelectedPortraitIndex = (currentSelectedPortraitIndex + 1) % LEADERBOARD_PORTRAIT_COUNT;
  hasCustomPortraitSelection = true;
  const portrait = portraitForIndex(currentSelectedPortraitIndex);
  elements.leaderboardPortraitPreview.src = portrait.src;
}

function renderLeaderboard(entries: readonly LeaderboardEntry[]): void {
  const fragment = document.createDocumentFragment();
  for (const entry of entries) {
    const portrait =
      entry.portraitIndex !== undefined && entry.portraitIndex !== null
        ? portraitForIndex(entry.portraitIndex)
        : portraitForName(entry.playerName);
    const frame = frameForRank(entry.rank);
    const playerStars = playerBiomeStars[entry.playerName] ?? {};
    const starTokens = expandBiomeStars(playerStars);
    const item = document.createElement("li");
    const face = document.createElement("div");
    const portraitImg = document.createElement("img");
    const frameImg = document.createElement("img");
    const rank = document.createElement("span");
    const body = document.createElement("div");
    const top = document.createElement("div");
    const nameBlock = document.createElement("div");
    const name = document.createElement("span");
    const stars = document.createElement("div");
    const score = document.createElement("span");
    const meta = document.createElement("div");
    const time = document.createElement("span");
    const biome = document.createElement("span");
    const seed = document.createElement("button");

    item.className = `leaderboard-entry is-${frame.kind}`;
    face.className = `leaderboard-face is-${frame.kind}`;
    portraitImg.className = "leaderboard-portrait";
    frameImg.className = "leaderboard-frame";
    rank.className = "leaderboard-rank";
    body.className = "leaderboard-body";
    top.className = "leaderboard-top";
    nameBlock.className = "leaderboard-name-block";
    name.className = "leaderboard-name";
    stars.className = "leaderboard-stars";
    score.className = "leaderboard-score";
    meta.className = "leaderboard-meta";
    time.className = "leaderboard-time";
    biome.className = "leaderboard-biome";
    seed.className = "leaderboard-seed";
    seed.type = "button";

    const escapeTime = formatTime(entry.durationMs / 1000);
    portraitImg.src = portrait.src;
    portraitImg.alt = "";
    portraitImg.decoding = "async";
    portraitImg.loading = "lazy";
    portraitImg.draggable = false;
    frameImg.src = frame.src;
    frameImg.alt = "";
    frameImg.decoding = "async";
    frameImg.loading = "lazy";
    frameImg.draggable = false;
    frameImg.setAttribute("aria-hidden", "true");
    rank.textContent = String(entry.rank);
    rank.setAttribute("aria-label", COPY.leaderboard.rankLabel(entry.rank));
    name.textContent = entry.playerName;
    name.title = `${entry.biome} · ${entry.difficulty}`;
    if (starTokens.length > 0) {
      const counts = Object.entries(playerStars)
        .filter(([, count]) => count > 0)
        .map(([biomeLabel, count]) => `${biomeLabel}: ${count}`)
        .join(" · ");
      stars.title = counts;
      stars.setAttribute("aria-label", `Biome stars: ${counts}`);
      for (const token of starTokens) {
        const star = document.createElement("span");
        star.className = "leaderboard-star";
        if (token.id) star.dataset.biome = token.id;
        star.textContent = "★";
        star.style.color = token.color;
        star.title = token.label;
        stars.append(star);
      }
    } else {
      stars.hidden = true;
    }
    score.textContent = entry.score.toLocaleString("en-US");
    score.title = "Score";
    time.textContent = escapeTime;
    time.title = "Escape time";
    biome.textContent = entry.biome;
    biome.title = "Biome";
    seed.textContent = entry.seed;
    seed.title = COPY.leaderboard.playSeed(entry.seed);
    seed.setAttribute("aria-label", COPY.leaderboard.playSeed(entry.seed));
    seed.addEventListener("click", (event) => {
      event.preventDefault();
      forcedPlayMoodId = null;
      // Hall seeds are campaign attempts — still rank on escape.
      void startPlayWithSeed(entry.seed, { runSource: "campaign" });
    });

    face.append(portraitImg, frameImg, rank);
    nameBlock.append(name, stars);
    top.append(nameBlock, score);
    meta.append(time, biome, seed);
    body.append(top, meta);
    item.append(face, body);
    fragment.append(item);
  }
  elements.leaderboardList.replaceChildren(fragment);
}

async function refreshLeaderboard(): Promise<void> {
  const sequence = ++leaderboardLoadSequence;
  elements.leaderboardStatus.textContent = COPY.leaderboard.loading;
  try {
    const response = await loadLeaderboard();
    if (sequence !== leaderboardLoadSequence) return;
    playerBiomeStars = response.playerBiomeStars ?? emptyPlayerBiomeStars();
    syncWelcomeArt();
    renderLeaderboard(response.entries);
    if (!elements.welcomeBiomePicker.hidden) renderBiomePicker();
    elements.leaderboardStatus.textContent = response.entries.length
      ? `${response.entries.length} completed escape${response.entries.length === 1 ? "" : "s"}.`
      : COPY.leaderboard.empty;
  } catch (error) {
    if (sequence !== leaderboardLoadSequence) return;
    playerBiomeStars = emptyPlayerBiomeStars();
    syncWelcomeArt();
    renderLeaderboard([]);
    elements.leaderboardStatus.textContent = COPY.leaderboard.unavailable;
    console.warn("Leaderboard could not be loaded", error);
  }
}

function createLeaderboardRunId(): string {
  const unique = crypto.randomUUID?.() ?? `${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
  return `run_${unique}`;
}

function prepareLeaderboardSubmission(
  runSeconds: number,
  distanceM: number,
  biome: string,
  seed: string,
  roomCount: number,
): void {
  const durationMs = Math.max(1_000, Math.round(runSeconds * 1000));
  const difficultyValue = getEnemyDensity();
  const score = computeLeaderboardScore({ durationMs, difficultyValue, roomCount });
  elements.endScore.textContent = score.toLocaleString("en-US");

  // Custom Run / Forge / Map Tools: show the local score, never open Hall submit.
  if (!isLeaderboardEligible(runSource) || Boolean(dungeon?.forge)) {
    pendingLeaderboardSubmission = null;
    elements.endLeaderboardForm.hidden = true;
    elements.endLeaderboardNote.hidden = false;
    elements.endLeaderboardNote.textContent = COPY.leaderboard.customExcluded;
    return;
  }

  pendingLeaderboardSubmission = {
    runId: createLeaderboardRunId(),
    durationMs,
    distanceM: Math.max(0, Math.round(distanceM)),
    stonesFound: 4,
    biome,
    seed,
    difficultyValue,
    roomCount,
    runSource: "campaign",
  };
  elements.endLeaderboardNote.hidden = true;
  elements.endLeaderboardNote.textContent = "";
  elements.endLeaderboardForm.hidden = false;
  elements.leaderboardName.disabled = false;
  elements.leaderboardSubmit.disabled = false;
  elements.leaderboardSubmit.textContent = COPY.leaderboard.submit;
  elements.leaderboardSubmitStatus.textContent = "";
  try {
    elements.leaderboardName.value = localStorage.getItem(LAST_LEADERBOARD_NAME_KEY) ?? "";
  } catch {
    elements.leaderboardName.value = "";
  }
  hasCustomPortraitSelection = false;
  currentSelectedPortraitIndex = portraitIndexForName(elements.leaderboardName.value || "Wanderer");
  updateLeaderboardPortraitPreview(elements.leaderboardName.value || "Wanderer", true);
}

function canEnablePlayController(): boolean {
  return renderWarmupReady && engineMode === "play" && playRuntime.state().runMode === "playing";
}

function beginRendererWarmup(): number {
  renderWarmupSequence += 1;
  renderWarmupReady = false;
  elements.shell.dataset.rendererReady = "false";
  controller.setEnabled(false);
  return renderWarmupSequence;
}

function startRendererWarmup(sequence: number, readyMessage: string): void {
  if (localDevTools) setStatus("Preparing renderer...");
  window.requestAnimationFrame(() => {
    if (sequence !== renderWarmupSequence) return;
    const startedAt = performance.now();
    world.setPickupEffectsWarmupVisible(true);
    void (async () => {
      try {
        const warmupWork = async (): Promise<void> => {
          // Firefox: skip compileAsync — parallel compile is weak and long tasks
          // freeze the tab (Chrome already spends ~12s here with 100+ programs).
          if (!renderCaps.skipShaderPrecompile) {
            await renderer.compileAsync(scene, camera);
            await povPost.compileSceneAsync(renderer, scene, camera);
            await povPost.compileAsync(renderer);
          }
          // One locked-control draw uploads pooled geometry and forces a first
          // program link on the constrained path without blocking the UI thread
          // on a full scene compile.
          povPost.render(renderer, scene, camera);
        };
        const raced = await raceWithTimeout(
          warmupWork(),
          renderCaps.compileTimeoutMs,
          "renderer-warmup-timeout",
        );
        if (!raced.ok) {
          console.warn("Dungeon renderer warmup timed out or failed", raced.reason);
          // Still attempt a single draw so the canvas is not left black.
          try {
            povPost.render(renderer, scene, camera);
          } catch (drawError) {
            console.warn("Warmup fallback draw failed", drawError);
          }
        }
      } finally {
        world.setPickupEffectsWarmupVisible(false);
      }
    })()
      .then(() => {
        if (sequence !== renderWarmupSequence) return;
        renderWarmupReady = true;
        elements.shell.dataset.rendererReady = "true";
        elements.shell.dataset.renderPath = renderCaps.isFirefox
          ? "firefox"
          : renderCaps.isLowEnd
            ? "low-end"
            : renderCaps.skipShaderPrecompile
              ? "safe"
              : "default";
        controller.setEnabled(canEnablePlayController());
        const readyMs = Math.round(performance.now() - startedAt);
        if (localDevTools) {
          setStatus(`${readyMessage} Renderer ready in ${readyMs}ms.`);
        } else if (engineMode === "play") {
          setStatus(COPY.status.enterPlay);
        } else {
          setStatus(readyMessage);
        }
      })
      .catch((error: unknown) => {
        if (sequence !== renderWarmupSequence) return;
        // Never leave play locked if warmup throws — first frames compile lazily.
        renderWarmupReady = true;
        elements.shell.dataset.rendererReady = "error";
        controller.setEnabled(canEnablePlayController());
        const detail = error instanceof Error ? error.message : "unknown error";
        console.error("Dungeon renderer warmup failed", error);
        if (localDevTools) {
          setStatus(`${readyMessage} Renderer warmup failed: ${detail}.`);
        } else if (engineMode === "play") {
          setStatus(COPY.status.enterPlay);
        } else {
          setStatus(readyMessage);
        }
      });
  });
}

function clearObjectiveBannerTimers(): void {
  if (objectiveBannerTimer !== null) {
    clearTimeout(objectiveBannerTimer);
    objectiveBannerTimer = null;
  }
  if (objectiveFadeTimer !== null) {
    clearTimeout(objectiveFadeTimer);
    objectiveFadeTimer = null;
  }
}

/**
 * Show a centered objective line, hold, then fade out.
 * Used for run intro and portal-open beat.
 */
function showObjectiveBanner(
  text: string,
  state: "hunt" | "portal" | "escaped" = "hunt",
  holdMs = 3200,
  fadeMs = 1400,
): void {
  clearObjectiveBannerTimers();
  const el = elements.playObjective;
  el.hidden = false;
  el.textContent = text;
  el.dataset.state = state;
  el.classList.remove("is-fading");
  // Force reflow so re-show restarts transitions after a prior fade.
  void el.offsetWidth;
  el.classList.add("is-visible");
  objectiveBannerTimer = setTimeout(() => {
    el.classList.add("is-fading");
    el.classList.remove("is-visible");
    objectiveFadeTimer = setTimeout(() => {
      el.hidden = true;
      el.classList.remove("is-fading");
      objectiveFadeTimer = null;
    }, fadeMs);
    objectiveBannerTimer = null;
  }, holdMs);
}

// Dirty-tracking for the quest HUD. syncQuestHud() runs every simulation frame;
// without this guard it rebuilds the full QuestSnapshot + toggles DOM classes even
// when no stone/portal state changed. We compare the cheap quest getters instead.
let questHudStonesFound = -1;
let questHudPortalOpen = false;

function syncQuestHud(): void {
  const quest = playRuntime.state().quest;
  const { stonesFound, portalOpen } = quest;
  if (stonesFound === questHudStonesFound && portalOpen === questHudPortalOpen) return;
  questHudStonesFound = stonesFound;
  questHudPortalOpen = portalOpen;

  elements.stoneCount.textContent = `${stonesFound}/${quest.stonesTotal}`;
  for (const socket of elements.stoneSockets) {
    const id = socket.dataset.stone as StoneId | undefined;
    const bound = id ? quest.foundStoneIds.includes(id) : false;
    socket.classList.toggle("is-bound", bound);
    socket.setAttribute("aria-pressed", String(bound));
  }
  elements.shell.classList.toggle("has-relic", portalOpen);
  elements.shell.dataset.stones = String(stonesFound);

  // Portal-open beat: one banner when the fourth stone binds.
  if (portalOpen && !quest.escaped && !lastPortalBanner) {
    lastPortalBanner = true;
    showObjectiveBanner(COPY.objective.openPortal, "portal", 3600, 1500);
  }
}

function applyPersistedRunSession(
  persisted: PersistedRunSession,
  resume?: LocalRunResumeState,
): void {
  const state = playRuntime.restore(persisted, runtimeProgressFromResume(resume));
  applyLocalRunResume(resume);
  if (resume) syncDomainExplore();
  lastTimeFreezeDisplay = "";
  lastLuminousWardDisplay = "";
  lastAnnihilationPulseDisplay = "";
  lastRunTimerSecond = -1;
  syncTimeFreezeHud();
  syncLuminousWardHud();
  syncAnnihilationPulseHud();
  syncRunTimer();
  controller.setSolidColliders(world.getSolidColliders());
  elements.shell.dataset.mode = state.runMode;
  elements.shell.dataset.relic = String(state.quest.portalOpen);
  elements.shell.dataset.stones = String(state.quest.stonesFound);
  elements.shell.dataset.resolve = String(Math.ceil(state.resolve));
  lastPortalBanner = state.quest.portalOpen;
  questHudStonesFound = -1;
  questHudPortalOpen = false;
  updateResolve();
  updateObjective();
  if (state.runMode === "playing") closeEndOverlay();
  else showEndOverlay(state.runMode);
}

function setOptionsOpen(open: boolean): void {
  if (engineMode !== "play") {
    // Creation/Debug always show the docked tools shell.
    optionsOpen = false;
    elements.shell.classList.remove("options-open");
    elements.optionsMenu.hidden = false;
    elements.optionsCard.setAttribute("role", "region");
    elements.optionsCard.removeAttribute("aria-modal");
    elements.optionsTitle.textContent = engineMode === "debug" ? "Debug" : "Creation";
    return;
  }
  optionsOpen = open;
  elements.shell.classList.toggle("options-open", open);
  elements.optionsMenu.hidden = !open;
  elements.optionsCard.setAttribute("role", "dialog");
  elements.optionsCard.setAttribute("aria-modal", "true");
  elements.optionsTitle.textContent = open ? "Paused" : "Play";
  if (open) {
    controller.releasePointerLock();
    audio.setPaused(true);
    elements.optionsResume.focus();
  } else {
    audio.setPaused(!controller.getState().locked && !touchSessionActive);
  }
}

function clearTouchSession(): void {
  for (const button of elements.touchButtons) {
    const action = button.dataset.move as PlayerAction | undefined;
    if (action) controller.setVirtualAction(action, false);
  }
  uiInteractQueued = false;
  touchSessionActive = false;
}

function resumePlay(): void {
  const useTouchControls = resumeTouchControls;
  resumeTouchControls = false;
  setOptionsOpen(false);
  void audio.unlock();
  if (!useTouchControls && engineMode === "play" && playRuntime.state().runMode === "playing") {
    controller.requestPointerLock();
  }
}

/** Rebuild the current seed from the pause menu (same as R while options open). */
function restartCurrentMap(): void {
  void audio.unlock();
  clearTouchSession();
  resumeTouchControls = false;
  closeEndOverlay();
  setOptionsOpen(false);
  buildDungeon();
  setStatus(COPY.pause.restarted);
}

/** Leave play and open the welcome screen without wiping the continue save. */
function returnToMainScreen(): void {
  void audio.unlock();
  clearTouchSession();
  resumeTouchControls = false;
  closeEndOverlay();
  setOptionsOpen(false);
  flushLocalRunSave();
  const save = readLocalRunSave();
  if (canContinueLocalRun(save)) {
    setContinueCandidate(save.state, `Continue ready · ${save.state.seed}`);
  } else if (continueDomainState && canContinueDomainRun(continueDomainState)) {
    setContinueCandidate(continueDomainState, `Continue ready · ${continueDomainState.seed}`);
  } else {
    setContinueCandidate(null, "No active saved run. Start a new game.");
  }
  syncWelcomeArt();
  setWelcomeOpen(true);
  setStatus(COPY.pause.returnedHome);
}

function pauseTouchPlay(): void {
  if (engineMode !== "play" || playRuntime.state().runMode !== "playing") return;
  clearTouchSession();
  resumeTouchControls = true;
  setOptionsOpen(true);
}

function clearTouchSessionWhenHidden(): void {
  if (document.visibilityState === "hidden") clearTouchSession();
}

function getDecorDensity(): number {
  return Number(elements.decorDensity.value) / 100;
}
function getEnemyDensity(): number {
  return Number(elements.enemyDensity.value) / 100;
}
function syncDifficultyLabel(): void {
  const label = difficultyLabel(getEnemyDensity());
  elements.enemyDensityLabel.value = label;
  elements.enemyDensity.setAttribute("aria-valuetext", label.toLowerCase());
}
function syncRunTimer(snapshot = world.getDifficultyState()): void {
  const seconds = Math.floor(playRuntime.runSeconds());
  if (seconds === lastRunTimerSecond) return;
  lastRunTimerSecond = seconds;
  const clock = formatRunClock(seconds);
  elements.runTimer.textContent = clock;
  elements.runTimer.dateTime = `PT${seconds}S`;
  elements.runTimer.setAttribute("aria-label", `Run time ${clock}`);
  elements.shell.dataset.difficulty = snapshot.label.toLowerCase();
  elements.shell.dataset.pressure = String(snapshot.pressureLevel);
}

function syncTimeFreezeHud(remaining = world.timeFreezeRemaining): void {
  const seconds = Math.max(0, remaining);
  const active = seconds > 0.0001;
  elements.timeFreezeStatus.hidden = !active;
  elements.shell.dataset.timeFreeze = active ? "true" : "false";
  if (!active) {
    lastTimeFreezeDisplay = "";
    elements.timeFreezeStatus.removeAttribute("data-urgent");
    return;
  }
  const display = `${seconds.toFixed(1)}s`;
  if (display === lastTimeFreezeDisplay) return;
  lastTimeFreezeDisplay = display;
  elements.timeFreezeValue.textContent = display;
  elements.timeFreezeValue.dateTime = `PT${seconds.toFixed(1)}S`;
  elements.timeFreezeValue.setAttribute("aria-label", `${display} time freeze remaining`);
  elements.timeFreezeStatus.toggleAttribute("data-urgent", seconds <= 5);
}

function syncLuminousWardHud(remaining = world.luminousWardRemaining): void {
  const seconds = Math.max(0, remaining);
  const active = seconds > 0.0001;
  elements.luminousWardStatus.hidden = !active;
  elements.shell.dataset.luminousWard = active ? "true" : "false";
  if (!active) {
    lastLuminousWardDisplay = "";
    elements.luminousWardStatus.removeAttribute("data-urgent");
    return;
  }
  const display = `${seconds.toFixed(1)}s`;
  if (display === lastLuminousWardDisplay) return;
  lastLuminousWardDisplay = display;
  elements.luminousWardValue.textContent = display;
  elements.luminousWardValue.dateTime = `PT${seconds.toFixed(1)}S`;
  elements.luminousWardValue.setAttribute("aria-label", `${display} ward remaining`);
  elements.luminousWardStatus.toggleAttribute("data-urgent", seconds <= 5);
}

function syncAnnihilationPulseHud(remaining = world.annihilationPulseRemaining): void {
  const seconds = Math.max(0, remaining);
  const active = seconds > 0.0001;
  elements.annihilationPulseStatus.hidden = !active;
  elements.shell.dataset.annihilationPulse = active ? "true" : "false";
  if (!active) {
    lastAnnihilationPulseDisplay = "";
    elements.annihilationPulseStatus.removeAttribute("data-urgent");
    return;
  }
  const display = `${seconds.toFixed(1)}s`;
  if (display === lastAnnihilationPulseDisplay) return;
  lastAnnihilationPulseDisplay = display;
  elements.annihilationPulseValue.textContent = display;
  elements.annihilationPulseValue.dateTime = `PT${seconds.toFixed(1)}S`;
  elements.annihilationPulseValue.setAttribute("aria-label", `${display} pulse remaining`);
  elements.annihilationPulseStatus.toggleAttribute("data-urgent", seconds <= 5);
}

function syncHazardStatus(effect: HazardSurfaceEffect): void {
  activeHazardKind = effect.kind;
  if (effect.kind === lastHazardKind) return;
  lastHazardKind = effect.kind;
  const hazardKey = effect.kind ?? "none";
  elements.hazardStatus.hidden = effect.kind === null;
  elements.hazardStatus.textContent = effect.label;
  elements.hazardStatus.dataset.hazard = hazardKey;
  elements.shell.dataset.hazard = hazardKey;
  elements.hazardOverlay.dataset.hazard = hazardKey;
}
function getLightLevel(): number {
  return Number(elements.lightLevel.value) / 100;
}
function formatCell(cell: { x: number; y: number }): string {
  return `${cell.x + 1}.${cell.y + 1}`;
}

function readEditorParams(): DungeonEditorParams {
  return {
    roomTarget: Number(elements.roomCount.value),
    loopRate: Number(elements.loopRate.value),
    decorDensity: Number(elements.decorDensity.value),
    mapWidth: Number(elements.mapWidth.value),
    mapHeight: Number(elements.mapHeight.value),
    minRoomSize: Number(elements.minRoom.value),
    maxRoomSize: Number(elements.maxRoom.value),
    corridorRadius: Number(elements.corridorRadius.value),
    roomPadding: Number(elements.roomPadding.value),
    enemyDensity: Number(elements.enemyDensity.value),
    lightLevel: Number(elements.lightLevel.value),
    profile: elements.profileSelect.value || "custom",
  };
}

function applyEditorParamsToForm(params: DungeonEditorParams): void {
  elements.roomCount.value = String(params.roomTarget);
  elements.roomCountLabel.value = String(params.roomTarget);
  elements.loopRate.value = String(params.loopRate);
  elements.loopRateLabel.value = `${params.loopRate}%`;
  elements.decorDensity.value = String(params.decorDensity);
  elements.decorDensityLabel.value = `${params.decorDensity}%`;
  elements.mapWidth.value = String(params.mapWidth);
  elements.mapWidthLabel.value = String(params.mapWidth);
  elements.mapHeight.value = String(params.mapHeight);
  elements.mapHeightLabel.value = String(params.mapHeight);
  elements.minRoom.value = String(params.minRoomSize);
  elements.minRoomLabel.value = String(params.minRoomSize);
  elements.maxRoom.value = String(params.maxRoomSize);
  elements.maxRoomLabel.value = String(params.maxRoomSize);
  elements.corridorRadius.value = String(params.corridorRadius);
  elements.corridorLabel.value = String(params.corridorRadius);
  elements.roomPadding.value = String(params.roomPadding);
  elements.paddingLabel.value = String(params.roomPadding);
  elements.enemyDensity.value = String(params.enemyDensity);
  syncDifficultyLabel();
  elements.lightLevel.value = String(params.lightLevel);
  elements.lightLevelLabel.value = `${params.lightLevel}%`;
  elements.profileSelect.value = [...elements.profileSelect.options].some(
    (option) => option.value === params.profile,
  )
    ? params.profile
    : "custom";
}

/** Resolve active mood: forced NEW GAME biome, URL, forge/profile, or seed. */
function resolveActiveMood(nextDungeon: DungeonData) {
  if (forcedPlayMoodId) return getDungeonMood(forcedPlayMoodId);
  const forced = parseDungeonMoodId(readMoodFromUrl());
  if (forced) return getDungeonMood(forced);
  return resolveDungeonMood(nextDungeon, readEditorParams().profile);
}

function applyAtmosphereFromParams(): void {
  // Forge maps keep their authored decor while the run director owns enemy pacing.
  if (dungeon?.forge) {
    world.setDecorDensity(dungeon.forge.decorDensity);
  } else {
    world.setDecorDensity(getDecorDensity());
  }
  world.setEnemyDensity(getEnemyDensity());
  const moodBias = dungeon ? resolveActiveMood(dungeon).exposureBias : 0;
  renderer.toneMappingExposure = resolveDungeonExposure(getLightLevel(), moodBias);
}

function applyDungeonMood(nextDungeon: DungeonData): ReturnType<typeof resolveDungeonMood> {
  const mood = resolveActiveMood(nextDungeon);
  lighting.applyMood(mood);
  return mood;
}

function pushParamsToDomain(
  params: DungeonEditorParams = readEditorParams(),
  source = "Dungeon parameters rejected",
): boolean {
  const result = domainBridge.setParams(params);
  if (result.ok) return true;
  setStatus(`${source}: ${result.error.message}`);
  return false;
}

function applyDungeonDomainToForm(state: DungeonDomainState): void {
  applyEditorParamsToForm({
    roomTarget: state.roomTarget,
    loopRate: state.loopRate,
    decorDensity: state.decorDensity,
    mapWidth: state.mapWidth,
    mapHeight: state.mapHeight,
    minRoomSize: state.minRoomSize,
    maxRoomSize: state.maxRoomSize,
    corridorRadius: state.corridorRadius,
    roomPadding: state.roomPadding,
    enemyDensity: state.enemyDensity,
    lightLevel: state.lightLevel,
    profile: state.profile,
  });
}

async function refreshRunSelect(): Promise<void> {
  if (!localDevTools) {
    elements.serverReadout.textContent = "Server: local tools off";
    return;
  }
  const online = await domainBridge.probeAuthority();
  elements.serverReadout.textContent = online
    ? COPY.status.serverProbe(domainBridge.getStatus().lastError ?? "ok")
    : COPY.status.serverOffline;
  if (!online) return;
  try {
    const list = await authority.listRuns();
    const boundRunId = domainBridge.getAuthorityRunId();
    if ((!boundRunId || boundRunId === list.activeRunId) && list.activeRunId) {
      domainBridge.bindAuthorityRun(list.activeRunId);
    }
    elements.runSelect.replaceChildren();
    for (const run of list.runs) {
      const opt = document.createElement("option");
      opt.value = run.id;
      opt.textContent = `${run.label} · ${run.seed} · ${run.id}`;
      if (run.id === list.activeRunId) opt.selected = true;
      elements.runSelect.append(opt);
    }
    elements.serverReadout.textContent = COPY.status.serverOnline(
      String(list.activeRunId),
      list.runs.length,
    );
  } catch (err) {
    elements.serverReadout.textContent = COPY.status.serverError(
      err instanceof Error ? err.message : String(err),
    );
  }
}

function playCue(cue: AudioCue): void {
  void audio.unlock().then(() => audio.play(cue));
}

/** The scene click can start pointer lock directly, so it must also unlock Web Audio. */
function unlockAudioFromGesture(): void {
  if (!audio.isUnlocked || !audio.isReady) void audio.unlock();
}

document.addEventListener("pointerdown", unlockAudioFromGesture, { capture: true });
document.addEventListener("keydown", unlockAudioFromGesture, { capture: true });

const UI_SOUND_SELECTOR =
  "button, [role='button'], a.button, summary, select, input[type='button'], input[type='submit'], input[type='checkbox'], input[type='radio'], .leaderboard-seed, .biome-picker-option, .welcome-menu__item, .welcome-music-toggle";
let lastUiHoverAt = 0;
let lastUiHoverTarget: EventTarget | null = null;
let lastUiClickAt = 0;

function isUiControlDisabled(node: Element): boolean {
  if (
    node instanceof HTMLButtonElement ||
    node instanceof HTMLInputElement ||
    node instanceof HTMLSelectElement
  ) {
    return node.disabled;
  }
  return node.hasAttribute("disabled") || node.getAttribute("aria-disabled") === "true";
}

function resolveUiClickCue(target: Element): AudioCue {
  if (isUiControlDisabled(target)) return "uiDeny";
  if (
    target.matches(
      ".biome-picker-option, .welcome-menu__item--primary, #leaderboard-submit, #welcome-new, #options-resume, #end-next-biome",
    ) ||
    target.closest(".biome-picker-option, .welcome-menu__item--primary")
  ) {
    return "uiSelect";
  }
  if (
    target.matches(
      "#biome-picker-back, .welcome-menu__item--secondary, #welcome-custom, summary, #retry, #new-dungeon",
    ) ||
    target.closest("#biome-picker-back, .welcome-menu__item--secondary")
  ) {
    return "uiBack";
  }
  if (
    target.matches(
      "#music-toggle, #welcome-music-toggle, #audio-toggle, #crt-toggle, input[type='checkbox']",
    ) ||
    target.closest("#music-toggle, #welcome-music-toggle, #audio-toggle, #crt-toggle")
  ) {
    return "uiToggle";
  }
  if (target.matches("select, .leaderboard-seed") || target.closest(".leaderboard-seed")) {
    return "uiTick";
  }
  return "uiClick";
}

function shouldPlayUiHover(target: Element): boolean {
  return Boolean(
    target.closest(
      ".welcome-menu__item, .biome-picker-option, .leaderboard-seed, .welcome-music-toggle, #options-resume, button.mode-button, [data-engine-mode]",
    ),
  );
}

/** Light global UI SFX so menus, toggles, and pickers feel like a game shell. */
function wireInterfaceSounds(): void {
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0) return;
      const target = (event.target as Element | null)?.closest?.(UI_SOUND_SELECTOR);
      if (!target || target.closest("#scene, .touch-controls")) return;
      const now = performance.now();
      if (now - lastUiClickAt < 40) return;
      lastUiClickAt = now;
      playCue(resolveUiClickCue(target));
    },
    true,
  );

  document.addEventListener(
    "pointerover",
    (event) => {
      const target = (event.target as Element | null)?.closest?.(UI_SOUND_SELECTOR);
      if (!target || target.closest("#scene, .touch-controls")) return;
      if (isUiControlDisabled(target) || !shouldPlayUiHover(target)) return;
      if (lastUiHoverTarget === target) return;
      lastUiHoverTarget = target;
      const now = performance.now();
      if (now - lastUiHoverAt < 70) return;
      lastUiHoverAt = now;
      playCue("uiHover");
    },
    true,
  );

  document.addEventListener(
    "change",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (
        target.matches("select, input[type='range'], input[type='checkbox'], input[type='radio']")
      ) {
        playCue(target.matches("input[type='range']") ? "uiTick" : "uiToggle");
      }
    },
    true,
  );

  document.addEventListener(
    "input",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.type !== "range") return;
      const now = performance.now();
      if (now - lastUiClickAt < 55) return;
      lastUiClickAt = now;
      playCue("uiTick");
    },
    true,
  );
}

wireInterfaceSounds();

function flash(kind: "event" | "damage" = "event"): void {
  if (kind === "damage") {
    elements.shell.classList.remove("is-shaking");
    void elements.shell.offsetWidth;
    elements.shell.classList.add("is-shaking");
    window.setTimeout(() => elements.shell.classList.remove("is-shaking"), 210);
  }
  elements.eventFlash.classList.remove("is-active");
  void elements.eventFlash.offsetWidth;
  elements.eventFlash.classList.add("is-active");
}

const DAMAGE_WASH_SECONDS = 2.1;
const ORB_SPLASH_DROPS = 16;

/**
 * Pool of orb-splash droplets. Pre-created at boot and recycled each hit so a
 * damage burst doesn't allocate 16 spans + 16 listeners + 16 timers. The drops
 * live hidden in the splatter layer; a hit re-arms their animation in place.
 */
let orbSplashPool: HTMLElement[] | null = null;
let orbHurtTimer: ReturnType<typeof setTimeout> | null = null;

function initOrbSplashPool(): void {
  if (orbSplashPool) return;
  const layer = elements.healthOrb.querySelector<HTMLElement>(".health-orb__splatter");
  if (!layer) return;
  const pool: HTMLElement[] = [];
  for (let i = 0; i < ORB_SPLASH_DROPS; i += 1) {
    const drop = document.createElement("span");
    drop.className = "health-orb__drop";
    // Keep it parked (no animation) until a hit re-arms it.
    drop.style.animation = "none";
    drop.style.opacity = "0";
    // Single permanent listener — recycles itself, never added/removed per hit.
    drop.addEventListener("animationend", () => {
      drop.style.animation = "none";
      drop.style.opacity = "0";
    });
    layer.appendChild(drop);
    pool.push(drop);
  }
  orbSplashPool = pool;
}

/** Spawn red droplets that fly out of the health orb on hit (recycled pool). */
function spawnOrbBloodSplash(): void {
  if (!orbSplashPool) initOrbSplashPool();
  const pool = orbSplashPool;
  if (!pool) return;
  elements.healthOrb.classList.remove("is-hurt");
  void elements.healthOrb.offsetWidth;
  elements.healthOrb.classList.add("is-hurt");
  if (orbHurtTimer) clearTimeout(orbHurtTimer);
  orbHurtTimer = setTimeout(() => elements.healthOrb.classList.remove("is-hurt"), 420);

  for (let i = 0; i < pool.length; i += 1) {
    const drop = pool[i]!;
    const angle = (Math.PI * 2 * i) / pool.length + (Math.random() - 0.5) * 0.55;
    const dist = 22 + Math.random() * 52;
    drop.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    // Bias upward so blood reads as a splash out of the phial.
    drop.style.setProperty("--dy", `${Math.sin(angle) * dist * 0.85 - 10 - Math.random() * 18}px`);
    drop.style.setProperty("--size", `${3.5 + Math.random() * 7}px`);
    drop.style.setProperty("--delay", `${Math.floor(Math.random() * 70)}ms`);
    // Restart the CSS animation: clear, force a style recalc, re-enable.
    drop.style.animation = "none";
    drop.style.opacity = "1";
    void drop.offsetWidth;
    drop.style.animation = "";
  }
}

function triggerDamageFeedback(
  knockback: { x: number; z: number } | null,
  washKind: DamageWashKind = "enemy",
): void {
  damageTimer = DAMAGE_WASH_SECONDS;
  // Fresh hits re-arm full trauma so multi-hits stay unstable for a few seconds.
  hitTrauma = 1;
  if (washKind !== "enemy") hazardHitBoost = 1;
  elements.damage.dataset.kind = washKind;
  elements.healthOrb.dataset.damageKind = washKind;
  elements.damage.classList.remove("is-hit");
  void elements.damage.offsetWidth;
  elements.damage.classList.add("is-hit");
  damageHitActive = true;
  spawnOrbBloodSplash();
  if (knockback) controller.applyKnockback(knockback.x, knockback.z);
  else controller.applyKnockback(0, 0);
}

let pickupFeedbackAnimation: Animation | null = null;

function showPickupFeedback(
  label: string,
  restoreResolve = false,
  stoneId?: StoneId,
  timeFreeze = false,
  luminousWard = false,
  annihilationPulse = false,
): void {
  elements.pickupFeedbackText.textContent = label;
  elements.pickupFeedbackKicker.textContent = annihilationPulse
    ? COPY.pickup.annihilationPulse
    : luminousWard
      ? COPY.pickup.luminousWard
      : timeFreeze
        ? COPY.pickup.timeFreeze
        : restoreResolve
          ? COPY.pickup.flask
          : stoneId
            ? COPY.pickup.small
            : COPY.pickup.notice;
  elements.pickupFeedback.dataset.kind = annihilationPulse
    ? "annihilation-pulse"
    : luminousWard
      ? "luminous-ward"
      : timeFreeze
        ? "time-freeze"
        : restoreResolve
          ? "flask"
          : stoneId
            ? "stone"
            : "notice";
  if (stoneId) elements.pickupFeedback.dataset.stone = stoneId;
  else delete elements.pickupFeedback.dataset.stone;
  elements.pickupFeedback.classList.add("is-active");
  pickupFeedbackAnimation?.cancel();
  pickupFeedbackAnimation = elements.pickupFeedback.animate(
    [
      { opacity: 0, transform: "translate(-50%, 12px)", offset: 0 },
      { opacity: 1, transform: "translate(-50%, 0)", offset: 0.14 },
      { opacity: 1, transform: "translate(-50%, 0)", offset: 0.68 },
      { opacity: 0, transform: "translate(-50%, -8px)", offset: 1 },
    ],
    {
      duration: REDUCED_MOTION_QUERY.matches ? 1 : 900,
      easing: "steps(8, end)",
      fill: "both",
    },
  );
  pickupFeedbackAnimation.addEventListener(
    "finish",
    () => elements.pickupFeedback.classList.remove("is-active"),
    { once: true },
  );
  if (restoreResolve) {
    elements.playVitals.classList.remove("is-restored");
    void elements.playVitals.offsetWidth;
    elements.playVitals.classList.add("is-restored");
  }
}

function applyCameraSettings(): void {
  const sensitivity = 0.00034 + Number(elements.cameraSensitivity.value) * 0.0000062;
  const motion = Number(elements.cameraMotion.value) / 100;
  controller.setMouseSensitivity(sensitivity);
  controller.setCameraMotion(motion);
  elements.cameraSensitivityLabel.value = `${elements.cameraSensitivity.value}%`;
  elements.cameraMotionLabel.value = `${elements.cameraMotion.value}%`;
}

function updateResolve(): void {
  const clamped = THREE.MathUtils.clamp(playRuntime.state().resolve, 0, 100);
  const shown = Math.ceil(clamped);
  const fill = `${clamped}%`;
  elements.resolveValue.value = String(shown);
  // --fill drives liquid height + meniscus on the orb root.
  elements.healthOrb.style.setProperty("--fill", fill);
  elements.healthOrb.classList.toggle("is-low", clamped <= 30);
  elements.healthOrb.setAttribute("aria-valuenow", String(shown));
  elements.healthOrb.setAttribute("aria-valuetext", `${shown} health`);
}

function updateStaminaHud(ratio: number, exhausted: boolean, draining: boolean): void {
  const clamped = THREE.MathUtils.clamp(ratio, 0, 1);
  const percent = Math.round(clamped * 100);
  // Color follows fill so recharge recomposes: red → orange → yellow → green.
  // Bands: empty red, <10% orange, <20% yellow, otherwise green (full).
  const empty = percent <= 0;
  const critical = !empty && percent < 10;
  const warn = !empty && !critical && percent < 20;
  const key = `${percent}|${empty ? 1 : 0}|${critical ? 1 : 0}|${warn ? 1 : 0}|${exhausted ? 1 : 0}|${draining ? 1 : 0}`;
  if (key === lastStaminaHudKey) return;
  lastStaminaHudKey = key;
  const fill = `${percent}%`;
  elements.staminaMeter.style.setProperty("--fill", fill);
  elements.staminaMeter.classList.toggle("is-warn", warn);
  elements.staminaMeter.classList.toggle("is-critical", critical);
  elements.staminaMeter.classList.toggle("is-exhausted", empty);
  elements.staminaMeter.classList.toggle("is-draining", draining && percent > 0);
  elements.staminaMeter.setAttribute("aria-valuenow", String(percent));
  elements.staminaMeter.setAttribute(
    "aria-valuetext",
    exhausted || empty ? `${percent} stamina, exhausted` : `${percent} stamina`,
  );
}

function updateObjective(): void {
  syncQuestHud();
}

function updateReadout(): void {
  if (!dungeon) return;
  const player = controller.getState();
  elements.runStats.textContent = `${dungeon.stats.roomCount} rooms / ${dungeon.stats.loopCount} loops / ${world.stats.enemies} presence`;
  elements.position.textContent = player.cell
    ? `CELL ${formatCell(player.cell)} / ${player.distanceTravelled.toFixed(0)} m`
    : "CELL —";
}

/** Reveal floor around a cell for minimap fog-of-war (saved with the run). */
function revealMinimapCell(cell: { x: number; y: number }): void {
  if (!dungeon) {
    visitedCells.add(`${cell.x},${cell.y}`);
    return;
  }
  collectExploredAround(dungeon, cell, MINIMAP_REVEAL_RADIUS, visitedCells);
}

function drawMap(): void {
  if (!dungeon) return;
  const player = controller.getState();
  drawMinimap(elements.minimap, dungeon, player.cell, {
    features: world.getMinimapFeatures(),
    viewport: minimapViewport,
    explored: visitedCells,
    playerYaw: player.lookYaw,
  });
}

/** Next run stays in the layout: enabled only when a campaign biome remains. */
function setEndNextBiomeDisabled(label = COPY.end.nextRun): void {
  elements.endNextBiome.hidden = false;
  elements.endNextBiome.disabled = true;
  elements.endNextBiome.dataset.biomeId = "";
  elements.endNextBiome.textContent = label;
  elements.endNextBiome.setAttribute("aria-disabled", "true");
}

function setEndNextBiomeEnabled(biomeId: string, label: string): void {
  elements.endNextBiome.hidden = false;
  elements.endNextBiome.disabled = false;
  elements.endNextBiome.dataset.biomeId = biomeId;
  elements.endNextBiome.textContent = COPY.end.nextBiome(label);
  elements.endNextBiome.setAttribute("aria-disabled", "false");
}

function hideEndNextBiome(): void {
  // Overlay closed: drop out of the action row entirely.
  elements.endNextBiome.hidden = true;
  elements.endNextBiome.disabled = true;
  elements.endNextBiome.dataset.biomeId = "";
  elements.endNextBiome.textContent = COPY.end.nextRun;
  elements.endNextBiome.setAttribute("aria-disabled", "true");
}

function revealEndNextBiomeAfterSave(): void {
  const moodId = forcedPlayMoodId ?? (dungeon ? resolveActiveMood(dungeon).id : null);
  if (!moodId) {
    setEndNextBiomeDisabled();
    return;
  }
  const nextId = nextBiomeId(moodId);
  if (!nextId) {
    setEndNextBiomeDisabled();
    // Final campaign step: keep the save status and note the end of the ramp.
    if (!elements.leaderboardSubmitStatus.textContent.includes("Final biome")) {
      elements.leaderboardSubmitStatus.textContent = [
        elements.leaderboardSubmitStatus.textContent,
        COPY.end.finalBiomeSaved,
      ]
        .filter(Boolean)
        .join(" ");
    }
    return;
  }
  const label = getDungeonMood(nextId).label;
  setEndNextBiomeEnabled(nextId, label);
  window.requestAnimationFrame(() => elements.endNextBiome.focus());
}

function closeEndOverlay(): void {
  endScreenParticles.setActive(false);
  elements.endOverlay.hidden = true;
  elements.endLeaderboardForm.hidden = true;
  elements.endLeaderboardNote.hidden = true;
  elements.endLeaderboardNote.textContent = "";
  hideEndNextBiome();
  pendingLeaderboardSubmission = null;
  elements.shell.dataset.mode = "playing";
  controller.setEnabled(canEnablePlayController());
  if (!welcomeOpen) setMusicBed(null);
}

function showEndOverlay(mode: "dead" | "won"): void {
  elements.shell.dataset.mode = mode;
  controller.setEnabled(false);
  controller.releasePointerLock();
  // A restored finished run remains useful context in editor/debug, but its
  // play-only ending must never cover the creation workspace.
  if (engineMode !== "play") {
    endScreenParticles.setActive(false);
    elements.endOverlay.hidden = true;
    return;
  }
  const activeMood = dungeon ? resolveActiveMood(dungeon) : null;
  const endingBiomeId = activeMood?.id ?? "ancient";
  elements.endArt.src = biomeScreenArtSrc(endingBiomeId, "ending");
  elements.endArt.dataset.biomeId = endingBiomeId;
  elements.endOverlay.dataset.end = mode === "won" ? "won" : "dead";
  elements.endOverlay.hidden = false;
  endScreenParticles.setBiome(endingBiomeId);
  endScreenParticles.setActive(mode === "won");
  if (mode === "won") {
    audio.play("win");
    setMusicBed("win");
    elements.endKicker.textContent = COPY.end.winKicker;
    elements.endTitle.textContent = COPY.end.winTitle;
    elements.endCopy.textContent = COPY.end.winLead;
    const result = playRuntime.snapshot();
    const quest = playRuntime.state().quest;
    const player = controller.getState();
    elements.endResults.hidden = false;
    elements.endTime.textContent = formatTime(result.runSeconds);
    elements.endStones.textContent = `${quest.stonesFound} / ${quest.stonesTotal}`;
    elements.endDistance.textContent = `${Math.round(player.distanceTravelled)} m`;
    const biome = activeMood?.label ?? "Unknown";
    const seed = dungeon?.seed ?? "Unknown";
    elements.endBiome.textContent = biome;
    elements.endSeed.textContent = seed;
    prepareLeaderboardSubmission(
      result.runSeconds,
      player.distanceTravelled,
      biome,
      seed,
      dungeon?.stats.roomCount ?? 28,
    );
    // Visible but locked until Hall save unlocks the next campaign biome (if any).
    setEndNextBiomeDisabled();
    elements.retry.hidden = true;
    elements.newDungeon.textContent = COPY.end.next;
  } else {
    audio.play("lose");
    setMusicBed("lose");
    elements.endKicker.textContent = COPY.end.loseKicker;
    elements.endTitle.textContent = COPY.end.loseTitle;
    elements.endCopy.textContent = COPY.end.loseCopy;
    elements.endResults.hidden = true;
    elements.endLeaderboardForm.hidden = true;
    elements.endLeaderboardNote.hidden = true;
    elements.endLeaderboardNote.textContent = "";
    setEndNextBiomeDisabled();
    pendingLeaderboardSubmission = null;
    elements.retry.textContent = COPY.end.retry;
    elements.retry.hidden = false;
    elements.newDungeon.textContent = COPY.end.newDungeon;
  }
  window.requestAnimationFrame(() =>
    (mode === "dead" ? elements.retry : elements.leaderboardName).focus(),
  );
}

let exploreFlushTimer: ReturnType<typeof setTimeout> | null = null;
let pendingExploreRoom = "entrance";
let pendingExploreExtra: { threat?: number } = {};
let runTransitionPending = false;

function flushDomainExplore(allowDuringRunTransition = false): void {
  if (exploreFlushTimer) clearTimeout(exploreFlushTimer);
  exploreFlushTimer = null;
  if ((!allowDuringRunTransition && runTransitionPending) || !dungeon) return;
  const extra = pendingExploreExtra;
  pendingExploreExtra = {};
  domainBridge.syncExplore({
    room: pendingExploreRoom,
    exploredCells: visitedCells.size,
    mapped: Math.max(1, Math.min(dungeon.stats.floorCount, visitedCells.size)),
    topologySignature: dungeon.topologySignature,
    threat: extra.threat,
  });
}

function syncDomainExplore(extra: { threat?: number } = {}): void {
  if (!dungeon || runTransitionPending) return;
  const player = controller.getState();
  const cell = player.cell ?? dungeon.spawn;
  revealMinimapCell(cell);
  const room = roomLabelForCell(dungeon.rooms, cell);
  pendingExploreRoom = room;
  pendingExploreExtra = { ...pendingExploreExtra, ...extra };

  if (exploreFlushTimer) return;
  exploreFlushTimer = setTimeout(() => flushDomainExplore(), 350);
}

async function beginAuthorityRunTransition(): Promise<boolean> {
  if (runTransitionPending) {
    setStatus("A run change is already in progress.");
    return false;
  }
  runTransitionPending = true;
  if (exploreFlushTimer) flushDomainExplore(true);
  const drained = await domainBridge.beginRunTransition();
  if (drained) return true;
  domainBridge.cancelRunTransition();
  runTransitionPending = false;
  setStatus("Run change blocked by an unsynced dungeon. Use PUSH TO SERVER, then retry.");
  return false;
}

function bindAuthorityRunTransition(runId: string): void {
  if (!domainBridge.completeRunTransition(runId)) {
    throw new Error(`Cannot bind dungeon run to server run ${runId}.`);
  }
}

function activateDungeon(
  nextDungeon: DungeonData,
  message: string,
  params: DungeonEditorParams,
  options: {
    persistBuild?: boolean;
    persistedSession?: PersistedRunSession;
    resume?: LocalRunResumeState;
  } = {},
): DungeonRuntimeState {
  const persistBuild = options.persistBuild ?? true;
  if (persistBuild) {
    const captured = domainBridge.captureBuild({
      seed: nextDungeon.seed,
      topologySignature: nextDungeon.topologySignature,
      ...params,
    });
    if (!captured.ok) {
      const error = new Error(`Dungeon build rejected: ${captured.error.message}`);
      setStatus(error.message);
      throw error;
    }
  }
  const warmupSequence = beginRendererWarmup();

  dungeon = nextDungeon;
  forgePreviewDungeon = nextDungeon.forge ? nextDungeon : null;
  // Forge maps never rank, even if the session started as campaign by mistake.
  setRunSource(runSource, Boolean(nextDungeon.forge));
  // Scene graph changed — force the next materials inventory to rescan.
  lastMaterialCountAt = 0;
  elements.seed.value = nextDungeon.seed;
  writeSeedToUrl(nextDungeon.seed);
  visitedCells.clear();
  collectExploredAround(nextDungeon, nextDungeon.spawn, MINIMAP_REVEAL_RADIUS, visitedCells);
  const mood = applyDungeonMood(nextDungeon);
  applyAtmosphereFromParams();
  const state = playRuntime.load({
    dungeon,
    mood,
    persisted: options.persistedSession,
    runtimeProgress: runtimeProgressFromResume(options.resume),
  });
  lastTimeFreezeDisplay = "";
  lastLuminousWardDisplay = "";
  lastAnnihilationPulseDisplay = "";
  syncTimeFreezeHud(0);
  syncLuminousWardHud(0);
  syncAnnihilationPulseHud(0);
  controller.setSurfaceMovement(1, 1);
  lastHazardKind = undefined;
  activeHazardKind = null;
  hazardHitBoost = 0;
  syncHazardStatus({ kind: null, label: "", damage: 0, movementScale: 1, traction: 1 });
  elements.damage.dataset.kind = "enemy";
  elements.healthOrb.dataset.damageKind = "enemy";
  lastRunTimerSecond = -1;
  syncRunTimer();
  atmosphere.setDungeon(dungeon, mood);
  controller.setDungeon(dungeon);
  applyLocalRunResume(options.resume);
  if (options.resume) syncDomainExplore();
  controller.setBlockedCells([]);
  controller.setSolidColliders(world.getSolidColliders());
  controller.setEnabled(canEnablePlayController());
  editorView.setDungeon(dungeon, mood);
  setEditorSurfaceStatus(
    "runtime",
    `PLAY MAP · ${nextDungeon.stats.roomCount} ROOMS · ${nextDungeon.stats.loopCount} LOOPS`,
    "ready",
  );
  elements.shell.dataset.ready = "true";
  elements.shell.dataset.mode = state.runMode;
  elements.shell.dataset.relic = String(state.quest.portalOpen);
  elements.shell.dataset.stones = String(state.quest.stonesFound);
  elements.shell.dataset.resolve = String(Math.ceil(state.resolve));
  elements.editorCell.textContent = `SPAWN ${formatCell(dungeon.spawn)}`;
  damageTimer = 0;
  hitTrauma = 0;
  exhaustionTrauma = 0;
  lastStaminaHudKey = "";
  updateStaminaHud(1, false, false);
  povFeel.reset();
  lastPortalBanner = state.quest.portalOpen;
  // Invalidate the quest HUD dirty cache so the first syncQuestHud() repaints.
  questHudStonesFound = -1;
  questHudPortalOpen = false;
  if (persistBuild) {
    domainBridge.setEngineMode(engineMode);
    syncDomainExplore();
  }
  if (state.runMode === "playing") closeEndOverlay();
  else showEndOverlay(state.runMode);
  updateResolve();
  syncTimeFreezeHud();
  syncLuminousWardHud();
  updateObjective();
  // Intro objective: appears at run start, then fades so the scene stays clean.
  if (engineMode === "play" && state.runMode === "playing" && !state.quest.portalOpen) {
    showObjectiveBanner(COPY.objective.intro, "hunt", 3400, 1500);
  } else {
    clearObjectiveBannerTimers();
    elements.playObjective.hidden = true;
    elements.playObjective.classList.remove("is-visible", "is-fading");
  }
  updateReadout();
  toggleMap(mapExpanded);
  // Players never need profile/renderer telemetry in the pause strip.
  if (localDevTools) setStatus(message);
  else if (engineMode === "play") setStatus(COPY.status.enterPlay);
  else setStatus(message);
  startRendererWarmup(warmupSequence, message);
  if (persistBuild) {
    runHasStarted = true;
    domainBridge.syncSession(playRuntime.snapshot());
    scheduleLocalRunSave(0);
  }
  return getRuntimeState();
}

function buildDungeon(
  seed = elements.seed.value,
  options: {
    persistBuild?: boolean;
    persistedSession?: PersistedRunSession;
    resume?: LocalRunResumeState;
  } = {},
): DungeonRuntimeState {
  povPost.resetCrtHistory();
  const normalizedSeed = seed.trim() || COPY.hud.seedDefault;
  const params = readEditorParams();
  try {
    const generated = generateCompletableDungeon(normalizedSeed, {
      roomTarget: params.roomTarget,
      extraConnectionRate: params.loopRate / 100,
      width: params.mapWidth,
      height: params.mapHeight,
      minRoomSize: params.minRoomSize,
      maxRoomSize: params.maxRoomSize,
      corridorRadius: params.corridorRadius,
      roomPadding: params.roomPadding,
    });
    const mood = resolveActiveMood(generated);
    const statusMessage = localDevTools
      ? COPY.status.generation(params.profile, mood.label)
      : COPY.status.generationPlayer(mood.label);
    return activateDungeon(generated, statusMessage, params, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not generate the dungeon.";
    setEditorSurfaceStatus("runtime", "PLAY MAP · GENERATION FAILED", "error");
    setStatus(message);
    throw error;
  }
}

function setEditorSurface(nextSurface: "runtime" | "forge"): void {
  editorSurface = nextSurface;
  renderEditorSurfaceStatus();
  elements.editorRuntimeSurface.hidden = nextSurface !== "runtime";
  elements.editorForgeSurface.hidden = nextSurface !== "forge";
  elements.editorViewButtons.forEach((button) => {
    const active = button.dataset.editorView === nextSurface;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  if (shouldMountForge(nextSurface, engineMode, elements.forgeFrame.hasAttribute("src"))) {
    // Presentation query hides Forge chrome before the first paint of a cold load.
    elements.forgeFrame.src = forgeFrameSrc(runIntroActive);
  }
  const visible = nextSurface === "forge" && (engineMode === "editor" || runIntroActive);
  elements.forgeFrame.contentWindow?.postMessage(
    { type: "black-flag:forge-visibility", visible },
    location.origin,
  );
  if (engineMode === "editor") setMapToolsOpen(nextSurface === "runtime");
  if (nextSurface === "runtime") window.requestAnimationFrame(() => editorView.redraw());
}

function applyForgeDungeon(): void {
  if (!forgeIntake) return;
  try {
    const imported = forgePreviewDungeon ?? forgeIntake.dungeon;
    const { params } = forgeIntake;
    applyEditorParamsToForm(params);
    const mood = resolveActiveMood(imported);
    setRunSource("custom", true);
    activateDungeon(
      imported,
      `${imported.forge?.name ?? "Dungeon Creation"} · ${mood.label} ready to play.`,
      params,
    );
    setEngineMode("play");
    showPickupFeedback(COPY.status.forgeLoaded);
    playCue("forge");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not load the Dungeon Creation map.";
    setEditorSurfaceStatus("forge", message.toUpperCase(), "error");
    setStatus(message);
  }
}

function selectEditorSpawn(cell: { x: number; y: number }): void {
  if (!dungeon || engineMode !== "editor") return;
  if (forgePreviewDungeon && forgePreviewDungeon !== dungeon) {
    forgePreviewDungeon = setDungeonSpawn(forgePreviewDungeon, cell);
    const previewMood = resolveActiveMood(forgePreviewDungeon);
    editorView.setDungeon(forgePreviewDungeon, previewMood);
    editorView.setSpawn(cell);
    elements.editorCell.textContent = `SPAWN ${formatCell(cell)} · EXIT ${formatCell(
      forgePreviewDungeon.exit,
    )}`;
    elements.shell.dataset.spawn = `${cell.x},${cell.y}`;
    setStatus(`Generated-map spawn set to ${formatCell(cell)}.`);
    playCue("spawn");
    flash();
    return;
  }
  const warmupSequence = beginRendererWarmup();
  dungeon = setDungeonSpawn(dungeon, cell);
  const mood = applyDungeonMood(dungeon);
  applyAtmosphereFromParams();
  const state = playRuntime.load({ dungeon, mood, persisted: playRuntime.snapshot() });
  lastTimeFreezeDisplay = "";
  lastLuminousWardDisplay = "";
  lastAnnihilationPulseDisplay = "";
  lastRunTimerSecond = -1;
  atmosphere.setDungeon(dungeon, mood);
  controller.setDungeon(dungeon);
  controller.setBlockedCells([]);
  controller.setSolidColliders(world.getSolidColliders());
  editorView.setDungeon(dungeon, mood);
  editorView.setSpawn(cell);
  elements.editorCell.textContent = `SPAWN ${formatCell(cell)} · EXIT ${formatCell(dungeon.exit)}`;
  elements.shell.dataset.spawn = `${cell.x},${cell.y}`;
  elements.shell.dataset.mode = state.runMode;
  elements.shell.dataset.relic = String(state.quest.portalOpen);
  elements.shell.dataset.stones = String(state.quest.stonesFound);
  elements.shell.dataset.resolve = String(Math.ceil(state.resolve));
  lastPortalBanner = state.quest.portalOpen;
  questHudStonesFound = -1;
  questHudPortalOpen = false;
  closeEndOverlay();
  updateResolve();
  updateObjective();
  syncRunTimer();
  syncTimeFreezeHud();
  syncLuminousWardHud();
  syncAnnihilationPulseHud();
  updateReadout();
  drawMap();
  setStatus(`Spawn set to ${formatCell(cell)}. Exit was recalculated.`);
  startRendererWarmup(warmupSequence, `Spawn set to ${formatCell(cell)}.`);
  playCue("spawn");
  flash();
}

function setEngineMode(
  nextMode: EngineMode,
  options: { hydrate?: boolean; persist?: boolean } = {},
): void {
  const initialized = Boolean(elements.shell.dataset.engineMode);
  if (engineMode === nextMode && initialized) return;
  engineMode = nextMode;
  // Apply the play DPR cap immediately; waiting for browser resize caused the
  // game to keep the editor-resolution render target.
  resize();
  const external = nextMode !== "play";
  elements.shell.dataset.engineMode = nextMode;
  // Keep the URL state aligned with editor, debug, and play modes.
  writeModeToUrl(nextMode);
  if (options.persist !== false) domainBridge.setEngineMode(nextMode);
  if (nextMode === "play" && options.hydrate !== false && localDevTools) {
    void (async () => {
      const hydrated = await domainBridge.hydrateFromAuthority();
      if (!hydrated) {
        return;
      }
      const localSeed = elements.seed.value.trim();
      if (shouldAdoptHydratedSeed(Boolean(dungeon), hydrated.seed, localSeed)) {
        applyDungeonDomainToForm(hydrated.state);
        elements.seed.value = hydrated.seed;
        buildDungeon(hydrated.seed, {
          persistBuild: false,
          persistedSession: domainToPersistedSession(hydrated.state),
        });
        setStatus(COPY.status.hydrate(hydrated.seed));
      } else if (dungeon && hydrated.seed === localSeed) {
        applyPersistedRunSession(domainToPersistedSession(hydrated.state));
        setStatus("Server session restored for this dungeon.");
      } else if (hydrated.seed && hydrated.seed !== localSeed && dungeon) {
        setStatus(`Server seed ${hydrated.seed} (local map kept). Use SYNC RUNS to adopt.`);
      } else {
        setStatus("Server online · dungeon domain ready.");
      }
    })();
  } else if (localDevTools) {
    void domainBridge.probeAuthority();
  }
  elements.modeButtons.forEach((button) => {
    const active = button.dataset.engineMode === nextMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  controller.releasePointerLock();
  controller.setEnabled(canEnablePlayController());
  elements.editorWorkspace.hidden = !external;
  elements.debugPanel.hidden = nextMode !== "debug";
  // Creation/Debug: Map Tools only when local developer chrome is on.
  setMapToolsOpen(external);
  elements.editorTitle.textContent = nextMode === "debug" ? "Graph and cells" : "Generated map";
  elements.debugMode.textContent = nextMode.toUpperCase();
  // Apply map first, then debug overlays. setDungeon no-ops rebuild when the
  // same dungeon reference is already loaded (mode toggles stay cheap).
  const editorDungeon = forgePreviewDungeon ?? dungeon;
  if (editorDungeon) editorView.setDungeon(editorDungeon, resolveActiveMood(editorDungeon));
  editorView.setDebug(nextMode === "debug");
  if (nextMode === "debug") setEditorSurface("runtime");
  else setEditorSurface(editorSurface);
  // Play starts with options closed (minimal HUD). Creation/Debug keep tools docked.
  if (nextMode === "play") setOptionsOpen(false);
  else setOptionsOpen(false); // forces docked tools visible via engine mode CSS
  const runtimeState = playRuntime.state();
  if (runtimeState.runMode === "playing") closeEndOverlay();
  else showEndOverlay(runtimeState.runMode);
  audio.setPaused(nextMode !== "play" || (!controller.getState().locked && !touchSessionActive));
  setStatus(
    nextMode === "play"
      ? COPY.status.enterPlay
      : nextMode === "editor"
        ? "Creation mode. Generate the map or set spawn."
        : "Debug mode. Graph, rooms, and telemetry visible.",
  );
  // Entering play mid-session: replay intro if the hunt is still open.
  if (
    nextMode === "play" &&
    dungeon &&
    runtimeState.quest.isRunning &&
    !runtimeState.quest.portalOpen
  ) {
    showObjectiveBanner(COPY.objective.intro, "hunt", 3400, 1500);
  } else if (nextMode !== "play") {
    clearObjectiveBannerTimers();
    elements.playObjective.hidden = true;
    elements.playObjective.classList.remove("is-visible", "is-fading");
  }
  if (initialized) playCue("mode");
  flash();
  scheduleMinimapLayout();
  // One paint after layout (surface unhide / deck height) — editorView coalesces.
  window.requestAnimationFrame(() => editorView.redraw());
}

function toggleMap(forceExpanded = !mapExpanded): void {
  mapExpanded = forceExpanded;
  elements.mapPanel.classList.toggle("is-expanded", mapExpanded);
  elements.mapToggle.setAttribute("aria-expanded", String(mapExpanded));
  elements.mapToggle.textContent = "M";
  elements.mapToggle.setAttribute("aria-label", mapExpanded ? "Shrink map" : "Expand map");
  elements.mapToggle.title = mapExpanded ? "Shrink map (M)" : "Expand map (M)";
  scheduleMinimapLayout();
}

function makeSeed(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return `ASH-${(values[0] ?? 0).toString(36).toUpperCase()}`;
}

function makeProceduralSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  lastProceduralSeed = nextProceduralSeed(values[0] ?? 0, lastProceduralSeed);
  return lastProceduralSeed;
}

function postPendingProceduralSeed(): void {
  if (pendingProceduralSeed === null || elements.forgeFrame.dataset.loaded !== "true") return;
  elements.forgeFrame.contentWindow?.postMessage(
    { type: "black-flag:forge-new-seed", seed: pendingProceduralSeed },
    location.origin,
  );
  pendingProceduralSeed = null;
}

function queueNewProceduralSeed(): void {
  pendingProceduralSeed = makeProceduralSeed();
  postPendingProceduralSeed();
}

function refreshMinimapViewport(): void {
  // Measure once here instead of on every minimap redraw (which fires on each
  // cell change). Called from resize() and at boot.
  const bounds = elements.minimap.getBoundingClientRect();
  minimapViewport.width = bounds.width;
  minimapViewport.height = bounds.height;
  minimapViewport.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
}

function scheduleMinimapLayout(): void {
  minimapLayout.schedule();
}

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  // Play draws the scene plus a full-screen lens pass. Keep its buffer at 1x
  // so a first run does not silently retain the editor's higher DPR.
  const dprCap = engineMode === "play" ? (width <= 760 ? 0.85 : 1) : width <= 760 ? 0.92 : 1.25;
  const dpr = resolveRenderPixelRatio(window.devicePixelRatio, dprCap);
  renderer.setPixelRatio(dpr);
  renderer.setSize(width, height, false);
  povPost.setSize(width, height, dpr);
  scheduleMinimapLayout();
  if (engineMode !== "play") editorView.redraw();
}

export interface RendererDiagnostics {
  calls: number;
  triangles: number;
  points: number;
  lines: number;
  geometries: number;
  textures: number;
  materials: number;
  programs: number;
  frameMs: number;
  fps: number;
  dpr: number;
  shadowMap: boolean;
  shadowType: number;
  frameGaps: FrameGapSnapshot;
}

export interface DungeonRuntimeState {
  id: "black-flag-dungeon-engine";
  ready: boolean;
  seed?: string;
  topologySignature?: string;
  spawn?: { x: number; y: number };
  exit?: { x: number; y: number };
  stats?: Record<string, number>;
  player?: ReturnType<FirstPersonController["getState"]>;
  exitReached?: boolean;
  hasRelic?: boolean;
  stonesFound?: number;
  timeFreezeRemaining?: number;
  luminousWardRemaining?: number;
  annihilationPulseRemaining?: number;
  resolve?: number;
  mode?: "playing" | "dead" | "won";
  engineMode?: EngineMode;
  audioMuted?: boolean;
  crtEnabled?: boolean;
  difficulty?: Readonly<DifficultySnapshot>;
  renderer?: RendererDiagnostics;
  domain?: ReturnType<DomainBridge["getDungeon"]>;
  domainProjection?: ReturnType<DomainBridge["project"]>;
}

/** Full scene material counts are expensive; cache for API consumers. */
let cachedMaterialCount = 0;
let lastMaterialCountAt = 0;
const MATERIAL_COUNT_TTL_MS = 2500;

function countSceneMaterials(now = performance.now()): number {
  if (now - lastMaterialCountAt < MATERIAL_COUNT_TTL_MS) return cachedMaterialCount;
  const materials = new Set<THREE.Material>();
  scene.traverse((object) => {
    const material = (object as THREE.Mesh).material;
    if (Array.isArray(material)) material.forEach((entry) => materials.add(entry));
    else if (material) materials.add(material);
  });
  cachedMaterialCount = materials.size;
  lastMaterialCountAt = now;
  return cachedMaterialCount;
}

function getRendererDiagnostics(): RendererDiagnostics {
  return {
    calls: lastRenderSnapshot.calls,
    triangles: lastRenderSnapshot.triangles,
    points: lastRenderSnapshot.points,
    lines: lastRenderSnapshot.lines,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    materials: countSceneMaterials(),
    programs: renderer.info.programs?.length ?? 0,
    frameMs: Number(smoothedFrameMs.toFixed(2)),
    fps: Number((1000 / smoothedFrameMs).toFixed(1)),
    dpr: renderer.getPixelRatio(),
    shadowMap: renderer.shadowMap.enabled,
    shadowType: renderer.shadowMap.type,
    frameGaps: frameGapProfiler.snapshot(),
  };
}

function publishPerformanceDiagnostics(now: number): void {
  if (now - lastPerformancePublish < 1000) return;
  const gaps = frameGapProfiler.snapshot();
  const dataset = elements.scene.dataset;
  dataset.perfSamples = String(gaps.samples);
  dataset.perfP50 = gaps.p50.toFixed(2);
  dataset.perfP95 = gaps.p95.toFixed(2);
  dataset.perfP99 = gaps.p99.toFixed(2);
  dataset.perfMax = gaps.max.toFixed(2);
  dataset.perfOver25 = String(gaps.over25);
  dataset.perfOver33 = String(gaps.over33);
  dataset.perfOver50 = String(gaps.over50);
  dataset.perfLongTasks = String(gaps.longTasks);
  dataset.perfLongestTask = gaps.longestTask.toFixed(2);
  dataset.renderCalls = String(lastRenderSnapshot.calls);
  dataset.renderTriangles = String(lastRenderSnapshot.triangles);
  dataset.renderPoints = String(lastRenderSnapshot.points);
  dataset.renderLines = String(lastRenderSnapshot.lines);
  dataset.renderGeometries = String(renderer.info.memory.geometries);
  dataset.renderTextures = String(renderer.info.memory.textures);
  dataset.renderPrograms = String(renderer.info.programs?.length ?? 0);
  dataset.renderDpr = renderer.getPixelRatio().toFixed(2);
  dataset.worldLights = String(world.stats.lights);
  if (new URLSearchParams(window.location.search).has("perfAudit")) {
    dataset.renderInventory = JSON.stringify(collectVisibleRenderInventory(scene, camera));
  }
  lastPerformancePublish = now;
}

function getRuntimeState(): DungeonRuntimeState {
  if (!dungeon) {
    return {
      id: "black-flag-dungeon-engine",
      ready: false,
      renderer: getRendererDiagnostics(),
      domain: domainBridge.getDungeon(),
      domainProjection: domainBridge.project(),
    };
  }
  const state = playRuntime.state();
  return {
    id: "black-flag-dungeon-engine",
    ready: renderWarmupReady,
    seed: dungeon.seed,
    topologySignature: dungeon.topologySignature,
    spawn: { ...dungeon.spawn },
    exit: { ...dungeon.exit },
    stats: { ...dungeon.stats, ...world.stats },
    player: controller.getState(),
    exitReached: state.exitReached,
    hasRelic: state.quest.portalOpen,
    stonesFound: state.quest.stonesFound,
    timeFreezeRemaining: Number(world.timeFreezeRemaining.toFixed(2)),
    luminousWardRemaining: Number(world.luminousWardRemaining.toFixed(2)),
    annihilationPulseRemaining: Number(world.annihilationPulseRemaining.toFixed(2)),
    resolve: Number(state.resolve.toFixed(1)),
    mode: state.runMode,
    engineMode,
    audioMuted: audio.isMuted,
    crtEnabled,
    difficulty: { ...world.getDifficultyState() },
    renderer: getRendererDiagnostics(),
    domain: domainBridge.getDungeon(),
    domainProjection: domainBridge.project(),
  };
}

elements.generationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!localDevTools) {
    setStatus("Map tools are only available in local development.");
    return;
  }
  setRunSource("custom", false);
  buildDungeon();
  playCue("forge");
});
elements.leaderboardName.addEventListener("input", () => {
  updateLeaderboardPortraitPreview(elements.leaderboardName.value || "Wanderer");
});
elements.leaderboardPortraitPreviewFace.addEventListener("click", () => {
  cycleLeaderboardPortrait();
  playCue("mode");
});
elements.leaderboardPortraitPreviewFace.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    cycleLeaderboardPortrait();
    playCue("mode");
  }
});

elements.endLeaderboardForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!isLeaderboardEligible(runSource) || Boolean(dungeon?.forge)) {
    setStatus(COPY.leaderboard.customExcluded);
    return;
  }
  if (!pendingLeaderboardSubmission || elements.leaderboardSubmit.disabled) return;
  const playerName = normalizePlayerName(elements.leaderboardName.value);
  if (!playerName) {
    elements.leaderboardSubmitStatus.textContent = `Use 1-20 letters, numbers, spaces or . _ ' -`;
    elements.leaderboardName.focus();
    return;
  }
  elements.leaderboardSubmit.disabled = true;
  elements.leaderboardSubmit.textContent = COPY.leaderboard.saving;
  elements.leaderboardSubmitStatus.textContent = COPY.leaderboard.saving;
  const portraitIndex =
    currentSelectedPortraitIndex !== null
      ? currentSelectedPortraitIndex
      : portraitIndexForName(playerName);
  void submitLeaderboardEntry({ ...pendingLeaderboardSubmission, playerName, portraitIndex })
    .then(({ entry }) => {
      try {
        localStorage.setItem(LAST_LEADERBOARD_NAME_KEY, entry.playerName);
      } catch {
        // Score is already stored. Remembering the local name is optional.
      }
      elements.leaderboardName.value = entry.playerName;
      elements.leaderboardName.disabled = true;
      elements.leaderboardSubmit.textContent = "Saved";
      updateLeaderboardPortraitPreview(entry.playerName);
      elements.leaderboardSubmitStatus.textContent = COPY.leaderboard.saved(
        entry.rank,
        entry.score,
      );
      // Campaign path only: after Hall save, offer the next harder biome.
      revealEndNextBiomeAfterSave();
      void refreshLeaderboard();
    })
    .catch((error) => {
      elements.leaderboardSubmit.disabled = false;
      elements.leaderboardSubmit.textContent = COPY.leaderboard.submit;
      elements.leaderboardSubmitStatus.textContent =
        error instanceof Error ? error.message : COPY.leaderboard.unavailable;
    });
});
function scheduleEditorRegeneration(): void {
  if (!localDevTools || engineMode === "play") return;
  void audio.unlock();
  window.clearTimeout(regenerateTimer);
  setEditorSurfaceStatus("runtime", "PLAY MAP · UPDATING", "updating");
  regenerateTimer = window.setTimeout(() => {
    elements.profileSelect.value = "custom";
    setRunSource("custom", false);
    buildDungeon();
    audio.play("forge");
  }, 280);
}
function bindRange(
  input: HTMLInputElement,
  label: HTMLOutputElement,
  suffix = "",
  onInput?: () => void,
): void {
  input.addEventListener("input", () => {
    label.value = suffix ? `${input.value}${suffix}` : input.value;
    onInput?.();
    scheduleEditorRegeneration();
  });
}
bindRange(elements.roomCount, elements.roomCountLabel);
bindRange(elements.loopRate, elements.loopRateLabel, "%");
bindRange(elements.mapWidth, elements.mapWidthLabel);
bindRange(elements.mapHeight, elements.mapHeightLabel);
bindRange(elements.minRoom, elements.minRoomLabel);
bindRange(elements.maxRoom, elements.maxRoomLabel);
bindRange(elements.corridorRadius, elements.corridorLabel);
bindRange(elements.roomPadding, elements.paddingLabel);
bindRange(elements.decorDensity, elements.decorDensityLabel, "%", applyAtmosphereFromParams);
elements.enemyDensity.addEventListener("input", () => {
  syncDifficultyLabel();
  applyAtmosphereFromParams();
  scheduleEditorRegeneration();
});
bindRange(elements.lightLevel, elements.lightLevelLabel, "%", applyAtmosphereFromParams);
elements.profileSelect.addEventListener("change", () => {
  const id = elements.profileSelect.value as DungeonPresetId;
  if (id in DUNGEON_PRESETS) {
    applyEditorParamsToForm(DUNGEON_PRESETS[id]);
    scheduleEditorRegeneration();
  } else {
    pushParamsToDomain();
  }
});
elements.presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!localDevTools) return;
    const id = button.dataset.dungeonPreset as DungeonPresetId;
    const preset = DUNGEON_PRESETS[id];
    if (!preset) return;
    applyEditorParamsToForm(preset);
    setRunSource("custom", false);
    buildDungeon();
    playCue("forge");
    setStatus(`Preset ${id} applied and regenerated.`);
  });
});
elements.cameraSensitivity.addEventListener("input", applyCameraSettings);
elements.cameraMotion.addEventListener("input", applyCameraSettings);
elements.reroll.addEventListener("click", () => {
  if (!localDevTools) return;
  elements.seed.value = makeSeed();
  setRunSource("custom", false);
  buildDungeon();
  playCue("forge");
});
elements.pushServer.addEventListener("click", () => {
  if (!localDevTools) {
    setStatus("Map tools are only available in local development.");
    return;
  }
  if (!pushParamsToDomain()) return;
  const seeded = domainBridge.setSeed(elements.seed.value.trim() || "CAMPAIGN-17");
  if (!seeded.ok) {
    setStatus(`Server push rejected: ${seeded.error.message}`);
    return;
  }
  const reconciliationQueued = domainBridge.reconcileRemote();
  void domainBridge.probeAuthority().then((ok) => {
    setStatus(
      ok && reconciliationQueued
        ? "Server sync queued with the current dungeon snapshot."
        : ok
          ? COPY.status.pushOk
          : COPY.status.pushOffline,
    );
    void refreshRunSelect();
  });
});
elements.runRefresh.addEventListener("click", () => {
  if (!localDevTools) return;
  void refreshRunSelect();
});
elements.runNew.addEventListener("click", () => {
  void (async () => {
    if (!localDevTools) {
      setStatus("Server runs are only available in local development.");
      return;
    }
    const online = await domainBridge.probeAuthority();
    if (!online) {
      setStatus("Cannot create run: server offline.");
      return;
    }
    if (!(await beginAuthorityRunTransition())) return;
    const seed = elements.seed.value.trim() || makeSeed();
    try {
      const created = await authority.createRun({ seed, label: `dungeon-${seed.slice(0, 12)}` });
      bindAuthorityRunTransition(created.run.id);
      elements.seed.value = created.run.seed;
      buildDungeon(created.run.seed);
      runTransitionPending = false;
      await refreshRunSelect();
      setStatus(`New run ${created.activeRunId}`);
      playCue("forge");
    } catch (error) {
      domainBridge.cancelRunTransition();
      runTransitionPending = false;
      setStatus(`Create run failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  })();
});
elements.runSelect.addEventListener("change", () => {
  const runId = elements.runSelect.value;
  if (!runId || !localDevTools) return;
  void (async () => {
    try {
      if (!(await beginAuthorityRunTransition())) return;
      const activated = await authority.activateRun(runId);
      bindAuthorityRunTransition(activated.run.id);
      const hydrated = await domainBridge.hydrateFromAuthority();
      if (hydrated) {
        const d = hydrated.state;
        applyDungeonDomainToForm(d);
        elements.seed.value = hydrated.seed;
        buildDungeon(hydrated.seed, {
          persistBuild: false,
          persistedSession: domainToPersistedSession(d),
        });
        setStatus(`Active run ${runId} · seed ${hydrated.seed}`);
      } else {
        setStatus(`Active run ${runId}; dungeon hydrate did not complete.`);
      }
      runTransitionPending = false;
      await refreshRunSelect();
    } catch (err) {
      domainBridge.cancelRunTransition();
      runTransitionPending = false;
      setStatus(`Activate run failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  })();
});
elements.welcomeNew.addEventListener("click", () => {
  void audio.unlock();
  showBiomePicker();
});
elements.biomePickerBack.addEventListener("click", () => {
  showWelcomeHome();
  window.requestAnimationFrame(() => elements.welcomeNew.focus());
});
elements.welcomeContinue.addEventListener("click", () => {
  const save = readLocalRunSave();
  const state = canContinueLocalRun(save) ? save.state : continueDomainState;
  if (!state) return;
  void audio.unlock();
  forcedPlayMoodId = null;
  setRunSource(runSourceFromLocalSave(save), false);
  applyDungeonDomainToForm(state);
  elements.seed.value = state.seed;
  buildDungeon(state.seed, {
    persistBuild: true,
    persistedSession: domainToPersistedSession(state, save?.resume),
    resume: save?.resume,
  });
  runHasStarted = true;
  setWelcomeOpen(false);
  setEngineMode("play", { hydrate: false });
  scheduleLocalRunSave(0);
  setStatus(`Continued run · seed ${state.seed}. Click the scene to look.`);
});
elements.welcomeCustom.addEventListener("click", () => {
  void audio.unlock();
  forcedPlayMoodId = null;
  setRunSource("custom", false);
  const freshSeed = makeSeed();
  queueNewProceduralSeed();
  elements.seed.value = freshSeed;
  buildDungeon(freshSeed);
  setWelcomeOpen(false);
  setEngineMode("editor", { hydrate: false });
  setEditorSurface("forge");
  setStatus("Custom run · practice only. Create a dungeon, then select PLAY.");
});
elements.optionsResume.addEventListener("click", resumePlay);
elements.optionsRestart.addEventListener("click", () => {
  restartCurrentMap();
});
elements.optionsHome.addEventListener("click", () => {
  returnToMainScreen();
});
elements.optionsMenu.querySelectorAll("[data-options-dismiss]").forEach((node) => {
  node.addEventListener("click", () => {
    if (engineMode === "play") resumePlay();
  });
});
elements.mapToggle.addEventListener("click", () => toggleMap());
elements.modeButtons.forEach((button) =>
  button.addEventListener("click", () => {
    const nextMode = button.dataset.engineMode;
    if (isEngineMode(nextMode)) setEngineMode(nextMode);
  }),
);
elements.editorViewButtons.forEach((button) =>
  button.addEventListener("click", () => {
    if (button.dataset.editorView === "forge") setEditorSurface("forge");
    else setEditorSurface("runtime");
  }),
);
elements.forgeApply.addEventListener("click", applyForgeDungeon);
elements.forgeFrame.addEventListener("load", () => {
  elements.forgeFrame.dataset.loaded = "true";
  setEditorSurfaceStatus("forge", "DUNGEON CREATION · BUILDING", "loading");
  elements.forgeFrame.contentWindow?.postMessage(
    {
      type: "black-flag:forge-visibility",
      visible: editorSurface === "forge" && engineMode === "editor",
    },
    location.origin,
  );
  postPendingProceduralSeed();
});
window.addEventListener("message", (event) => {
  if (event.origin !== location.origin || event.source !== elements.forgeFrame.contentWindow)
    return;
  if (event.data?.type === "black-flag:forge-anim-complete") {
    notifyForgeAnimComplete();
    return;
  }
  const intake = parseForgeDungeonMessage(event.data);
  if (intake.kind === "ignored") return;
  if (intake.kind === "rejected") {
    forgeIntake = null;
    forgePreviewDungeon = null;
    elements.forgeApply.disabled = true;
    if (dungeon) editorView.setDungeon(dungeon, resolveActiveMood(dungeon));
    setEditorSurfaceStatus("forge", intake.error.message.toUpperCase(), "error");
    setEditorSurfaceStatus("runtime", "MAP PREVIEW · INVALID", "error");
    return;
  }
  try {
    const { dungeon: imported, params } = intake.value;
    forgeIntake = intake.value;
    forgePreviewDungeon = imported;
    const mood = resolveActiveMood(imported);
    editorView.setDungeon(imported, mood);
    const theme = (imported.forge?.themeKey ?? params.profile).toUpperCase();
    setEditorSurfaceStatus(
      "forge",
      `${(imported.forge?.name ?? "Dungeon Creation").toUpperCase()} · ${imported.stats.roomCount} ROOMS · ${theme}`,
      "ready",
    );
    setEditorSurfaceStatus(
      "runtime",
      `MAP PREVIEW · ${imported.stats.roomCount} ROOMS · ${imported.stats.loopCount} LOOPS`,
      "ready",
    );
    elements.forgeApply.disabled = false;
  } catch (error) {
    forgeIntake = null;
    forgePreviewDungeon = null;
    elements.forgeApply.disabled = true;
    if (dungeon) editorView.setDungeon(dungeon, resolveActiveMood(dungeon));
    const message =
      error instanceof Error ? error.message : "Dungeon Creation preview could not be validated.";
    setEditorSurfaceStatus("forge", message.toUpperCase(), "error");
    setEditorSurfaceStatus("runtime", "MAP PREVIEW · INVALID", "error");
  }
});
function syncAudioToggleUi(): void {
  const muted = audio.isMuted;
  setToggleValue(elements.audioToggle, !muted, COPY.hud.audioOn, COPY.hud.mute);
  elements.audioToggle.title = muted ? "Unmute all audio" : "Mute all audio";
}

elements.audioToggle.addEventListener("click", () => {
  void audio.unlock().then(() => {
    const muted = audio.toggleMuted();
    syncAudioToggleUi();
    setStatus(muted ? "Audio off." : "Audio on.");
  });
});
function onMusicToggleClick(): void {
  void audio.unlock().then(() => {
    // Skip the extra click — pointerdown handler already fired uiToggle.
    setMusicMutedPreference(!audio.isMusicMuted, { playClick: false });
  });
}
elements.musicToggle.addEventListener("click", onMusicToggleClick);
elements.welcomeMusicToggle.addEventListener("click", onMusicToggleClick);
function syncCrtToggleUi(): void {
  elements.shell.classList.toggle("crt-off", !crtEnabled);
  setToggleValue(elements.crtToggle, crtEnabled, COPY.hud.crtOn, COPY.hud.crtOff);
  elements.crtToggle.title = crtEnabled ? "Turn CRT off" : "Turn CRT on";
}

// Apply capability default before first paint (toggle reflects Firefox/low-end path).
povPost.setCrtEnabled(crtEnabled);
syncCrtToggleUi();
syncAudioToggleUi();

elements.crtToggle.addEventListener("click", () => {
  crtEnabled = !crtEnabled;
  crtManualOverride = true;
  crtAutoDisabled = false;
  povPost.setCrtEnabled(crtEnabled);
  syncCrtToggleUi();
  setStatus(crtEnabled ? "CRT on." : "CRT off.");
});
elements.retry.addEventListener("click", () => {
  buildDungeon();
});
elements.newDungeon.addEventListener("click", () => {
  elements.seed.value = makeSeed();
  buildDungeon();
});
elements.endNextBiome.addEventListener("click", () => {
  if (elements.endNextBiome.disabled) return;
  const biomeId = parseDungeonMoodId(elements.endNextBiome.dataset.biomeId);
  if (!biomeId) return;
  startNewGameWithBiome(biomeId);
});
elements.interactionPrompt.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  void audio.unlock();
  touchSessionActive = true;
  audio.setPaused(false);
  uiInteractQueued = true;
});

document.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select"))
    return;
  if (event.repeat) return;
  if (welcomeOpen) return;
  if (event.code === "Escape" && engineMode === "play") {
    event.preventDefault();
    if (mapExpanded) {
      toggleMap(false);
      return;
    }
    // While pointer-locked, the browser unlocks first; onLockChange opens options.
    if (controller.getState().locked) return;
    if (optionsOpen) {
      resumePlay();
    } else {
      setOptionsOpen(true);
    }
    return;
  }
  if (event.code === "KeyM") {
    event.preventDefault();
    toggleMap();
  }
  if (event.code === "KeyR" && (engineMode !== "play" || optionsOpen)) {
    event.preventDefault();
    if (engineMode === "play" && optionsOpen) restartCurrentMap();
    else buildDungeon();
  }
  if (event.code === "Digit1") setEngineMode("editor");
  if (event.code === "Digit2") setEngineMode("debug");
  if (event.code === "Digit3") setEngineMode("play");
});

elements.touchButtons.forEach((button) => {
  const action = button.dataset.move as PlayerAction | undefined;
  if (!action) return;
  const release = (): void => controller.setVirtualAction(action, false);
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    void audio.unlock();
    touchSessionActive = true;
    audio.setPaused(false);
    button.setPointerCapture(event.pointerId);
    controller.setVirtualAction(action, true);
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
});
elements.touchPause.addEventListener("click", pauseTouchPlay);

const minimapResizeObserver = new ResizeObserver(() => scheduleMinimapLayout());
minimapResizeObserver.observe(elements.minimap);
window.addEventListener("resize", resize);

function descendFloor(): DungeonRuntimeState {
  const result = domainBridge.descend();
  if (!result.ok) {
    setStatus(result.error.message);
    return getRuntimeState();
  }
  const nextSeed = domainBridge.getDungeon().seed;
  elements.seed.value = nextSeed;
  return buildDungeon(nextSeed);
}

const api: DungeonEngineApi = {
  id: "black-flag-dungeon-engine",
  get ready() {
    return Boolean(dungeon) && renderWarmupReady;
  },
  getState: getRuntimeState,
  reset(seed?: string) {
    return buildDungeon(seed ?? elements.seed.value);
  },
  primaryAction() {
    setOptionsOpen(false);
    controller.requestPointerLock();
    return getRuntimeState();
  },
  toggleMap,
  setMode: setEngineMode,
  getDomain: () => domainBridge.getDungeon(),
  projectDomain: () => domainBridge.project(),
  descendFloor,
};

export interface DungeonEngineApi {
  readonly id: string;
  readonly ready: boolean;
  getState(): DungeonRuntimeState;
  reset(seed?: string): DungeonRuntimeState;
  primaryAction(): DungeonRuntimeState;
  toggleMap(forceExpanded?: boolean): void;
  setMode(mode: EngineMode): void;
  getDomain(): ReturnType<DomainBridge["getDungeon"]>;
  projectDomain(): ReturnType<DomainBridge["project"]>;
  descendFloor(): DungeonRuntimeState;
}

window.__BLACK_FLAG_DUNGEON_ENGINE__ = api;
window.__BLACK_FLAG_PROTOTYPE__ = api;
window.__THREE_GAME_DIAGNOSTICS__ = {
  getState: getRuntimeState,
  getRenderer: getRendererDiagnostics,
  getScene: () => scene,
  getCamera: () => camera,
  getController: () => controller,
};

// Three r185+ Timer API is absent from the pinned renderer; use a local delta clock.
let lastFrameMs = performance.now();
let damageHitActive = false;
let lastPaused = "";
let lastAudioFrameSync = Number.NEGATIVE_INFINITY;
function frame(now: number): void {
  requestAnimationFrame(frame);
  renderer.info.reset();
  const rawFrameGapMs = now - lastFrameMs;
  const delta = Math.min(Math.max(0, rawFrameGapMs / 1000), 0.05);
  lastFrameMs = now;
  smoothedFrameMs = THREE.MathUtils.lerp(smoothedFrameMs, delta * 1000, 0.08);
  const reducedMotion = REDUCED_MOTION_QUERY.matches;
  const criticalHealth = computeCriticalHealthFeel(
    playRuntime.state().resolve,
    now * 0.001,
    reducedMotion,
  );
  controller.setCriticalMovementDrift(criticalHealth.movementDrift);
  const result = controller.update(delta);
  const player = controller.getState();
  playerPosition.set(player.position.x, player.position.y, player.position.z);
  // Local fog volume follows the player (smooth height gradient around the view).
  atmosphere.update(delta, playerPosition);
  // Fire LOD + LOS is play-path cost; skip full torch budget work in editor/debug chrome.
  if (engineMode === "play") {
    world.updateEffects(delta, playerPosition);
  }

  // Domain explore: only on cell change, and coalesced (no network/health per step).
  if (dungeon && player.cell) {
    const cellKey = `${player.cell.x},${player.cell.y}`;
    if (cellKey !== lastExploreCellKey) {
      lastExploreCellKey = cellKey;
      syncDomainExplore();
    }
  }

  const simulationActive =
    engineMode === "play" && !optionsOpen && (player.locked || touchSessionActive);
  if (simulationActive !== profileSimulationActive) {
    profileSimulationActive = simulationActive;
    frameGapProfiler.reset();
    profileWarmupUntil = simulationActive ? now + 1800 : Number.POSITIVE_INFINITY;
  }
  if (simulationActive && now >= profileWarmupUntil) frameGapProfiler.record(rawFrameGapMs);
  if (!simulationActive) elements.interactionPrompt.hidden = true;
  const pausedFlag = String(!simulationActive);
  if (pausedFlag !== lastPaused) {
    lastPaused = pausedFlag;
    elements.shell.dataset.paused = pausedFlag;
  }
  if (simulationActive && document.visibilityState === "visible") {
    const step = playRuntime.step({
      delta,
      player: playerPosition,
      atExit: result.atExit,
      interactPressed: result.interactPressed || uiInteractQueued,
    });
    uiInteractQueued = false;
    const { worldUpdate, effects, state } = step;
    if (worldUpdate) {
      syncTimeFreezeHud(worldUpdate.timeFreezeRemaining);
      syncLuminousWardHud(worldUpdate.luminousWardRemaining);
      syncAnnihilationPulseHud(worldUpdate.annihilationPulseRemaining);
      controller.setSurfaceMovement(
        worldUpdate.surfaceEffect.movementScale,
        worldUpdate.surfaceEffect.traction,
      );
      syncHazardStatus(worldUpdate.surfaceEffect);
      elements.interactionPrompt.hidden = worldUpdate.interactionPrompt !== "open-chest";

      if (effects.questStonesFound !== undefined) {
        elements.shell.dataset.relic = effects.questPortalOpen ? "true" : "false";
        elements.shell.dataset.stones = String(effects.questStonesFound);
        updateObjective();
      }
      if (effects.sessionChanged) {
        domainBridge.syncSession(playRuntime.snapshot());
        scheduleLocalRunSave();
      }
      if (effects.status) setStatus(effects.status);
      if (effects.playPickup && effects.pickup) {
        audio.playPickup(worldUpdate.collectedPickup);
        if (effects.questPortalOpen) audio.playPortal(world.getAudioFrame().portal);
        showPickupFeedback(
          effects.pickup.label,
          Boolean(effects.pickup.restoreResolve),
          effects.pickup.stoneId,
          Boolean(effects.pickup.timeFreeze),
          Boolean(effects.pickup.luminousWard),
          Boolean(effects.pickup.annihilationPulse),
        );
      }
      if (worldUpdate.annihilationPulse) {
        audio.playAnnihilationPulse(worldUpdate.annihilationPulse.position);
        if (worldUpdate.annihilationPulse.hits > 0) {
          hitTrauma = Math.max(
            hitTrauma,
            Math.min(0.72, 0.18 + worldUpdate.annihilationPulse.hits * 0.03),
          );
          flash("event");
        }
      }
      if (effects.playEnemyHit) {
        elements.shell.dataset.resolve = String(Math.ceil(state.resolve));
        const washKind = resolveDamageWashKind(
          worldUpdate.surfaceEffect.kind,
          worldUpdate.surfaceEffect.damage,
        );
        triggerDamageFeedback(worldUpdate.knockback, washKind);
        if (worldUpdate.damageSource) {
          audio.playEnemyHit(worldUpdate.damageSource.position, worldUpdate.damageSource.voice);
        } else {
          // Hazard floor damage: hit sting only (no creature bark).
          audio.play("damage");
        }
      }
      if (worldUpdate.doorSound) {
        audio.playDoor(worldUpdate.doorSound.kind, worldUpdate.doorSound.position);
      }
      if (worldUpdate.chestSound) {
        audio.playChest(worldUpdate.chestSound.position);
      }
      if (effects.flash) flash(effects.flash);
      if (
        effects.damageHit ||
        effects.pickup?.restoreResolve ||
        effects.questStonesFound !== undefined
      ) {
        updateResolve();
      }
      if (effects.endOverlay) showEndOverlay(effects.endOverlay);
      syncQuestHud();
      // Threat distance still drives lighting / audio feel; no HUD spam.
      currentThreatDistance = worldUpdate.nearestThreat;
    }
  }
  syncTimeFreezeHud();
  syncLuminousWardHud();
  syncAnnihilationPulseHud();
  syncRunTimer();

  damageTimer = Math.max(0, damageTimer - delta);
  if (damageTimer === 0 && damageHitActive) {
    damageHitActive = false;
    elements.damage.classList.remove("is-hit");
  }
  hazardHitBoost = simulationActive ? decayHazardHitBoost(hazardHitBoost, delta) : 0;
  hitTrauma = simulationActive ? decayHitTrauma(hitTrauma, delta) : 0;
  if (simulationActive && result.justExhausted) exhaustionTrauma = 1;
  exhaustionTrauma = simulationActive ? decayExhaustionTrauma(exhaustionTrauma, delta) : 0;
  updateStaminaHud(result.stamina, result.staminaExhausted, simulationActive && player.sprinting);
  if (simulationActive && result.footstep) {
    audio.playFootstep(footstepSurfaceAt(dungeon, result.cell));
  }
  camera.getWorldDirection(audioForward);
  audio.setListener(camera.position, audioForward);
  // Asset ambience, spatial torches, and nearby creature calls.
  if (simulationActive) {
    // World anchors move far slower than render frames. A bounded refresh keeps
    // HRTF placement current without recreating a fire/enemy snapshot at 60 Hz.
    if (now - lastAudioFrameSync >= 125) {
      audio.syncWorld(world.getAudioFrame());
      lastAudioFrameSync = now;
    }
    audio.setThreatDistance(currentThreatDistance);
    audio.tick(delta);
  } else {
    audio.setThreatDistance(null);
  }
  camera.getWorldDirection(lanternForward);
  lighting.update(delta, playerPosition, currentThreatDistance, lanternForward);

  // POV: close enemies shake a little; hits keep the lens unstable for a few seconds.
  const maxSpeed = PLAYER_MOVE_SPEED * PLAYER_SPRINT_MULT;
  const speedRatio = THREE.MathUtils.clamp(player.speed / maxSpeed, 0, 1);
  const feelTarget = computePovFeel({
    sprinting: player.sprinting && simulationActive,
    speedRatio: simulationActive ? speedRatio : 0,
    threatDistance: simulationActive ? currentThreatDistance : null,
    hitTrauma: simulationActive ? hitTrauma : 0,
    exhaustionTrauma: simulationActive ? exhaustionTrauma : 0,
    reducedMotion,
  });
  const feel = povFeel.apply(feelTarget, delta);
  if (feel.shake > 0.002) {
    const shake = samplePovShake(now * 0.001, feel.shake);
    camera.position.x += shake.x;
    camera.position.y += shake.y;
    cameraShakeEuler.setFromQuaternion(camera.quaternion);
    cameraShakeEuler.z += shake.roll;
    camera.quaternion.setFromEuler(cameraShakeEuler);
  }
  povPost.setEnabled(engineMode === "play");
  // Auto-drop CRT when the frame budget is missed (Firefox especially). Manual
  // toggle wins so players can force CRT back on after recovery.
  if (!crtManualOverride && engineMode === "play") {
    if (!crtAutoDisabled && crtEnabled && smoothedFrameMs >= renderCaps.adaptiveCrtDisableMs) {
      crtAutoDisabled = true;
      crtEnabled = false;
      povPost.setCrtEnabled(false);
      syncCrtToggleUi();
    } else if (
      crtAutoDisabled &&
      !crtEnabled &&
      smoothedFrameMs <= renderCaps.adaptiveCrtDisableMs - 8
    ) {
      crtAutoDisabled = false;
      crtEnabled = renderCaps.enableCrtByDefault;
      if (crtEnabled) {
        povPost.setCrtEnabled(true);
        syncCrtToggleUi();
      }
    }
  }
  elements.shell.dataset.criticalHealth = String(criticalHealth.active);
  povPost.setParams(
    feel.curvature,
    feel.chromatic,
    simulationActive ? criticalHealth.redTint : 0,
    reducedMotion ? 0.004 : 0.008,
    !reducedMotion,
  );
  const hazardFeel = simulationActive
    ? computeHazardFeel(activeHazardKind, hazardHitBoost, reducedMotion)
    : computeHazardFeel(null);
  povPost.setHazardFeel(
    hazardFeel.heatwave,
    hazardFeel.toxinGreen,
    hazardFeel.iceBlue,
    hazardFeel.spikeEdge,
  );

  if (result.changedCell) {
    updateReadout();
    drawMap();
    scheduleLocalRunSave();
  } else if (now - lastMapDraw > 220) {
    drawMap();
    lastMapDraw = now;
  }
  // Debug HUD only needs cheap counters — never walk the scene graph here.
  if (engineMode === "debug" && now - lastDebugDraw > 240) {
    const frameMs = Number(smoothedFrameMs.toFixed(1));
    const triangles = lastRenderSnapshot.triangles;
    elements.debugFps.textContent = String(Math.round(1000 / Math.max(smoothedFrameMs, 0.001)));
    elements.debugFrame.textContent = `${frameMs}ms`;
    elements.debugCalls.textContent = String(lastRenderSnapshot.calls);
    elements.debugTris.textContent =
      triangles > 9999 ? `${Math.round(triangles / 1000)}k` : String(triangles);
    elements.debugTextures.textContent = String(renderer.info.memory.textures);
    elements.debugLights.textContent = String(world.stats.lights);
    lastDebugDraw = now;
  }
  if (renderWarmupReady) {
    povPost.render(renderer, scene, camera);
  } else {
    renderer.setRenderTarget(null);
    renderer.clear();
  }
  lastRenderSnapshot.calls = renderer.info.render.calls;
  lastRenderSnapshot.triangles = renderer.info.render.triangles;
  lastRenderSnapshot.points = renderer.info.render.points;
  lastRenderSnapshot.lines = renderer.info.render.lines;
  publishPerformanceDiagnostics(now);
}

window.addEventListener("pagehide", clearTouchSession);
window.addEventListener("pagehide", flushLocalRunSave);
document.addEventListener("visibilitychange", clearTouchSessionWhenHidden);
document.addEventListener("visibilitychange", flushLocalRunSaveWhenHidden);
window.addEventListener("beforeunload", () => {
  flushLocalRunSave();
  longTaskObserver?.disconnect();
  minimapResizeObserver.disconnect();
  minimapLayout.dispose();
  editorView.dispose();
  audio.dispose();
  controller.dispose();
  atmosphere.dispose();
  povPost.dispose();
  lighting.dispose();
  playRuntime.dispose();
  renderer.dispose();
});
function setBootProgress(progress: number, message: string): void {
  const pct = Math.max(0, Math.min(1, progress));
  elements.bootFill.style.width = `${Math.round(pct * 100)}%`;
  elements.bootStatus.textContent = message;
}

function waitAnimationFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    let left = Math.max(1, count);
    const step = (): void => {
      left -= 1;
      if (left <= 0) resolve();
      else window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  });
}

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.src = src;
    if (image.complete) resolve();
  });
}

async function waitForRendererWarmup(timeoutMs = 6_000): Promise<void> {
  if (renderWarmupReady) return;
  const started = performance.now();
  while (!renderWarmupReady && performance.now() - started < timeoutMs) {
    await waitAnimationFrames(1);
  }
}

async function dismissBootScreen(): Promise<void> {
  setBootProgress(1, "Ready.");
  await waitAnimationFrames(1);
  document.body.classList.remove("is-booting");
  elements.bootScreen.classList.add("is-done");
  elements.bootScreen.setAttribute("aria-busy", "false");
  window.setTimeout(() => {
    elements.bootScreen.hidden = true;
  }, 480);
}

resize();
applyCameraSettings();
setBootProgress(0.12, "Binding audio…");
// Restore music preference before the welcome bed is requested.
audio.setMusicMuted(readStoredMusicMuted());
syncMusicToggleUi();
// Welcome owns the first choice. New Game starts play; Custom Run opens Creation.
setBootProgress(0.28, "Forging the first map…");
setEngineMode("editor", { hydrate: false, persist: false });
// Keep welcome closed until boot finishes so the UI does not pop in mid-stutter.
setWelcomeOpen(false);
void refreshLeaderboard();
const localContinue = readLocalRunSave();
let bootBuilt = false;
if (canContinueLocalRun(localContinue)) {
  try {
    setRunSource(runSourceFromLocalSave(localContinue), false);
    applyDungeonDomainToForm(localContinue.state);
    elements.seed.value = localContinue.state.seed;
    buildDungeon(localContinue.state.seed, {
      persistBuild: false,
      persistedSession: domainToPersistedSession(localContinue.state, localContinue.resume),
      resume: localContinue.resume,
    });
    setContinueCandidate(localContinue.state, `Continue ready · ${localContinue.state.seed}`);
    bootBuilt = true;
  } catch (error) {
    console.warn("Local dungeon save could not be restored", error);
  }
}
if (!bootBuilt) {
  buildDungeon(urlSeed, { persistBuild: false });
  setContinueCandidate(null, "No active saved run. Start a new game.");
}
setBootProgress(0.55, "Warming the renderer…");
const visualQaState = readVisualQaState(window.location.search);
if (visualQaState) {
  runHasStarted = false;
  setWelcomeOpen(false);
  setEngineMode("play", { hydrate: false, persist: false });
  const qaState = playRuntime.loadFixture(visualQaState);
  lastPortalBanner = qaState.quest.portalOpen;
  questHudStonesFound = -1;
  questHudPortalOpen = false;
  updateResolve();
  elements.shell.dataset.resolve = String(qaState.resolve);
  elements.shell.dataset.relic = String(qaState.quest.portalOpen);
  elements.shell.dataset.stones = String(qaState.quest.stonesFound);
  syncQuestHud();
  if (qaState.runMode !== "playing") showEndOverlay(qaState.runMode);
  setStatus(`Visual QA state · ${visualQaState}`);
  void (async () => {
    setBootProgress(0.8, "Loading type…");
    await Promise.all([
      document.fonts.ready.catch(() => undefined),
      preloadImage("/assets/ui/biome-screens/ancient-main.webp"),
      preloadImage(elements.endArt.src),
      waitForRendererWarmup(renderCaps.skipShaderPrecompile ? 2_500 : 8_000),
    ]);
    await waitAnimationFrames(2);
    await dismissBootScreen();
  })();
} else {
  void (async () => {
    setBootProgress(0.62, "Checking saved runs…");
    try {
      if (localDevTools) {
        const hydrated = await domainBridge.hydrateFromAuthority();
        if (hydrated && canContinueDomainRun(hydrated.state)) {
          applyDungeonDomainToForm(hydrated.state);
          elements.seed.value = hydrated.seed;
          buildDungeon(hydrated.seed, {
            persistBuild: false,
            persistedSession: domainToPersistedSession(hydrated.state),
          });
          setContinueCandidate(hydrated.state, `Continue ready · ${hydrated.seed}`);
          setStatus(`Saved run ready · seed ${hydrated.seed}`);
        } else if (!continueDomainState) {
          setContinueCandidate(null, "No active saved run. Start a new game.");
        }
        await refreshRunSelect();
      } else if (!continueDomainState) {
        setContinueCandidate(null, "No active saved run. Start a new game.");
      }
    } catch (error) {
      console.warn("Boot hydrate failed", error);
    }
    setBootProgress(0.8, "Loading type and art…");
    await Promise.all([
      document.fonts.ready.catch(() => undefined),
      preloadImage("/assets/ui/biome-screens/ancient-main.webp"),
      // Firefox skips full precompile; do not hold the boot curtain for Chrome-length compiles.
      waitForRendererWarmup(renderCaps.skipShaderPrecompile ? 2_500 : 8_000),
    ]);
    setBootProgress(0.96, "Opening the hall…");
    await waitAnimationFrames(2);
    setWelcomeOpen(true);
    await dismissBootScreen();
  })();
}
requestAnimationFrame(frame);
