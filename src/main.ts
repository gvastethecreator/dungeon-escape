import * as THREE from "three";

import { GameAudio, type AudioCue } from "./audio/GameAudio";
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
import { mountDomainPanel } from "./domain/panel";
import { DUNGEON_PRESETS, type DungeonEditorParams, type DungeonPresetId } from "./editor/presets";
import { generateDungeon, setDungeonSpawn } from "./dungeon/generateDungeon";
import {
  isForgeDungeonMessage,
  prepareDungeonForge,
  type ForgeDungeonPayload,
} from "./dungeon/importDungeonForge";
import { normalizeForgePayload } from "./dungeon/forgePayload";
import type { DungeonData } from "./dungeon/types";
import { DungeonEditorView } from "./editor/DungeonEditorView";
import { type EngineMode, isEngineMode, shouldMountForge } from "./game/EngineMode";
import { FirstPersonController, type PlayerAction } from "./player/FirstPersonController";
import { AtmosphereSystem } from "./systems/AtmosphereSystem";
import { getDungeonMood, parseDungeonMoodId, resolveDungeonMood } from "./systems/DungeonMood";
import { LightingRig } from "./systems/LightingRig";
import { resolveDungeonExposure } from "./systems/LightTuning";
import { PovPostFx } from "./systems/PovPostFx";
import { computeCriticalHealthFeel } from "./systems/CriticalHealthFeel";
import { FrameGapProfiler, type FrameGapSnapshot } from "./systems/FrameGapProfiler";
import { collectVisibleRenderInventory } from "./systems/RenderInventory";
import { readVisualQaState } from "./systems/VisualQaState";
import { computePovFeel, PovFeelState, samplePovShake } from "./systems/povFeel";
import { drawMinimap } from "./ui/drawMinimap";
import { COPY, STONE_ORDER, formatTime, type StoneId } from "./ui/copy";
import { createMinimapLayoutScheduler } from "./ui/minimapLayout";
import { QuestState } from "./game/QuestState";
import {
  applyWorldUpdate,
  createRunSession,
  resetRunSession,
  restoreRunSession,
  snapshotRunSession,
  type PersistedRunSession,
} from "./game/RunSession";
import { shouldAdoptHydratedSeed } from "./game/hydratePolicy";
import {
  canContinueDomainRun,
  canContinueLocalRun,
  readLocalRunSave,
  writeLocalRunSave,
} from "./game/LocalRunSave";
import { DungeonWorld } from "./world/DungeonWorld";
import { WORLD_TILE_SIZE, WORLD_WALL_HEIGHT } from "./world/WorldMetrics";
import "./styles.css";

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}.`);
  return element;
}

const elements = {
  shell: requireElement<HTMLElement>(".app-shell"),
  scene: requireElement<HTMLCanvasElement>("#scene"),
  welcomeScreen: requireElement<HTMLElement>("#welcome-screen"),
  welcomeNew: requireElement<HTMLButtonElement>("#welcome-new"),
  welcomeContinue: requireElement<HTMLButtonElement>("#welcome-continue"),
  welcomeStatus: requireElement<HTMLElement>("#welcome-status"),
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
  pushAuthority: requireElement<HTMLButtonElement>("#push-authority"),
  cameraSensitivity: requireElement<HTMLInputElement>("#camera-sensitivity"),
  cameraSensitivityLabel: requireElement<HTMLOutputElement>("#camera-sensitivity-label"),
  cameraMotion: requireElement<HTMLInputElement>("#camera-motion"),
  cameraMotionLabel: requireElement<HTMLOutputElement>("#camera-motion-label"),
  reroll: requireElement<HTMLButtonElement>("#reroll"),
  runStats: requireElement<HTMLParagraphElement>("#run-stats"),
  position: requireElement<HTMLParagraphElement>("#position-readout"),
  authorityReadout: requireElement<HTMLParagraphElement>("#authority-readout"),
  presetButtons: [...document.querySelectorAll<HTMLButtonElement>("[data-dungeon-preset]")],
  status: requireElement<HTMLParagraphElement>("#status"),
  resolveValue: requireElement<HTMLOutputElement>("#resolve-value"),
  resolveFill: requireElement<HTMLElement>("#resolve-fill"),
  healthOrb: requireElement<HTMLElement>(".health-orb"),
  playVitals: requireElement<HTMLElement>(".play-vitals"),
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
  endOverlay: requireElement<HTMLElement>("#end-overlay"),
  endKicker: requireElement<HTMLElement>("#end-kicker"),
  endTitle: requireElement<HTMLElement>("#end-title"),
  endCopy: requireElement<HTMLElement>("#end-copy"),
  endResults: requireElement<HTMLElement>("#end-results"),
  endTime: requireElement<HTMLElement>("#end-time"),
  endStones: requireElement<HTMLElement>("#end-stones"),
  endDistance: requireElement<HTMLElement>("#end-distance"),
  endBiome: requireElement<HTMLElement>("#end-biome"),
  endSeed: requireElement<HTMLElement>("#end-seed"),
  retry: requireElement<HTMLButtonElement>("#retry"),
  newDungeon: requireElement<HTMLButtonElement>("#new-dungeon"),
  optionsMenu: requireElement<HTMLElement>("#options-menu"),
  optionsCard: requireElement<HTMLElement>("#options-card"),
  optionsTitle: requireElement<HTMLElement>("#options-title"),
  optionsResume: requireElement<HTMLButtonElement>("#options-resume"),
  recordPanel: requireElement<HTMLDetailsElement>(".record-panel"),
  modeButtons: [...document.querySelectorAll<HTMLButtonElement>("[data-engine-mode]")],
  audioToggle: requireElement<HTMLButtonElement>("#audio-toggle"),
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

const TILE_SIZE = WORLD_TILE_SIZE;
const PLAYER_MOVE_SPEED = 4.25;
const PLAYER_SPRINT_MULT = 1.48;

// Local domain bridge keeps seed, floor, exploration, and engine mode coherent.
const urlSeed = readSeedFromUrl() ?? (elements.seed.value.trim() || COPY.hud.seedDefault);
elements.seed.value = urlSeed;
const authorityBaseUrl = new URLSearchParams(window.location.search).get("authority")?.trim() ?? "";
const authority = createAuthorityClient({ baseUrl: authorityBaseUrl });
const domainBridge: DomainBridge = createDomainBridge({ initialSeed: urlSeed, authority });
const domainPanel = mountDomainPanel(elements.shell, domainBridge);
const visitedCells = new Set<string>();
let lastExploreCellKey = "";
let lastPanelRefresh = 0;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 120);
const renderer = new THREE.WebGLRenderer({
  canvas: elements.scene,
  antialias: false,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
// Soft shadows + many torch lights stutter on mid GPUs; keep maps off for play smoothness.
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
// The post pass renders twice. Keep renderer.info across both draws, then
// reset once per animation frame so diagnostics describe the real scene cost.
renderer.info.autoReset = false;

const lighting = new LightingRig(scene);
// Neutral IBL so MeshStandard metals leave flat gray (low mood intensity keeps interiors grim).
lighting.bindEnvironment(renderer);
const world = new DungeonWorld(scene, { tileSize: TILE_SIZE, wallHeight: WORLD_WALL_HEIGHT });
// Fog column shares WorldMetrics with the architecture stack.
const atmosphere = new AtmosphereSystem(scene, TILE_SIZE, WORLD_WALL_HEIGHT);
const povPost = new PovPostFx();
const povFeel = new PovFeelState();
const audio = new GameAudio();
const playerPosition = new THREE.Vector3();
const audioForward = new THREE.Vector3();
const cameraShakeEuler = new THREE.Euler(0, 0, 0, "YXZ");
// Cached once — reading matchMedia every frame is wasteful and some browsers do
// non-trivial work on each call. The live MediaQueryList keeps .matches current.
const REDUCED_MOTION_QUERY = window.matchMedia("(prefers-reduced-motion: reduce)");
let dungeon: DungeonData | null = null;
const session = createRunSession();
/** @deprecated mirrors — prefer session; kept as short names for local call sites */
let resolve = session.resolve;
let runMode = session.runMode;
let exitReached = session.exitReached;

function syncSessionMirrors(): void {
  resolve = session.resolve;
  runMode = session.runMode;
  exitReached = session.exitReached;
}
let mapExpanded = false;
let lastMapDraw = 0;
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
let touchSessionActive = false;
let engineMode: EngineMode = "editor";
let crtEnabled = true;
let optionsOpen = false;
let welcomeOpen = true;
let continueDomainState: DungeonDomainState | null = null;
let localSaveTimer: ReturnType<typeof setTimeout> | null = null;
let runHasStarted = false;
let renderWarmupReady = false;
let renderWarmupSequence = 0;
let lastDebugDraw = 0;
let regenerateTimer = 0;
let currentThreatDistance: number | null = null;
let editorSurface: "runtime" | "forge" = "forge";
let forgeDungeon: ForgeDungeonPayload | null = null;
let forgePreviewDungeon: DungeonData | null = null;
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
    if (!hasActivePlayInput && engineMode === "play" && runMode === "playing") {
      setOptionsOpen(true);
    } else if (locked) {
      setOptionsOpen(false);
    }
    setStatus(message);
  },
});

const editorView = new DungeonEditorView(elements.editorMap, { onSelectSpawn: selectEditorSpawn });

const quest = new QuestState();
let objectiveBannerTimer: ReturnType<typeof setTimeout> | null = null;
let objectiveFadeTimer: ReturnType<typeof setTimeout> | null = null;
let lastPortalBanner = false;

function setStatus(message: string): void {
  elements.status.textContent = message;
}

function currentDomainSave(): DungeonDomainState {
  const persisted = snapshotRunSession(session, quest);
  return {
    ...domainBridge.getDungeon(),
    ...persisted,
    engineMode,
  };
}

function persistCurrentRun(): void {
  if (!dungeon) return;
  writeLocalRunSave(currentDomainSave());
}

function scheduleLocalRunSave(delay = 650): void {
  if (localSaveTimer !== null) clearTimeout(localSaveTimer);
  localSaveTimer = setTimeout(() => {
    localSaveTimer = null;
    persistCurrentRun();
  }, delay);
}

function setContinueCandidate(state: DungeonDomainState | null, status: string): void {
  continueDomainState = canContinueDomainRun(state) ? state : null;
  elements.welcomeContinue.disabled = continueDomainState === null;
  elements.welcomeStatus.textContent = status;
}

function setWelcomeOpen(open: boolean): void {
  welcomeOpen = open;
  elements.welcomeScreen.hidden = !open;
  elements.shell.classList.toggle("is-welcome", open);
  if (open) {
    controller.releasePointerLock();
    audio.setPaused(true);
    window.requestAnimationFrame(() => elements.welcomeNew.focus());
  } else {
    elements.scene.focus({ preventScroll: true });
  }
}

function canEnablePlayController(): boolean {
  return renderWarmupReady && engineMode === "play" && runMode === "playing";
}

function beginRendererWarmup(): number {
  renderWarmupSequence += 1;
  renderWarmupReady = false;
  elements.shell.dataset.rendererReady = "false";
  controller.setEnabled(false);
  return renderWarmupSequence;
}

function startRendererWarmup(sequence: number, readyMessage: string): void {
  setStatus("Preparing renderer...");
  window.requestAnimationFrame(() => {
    if (sequence !== renderWarmupSequence) return;
    const startedAt = performance.now();
    void (async () => {
      // Precompile both output paths used by the POV pass. The fixed light count
      // then keeps the same shader set valid as the player crosses rooms.
      await renderer.compileAsync(scene, camera);
      await povPost.compileSceneAsync(renderer, scene, camera);
      await povPost.compileAsync(renderer);
    })()
      .then(() => {
        if (sequence !== renderWarmupSequence) return;
        renderWarmupReady = true;
        elements.shell.dataset.rendererReady = "true";
        controller.setEnabled(canEnablePlayController());
        setStatus(
          `${readyMessage} Renderer ready in ${Math.round(performance.now() - startedAt)}ms.`,
        );
      })
      .catch((error: unknown) => {
        if (sequence !== renderWarmupSequence) return;
        renderWarmupReady = true;
        elements.shell.dataset.rendererReady = "error";
        controller.setEnabled(canEnablePlayController());
        const detail = error instanceof Error ? error.message : "unknown error";
        console.error("Dungeon renderer warmup failed", error);
        setStatus(`${readyMessage} Renderer warmup failed: ${detail}.`);
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
  const stonesFound = quest.stonesFound;
  const portalOpen = quest.portalOpen;
  if (stonesFound === questHudStonesFound && portalOpen === questHudPortalOpen) return;
  questHudStonesFound = stonesFound;
  questHudPortalOpen = portalOpen;

  elements.stoneCount.textContent = `${stonesFound}/${quest.totalStones}`;
  for (const socket of elements.stoneSockets) {
    const id = socket.dataset.stone as StoneId | undefined;
    const bound = id ? quest.hasStone(id) : false;
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

function applyPersistedRunSession(persisted: PersistedRunSession): void {
  restoreRunSession(session, quest, persisted);
  world.restoreSession(persisted.foundStoneIds);
  syncSessionMirrors();
  elements.shell.dataset.mode = session.runMode;
  elements.shell.dataset.relic = String(quest.portalOpen);
  elements.shell.dataset.stones = String(quest.stonesFound);
  elements.shell.dataset.resolve = String(Math.ceil(session.resolve));
  lastPortalBanner = quest.portalOpen;
  questHudStonesFound = -1;
  questHudPortalOpen = false;
  updateResolve();
  updateObjective();
  if (session.runMode === "playing") closeEndOverlay();
  else showEndOverlay(session.runMode);
}

function setOptionsOpen(open: boolean): void {
  if (engineMode !== "play") {
    // Editor/debug always show the docked tools shell.
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
function getDecorDensity(): number {
  return Number(elements.decorDensity.value) / 100;
}
function getEnemyDensity(): number {
  return Number(elements.enemyDensity.value) / 100;
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
  elements.enemyDensityLabel.value = `${params.enemyDensity}%`;
  elements.lightLevel.value = String(params.lightLevel);
  elements.lightLevelLabel.value = `${params.lightLevel}%`;
  elements.profileSelect.value = [...elements.profileSelect.options].some(
    (option) => option.value === params.profile,
  )
    ? params.profile
    : "custom";
}

/** Resolve active mood: URL ?mood=/?theme= wins, else forge/profile/seed. */
function resolveActiveMood(nextDungeon: DungeonData) {
  const forced = parseDungeonMoodId(readMoodFromUrl());
  if (forced) return getDungeonMood(forced);
  return resolveDungeonMood(nextDungeon, readEditorParams().profile);
}

function applyAtmosphereFromParams(): void {
  // Forge maps: honor authored densites so Play matches Creation preview.
  if (dungeon?.forge) {
    world.setDecorDensity(dungeon.forge.decorDensity);
    world.setEnemyDensity(1);
  } else {
    world.setDecorDensity(getDecorDensity());
    world.setEnemyDensity(getEnemyDensity());
  }
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
  domainPanel.refresh();
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
  const online = await domainBridge.probeAuthority();
  elements.authorityReadout.textContent = online
    ? `Authority: ONLINE · run ${domainBridge.getStatus().lastError ?? "ok"}`
    : "Authority: OFFLINE (local sim)";
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
    elements.authorityReadout.textContent = COPY.status.authorityOnline(
      String(list.activeRunId),
      list.runs.length,
    );
  } catch (err) {
    elements.authorityReadout.textContent = COPY.status.authorityError(
      err instanceof Error ? err.message : String(err),
    );
  }
  domainPanel.refresh();
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

function triggerDamageFeedback(knockback: { x: number; z: number } | null): void {
  damageTimer = DAMAGE_WASH_SECONDS;
  elements.damage.classList.remove("is-hit");
  void elements.damage.offsetWidth;
  elements.damage.classList.add("is-hit");
  damageHitActive = true;
  spawnOrbBloodSplash();
  if (knockback) controller.applyKnockback(knockback.x, knockback.z);
  else controller.applyKnockback(0, 0);
}

function showPickupFeedback(label: string, restoreResolve = false, stoneId?: StoneId): void {
  elements.pickupFeedbackText.textContent = label;
  elements.pickupFeedbackKicker.textContent = restoreResolve
    ? COPY.pickup.flask
    : stoneId
      ? COPY.pickup.small
      : COPY.pickup.notice;
  elements.pickupFeedback.dataset.kind = restoreResolve ? "flask" : stoneId ? "stone" : "notice";
  if (stoneId) elements.pickupFeedback.dataset.stone = stoneId;
  else delete elements.pickupFeedback.dataset.stone;
  elements.pickupFeedback.classList.remove("is-active");
  void elements.pickupFeedback.offsetWidth;
  elements.pickupFeedback.classList.add("is-active");
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
  const clamped = THREE.MathUtils.clamp(resolve, 0, 100);
  const shown = Math.ceil(clamped);
  const fill = `${clamped}%`;
  elements.resolveValue.value = String(shown);
  // --fill drives liquid height + meniscus on the orb root.
  elements.healthOrb.style.setProperty("--fill", fill);
  elements.healthOrb.classList.toggle("is-low", clamped <= 30);
  elements.healthOrb.setAttribute("aria-valuenow", String(shown));
  elements.healthOrb.setAttribute("aria-valuetext", `${shown} health`);
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

function drawMap(): void {
  if (dungeon) {
    drawMinimap(
      elements.minimap,
      dungeon,
      controller.getState().cell,
      world.getMinimapFeatures(),
      minimapViewport,
    );
  }
}

function closeEndOverlay(): void {
  elements.endOverlay.hidden = true;
  elements.shell.dataset.mode = "playing";
  controller.setEnabled(canEnablePlayController());
}

function showEndOverlay(mode: "dead" | "won"): void {
  session.runMode = mode;
  runMode = mode;
  elements.shell.dataset.mode = mode;
  controller.setEnabled(false);
  controller.releasePointerLock();
  // A restored finished run remains useful context in editor/debug, but its
  // play-only ending must never cover the creation workspace.
  if (engineMode !== "play") {
    elements.endOverlay.hidden = true;
    return;
  }
  elements.endOverlay.hidden = false;
  elements.endOverlay.dataset.end = mode === "won" ? "won" : "dead";
  if (mode === "won") {
    audio.play("win");
    elements.endKicker.textContent = COPY.end.winKicker;
    elements.endTitle.textContent = COPY.end.winTitle;
    elements.endCopy.textContent = COPY.end.winLead;
    const result = quest.snapshot();
    const player = controller.getState();
    elements.endResults.hidden = false;
    elements.endTime.textContent = formatTime(result.runSeconds);
    elements.endStones.textContent = `${result.stonesFound} / ${result.stonesTotal}`;
    elements.endDistance.textContent = `${Math.round(player.distanceTravelled)} m`;
    elements.endBiome.textContent = dungeon ? resolveActiveMood(dungeon).label : "Unknown";
    elements.endSeed.textContent = dungeon?.seed ?? "Unknown";
    elements.retry.hidden = true;
    elements.newDungeon.textContent = COPY.end.next;
  } else {
    audio.play("lose");
    elements.endKicker.textContent = COPY.end.loseKicker;
    elements.endTitle.textContent = COPY.end.loseTitle;
    elements.endCopy.textContent = COPY.end.loseCopy;
    elements.endResults.hidden = true;
    elements.retry.textContent = COPY.end.retry;
    elements.retry.hidden = false;
    elements.newDungeon.textContent = COPY.end.newDungeon;
  }
  (mode === "dead" ? elements.retry : elements.newDungeon).focus();
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
  domainPanel.refresh();
}

function syncDomainExplore(extra: { threat?: number } = {}): void {
  if (!dungeon || runTransitionPending) return;
  const player = controller.getState();
  const cell = player.cell ?? dungeon.spawn;
  const key = `${cell.x},${cell.y}`;
  visitedCells.add(key);
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
  setStatus("Run change blocked by an unsynced dungeon. Use PUSH BACKEND, then retry.");
  domainPanel.refresh();
  return false;
}

function bindAuthorityRunTransition(runId: string): void {
  if (!domainBridge.completeRunTransition(runId)) {
    throw new Error(`Cannot bind dungeon authority to run ${runId}.`);
  }
}

function activateDungeon(
  nextDungeon: DungeonData,
  message: string,
  params: DungeonEditorParams,
  options: { persistBuild?: boolean; persistedSession?: PersistedRunSession } = {},
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
      domainPanel.refresh();
      throw error;
    }
  }
  const warmupSequence = beginRendererWarmup();

  dungeon = nextDungeon;
  forgePreviewDungeon = nextDungeon.forge ? nextDungeon : null;
  elements.seed.value = nextDungeon.seed;
  writeSeedToUrl(nextDungeon.seed);
  visitedCells.clear();
  visitedCells.add(`${nextDungeon.spawn.x},${nextDungeon.spawn.y}`);
  const mood = applyDungeonMood(nextDungeon);
  applyAtmosphereFromParams();
  world.setDungeon(dungeon, mood);
  atmosphere.setDungeon(dungeon, mood);
  controller.setDungeon(dungeon);
  controller.setBlockedCells([]);
  controller.setSolidColliders(world.getSolidColliders());
  controller.setEnabled(canEnablePlayController());
  editorView.setDungeon(dungeon, mood);
  setEditorSurfaceStatus(
    "runtime",
    `PLAY MAP · ${nextDungeon.stats.roomCount} ROOMS · ${nextDungeon.stats.loopCount} LOOPS`,
    "ready",
  );
  if (options.persistedSession) {
    restoreRunSession(session, quest, options.persistedSession);
    world.restoreSession(options.persistedSession.foundStoneIds);
  } else {
    resetRunSession(session, 100);
    quest.start();
  }
  syncSessionMirrors();
  elements.shell.dataset.ready = "true";
  elements.shell.dataset.mode = session.runMode;
  elements.shell.dataset.relic = String(quest.portalOpen);
  elements.shell.dataset.stones = String(quest.stonesFound);
  elements.shell.dataset.resolve = String(Math.ceil(session.resolve));
  elements.editorCell.textContent = `SPAWN ${formatCell(dungeon.spawn)}`;
  damageTimer = 0;
  lastPortalBanner = quest.portalOpen;
  // Invalidate the quest HUD dirty cache so the first syncQuestHud() repaints.
  questHudStonesFound = -1;
  questHudPortalOpen = false;
  if (persistBuild) {
    domainBridge.setEngineMode(engineMode);
    syncDomainExplore();
  }
  if (session.runMode === "playing") closeEndOverlay();
  else showEndOverlay(session.runMode);
  updateResolve();
  updateObjective();
  // Intro objective: appears at run start, then fades so the scene stays clean.
  if (engineMode === "play" && session.runMode === "playing" && !quest.portalOpen) {
    showObjectiveBanner(COPY.objective.intro, "hunt", 3400, 1500);
  } else {
    clearObjectiveBannerTimers();
    elements.playObjective.hidden = true;
    elements.playObjective.classList.remove("is-visible", "is-fading");
  }
  updateReadout();
  toggleMap(mapExpanded);
  setStatus(message);
  startRendererWarmup(warmupSequence, message);
  if (persistBuild) {
    runHasStarted = true;
    domainBridge.syncSession(snapshotRunSession(session, quest));
    scheduleLocalRunSave(0);
  }
  return getRuntimeState();
}

function buildDungeon(
  seed = elements.seed.value,
  options: { persistBuild?: boolean; persistedSession?: PersistedRunSession } = {},
): DungeonRuntimeState {
  const normalizedSeed = seed.trim() || COPY.hud.seedDefault;
  const params = readEditorParams();
  try {
    const generated = generateDungeon(normalizedSeed, {
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
    return activateDungeon(
      generated,
      COPY.status.generation(params.profile, mood.label),
      params,
      options,
    );
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
  if (shouldMountForge(nextSurface, engineMode, elements.forgeFrame.hasAttribute("src")))
    elements.forgeFrame.src = elements.forgeFrame.dataset.src ?? "/forge.html";
  const visible = nextSurface === "forge" && engineMode === "editor";
  elements.forgeFrame.contentWindow?.postMessage(
    { type: "black-flag:forge-visibility", visible },
    location.origin,
  );
  if (engineMode === "editor") elements.recordPanel.open = nextSurface === "runtime";
  if (nextSurface === "runtime") window.requestAnimationFrame(() => editorView.redraw());
}

function applyForgeDungeon(): void {
  if (!forgeDungeon) return;
  try {
    const prepared = prepareDungeonForge(forgeDungeon);
    const imported = forgePreviewDungeon ?? prepared.dungeon;
    const { params } = prepared;
    applyEditorParamsToForm(params);
    const mood = resolveActiveMood(imported);
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
  world.setDungeon(dungeon, mood);
  atmosphere.setDungeon(dungeon, mood);
  controller.setDungeon(dungeon);
  controller.setBlockedCells([]);
  controller.setSolidColliders(world.getSolidColliders());
  editorView.setDungeon(dungeon, mood);
  editorView.setSpawn(cell);
  elements.editorCell.textContent = `SPAWN ${formatCell(cell)} · EXIT ${formatCell(dungeon.exit)}`;
  elements.shell.dataset.spawn = `${cell.x},${cell.y}`;
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
  if (nextMode === "play" && options.hydrate !== false) {
    void (async () => {
      const hydrated = await domainBridge.hydrateFromAuthority();
      if (!hydrated) {
        domainPanel.refresh();
        return;
      }
      domainPanel.refresh();
      const localSeed = elements.seed.value.trim();
      if (shouldAdoptHydratedSeed(Boolean(dungeon), hydrated.seed, localSeed)) {
        applyDungeonDomainToForm(hydrated.state);
        elements.seed.value = hydrated.seed;
        buildDungeon(hydrated.seed, { persistBuild: false, persistedSession: hydrated.state });
        setStatus(COPY.status.hydrate(hydrated.seed));
      } else if (dungeon && hydrated.seed === localSeed) {
        applyPersistedRunSession(hydrated.state);
        setStatus("Hydrate backend · dungeon session restored");
      } else if (hydrated.seed && hydrated.seed !== localSeed && dungeon) {
        setStatus(`Backend seed ${hydrated.seed} (local map kept). Use SYNC RUNS to adopt.`);
      } else {
        setStatus("Hydrate backend · dungeons domain online");
      }
    })();
  } else {
    void domainBridge.probeAuthority().then(() => domainPanel.refresh());
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
  // Editor/debug: open authority tools. Play pause: keep RUN AUTHORITY collapsed.
  elements.recordPanel.open = external;
  elements.editorTitle.textContent = nextMode === "debug" ? "Graph and cells" : "Generated map";
  elements.debugMode.textContent = nextMode.toUpperCase();
  editorView.setDebug(nextMode === "debug");
  const editorDungeon = forgePreviewDungeon ?? dungeon;
  if (editorDungeon) editorView.setDungeon(editorDungeon, resolveActiveMood(editorDungeon));
  if (nextMode === "debug") setEditorSurface("runtime");
  else setEditorSurface(editorSurface);
  // Play starts with options closed (minimal HUD). Editor/debug keep tools docked.
  if (nextMode === "play") setOptionsOpen(false);
  else setOptionsOpen(false); // forces docked tools visible via engine mode CSS
  if (runMode === "playing") closeEndOverlay();
  else showEndOverlay(runMode);
  audio.setPaused(nextMode !== "play" || (!controller.getState().locked && !touchSessionActive));
  setStatus(
    nextMode === "play"
      ? COPY.status.enterPlay
      : nextMode === "editor"
        ? "Editor/CREATION mode. Generate the map or validate spawn."
        : "Debug mode. Graph, rooms, and telemetry visible.",
  );
  // Entering play mid-session: replay intro if the hunt is still open.
  if (nextMode === "play" && dungeon && quest.isRunning && !quest.portalOpen) {
    showObjectiveBanner(COPY.objective.intro, "hunt", 3400, 1500);
  } else if (nextMode !== "play") {
    clearObjectiveBannerTimers();
    elements.playObjective.hidden = true;
    elements.playObjective.classList.remove("is-visible", "is-fading");
  }
  if (initialized) playCue("mode");
  flash();
  scheduleMinimapLayout();
  window.requestAnimationFrame(() => editorView.redraw());
}

function toggleMap(forceExpanded = !mapExpanded): void {
  mapExpanded = forceExpanded;
  elements.mapPanel.classList.toggle("is-expanded", mapExpanded);
  elements.mapToggle.setAttribute("aria-expanded", String(mapExpanded));
  elements.mapToggle.textContent = mapExpanded ? COPY.hud.mapShrink : COPY.hud.mapExpand;
  elements.mapToggle.title = mapExpanded ? "Shrink map (M)" : "Expand map (M)";
  scheduleMinimapLayout();
}

function makeSeed(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return `ASH-${(values[0] ?? 0).toString(36).toUpperCase()}`;
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
  const dpr = Math.min(window.devicePixelRatio, dprCap);
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
  resolve?: number;
  mode?: "playing" | "dead" | "won";
  engineMode?: EngineMode;
  audioMuted?: boolean;
  crtEnabled?: boolean;
  renderer?: RendererDiagnostics;
  domain?: ReturnType<DomainBridge["getDungeon"]>;
  domainProjection?: ReturnType<DomainBridge["project"]>;
}

function getRendererDiagnostics(): RendererDiagnostics {
  const materials = new Set<THREE.Material>();
  scene.traverse((object) => {
    const material = (object as THREE.Mesh).material;
    if (Array.isArray(material)) material.forEach((entry) => materials.add(entry));
    else if (material) materials.add(material);
  });
  return {
    calls: lastRenderSnapshot.calls,
    triangles: lastRenderSnapshot.triangles,
    points: lastRenderSnapshot.points,
    lines: lastRenderSnapshot.lines,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    materials: materials.size,
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
  return {
    id: "black-flag-dungeon-engine",
    ready: renderWarmupReady,
    seed: dungeon.seed,
    topologySignature: dungeon.topologySignature,
    spawn: { ...dungeon.spawn },
    exit: { ...dungeon.exit },
    stats: { ...dungeon.stats, ...world.stats },
    player: controller.getState(),
    exitReached,
    hasRelic: world.hasRelic,
    stonesFound: world.stonesFound,
    resolve: Number(resolve.toFixed(1)),
    mode: runMode,
    engineMode,
    audioMuted: audio.isMuted,
    crtEnabled,
    renderer: getRendererDiagnostics(),
    domain: domainBridge.getDungeon(),
    domainProjection: domainBridge.project(),
  };
}

elements.generationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  buildDungeon();
  playCue("forge");
});
function scheduleEditorRegeneration(): void {
  if (engineMode === "play") return;
  void audio.unlock();
  window.clearTimeout(regenerateTimer);
  setEditorSurfaceStatus("runtime", "PLAY MAP · UPDATING", "updating");
  regenerateTimer = window.setTimeout(() => {
    elements.profileSelect.value = "custom";
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
bindRange(elements.enemyDensity, elements.enemyDensityLabel, "%", applyAtmosphereFromParams);
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
    const id = button.dataset.dungeonPreset as DungeonPresetId;
    const preset = DUNGEON_PRESETS[id];
    if (!preset) return;
    applyEditorParamsToForm(preset);
    buildDungeon();
    playCue("forge");
    setStatus(`Preset ${id} applied and regenerated.`);
  });
});
elements.cameraSensitivity.addEventListener("input", applyCameraSettings);
elements.cameraMotion.addEventListener("input", applyCameraSettings);
elements.reroll.addEventListener("click", () => {
  elements.seed.value = makeSeed();
  buildDungeon();
  playCue("forge");
});
elements.pushAuthority.addEventListener("click", () => {
  if (!pushParamsToDomain()) return;
  const seeded = domainBridge.setSeed(elements.seed.value.trim() || "CAMPAIGN-17");
  if (!seeded.ok) {
    setStatus(`Backend push rejected: ${seeded.error.message}`);
    domainPanel.refresh();
    return;
  }
  const reconciliationQueued = domainBridge.reconcileRemote();
  void domainBridge.probeAuthority().then((ok) => {
    domainPanel.refresh();
    setStatus(
      ok && reconciliationQueued
        ? "Backend reconciliation queued with the current dungeon snapshot."
        : ok
          ? COPY.status.pushOk
          : COPY.status.pushOffline,
    );
    void refreshRunSelect();
  });
});
elements.runRefresh.addEventListener("click", () => {
  void refreshRunSelect();
});
elements.runNew.addEventListener("click", () => {
  void (async () => {
    const online = await domainBridge.probeAuthority();
    if (!online) {
      setStatus("Cannot create run: backend offline.");
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
  if (!runId) return;
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
        buildDungeon(hydrated.seed, { persistBuild: false, persistedSession: d });
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
  const freshSeed = makeSeed();
  elements.seed.value = freshSeed;
  buildDungeon(freshSeed);
  setWelcomeOpen(false);
  setEngineMode("editor", { hydrate: false });
  setEditorSurface("forge");
  setStatus("Create a dungeon, then select PLAY.");
});
elements.welcomeContinue.addEventListener("click", () => {
  if (!continueDomainState) return;
  void audio.unlock();
  runHasStarted = true;
  setWelcomeOpen(false);
  setEngineMode("play", { hydrate: false });
  scheduleLocalRunSave(0);
  setStatus(`Continued run · seed ${continueDomainState.seed}. Click the scene to look.`);
});
elements.optionsResume.addEventListener("click", () => {
  setOptionsOpen(false);
  void audio.unlock();
  if (engineMode === "play" && runMode === "playing") controller.requestPointerLock();
});
elements.optionsMenu.querySelectorAll("[data-options-dismiss]").forEach((node) => {
  node.addEventListener("click", () => {
    if (engineMode === "play") setOptionsOpen(false);
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
  setEditorSurfaceStatus("forge", "DUNGEON CREATION · BUILDING", "loading");
  elements.forgeFrame.contentWindow?.postMessage(
    {
      type: "black-flag:forge-visibility",
      visible: editorSurface === "forge" && engineMode === "editor",
    },
    location.origin,
  );
});
window.addEventListener("message", (event) => {
  if (
    event.origin !== location.origin ||
    event.source !== elements.forgeFrame.contentWindow ||
    !isForgeDungeonMessage(event.data)
  )
    return;
  const payload = normalizeForgePayload(event.data.dungeon);
  if (!payload) return;
  try {
    const prepared = prepareDungeonForge(payload);
    forgeDungeon = payload;
    forgePreviewDungeon = prepared.dungeon;
    const mood = resolveActiveMood(prepared.dungeon);
    editorView.setDungeon(prepared.dungeon, mood);
    const theme = payload.params.themeKey.toUpperCase();
    setEditorSurfaceStatus(
      "forge",
      `${payload.name.toUpperCase()} · ${payload.rooms.length} ROOMS · ${theme}`,
      "ready",
    );
    setEditorSurfaceStatus(
      "runtime",
      `MAP PREVIEW · ${prepared.dungeon.stats.roomCount} ROOMS · ${prepared.dungeon.stats.loopCount} LOOPS`,
      "ready",
    );
    elements.forgeApply.disabled = false;
    const playKicker = elements.forgeApply.querySelector(".forge-play-btn__kicker");
    if (playKicker) playKicker.textContent = "READY";
  } catch (error) {
    forgeDungeon = null;
    forgePreviewDungeon = null;
    elements.forgeApply.disabled = true;
    const message =
      error instanceof Error ? error.message : "Dungeon Creation preview could not be validated.";
    setEditorSurfaceStatus("forge", message.toUpperCase(), "error");
    setEditorSurfaceStatus("runtime", "MAP PREVIEW · INVALID", "error");
  }
});
elements.audioToggle.addEventListener("click", () => {
  void audio.unlock().then(() => {
    const muted = audio.toggleMuted();
    elements.audioToggle.setAttribute("aria-pressed", String(muted));
    elements.audioToggle.classList.toggle("is-active", !muted);
    elements.audioToggle.textContent = muted ? COPY.hud.mute : COPY.hud.audioOn;
    if (!muted) audio.play("ui");
    setStatus(muted ? "Audio muted." : "Audio on.");
  });
});
elements.crtToggle.addEventListener("click", () => {
  crtEnabled = !crtEnabled;
  elements.shell.classList.toggle("crt-off", !crtEnabled);
  elements.crtToggle.setAttribute("aria-pressed", String(crtEnabled));
  elements.crtToggle.classList.toggle("is-active", crtEnabled);
  elements.crtToggle.textContent = crtEnabled ? COPY.hud.crtOn : COPY.hud.crtOff;
  playCue("ui");
  setStatus(crtEnabled ? "Soft CRT on." : "CRT off.");
});
elements.retry.addEventListener("click", () => {
  buildDungeon();
});
elements.newDungeon.addEventListener("click", () => {
  elements.seed.value = makeSeed();
  buildDungeon();
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
      setOptionsOpen(false);
      if (runMode === "playing") controller.requestPointerLock();
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
    buildDungeon();
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
let uiInteractQueued = false;

function frame(now: number): void {
  requestAnimationFrame(frame);
  renderer.info.reset();
  const delta = Math.min(Math.max(0, (now - lastFrameMs) / 1000), 0.05);
  lastFrameMs = now;
  smoothedFrameMs = THREE.MathUtils.lerp(smoothedFrameMs, delta * 1000, 0.08);
  const reducedMotion = REDUCED_MOTION_QUERY.matches;
  const criticalHealth = computeCriticalHealthFeel(session.resolve, now * 0.001, reducedMotion);
  controller.setCriticalMovementDrift(criticalHealth.movementDrift);
  const result = controller.update(delta);
  const player = controller.getState();
  playerPosition.set(player.position.x, player.position.y, player.position.z);
  // Local fog volume follows the player (smooth height gradient around the view).
  atmosphere.update(delta, playerPosition);
  // Fire LOD + LOS is play-path cost; skip full torch budget work in editor chrome.
  if (engineMode === "play" || engineMode === "debug") {
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
  if (simulationActive && now >= profileWarmupUntil) frameGapProfiler.record(delta * 1000);
  if (!simulationActive) elements.interactionPrompt.hidden = true;
  const pausedFlag = String(!simulationActive);
  if (pausedFlag !== lastPaused) {
    lastPaused = pausedFlag;
    elements.shell.dataset.paused = pausedFlag;
  }
  if (session.runMode === "playing" && simulationActive && document.visibilityState === "visible") {
    const worldUpdate = world.update(
      delta,
      playerPosition,
      result.atExit,
      result.interactPressed || uiInteractQueued,
    );
    uiInteractQueued = false;
    elements.interactionPrompt.hidden = worldUpdate.interactionPrompt !== "open-chest";
    const effects = applyWorldUpdate(
      session,
      quest,
      {
        collectedStoneId: worldUpdate.collectedStoneId as StoneId | null,
        stonesFound: worldUpdate.stonesFound,
        stonesTotal: worldUpdate.stonesTotal,
        portalOpen: worldUpdate.portalOpen,
        resolveGain: worldUpdate.resolveGain,
        damage: worldUpdate.damage,
        reachedLockedExit: worldUpdate.reachedLockedExit,
        reachedOpenExit: worldUpdate.reachedOpenExit,
      },
      now,
    );
    syncSessionMirrors();

    if (effects.questStonesFound !== undefined) {
      elements.shell.dataset.relic = effects.questPortalOpen ? "true" : "false";
      elements.shell.dataset.stones = String(effects.questStonesFound);
      updateObjective();
    }
    if (effects.sessionChanged) {
      domainBridge.syncSession(snapshotRunSession(session, quest));
      scheduleLocalRunSave();
      domainPanel.refresh();
    }
    if (effects.status) setStatus(effects.status);
    if (effects.playPickup && effects.pickup) {
      audio.playPickup(worldUpdate.collectedPickup);
      if (effects.questPortalOpen) audio.playPortal(world.getAudioFrame().portal);
      showPickupFeedback(
        effects.pickup.label,
        Boolean(effects.pickup.restoreResolve),
        effects.pickup.stoneId,
      );
    }
    if (effects.playEnemyHit) {
      elements.shell.dataset.resolve = String(Math.ceil(session.resolve));
      triggerDamageFeedback(worldUpdate.knockback);
      audio.playEnemyHit(
        worldUpdate.damageSource?.position ?? null,
        worldUpdate.damageSource?.voice ?? null,
      );
    }
    if (worldUpdate.doorSound) {
      audio.playDoor(worldUpdate.doorSound.kind, worldUpdate.doorSound.position);
    }
    if (worldUpdate.chestSound) {
      audio.playDoor("open", worldUpdate.chestSound.position);
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

  damageTimer = Math.max(0, damageTimer - delta);
  if (damageTimer === 0 && damageHitActive) {
    damageHitActive = false;
    elements.damage.classList.remove("is-hit");
  }
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
  lighting.update(delta, playerPosition, currentThreatDistance);

  // POV lens + stress: mild outward warp always; sprint widens it; threat shakes + chromatic fringe.
  const maxSpeed = PLAYER_MOVE_SPEED * PLAYER_SPRINT_MULT;
  const speedRatio = THREE.MathUtils.clamp(player.speed / maxSpeed, 0, 1);
  const feelTarget = computePovFeel({
    sprinting: player.sprinting && simulationActive,
    speedRatio: simulationActive ? speedRatio : 0,
    threatDistance: simulationActive ? currentThreatDistance : null,
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
  elements.shell.dataset.criticalHealth = String(criticalHealth.active);
  povPost.setParams(
    feel.curvature,
    feel.chromatic,
    simulationActive ? criticalHealth.redTint : 0,
    reducedMotion ? 0.006 : 0.011,
    !reducedMotion,
  );

  if (result.changedCell) {
    updateReadout();
    drawMap();
  } else if (now - lastMapDraw > 220) {
    drawMap();
    lastMapDraw = now;
  }
  // Panel is signature-gated; refresh slowly so it never contends with FPS input.
  if (now - lastPanelRefresh > 1500) {
    domainPanel.refresh();
    lastPanelRefresh = now;
  }
  if (engineMode === "debug" && now - lastDebugDraw > 240) {
    const diagnostics = getRendererDiagnostics();
    elements.debugFps.textContent = String(Math.round(diagnostics.fps));
    elements.debugFrame.textContent = `${diagnostics.frameMs.toFixed(1)}ms`;
    elements.debugCalls.textContent = String(diagnostics.calls);
    elements.debugTris.textContent =
      diagnostics.triangles > 9999
        ? `${Math.round(diagnostics.triangles / 1000)}k`
        : String(diagnostics.triangles);
    elements.debugTextures.textContent = String(diagnostics.textures);
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

window.addEventListener("beforeunload", () => {
  if (localSaveTimer !== null) clearTimeout(localSaveTimer);
  if (runHasStarted) persistCurrentRun();
  longTaskObserver?.disconnect();
  minimapResizeObserver.disconnect();
  minimapLayout.dispose();
  domainPanel.dispose();
  editorView.dispose();
  audio.dispose();
  controller.dispose();
  atmosphere.dispose();
  povPost.dispose();
  lighting.dispose();
  world.dispose();
  renderer.dispose();
});
resize();
applyCameraSettings();
// Welcome owns the first choice. New Game opens Creation; Continue opens play.
setEngineMode("editor", { hydrate: false, persist: false });
setWelcomeOpen(true);
const localContinue = readLocalRunSave();
let bootBuilt = false;
if (canContinueLocalRun(localContinue)) {
  try {
    applyDungeonDomainToForm(localContinue.state);
    elements.seed.value = localContinue.state.seed;
    buildDungeon(localContinue.state.seed, {
      persistBuild: false,
      persistedSession: localContinue.state,
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
const visualQaState = readVisualQaState(window.location.search);
if (visualQaState) {
  runHasStarted = false;
  setWelcomeOpen(false);
  setEngineMode("play", { hydrate: false, persist: false });
  session.resolve = visualQaState === "dead" ? 0 : visualQaState === "critical" ? 10 : 100;
  syncSessionMirrors();
  updateResolve();
  elements.shell.dataset.resolve = String(session.resolve);
  if (visualQaState === "dead") {
    quest.stop();
    showEndOverlay("dead");
  } else if (visualQaState === "won") {
    const qaNow = performance.now();
    quest.start(qaNow - 154_000);
    STONE_ORDER.forEach((id, index) => quest.collectStone(id, qaNow - (3 - index) * 28_000));
    quest.markEscaped(qaNow);
    showEndOverlay("won");
  }
  setStatus(`Visual QA state · ${visualQaState}`);
} else {
  void (async () => {
    const hydrated = await domainBridge.hydrateFromAuthority();
    if (hydrated && canContinueDomainRun(hydrated.state)) {
      applyDungeonDomainToForm(hydrated.state);
      elements.seed.value = hydrated.seed;
      buildDungeon(hydrated.seed, { persistBuild: false, persistedSession: hydrated.state });
      setContinueCandidate(hydrated.state, `Continue ready · ${hydrated.seed}`);
      setStatus(`Saved run ready · seed ${hydrated.seed}`);
    } else if (!continueDomainState) {
      setContinueCandidate(null, "No active saved run. Start a new game.");
    }
    domainPanel.refresh();
    await refreshRunSelect();
  })();
}
requestAnimationFrame(frame);
