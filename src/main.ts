import * as THREE from "three";

import { GameAudio, musicTrackForBiome, type AudioCue, type MusicTrack } from "./audio/GameAudio";
import { footstepSurfaceAt } from "./audio/FootstepSurface";
import {
  resolveUiChangeCue,
  resolveUiClickCue,
  resolveUiHoverCue,
  resolveUiSoundTarget,
  type UiSoundTarget,
} from "./ui/UiSoundPolicy";
import { createAuthorityClient } from "./authority/client";
import {
  createDomainBridge,
  roomLabelForCell,
  type DomainBridge,
  type DungeonDomainState,
} from "./domain/bridge";
import { DUNGEON_PRESETS, type DungeonEditorParams, type DungeonPresetId } from "./editor/presets";
import { generateCompletableDungeon } from "./dungeon/completeness";
import {
  createDungeonFloorCampaign,
  type DungeonFloorCampaign,
} from "./dungeon/generateDungeonFloors";
import { setDungeonSpawn } from "./dungeon/generateDungeon";
import { gridToWorld } from "./dungeon/gridCollision";
import { parseForgeDungeonMessage, type ForgeDungeonIntakeValue } from "./dungeon/forgeIntake";
import type { DungeonData } from "./dungeon/types";
import { DungeonEditorView } from "./editor/DungeonEditorView";
import { type EngineMode, isEngineMode } from "./game/EngineMode";
import { MOBILITY_BOOST_FOOTSTEP_GAIN } from "./game/MobilityBoost";
import { GLOOM_CURSE_FOG_MULTIPLIER, GLOOM_CURSE_LANTERN_MULTIPLIER } from "./game/GloomCurse";
import { SPIN_CURSE_SENSITIVITY_SCALE, SPIN_CURSE_YAW_BIAS } from "./game/SpinCurse";
import { createBrowserForgeFramePort, ForgeFrameClient } from "./forge/ForgeFrameClient";
import {
  difficultyLabel,
  formatRunClock,
  type DifficultySnapshot,
} from "./game/DifficultyDirector";
import { isLocalDevToolsEnabled, readLocalDevToolsEnv } from "./game/LocalDevTools";
import { hashSeed } from "./core/random";
import { createLaunchHistory, parseLaunchConfiguration } from "./launch/LaunchConfiguration";
import { FirstPersonController, type PlayerAction } from "./player/FirstPersonController";
import { PLAYER_COMBAT_EYE_HEIGHT } from "./player/CombatPose";
import { activeFloorFromSupportY } from "./world/StoryMetrics";
import { AtmosphereSystem } from "./systems/AtmosphereSystem";
import {
  getDungeonMood,
  parseDungeonMoodId,
  resolveDungeonMood,
  type DungeonMoodId,
} from "./systems/DungeonMood";
import { LightingRig } from "./systems/LightingRig";
import { resolveExplorationFogMultiplier } from "./systems/ExplorationFog";
import { applyTextureSmoothing } from "./systems/TextureSmoothing";
import { resolveDungeonExposure } from "./systems/LightTuning";
import { PovPostFx } from "./systems/PovPostFx";
import { computeCriticalHealthFeel } from "./systems/CriticalHealthFeel";
import { computeHazardFeel, decayHazardHitBoost, type DamageWashKind } from "./systems/HazardFeel";
import { projectPlayStepDamage } from "./systems/PlayStepEffects";
import { stepAdaptiveCrt } from "./systems/AdaptiveCrtPolicy";
import { TimedStatusChip } from "./ui/TimedStatusChip";
import { SceneLoaderEnemy } from "./ui/SceneLoaderEnemy";
import { projectPickupFeedback } from "./ui/PickupFeedback";
import { FrameGapProfiler, type FrameGapSnapshot } from "./systems/FrameGapProfiler";
import type { BiomeEventSnapshot } from "./systems/BiomeEventDirector";
import { detectRenderCapabilities } from "./systems/RenderCapabilities";
import { collectVisibleRenderInventory } from "./systems/RenderInventory";
import { resolveRenderPixelRatio } from "./systems/RenderScale";
import {
  computePovFeel,
  decayExhaustionTrauma,
  decayHitTrauma,
  PovFeelState,
  samplePovShake,
} from "./systems/povFeel";
import { drawMinimap } from "./ui/drawMinimap";
import { COPY, formatTime, type StoneId } from "./ui/copy";
import { BiomeScreenParticles } from "./ui/BiomeScreenParticles";
import {
  createMinimapDrawInvalidator,
  createMinimapLayoutScheduler,
} from "./ui/minimapLayout";
import { PlayRuntime } from "./game/PlayRuntime";
import { shouldAdoptHydratedSeed } from "./game/hydratePolicy";
import { nextProceduralSeed } from "./game/SeedFactory";
import { FloorExploration } from "./game/FloorExploration";
import { readUserSettings, writeUserSettings, type UserSettings } from "./game/UserSettings";
import { LocalRunSaveCoordinator } from "./game/LocalRunSaveCoordinator";
import {
  FloorTransitionDirector,
  type FloorTransitionResult,
} from "./game/FloorTransitionDirector";
import {
  RunIntroDirector,
  type RunIntroResult,
  type RunIntroWarmup,
} from "./game/RunIntroDirector";
import {
  captureRunResume,
  planFloorTransition,
  planRunResumeRestore,
  type RunResumeActivationPlan,
} from "./game/RunResumeMapping";
import {
  canContinueDomainRun,
  canContinueLocalRun,
  readLocalRunSave,
  runSourceFromLocalSave,
  writeLocalRunSave,
  type LocalRunResumeState,
} from "./game/LocalRunSave";
import { isLeaderboardEligible, runSourceForDungeon, type RunSource } from "./game/RunSource";
import {
  completeCampaignBiome,
  createPlayerProfile,
  isBiomeUnlocked,
  markPlayerRunCompleted,
  readPlayerProfile,
  updatePlayerIdentity,
  writePlayerProfile,
  type PlayerProfile,
} from "./game/PlayerProfile";
import { loadLeaderboard, submitLeaderboardEntry } from "./leaderboard/client";
import { RoundResultsController, type RoundResultsState } from "./ui/RoundResultsController";
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
  randomPortraitIndex,
} from "./leaderboard/portraits";
import {
  biomeCampaignFloorCount,
  biomeCampaignParams,
  biomeDifficultyRank,
  nextBiomeId,
} from "./systems/BiomeCampaign";
import {
  getBiomeIdentity,
  isBiomeId,
  listBiomeIdentities,
  type BiomeId,
} from "./systems/BiomeIdentity";
import { biomeScreenArtSrc, mainScreenBiomeForPlayer } from "./systems/BiomeScreenArt";
import { biomeHoverColor, biomeIconSrc, expandBiomeStars } from "./systems/BiomeUi";
import { DungeonWorld } from "./world/DungeonWorld";
import type { HazardSurfaceEffect } from "./world/HazardTileSystem";
import { WORLD_TILE_SIZE, WORLD_WALL_HEIGHT } from "./world/WorldMetrics";
import "./styles.css";
import "./styles/editor.css";

const launchConfig = parseLaunchConfiguration(window.location.search);
const launchHistory = createLaunchHistory({
  currentHref: () => window.location.href,
  replaceHref: (href) => window.history.replaceState({}, "", href),
});

function requireElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}.`);
  return element;
}

const elements = {
  shell: requireElement<HTMLElement>(".app-shell"),
  scene: requireElement<HTMLCanvasElement>("#scene"),
  welcomeScreen: requireElement<HTMLElement>("#welcome-screen"),
  welcomeContent: requireElement<HTMLElement>("#welcome-content"),
  welcomeArt: requireElement<HTMLImageElement>(".welcome-art"),
  welcomeParticles: requireElement<HTMLCanvasElement>("#welcome-particles"),
  welcomeHome: requireElement<HTMLElement>("#welcome-home"),
  welcomeProfileEdit: requireElement<HTMLButtonElement>("#welcome-profile-edit"),
  welcomePlayerAvatar: requireElement<HTMLImageElement>("#welcome-player-avatar"),
  welcomePlayerName: requireElement<HTMLElement>("#welcome-player-name"),
  welcomeSaveTitle: requireElement<HTMLElement>("#welcome-save-title"),
  welcomeSaveDetails: requireElement<HTMLElement>("#welcome-save-details"),
  welcomeSaveMeta: requireElement<HTMLElement>("#welcome-save-meta"),
  welcomeProfile: requireElement<HTMLElement>("#welcome-profile"),
  welcomeProfileForm: requireElement<HTMLFormElement>("#welcome-profile-form"),
  welcomeProfileBack: requireElement<HTMLButtonElement>("#welcome-profile-back"),
  welcomeProfileAvatar: requireElement<HTMLButtonElement>("#welcome-profile-avatar"),
  welcomeProfileAvatarImage: requireElement<HTMLImageElement>("#welcome-profile-avatar-image"),
  welcomeProfileName: requireElement<HTMLInputElement>("#welcome-profile-name"),
  welcomeProfileStatus: requireElement<HTMLElement>("#welcome-profile-status"),
  welcomeProfileSubmit: requireElement<HTMLButtonElement>("#welcome-profile-submit"),
  welcomeNew: requireElement<HTMLButtonElement>("#welcome-new"),
  welcomeContinue: requireElement<HTMLButtonElement>("#welcome-continue"),
  welcomeCustom: requireElement<HTMLButtonElement>("#welcome-custom"),
  welcomeStatus: requireElement<HTMLElement>("#welcome-status"),
  welcomeBiomePicker: requireElement<HTMLElement>("#welcome-biome-picker"),
  biomePickerGrid: requireElement<HTMLElement>("#biome-picker-grid"),
  biomePickerBack: requireElement<HTMLButtonElement>("#biome-picker-back"),
  welcomeLeaderboard: requireElement<HTMLElement>("#welcome-leaderboard"),
  leaderboardList: requireElement<HTMLOListElement>("#leaderboard-list"),
  welcomeHallToggle: requireElement<HTMLButtonElement>("#welcome-hall-toggle"),
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
  cullBrandStatus: requireElement<HTMLElement>("#cull-brand-status"),
  cullBrandValue: requireElement<HTMLTimeElement>("#cull-brand-value"),
  phoenixStatus: requireElement<HTMLElement>("#phoenix-status"),
  fogClearStatus: requireElement<HTMLElement>("#fog-clear-status"),
  fogClearValue: requireElement<HTMLTimeElement>("#fog-clear-value"),
  mobilityStatus: requireElement<HTMLElement>("#mobility-status"),
  mobilityValue: requireElement<HTMLTimeElement>("#mobility-value"),
  slowCurseStatus: requireElement<HTMLElement>("#slow-curse-status"),
  slowCurseValue: requireElement<HTMLTimeElement>("#slow-curse-value"),
  frenzyCurseStatus: requireElement<HTMLElement>("#frenzy-curse-status"),
  frenzyCurseValue: requireElement<HTMLTimeElement>("#frenzy-curse-value"),
  gloomCurseStatus: requireElement<HTMLElement>("#gloom-curse-status"),
  gloomCurseValue: requireElement<HTMLTimeElement>("#gloom-curse-value"),
  swarmCurseStatus: requireElement<HTMLElement>("#swarm-curse-status"),
  mirrorCurseStatus: requireElement<HTMLElement>("#mirror-curse-status"),
  mirrorCurseValue: requireElement<HTMLTimeElement>("#mirror-curse-value"),
  spinCurseStatus: requireElement<HTMLElement>("#spin-curse-status"),
  spinCurseValue: requireElement<HTMLTimeElement>("#spin-curse-value"),
  biomeEventStatus: requireElement<HTMLElement>("#biome-event-status"),
  biomeEventLabel: requireElement<HTMLElement>("#biome-event-label"),
  biomeEventValue: requireElement<HTMLTimeElement>("#biome-event-value"),
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
  endLeaderboardComparison: requireElement<HTMLElement>("#end-leaderboard-comparison"),
  endLeaderboardRank: requireElement<HTMLElement>("#end-leaderboard-rank"),
  endLeaderboardDelta: requireElement<HTMLElement>("#end-leaderboard-delta"),
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
  endHome: requireElement<HTMLButtonElement>("#end-home"),
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
  musicVolume: requireElement<HTMLInputElement>("#music-volume"),
  musicVolumeValue: requireElement<HTMLOutputElement>("#music-volume-value"),
  effectsVolume: requireElement<HTMLInputElement>("#effects-volume"),
  effectsVolumeValue: requireElement<HTMLOutputElement>("#effects-volume-value"),
  textureSmoothingToggle: requireElement<HTMLButtonElement>("#texture-smoothing-toggle"),
  welcomeMusicToggle: requireElement<HTMLButtonElement>("#welcome-music-toggle"),
  bootScreen: requireElement<HTMLElement>("#boot-screen"),
  bootFill: requireElement<HTMLElement>("#boot-fill"),
  bootStatus: requireElement<HTMLElement>("#boot-status"),
  sceneFade: requireElement<HTMLElement>("#scene-fade"),
  sceneLoader: requireElement<HTMLElement>("#scene-loader"),
  sceneLoaderEnemy: requireElement<HTMLElement>("#scene-loader-enemy"),
  sceneLoaderEnemySprite: requireElement<HTMLElement>("#scene-loader-enemy-sprite"),
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
  debugFloor: requireElement<HTMLElement>("#debug-floor"),
  debugRooms: requireElement<HTMLElement>("#debug-rooms"),
  debugDoors: requireElement<HTMLElement>("#debug-doors"),
  debugEnemies: requireElement<HTMLElement>("#debug-enemies"),
};

const forgeFrameClient = new ForgeFrameClient(
  createBrowserForgeFramePort({ frame: elements.forgeFrame }),
);

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
const urlSeed = launchConfig.seed ?? (elements.seed.value.trim() || COPY.hud.seedDefault);
elements.seed.value = urlSeed;
/** Map Tools + Server Runs only on local dev hosts — never on public deploy. */
const localDevTools = isLocalDevToolsEnabled(readLocalDevToolsEnv());
const authorityBaseUrl = localDevTools ? launchConfig.authorityBaseUrl : "";
const authority = createAuthorityClient({ baseUrl: authorityBaseUrl });
const domainBridge: DomainBridge = createDomainBridge({
  initialSeed: urlSeed,
  authority: authorityBaseUrl ? authority : null,
});
const floorExploration = new FloorExploration();
let campaignFloorSet: DungeonFloorCampaign | null = null;
let floorTransitionInputBlocked = false;

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
const renderCaps = detectRenderCapabilities({ overrides: launchConfig.render });
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
let userSettings: UserSettings = readUserSettings();
audio.setMusicVolume(userSettings.musicVolume);
audio.setEffectsVolume(userSettings.effectsVolume);
const playerPosition = new THREE.Vector3();
const audioForward = new THREE.Vector3();
const lanternForward = new THREE.Vector3();
const cameraShakeEuler = new THREE.Euler(0, 0, 0, "YXZ");
// Cached once — reading matchMedia every frame is wasteful and some browsers do
// non-trivial work on each call. The live MediaQueryList keeps .matches current.
const REDUCED_MOTION_QUERY = window.matchMedia("(prefers-reduced-motion: reduce)");
const sceneLoaderEnemy = new SceneLoaderEnemy({
  stage: elements.sceneLoaderEnemy,
  sprite: elements.sceneLoaderEnemySprite,
  reducedMotion: REDUCED_MOTION_QUERY.matches,
});
let dungeon: DungeonData | null = null;
let mapExpanded = false;
let lastMapDraw = 0;
let lastRunTimerSecond = -1;
let lastHazardKind: HazardSurfaceEffect["kind"] | undefined;
const timeFreezeChip = new TimedStatusChip({
  elements: { root: elements.timeFreezeStatus, value: elements.timeFreezeValue },
  shell: elements.shell,
  shellDatasetKey: "timeFreeze",
  ariaRemaining: "time freeze remaining",
});
const luminousWardChip = new TimedStatusChip({
  elements: { root: elements.luminousWardStatus, value: elements.luminousWardValue },
  shell: elements.shell,
  shellDatasetKey: "luminousWard",
  ariaRemaining: "ward remaining",
});
const annihilationPulseChip = new TimedStatusChip({
  elements: { root: elements.annihilationPulseStatus, value: elements.annihilationPulseValue },
  shell: elements.shell,
  shellDatasetKey: "annihilationPulse",
  ariaRemaining: "pulse remaining",
});
const cullBrandChip = new TimedStatusChip({
  elements: { root: elements.cullBrandStatus, value: elements.cullBrandValue },
  shell: elements.shell,
  shellDatasetKey: "cullBrand",
  ariaRemaining: "cull brand remaining",
});
const fogClearChip = new TimedStatusChip({
  elements: { root: elements.fogClearStatus, value: elements.fogClearValue },
  shell: elements.shell,
  shellDatasetKey: "fogClear",
  ariaRemaining: "clear air remaining",
});
const mobilityChip = new TimedStatusChip({
  elements: { root: elements.mobilityStatus, value: elements.mobilityValue },
  shell: elements.shell,
  shellDatasetKey: "mobilityBoost",
  ariaRemaining: "wayfinder remaining",
});
const slowCurseChip = new TimedStatusChip({
  elements: { root: elements.slowCurseStatus, value: elements.slowCurseValue },
  shell: elements.shell,
  shellDatasetKey: "slowCurse",
  ariaRemaining: "heavy limbs remaining",
});
const frenzyCurseChip = new TimedStatusChip({
  elements: { root: elements.frenzyCurseStatus, value: elements.frenzyCurseValue },
  shell: elements.shell,
  shellDatasetKey: "frenzyCurse",
  ariaRemaining: "blood frenzy remaining",
});
const gloomCurseChip = new TimedStatusChip({
  elements: { root: elements.gloomCurseStatus, value: elements.gloomCurseValue },
  shell: elements.shell,
  shellDatasetKey: "gloomCurse",
  ariaRemaining: "gloom remaining",
});
const mirrorCurseChip = new TimedStatusChip({
  elements: { root: elements.mirrorCurseStatus, value: elements.mirrorCurseValue },
  shell: elements.shell,
  shellDatasetKey: "mirrorCurse",
  ariaRemaining: "mirror curse remaining",
});
const spinCurseChip = new TimedStatusChip({
  elements: { root: elements.spinCurseStatus, value: elements.spinCurseValue },
  shell: elements.shell,
  shellDatasetKey: "spinCurse",
  ariaRemaining: "spin curse remaining",
});

function syncSwarmCurseHud(active = world.isSwarmCurseActive): void {
  elements.swarmCurseStatus.hidden = !active;
  elements.shell.dataset.swarmCurse = active ? "true" : "false";
}

function resetCurseHud(): void {
  slowCurseChip.reset();
  frenzyCurseChip.reset();
  gloomCurseChip.reset();
  mirrorCurseChip.reset();
  spinCurseChip.reset();
  syncSwarmCurseHud(false);
}
/**
 * Cached minimap viewport (CSS size + clamped DPR). Refreshed on resize so the
 * per-frame drawMinimap call never triggers a getBoundingClientRect reflow even
 * when crossing cells rapidly. Initial values are placeholders; refreshed below.
 */
const minimapViewport = { width: 0, height: 0, pixelRatio: 1 };
const minimapDrawInvalidator = createMinimapDrawInvalidator();
const minimapLayout = createMinimapLayoutScheduler({
  measure: refreshMinimapViewport,
  draw: () => drawMap(true),
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
/**
 * After RESUME / Escape-close, browsers often reject requestPointerLock when the
 * activation key was Escape (same key that exits lock). Do not reopen the pause
 * panel on that failed unlock; keep the scene click path as the retry.
 */
let suppressPauseOnPointerUnlock = false;
let welcomeOpen = true;
const LAST_LEADERBOARD_NAME_KEY = "dungeon-escape:leaderboard-name";
const MUSIC_MUTED_KEY = "dungeon-escape:music-muted";
let playerProfile: PlayerProfile | null = readPlayerProfile();
let profileAvatarDraft = playerProfile?.avatarIndex ?? 0;
let campaignClearRecordedForRun = false;
let leaderboardLoadSequence = 0;
const roundResults = new RoundResultsController((limit) => loadLeaderboard(limit));
let pendingLeaderboardSubmission: Omit<LeaderboardSubmissionInput, "playerName"> | null = null;
let leaderboardSubmissionPending = false;
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
let continueRecoveryOverride: {
  readonly resume: LocalRunResumeState;
  readonly runSource: RunSource;
} | null = null;
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
    if (locked) {
      suppressPauseOnPointerUnlock = false;
      setOptionsOpen(false);
    } else if (
      !hasActivePlayInput &&
      engineMode === "play" &&
      playRuntime.state().runMode === "playing" &&
      !suppressPauseOnPointerUnlock
    ) {
      setOptionsOpen(true);
    } else if (suppressPauseOnPointerUnlock && engineMode === "play") {
      // Intentional resume failed to re-lock (common after Escape). Stay unpaused
      // in the options sense; click the scene to capture the pointer again.
      setStatus(COPY.status.pointerFailed);
    }
    if (!(suppressPauseOnPointerUnlock && !locked)) {
      setStatus(message);
    }
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

function setToggleValue(
  button: HTMLButtonElement,
  on: boolean,
  onLabel: string,
  offLabel: string,
): void {
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
  if (!dungeon) return undefined;
  const player = controller.getState();
  const difficulty = world.getDifficultyState();
  const play = playRuntime.snapshot();
  floorExploration.setMapRevealed(world.isMapRevealed);
  const exploration = floorExploration.snapshot();
  return captureRunResume({
    play,
    player,
    world: {
      difficultyElapsed: difficulty.elapsedSeconds,
      timeFreezeRemaining: world.timeFreezeRemaining,
      luminousWardRemaining: world.luminousWardRemaining,
      annihilationPulseRemaining: world.annihilationPulseRemaining,
      mapRevealed: world.isMapRevealed,
      mobilityBoostRemaining: world.mobilityBoostRemaining,
      fogClearRemaining: world.fogClearRemaining,
      slowCurseRemaining: world.slowCurseRemaining,
      frenzyCurseRemaining: world.frenzyCurseRemaining,
      gloomCurseRemaining: world.gloomCurseRemaining,
      swarmCurseActive: world.isSwarmCurseActive,
      cullBrandRemaining: world.cullBrandRemaining,
      mirrorCurseRemaining: world.mirrorCurseRemaining,
      spinCurseRemaining: world.spinCurseRemaining,
      phoenixCharges: world.phoenixChargeCount,
    },
    exploration,
    campaign: {
      rootSeed: dungeon.floor?.rootSeed,
      biomeId: resolveActiveMood(dungeon).id,
    },
  });
}

function applyRunResumePlan(plan: RunResumeActivationPlan, allowStart = true): void {
  if (!dungeon) return;
  if (plan.exploration.kind === "switch-floor") {
    floorExploration.switchFloor(dungeon, plan.exploration.entryCell);
  } else if (plan.exploration.kind === "restore") {
    const restored = floorExploration.restore(dungeon, plan.exploration.state, dungeon.spawn);
    if (!restored.ok) floorExploration.start(dungeon, dungeon.spawn);
  } else if (allowStart) {
    floorExploration.start(dungeon, dungeon.spawn);
  }
  if (plan.playerPose) controller.restorePose(plan.playerPose);
  lastRunTimerSecond = -1;
}

function setRunSource(next: RunSource, hasForge = Boolean(dungeon?.forge)): void {
  runSource = runSourceForDungeon(next, hasForge);
  elements.shell.dataset.runSource = runSource;
}

function persistCurrentRun(): boolean {
  if (!dungeon) return false;
  return writeLocalRunSave(
    currentDomainSave(),
    localStorage,
    Date.now(),
    captureLocalRunResume(),
    runSource,
    runSource === "custom" ? (dungeon.forge ? "forge" : "procedural") : undefined,
  );
}

const localRunSave = new LocalRunSaveCoordinator({
  isActive: () => runHasStarted,
  persist: persistCurrentRun,
  onFailure: () => setStatus("Could not save this run locally. Continue may not be available."),
});

function flushLocalRunSaveWhenHidden(): void {
  if (document.visibilityState === "hidden") localRunSave.flush();
}

type ContinuePresentation = {
  readonly runSeconds?: number;
  readonly savedAt?: number;
  readonly biomeId?: string;
};

/** Prefer resume biome; otherwise resolve the same seed/profile look as generation. */
function continueBiomeLabel(
  state: DungeonDomainState,
  presentation: ContinuePresentation = {},
): string {
  const fromResume = presentation.biomeId?.trim().toLowerCase();
  if (fromResume && isBiomeId(fromResume)) return getBiomeIdentity(fromResume).label;
  const stub = {
    seed: state.seed,
    seedHash: hashSeed(state.seed),
  } as DungeonData;
  return resolveDungeonMood(stub, state.profile).label;
}

/** Readable continue title: real seed + biome label (pixel font, no gothic fantasy name). */
function continueDungeonLabel(
  state: DungeonDomainState | null,
  presentation: ContinuePresentation = {},
): string {
  const seed = state?.seed?.trim() || "Unknown map";
  if (!state) return seed;
  return `${seed} · ${continueBiomeLabel(state, presentation)}`;
}

function continueDurationLabel(seconds: number): string {
  const minutes = Math.max(0, Math.floor(seconds / 60));
  if (minutes < 60) return `${minutes} min played`;
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return `${hours}h ${String(remaining).padStart(2, "0")}m played`;
}

function saveAgeLabel(savedAt: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - savedAt) / 60_000));
  if (minutes < 1) return "Last save just now";
  if (minutes < 60) return `Last save ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return `Last save ${hours}h ago`;
}

function syncWelcomeSaveSummary(
  state: DungeonDomainState | null,
  presentation: ContinuePresentation = {},
): void {
  if (!state) {
    elements.welcomeSaveTitle.textContent = "No active descent";
    elements.welcomeSaveDetails.textContent = "Open the gates to begin your first escape.";
    elements.welcomeSaveMeta.textContent = "CONTINUE LOCKED · NEW DESCENT AVAILABLE";
    return;
  }
  elements.welcomeSaveTitle.textContent = continueDungeonLabel(state, presentation);
  const progress = `${state.foundStoneIds.length} / 4 stones bound`;
  elements.welcomeSaveDetails.textContent = `Floor ${Math.max(1, state.floor)} · ${
    presentation.runSeconds === undefined
      ? progress
      : continueDurationLabel(presentation.runSeconds)
  }`;
  elements.welcomeSaveMeta.textContent = presentation.savedAt
    ? saveAgeLabel(presentation.savedAt)
    : `Campaign descent · ${progress}`;
}

function setContinueCandidate(
  state: DungeonDomainState | null,
  status: string,
  recovery: { readonly resume: LocalRunResumeState; readonly runSource: RunSource } | null = null,
  presentation: ContinuePresentation = {},
): void {
  continueDomainState = canContinueDomainRun(state) ? state : null;
  continueRecoveryOverride = continueDomainState ? recovery : null;
  elements.welcomeContinue.disabled = continueDomainState === null;
  elements.welcomeContinue.classList.toggle("is-featured", continueDomainState !== null);
  elements.welcomeNew.classList.toggle("is-featured", continueDomainState === null);
  syncWelcomeSaveSummary(continueDomainState, presentation);
  elements.welcomeStatus.textContent = status;
}

function setWelcomeTransitionBusy(busy: boolean, message?: string): void {
  if (busy) elements.welcomeScreen.setAttribute("aria-busy", "true");
  else elements.welcomeScreen.removeAttribute("aria-busy");
  elements.welcomeNew.disabled = busy;
  elements.welcomeCustom.disabled = busy;
  elements.welcomeContinue.disabled = busy || continueDomainState === null;
  if (message) elements.welcomeStatus.textContent = message;
}

function syncPlayerProfileUi(): void {
  if (!playerProfile) return;
  const portrait = portraitForIndex(playerProfile.avatarIndex);
  elements.welcomePlayerName.textContent = playerProfile.name;
  elements.welcomePlayerAvatar.src = portrait.src;
  elements.welcomePlayerAvatar.alt = "";
  elements.welcomeProfileAvatarImage.src = portrait.src;
  elements.welcomeProfileAvatar.title = `Change avatar · ${portrait.title}`;
}

function persistPlayerIdentity(nameInput: unknown, avatarIndex: number): boolean {
  const nextProfile = playerProfile
    ? updatePlayerIdentity(playerProfile, nameInput, avatarIndex)
    : createPlayerProfile(nameInput, avatarIndex);
  if (!nextProfile) {
    elements.welcomeProfileStatus.textContent = "Use 1–20 letters, numbers, spaces, or . _ ' -";
    return false;
  }
  if (!writePlayerProfile(nextProfile)) {
    elements.welcomeProfileStatus.textContent =
      "This browser blocked saving. Check storage access and try again.";
    return false;
  }
  playerProfile = nextProfile;
  profileAvatarDraft = nextProfile.avatarIndex;
  try {
    localStorage.setItem(LAST_LEADERBOARD_NAME_KEY, nextProfile.name);
  } catch {
    // The profile write succeeded; this legacy key is optional.
  }
  syncPlayerProfileUi();
  syncWelcomeArt();
  renderBiomePicker();
  return true;
}

function syncWelcomeLeaderboardVisibility(): boolean {
  const visible = Boolean(playerProfile?.hasCompletedRun && !elements.welcomeHome.hidden);
  elements.welcomeLeaderboard.hidden = !visible;
  elements.welcomeContent.classList.toggle("is-ranked", visible);
  return visible;
}

function recordPlayerRunCompleted(): void {
  if (!playerProfile || playerProfile.hasCompletedRun) return;
  const completedProfile = markPlayerRunCompleted(playerProfile);
  playerProfile = completedProfile;
  writePlayerProfile(completedProfile);
}

function showPlayerProfileEditor(required = playerProfile === null): void {
  const legacyName = storedLeaderboardName() ?? "";
  const draftName = playerProfile?.name ?? legacyName;
  profileAvatarDraft =
    playerProfile?.avatarIndex ??
    (required
      ? randomPortraitIndex()
      : draftName
        ? portraitIndexForName(draftName)
        : profileAvatarDraft);
  elements.welcomeHome.hidden = true;
  elements.welcomeBiomePicker.hidden = true;
  elements.welcomeProfile.hidden = false;
  elements.welcomeProfileBack.hidden = required;
  elements.welcomeProfileSubmit.textContent = required ? "START NEW GAME" : "SAVE CHANGES";
  elements.welcomeProfileName.value = draftName;
  elements.welcomeProfileStatus.textContent = required
    ? "Your player and unlocked levels are saved in this browser."
    : "Name, avatar, and unlocked levels stay together.";
  const portrait = portraitForIndex(profileAvatarDraft);
  elements.welcomeProfileAvatarImage.src = portrait.src;
  elements.welcomeProfileAvatar.title = `Change avatar · ${portrait.title}`;
  syncWelcomeLeaderboardVisibility();
  window.requestAnimationFrame(() => elements.welcomeProfileName.focus());
}

function focusWelcomeEntry(): void {
  (playerProfile
    ? continueDomainState
      ? elements.welcomeContinue
      : elements.welcomeNew
    : elements.welcomeProfileName
  ).focus({
    preventScroll: true,
  });
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
    window.requestAnimationFrame(focusWelcomeEntry);
  } else {
    elements.scene.focus({ preventScroll: true });
    // Leave the menu bed: restore exploration/portal music if a run is live.
    if (playRuntime.state().runMode === "playing") setActiveBiomeMusic();
    else setMusicBed(null);
  }
  syncThreeRenderLoop();
}

function showWelcomeHome(): void {
  if (!playerProfile) {
    showPlayerProfileEditor(true);
    return;
  }
  syncPlayerProfileUi();
  elements.welcomeHome.hidden = false;
  elements.welcomeProfile.hidden = true;
  elements.welcomeBiomePicker.hidden = true;
  if (syncWelcomeLeaderboardVisibility()) void refreshLeaderboard();
}

function storedLeaderboardName(): string | null {
  if (playerProfile) return playerProfile.name;
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
  if (!playerProfile) {
    showPlayerProfileEditor(true);
    return;
  }
  renderBiomePicker();
  elements.welcomeHome.hidden = true;
  elements.welcomeProfile.hidden = true;
  elements.welcomeBiomePicker.hidden = false;
  syncWelcomeLeaderboardVisibility();
  // Warm the Forge iframe while the player picks a biome so New Game does not
  // stall on a cold WebGL load under the black curtain.
  if (!launchConfig.skipRunIntro) {
    void forgeFrameClient.ensureLoaded({ timeoutMs: 8_000, presentation: true });
  }
  window.requestAnimationFrame(() => elements.biomePickerBack.focus());
}

function formatStarLabel(count: number): string {
  if (count <= 0) return "—";
  if (count <= 5) return "★".repeat(count);
  return `★ ${count}`;
}

function renderBiomePicker(): void {
  if (!playerProfile) return;
  const fragment = document.createDocumentFragment();
  for (const [rank, biome] of listBiomeIdentities().entries()) {
    const button = document.createElement("button");
    const icon = document.createElement("img");
    const label = document.createElement("span");
    const stars = document.createElement("span");
    const count = playerProfile.clears[biome.id] ?? 0;
    const unlocked = isBiomeUnlocked(playerProfile, biome.id);
    button.type = "button";
    button.className = "biome-picker-option";
    button.dataset.biomeId = biome.id;
    button.dataset.campaignRank = String(rank + 1);
    button.dataset.locked = String(!unlocked);
    button.disabled = !unlocked;
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
    stars.textContent = unlocked
      ? count > 0
        ? formatStarLabel(count)
        : `LEVEL ${String(rank + 1).padStart(2, "0")}`
      : "LOCKED";
    stars.title = unlocked
      ? count > 0
        ? `${count} clear${count === 1 ? "" : "s"}`
        : `Campaign level ${rank + 1}`
      : `Clear level ${rank} to unlock`;
    button.setAttribute(
      "aria-label",
      unlocked ? `${biome.label}, level ${rank + 1}` : `${biome.label}, locked`,
    );
    button.append(icon, label, stars);
    button.addEventListener("click", () => {
      startNewGameWithBiome(biome.id);
    });
    fragment.append(button);
  }
  elements.biomePickerGrid.replaceChildren(fragment);
}

function startNewGameWithBiome(biomeId: BiomeId): void {
  if (!playerProfile || !isBiomeUnlocked(playerProfile, biomeId)) return;
  forcedPlayMoodId = biomeId;
  // Apply the campaign ramp for this biome (Ancient soft → Backrooms brutal).
  applyEditorParamsToForm(biomeCampaignParams(biomeId));
  void startPlayWithSeed(launchConfig.visualQa.seed ?? makeSeed(), {
    refreshProcedural: true,
    runSource: "campaign",
  }).then((result) => {
    if (result.kind !== "entered-play") return;
    setStatus(
      `Level ${biomeDifficultyRank(biomeId) + 1} · ${getDungeonMood(biomeId).label} · ${biomeCampaignFloorCount(biomeId)} floor${biomeCampaignFloorCount(biomeId) === 1 ? "" : "s"}.`,
    );
  });
}

/** Scene beds. Menu / end screens keep music while play SFX are paused. */
function setMusicBed(track: MusicTrack | null): void {
  audio.setMusicTrack(track);
}

/** Exploration bed, or denser portal bed once all four stones are bound. */
function setActiveBiomeMusic(): void {
  if (!dungeon) {
    setMusicBed(null);
    return;
  }
  const portalOpen = playRuntime.state().quest.portalOpen;
  setMusicBed(musicTrackForBiome(resolveActiveMood(dungeon).id, { portalOpen }));
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

function setRunIntroActive(active: boolean, statusText = ""): void {
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

function isRunIntroActive(): boolean {
  return elements.shell.dataset.runIntro === "true";
}

function setRunIntroStatus(statusText: string): void {
  if (!isRunIntroActive()) return;
  elements.runIntroStatus.hidden = false;
  elements.runIntroStatus.textContent = statusText;
}

/** Soft crossfade between map theater and Play — keep short so black never feels stuck. */
const SCENE_FADE_OUT_MS = 260;
const SCENE_FADE_IN_MS = 300;

function waitMs(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const done = (): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", done);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, Math.max(0, ms));
    signal?.addEventListener("abort", done, { once: true });
  });
}

function isSceneFadeCovering(): boolean {
  return !elements.sceneFade.hidden && elements.sceneFade.classList.contains("is-opaque");
}

/** Mood for the loading teaser: campaign pick, forced URL mood, or live dungeon. */
function resolveSceneLoaderMoodId(): string {
  if (forcedPlayMoodId) return forcedPlayMoodId;
  const forced = parseDungeonMoodId(launchConfig.mood);
  if (forced) return forced;
  if (dungeon) return resolveActiveMood(dungeon).id;
  return resolveIntroThemeKey();
}

/** Map-build spinner only. Black fades used for theater bookends stay clean. */
function setSceneLoaderVisible(visible: boolean): void {
  elements.sceneLoader.hidden = !visible;
  elements.sceneLoader.setAttribute("aria-hidden", visible ? "false" : "true");
  // Keep the same teaser while a cover re-asserts the spinner mid-build.
  if (visible) {
    if (!sceneLoaderEnemy.isVisible) sceneLoaderEnemy.show(resolveSceneLoaderMoodId());
  } else {
    sceneLoaderEnemy.hide();
  }
}

/**
 * While the isometric Forge theater is ready to be seen, raise it above the
 * global scene-fade (z-index 55). Otherwise a stuck or mid-transition fade
 * permanently hides the map animation and looks like a failed texture load.
 */
function setIntroTheaterRevealed(revealed: boolean): void {
  if (revealed) elements.shell.dataset.introReveal = "true";
  else delete elements.shell.dataset.introReveal;
}

async function setSceneFadeOpaque(
  opaque: boolean,
  options: {
    instant?: boolean;
    durationMs?: number;
    signal?: AbortSignal;
    /** When covering, show the "Loading dungeon" spinner. Default true. */
    showLoader?: boolean;
  } = {},
): Promise<void> {
  if (options.signal?.aborted) return;
  const fade = elements.sceneFade;
  const instant = Boolean(options.instant) || REDUCED_MOTION_QUERY.matches;
  const durationMs = options.durationMs ?? (opaque ? SCENE_FADE_OUT_MS : SCENE_FADE_IN_MS);
  if (opaque) {
    // Play bookends must cover Forge again; build covers keep theater hidden.
    if (options.showLoader === false) setIntroTheaterRevealed(false);
    fade.hidden = false;
    // Build swaps may ride the spinner; isometric/FPS bookends use a clean veil.
    setSceneLoaderVisible(options.showLoader !== false);
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
    // Always drop the spinner before revealing the world or isometric theater.
    setSceneLoaderVisible(false);
    // Only raise Forge above residual fade once we intentionally reveal the
    // theater — never while a previous Creation layout might still be on screen.
    if (isRunIntroActive()) setIntroTheaterRevealed(true);
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
  await waitMs(durationMs, options.signal);
  if (options.signal?.aborted) return;
  if (!opaque) {
    fade.hidden = true;
    fade.setAttribute("aria-hidden", "true");
    fade.style.transitionDuration = "";
  }
}

function resolveIntroThemeKey(): string {
  if (forcedPlayMoodId) return forcedPlayMoodId;
  return launchConfig.mood || "ancient";
}

const runIntroDirector = new RunIntroDirector({
  prepare(request) {
    campaignClearRecordedForRun = false;
    continueRecoveryOverride = null;
    elements.shell.dataset.runIntroInputGate = "true";
    void audio.unlock();
    if (request.runSource) setRunSource(request.runSource, false);
    elements.seed.value = request.seed;
    setWelcomeOpen(false);
    setMusicBed(null);
    controller.setEnabled(false);
    closeEndOverlay();
    setOptionsOpen(false);
  },
  refreshProcedural() {
    // Never regenerate a cosmetic Forge layout while the map theater is about to
    // host the real play dungeon — that second build is a visible pop-in and a
    // wasted full scene rebuild on the critical New Game path.
    if (isRunIntroActive() || elements.shell.dataset.runIntroInputGate === "true") return;
    forgeFrameClient.setProceduralSeed(makeProceduralSeed());
  },
  fade(target, options, signal) {
    return setSceneFadeOpaque(target === "opaque", { ...options, signal });
  },
  clearLoader() {
    // Drop the spinner only. Keep the black fade ABOVE Forge until fade("clear")
    // so a leftover Creation/procedural map cannot flash before the host layout.
    setSceneLoaderVisible(false);
  },
  enterTheater() {
    if (engineMode === "play") {
      setEngineMode("editor", { hydrate: false, persist: false });
    }
    setIntroTheaterRevealed(false);
    setRunIntroActive(true, COPY.status.forgingMap);
    setEditorSurface("forge");
    setMapToolsOpen(false);
    playCue("forge");
  },
  setTheaterStatus() {
    setRunIntroStatus(COPY.status.enteringDungeon);
  },
  leaveTheater() {
    setIntroTheaterRevealed(false);
    setRunIntroActive(false);
    forgeFrameClient.setVisible(false);
  },
  waitFrames(count, signal) {
    return waitAnimationFrames(count, signal);
  },
  waitDelay(durationMs, signal) {
    return waitMs(durationMs, signal);
  },
  async buildWorld(seed, signal) {
    if (signal.aborted) return { ok: false, message: "cancelled" };
    try {
      await buildDungeon(seed);
      if (signal.aborted) return { ok: false, message: "cancelled" };
      if (!dungeon) return { ok: false, message: "Could not generate the dungeon." };
      return { ok: true, dungeon };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Could not generate the dungeon.",
      };
    }
  },
  async waitForWorldReady(timeoutMs, signal): Promise<RunIntroWarmup> {
    await waitForRendererWarmup(timeoutMs, signal);
    return renderWarmupReady ? "ready" : "degraded";
  },
  startPresentation(presentation, options) {
    return forgeFrameClient.startPresentation({
      presentation,
      loadTimeoutMs: options.loadTimeoutMs,
      completionTimeoutMs: options.completionTimeoutMs,
      signal: options.signal,
    });
  },
  activatePlayMode() {
    setEngineMode("play", { hydrate: false, deferController: true });
  },
  async restorePlayInputAndFocus(signal) {
    setStatus(COPY.status.enterPlay);
    // rAF callbacks run before style/layout. Wait until the intro visibility
    // rule has been painted away before releasing input to the Play canvas.
    for (let frame = 0; frame < 8 && !signal.aborted; frame += 1) {
      await waitAnimationFrames(1, signal);
      if (getComputedStyle(elements.scene).visibility === "visible") break;
    }
    if (signal.aborted) return;
    delete elements.shell.dataset.runIntroInputGate;
    controller.setEnabled(canEnablePlayController());
    for (let attempt = 0; attempt < 4 && !signal.aborted; attempt += 1) {
      elements.scene.focus({ preventScroll: true });
      if (document.activeElement === elements.scene) return;
      await waitAnimationFrames(1, signal);
    }
  },
  recoverToWelcome(message) {
    delete elements.shell.dataset.runIntroInputGate;
    setIntroTheaterRevealed(false);
    setSceneLoaderVisible(false);
    setRunIntroActive(false);
    forgeFrameClient.setVisible(false);
    setWelcomeOpen(true);
    if (message) setStatus(message);
  },
  resetIntro(destination) {
    controller.setEnabled(false);
    if (destination !== "superseded") delete elements.shell.dataset.runIntroInputGate;
    setIntroTheaterRevealed(false);
    setSceneLoaderVisible(false);
    setRunIntroActive(false);
    forgeFrameClient.setVisible(false);
    void setSceneFadeOpaque(false, { instant: true, showLoader: false });
    if (destination === "cancelled") setWelcomeOpen(true);
  },
});

/**
 * Campaign New Game / Hall seed: build the real play map, show it isometrically
 * in Forge (same topology), then fade into first-person Play.
 */
function startPlayWithSeed(
  seed: string,
  options: { refreshProcedural?: boolean; runSource?: RunSource } = {},
): Promise<RunIntroResult> {
  const normalizedSeed = seed.trim() || COPY.hud.seedDefault;
  return runIntroDirector.start({
    seed: normalizedSeed,
    runSource: options.runSource,
    themeKey: resolveIntroThemeKey(),
    refreshProcedural: options.refreshProcedural,
    skip: launchConfig.skipRunIntro,
    reducedMotion: REDUCED_MOTION_QUERY.matches,
  });
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
  if (elements.leaderboardPortraitPreviewFace.getAttribute("aria-disabled") === "true") return;
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
      forcedPlayMoodId =
        listBiomeIdentities().find((biomeIdentity) => biomeIdentity.label === entry.biome)?.id ??
        null;
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
  elements.welcomeLeaderboard.classList.remove("is-expanded");
  elements.welcomeHallToggle.hidden = true;
  elements.welcomeHallToggle.setAttribute("aria-expanded", "false");
  const hallToggleLabel = elements.welcomeHallToggle.firstElementChild;
  const hallToggleArrow = elements.welcomeHallToggle.lastElementChild;
  if (hallToggleLabel) hallToggleLabel.textContent = "VIEW HALL";
  if (hallToggleArrow) hallToggleArrow.textContent = "→";
  try {
    const response = await loadLeaderboard();
    if (sequence !== leaderboardLoadSequence) return;
    playerBiomeStars = response.playerBiomeStars ?? emptyPlayerBiomeStars();
    syncWelcomeArt();
    renderLeaderboard(response.entries);
    elements.welcomeHallToggle.hidden = response.entries.length <= 3;
    if (!elements.welcomeBiomePicker.hidden) renderBiomePicker();
    elements.leaderboardStatus.textContent = response.entries.length
      ? `${response.entries.length} record${response.entries.length === 1 ? "" : "s"} in the hall.`
      : COPY.leaderboard.empty;
  } catch (error) {
    if (sequence !== leaderboardLoadSequence) return;
    playerBiomeStars = emptyPlayerBiomeStars();
    syncWelcomeArt();
    renderLeaderboard([]);
    elements.welcomeHallToggle.hidden = true;
    elements.leaderboardStatus.textContent = COPY.leaderboard.unavailable;
    console.warn("Leaderboard could not be loaded", error);
  }
}

function createLeaderboardRunId(): string {
  const unique = crypto.randomUUID?.() ?? `${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
  return `run_${unique}`;
}

function renderEndLeaderboardComparison(state: RoundResultsState): void {
  elements.endLeaderboardComparison.dataset.state = state.kind;
  elements.endLeaderboardRank.textContent = state.rank;
  elements.endLeaderboardDelta.textContent = state.detail;
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
    roundResults.showCustom(renderEndLeaderboardComparison);
    pendingLeaderboardSubmission = null;
    elements.endLeaderboardForm.hidden = true;
    elements.endLeaderboardNote.hidden = true;
    elements.endLeaderboardNote.textContent = "";
    return;
  }

  void roundResults.begin(score, renderEndLeaderboardComparison);

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
  elements.leaderboardName.value = playerProfile?.name ?? storedLeaderboardName() ?? "";
  hasCustomPortraitSelection = false;
  currentSelectedPortraitIndex =
    playerProfile?.avatarIndex ??
    portraitIndexForName(elements.leaderboardName.value || "Wanderer");
  updateLeaderboardPortraitPreview(elements.leaderboardName.value || "Wanderer", true);
  const hasSavedIdentity = playerProfile !== null;
  elements.leaderboardName.disabled = hasSavedIdentity;
  elements.leaderboardPortraitPreviewFace.setAttribute("aria-disabled", String(hasSavedIdentity));
  elements.leaderboardPortraitPreviewFace.tabIndex = hasSavedIdentity ? -1 : 0;
  if (hasSavedIdentity) {
    elements.leaderboardSubmit.disabled = true;
    elements.leaderboardSubmit.textContent = COPY.leaderboard.saving;
    elements.leaderboardSubmitStatus.textContent = COPY.leaderboard.saving;
    queueMicrotask(() => void submitPreparedLeaderboardEntry());
  }
}

function canEnablePlayController(): boolean {
  return (
    elements.shell.dataset.runIntroInputGate !== "true" &&
    !floorTransitionInputBlocked &&
    !welcomeOpen &&
    renderWarmupReady &&
    engineMode === "play" &&
    playRuntime.state().runMode === "playing"
  );
}

function beginRendererWarmup(): number {
  renderWarmupSequence += 1;
  renderWarmupReady = false;
  elements.shell.dataset.rendererReady = "false";
  controller.setEnabled(false);
  // A queued frame may be superseded before it starts. The replacement owns a
  // clean sentinel and the stale frame exits on its sequence guard.
  world.setPickupEffectsWarmupVisible(false);
  return renderWarmupSequence;
}

function markRendererWarmupReady(
  sequence: number,
  state: "true" | "error" | "timeout",
  readyMessage: string,
  detail?: string,
  readyMs?: number,
): void {
  if (sequence !== renderWarmupSequence || renderWarmupReady) return;
  renderWarmupReady = true;
  elements.shell.dataset.rendererReady = state;
  controller.setEnabled(canEnablePlayController());
  if (state === "error") {
    console.error("Dungeon renderer warmup failed", detail);
    if (localDevTools) {
      setStatus(`${readyMessage} Renderer warmup failed: ${detail ?? "unknown error"}.`);
    } else if (engineMode === "play") {
      setStatus(COPY.status.enterPlay);
    } else {
      setStatus(readyMessage);
    }
    return;
  }
  if (state === "timeout") {
    if (localDevTools) setStatus(`${readyMessage} Renderer warmup timed out.`);
    else if (engineMode === "play") setStatus(COPY.status.enterPlay);
    else setStatus(readyMessage);
    return;
  }
  elements.shell.dataset.renderPath = renderCaps.telemetryPath;
  if (localDevTools && readyMs !== undefined) {
    setStatus(`${readyMessage} Renderer ready in ${readyMs}ms.`);
  } else if (engineMode === "play") {
    setStatus(COPY.status.enterPlay);
  } else {
    setStatus(readyMessage);
  }
}

function startRendererWarmup(sequence: number, readyMessage: string): void {
  if (localDevTools) setStatus("Preparing renderer...");
  // Never leave the load cover waiting forever if rAF is delayed or the first
  // draw stalls. Parents (intro / rebuild cover) wait on renderWarmupReady.
  const failsafe = window.setTimeout(() => {
    markRendererWarmupReady(sequence, "timeout", readyMessage);
  }, 4_000);
  // Split warmup across two frames: first forces dormant VFX into the graph,
  // second compiles/draws. That keeps the longest main-thread task shorter than
  // a single combined setVisible+render long task without dropping programs.
  window.requestAnimationFrame(() => {
    if (sequence !== renderWarmupSequence) {
      window.clearTimeout(failsafe);
      return;
    }
    const startedAt = performance.now();
    try {
      world.setPickupEffectsWarmupVisible(true);
    } catch (error) {
      window.clearTimeout(failsafe);
      const detail = error instanceof Error ? error.message : "unknown error";
      markRendererWarmupReady(sequence, "error", readyMessage, detail);
      return;
    }
    window.requestAnimationFrame(() => {
      if (sequence !== renderWarmupSequence) {
        world.setPickupEffectsWarmupVisible(false);
        window.clearTimeout(failsafe);
        return;
      }
      let warmupError: unknown = null;
      try {
        // Draw only the live frame. Explicit scene precompile also registers
        // offscreen variants whose program handles can outlive a replaced world.
        povPost.render(renderer, scene, camera);
      } catch (error) {
        warmupError = error;
      } finally {
        world.setPickupEffectsWarmupVisible(false);
        window.clearTimeout(failsafe);
      }

      if (warmupError !== null) {
        const detail = warmupError instanceof Error ? warmupError.message : "unknown error";
        markRendererWarmupReady(sequence, "error", readyMessage, detail);
        return;
      }
      markRendererWarmupReady(
        sequence,
        "true",
        readyMessage,
        undefined,
        Math.round(performance.now() - startedAt),
      );
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

  // Portal-open beat: one banner when the fourth stone binds, and escalate the music bed.
  if (portalOpen && !quest.escaped && !lastPortalBanner) {
    lastPortalBanner = true;
    setActiveBiomeMusic();
    const finalFloor = !dungeon?.floor || dungeon.floor.index === dungeon.floor.count - 1;
    showObjectiveBanner(
      finalFloor ? COPY.objective.openPortal : "All stones bound. Take the stairs to the portal",
      "portal",
      3600,
      1500,
    );
  }
}

function applyPersistedRunSession(plan: RunResumeActivationPlan): void {
  const state = playRuntime.restore(plan.persistedSession, plan.runtimeProgress);
  applyRunResumePlan(plan, false);
  if (plan.playerPose) syncDomainExplore();
  lastRunTimerSecond = -1;
  timeFreezeChip.reset();
  luminousWardChip.reset();
  annihilationPulseChip.reset();
  cullBrandChip.reset();
  fogClearChip.reset();
  mobilityChip.reset();
  resetCurseHud();
  syncCurseHud();
  syncCullBrandHud();
  syncPhoenixHud();
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
    suppressPauseOnPointerUnlock = false;
    elements.shell.classList.remove("options-open");
    elements.optionsMenu.hidden = false;
    elements.optionsCard.setAttribute("role", "region");
    elements.optionsCard.removeAttribute("aria-modal");
    elements.optionsTitle.textContent = engineMode === "debug" ? "Debug" : "Creation";
    return;
  }
  optionsOpen = open;
  if (open) suppressPauseOnPointerUnlock = false;
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
  // Escape (and some browsers) refuse pointer lock on the same key that exits
  // lock. Suppress auto-pause-on-unlock so the panel stays closed; scene click
  // re-locks. Successful lock clears the flag in onLockChange.
  suppressPauseOnPointerUnlock = true;
  setOptionsOpen(false);
  void audio.unlock();
  if (useTouchControls) {
    suppressPauseOnPointerUnlock = false;
    return;
  }
  if (engineMode === "play" && playRuntime.state().runMode === "playing") {
    controller.requestPointerLock();
  }
}

let mapRebuildPending = false;

/**
 * End-overlay and pause-menu rebuilds swap the whole world.
 * Cover the swap with the scene fade + loader and hold it until the new
 * world's first frame is warm, so players never watch two layouts pop.
 */
async function rebuildDungeonCovered(build: () => void | Promise<unknown>): Promise<void> {
  if (mapRebuildPending) return;
  mapRebuildPending = true;
  controller.setEnabled(false);
  try {
    await setSceneFadeOpaque(true, { durationMs: 180 });
    await build();
    // The reveal waits for the new world's compiled first frame; otherwise the
    // old layout flashes through the fade and the new one pops in behind it.
    await waitForRendererWarmup(10_000);
  } catch (error) {
    console.error("Dungeon rebuild failed", error);
  } finally {
    try {
      await setSceneFadeOpaque(false, { durationMs: 240 });
    } finally {
      mapRebuildPending = false;
      controller.setEnabled(canEnablePlayController());
    }
  }
}

/** Rebuild the current seed from the pause menu (same as R while options open). */
function restartCurrentMap(): void {
  void audio.unlock();
  clearTouchSession();
  resumeTouchControls = false;
  campaignClearRecordedForRun = false;
  void rebuildDungeonCovered(async () => {
    closeEndOverlay();
    setOptionsOpen(false);
    await buildDungeon();
    setStatus(COPY.pause.restarted);
  });
}

/** Leave play and open the welcome screen without wiping the continue save. */
function returnToMainScreen(): void {
  runIntroDirector.cancel();
  void audio.unlock();
  clearTouchSession();
  resumeTouchControls = false;
  closeEndOverlay();
  setOptionsOpen(false);
  localRunSave.flush();
  const save = readLocalRunSave();
  if (canContinueLocalRun(save)) {
    setContinueCandidate(save.state, "Saved descent ready.", null, {
      runSeconds: save.resume?.runSeconds,
      savedAt: save.savedAt,
      biomeId:
        save.resume?.campaignBiomeId ??
        forcedPlayMoodId ??
        (dungeon ? resolveActiveMood(dungeon).id : undefined),
    });
  } else if (continueDomainState && canContinueDomainRun(continueDomainState)) {
    setContinueCandidate(continueDomainState, "Saved descent ready.", null, {
      biomeId: forcedPlayMoodId ?? (dungeon ? resolveActiveMood(dungeon).id : undefined),
    });
  } else {
    setContinueCandidate(null, "No active saved run. Start a new descent.");
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
  timeFreezeChip.sync(remaining);
}

function syncLuminousWardHud(remaining = world.luminousWardRemaining): void {
  luminousWardChip.sync(remaining);
}

function syncAnnihilationPulseHud(remaining = world.annihilationPulseRemaining): void {
  annihilationPulseChip.sync(remaining);
}

function syncCullBrandHud(remaining = world.cullBrandRemaining): void {
  cullBrandChip.sync(remaining);
}

function syncPhoenixHud(charges = world.phoenixChargeCount): void {
  const armed = charges > 0;
  elements.phoenixStatus.hidden = !armed;
  elements.shell.dataset.phoenix = armed ? "true" : "false";
}

function syncFogClearHud(remaining = world.fogClearRemaining): void {
  fogClearChip.sync(remaining);
  atmosphere.setFogClearPulse(remaining > 0 ? 1 : 0);
}

function syncMobilityHud(remaining = world.mobilityBoostRemaining): void {
  mobilityChip.sync(remaining);
}

function syncCurseHud(
  remaining: {
    slow?: number;
    frenzy?: number;
    gloom?: number;
    swarm?: boolean;
    mirror?: number;
    spin?: number;
  } = {},
): void {
  slowCurseChip.sync(remaining.slow ?? world.slowCurseRemaining);
  frenzyCurseChip.sync(remaining.frenzy ?? world.frenzyCurseRemaining);
  gloomCurseChip.sync(remaining.gloom ?? world.gloomCurseRemaining);
  mirrorCurseChip.sync(remaining.mirror ?? world.mirrorCurseRemaining);
  spinCurseChip.sync(remaining.spin ?? world.spinCurseRemaining);
  syncSwarmCurseHud(remaining.swarm ?? world.isSwarmCurseActive);
}

/**
 * Biome events (dustfall, whiteout, …) are environment pulses — falling grit,
 * weather, light loops — not player buffs. Drive world ceiling particles + mild
 * shell atmosphere; never surface a character-status chip next to ward / pulse.
 */
function syncBiomeEvent(snapshot?: BiomeEventSnapshot): void {
  const active = Boolean(snapshot?.active);
  // Keep the legacy chip permanently off.
  elements.biomeEventStatus.hidden = true;
  // Soft non-precipitation tints only (whiteout / light-loop). Fall events
  // (dustfall, cinderfall, spore-bloom, …) use AtmosphereSystem ceiling motes.
  elements.shell.dataset.biomeEvent = active && snapshot ? snapshot.id : "none";
  atmosphere.setEventPulse(active ? 1 : 0);
  if (!active || !snapshot) return;
  if (snapshot.started) {
    // Soft world notice only — no countdown state on the character HUD.
    setStatus(`${snapshot.label}.`);
    flash("event");
  }
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
  const forced = parseDungeonMoodId(launchConfig.mood);
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

let lastUiHoverAt = 0;
let lastUiHoverTarget: UiSoundTarget | null = null;
let lastUiClickAt = 0;

/** Light global UI SFX so menus, toggles, and pickers feel like a game shell. */
function wireInterfaceSounds(): void {
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0) return;
      const target = resolveUiSoundTarget(event.target);
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
      const target = resolveUiSoundTarget(event.target);
      if (!target || target.closest("#scene, .touch-controls")) return;
      const cue = resolveUiHoverCue(target);
      if (!cue) return;
      if (lastUiHoverTarget === target) return;
      lastUiHoverTarget = target;
      const now = performance.now();
      if (now - lastUiHoverAt < 70) return;
      lastUiHoverAt = now;
      playCue(cue);
    },
    true,
  );

  document.addEventListener(
    "change",
    (event) => {
      const cue = resolveUiChangeCue(event.target);
      if (cue) playCue(cue);
    },
    true,
  );

  document.addEventListener(
    "input",
    (event) => {
      const cue = resolveUiChangeCue(event.target);
      if (cue !== "uiTick") return;
      const now = performance.now();
      if (now - lastUiClickAt < 55) return;
      lastUiClickAt = now;
      playCue(cue);
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

const DAMAGE_WASH_SECONDS = 0.85;
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
  flags: Parameters<typeof projectPickupFeedback>[0] = {},
): void {
  const feedback = projectPickupFeedback(flags);
  elements.pickupFeedbackText.textContent = label;
  elements.pickupFeedbackKicker.textContent = COPY.pickup[feedback.kickerKey];
  elements.pickupFeedback.dataset.kind = feedback.kind;
  if (feedback.stoneId) elements.pickupFeedback.dataset.stone = feedback.stoneId;
  else delete elements.pickupFeedback.dataset.stone;
  elements.pickupFeedback.classList.add("is-active");
  pickupFeedbackAnimation?.cancel();
  pickupFeedbackAnimation = elements.pickupFeedback.animate(
    [
      { opacity: 0, transform: "translate(-50%, 22px) scale(0.92)", offset: 0 },
      { opacity: 1, transform: "translate(-50%, 0) scale(1.04)", offset: 0.12 },
      { opacity: 1, transform: "translate(-50%, 0) scale(1)", offset: 0.22 },
      { opacity: 1, transform: "translate(-50%, -6px) scale(1)", offset: 0.72 },
      { opacity: 0, transform: "translate(-50%, -18px) scale(0.98)", offset: 1 },
    ],
    {
      duration: REDUCED_MOTION_QUERY.matches ? 1 : 1200,
      easing: "steps(10, end)",
      fill: "both",
    },
  );
  pickupFeedbackAnimation.addEventListener(
    "finish",
    () => elements.pickupFeedback.classList.remove("is-active"),
    { once: true },
  );
  if (feedback.restoreResolve) {
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
  const floorLabel = dungeon.floor ? `floor ${dungeon.floor.number}/${dungeon.floor.count} / ` : "";
  elements.runStats.textContent = `${floorLabel}${dungeon.stats.roomCount} rooms / ${dungeon.stats.loopCount} loops / ${world.stats.enemies} presence`;
  elements.position.textContent = player.cell
    ? `CELL ${formatCell(player.cell)} / ${player.distanceTravelled.toFixed(0)} m`
    : "CELL —";
}

function drawMap(force = false): void {
  if (!dungeon) return;
  const player = controller.getState();
  const exploration = floorExploration.activeView();
  const features = world.getMinimapFeatures();
  if (
    !minimapDrawInvalidator.shouldDraw(
      player.cell,
      player.lookYaw,
      exploration.exploredCount,
      world.getMinimapFeatureRevision(),
      force,
    )
  ) {
    return;
  }
  drawMinimap(elements.minimap, dungeon, player.cell, {
    features,
    viewport: minimapViewport,
    explored: exploration.explored,
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
  if (!playerProfile || !isBiomeUnlocked(playerProfile, nextId)) {
    setEndNextBiomeDisabled();
    return;
  }
  const label = getDungeonMood(nextId).label;
  setEndNextBiomeEnabled(nextId, label);
}

function recordCampaignClear(biomeId: BiomeId): void {
  if (
    campaignClearRecordedForRun ||
    runSource !== "campaign" ||
    Boolean(dungeon?.forge) ||
    !playerProfile
  ) {
    return;
  }
  const nextProfile = completeCampaignBiome(playerProfile, biomeId);
  if (nextProfile === playerProfile) return;
  playerProfile = nextProfile;
  campaignClearRecordedForRun = true;
  if (!writePlayerProfile(nextProfile)) {
    elements.leaderboardSubmitStatus.textContent =
      "Level cleared, but browser progress could not be saved.";
  }
  syncPlayerProfileUi();
  renderBiomePicker();
}

function closeEndOverlay(): void {
  endScreenParticles.setActive(false);
  elements.endOverlay.hidden = true;
  elements.endLeaderboardForm.hidden = true;
  elements.endLeaderboardNote.hidden = true;
  elements.endLeaderboardNote.textContent = "";
  hideEndNextBiome();
  pendingLeaderboardSubmission = null;
  leaderboardSubmissionPending = false;
  roundResults.reset();
  elements.shell.dataset.mode = "playing";
  controller.setEnabled(canEnablePlayController());
  if (!welcomeOpen) setActiveBiomeMusic();
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
  if (!launchConfig.visualQa.state) recordPlayerRunCompleted();
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
    recordCampaignClear(endingBiomeId as BiomeId);
    revealEndNextBiomeAfterSave();
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
  window.requestAnimationFrame(() => {
    if (mode === "dead") elements.retry.focus();
    else if (!playerProfile) elements.leaderboardName.focus();
    else if (!elements.endNextBiome.disabled) elements.endNextBiome.focus();
    else elements.newDungeon.focus();
  });
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
  const exploredCount = floorExploration.activeView().exploredCount;
  domainBridge.syncExplore({
    room: pendingExploreRoom,
    exploredCells: exploredCount,
    mapped: Math.max(1, Math.min(dungeon.stats.floorCount, exploredCount)),
    topologySignature: dungeon.topologySignature,
    threat: extra.threat,
  });
}

function syncDomainExplore(extra: { threat?: number } = {}): void {
  if (!dungeon || runTransitionPending) return;
  const player = controller.getState();
  const cell = player.cell ?? dungeon.spawn;
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

/** One painted frame between heavy map-load steps so the fade/loader stays alive. */
function yieldMapLoadFrame(): Promise<void> {
  return waitAnimationFrames(1);
}

function publishMapLoadTelemetry(metrics: {
  seed: string;
  clearToReadyMs: number;
  worldBuildMs: number;
  atmosphereMs: number;
  rooms: number;
  floorCells: number;
  props: number;
  geometries: number;
  textures: number;
  programs: number;
}): void {
  const dataset = elements.scene.dataset;
  dataset.mapLoadMs = String(Math.round(metrics.clearToReadyMs));
  dataset.mapLoadWorldMs = String(Math.round(metrics.worldBuildMs));
  dataset.mapLoadAtmosphereMs = String(Math.round(metrics.atmosphereMs));
  dataset.mapLoadRooms = String(metrics.rooms);
  dataset.mapLoadFloorCells = String(metrics.floorCells);
  dataset.mapLoadProps = String(metrics.props);
  dataset.mapLoadGeometries = String(metrics.geometries);
  dataset.mapLoadTextures = String(metrics.textures);
  dataset.mapLoadPrograms = String(metrics.programs);
  if (localDevTools || launchConfig.performanceAudit) {
    console.info("[map-load]", metrics);
  }
}

async function activateDungeon(
  nextDungeon: DungeonData,
  message: string,
  params: DungeonEditorParams,
  options: {
    persistBuild?: boolean;
    restore?: RunResumeActivationPlan;
  } = {},
): Promise<DungeonRuntimeState> {
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
  // Parent covers (intro, floor transition, rebuildDungeonCovered) own reveal.
  // Never self-own a cover-and-wait here: that deadlocked first-map loads when
  // the warmup rAF and the waiter both stalled behind the same fade.
  // Only re-show the spinner while a black cover is already up for a real build.
  if (isSceneFadeCovering()) setSceneLoaderVisible(true);
  const warmupSequence = beginRendererWarmup();
  const loadStartedAt = performance.now();
  const mayYieldDuringBuild = isSceneFadeCovering();
  const yieldIfCovered = async (): Promise<void> => {
    if (mayYieldDuringBuild) await yieldMapLoadFrame();
  };

  dungeon = nextDungeon;
  forgePreviewDungeon = nextDungeon.forge ? nextDungeon : null;
  // Forge maps never rank, even if the session started as campaign by mistake.
  setRunSource(runSource, Boolean(nextDungeon.forge));
  // Scene graph changed — force the next materials inventory to rescan.
  lastMaterialCountAt = 0;
  elements.seed.value = nextDungeon.seed;
  launchHistory.replace({ seed: nextDungeon.seed });
  if (!options.restore) floorExploration.start(nextDungeon, nextDungeon.spawn);
  const mood = applyDungeonMood(nextDungeon);
  applyAtmosphereFromParams();
  // Dispose previous world, optionally yield under an existing cover so GC can
  // reclaim, then build the next floor. No yield without a cover — that flashed
  // empty frames and could stall the first New Game path.
  const worldStartedAt = performance.now();
  const stack =
    campaignFloorSet && campaignFloorSet.count > 1 ? campaignFloorSet.allFloors() : undefined;
  let state = await playRuntime.loadWithYield({ dungeon, mood, stack }, yieldIfCovered);
  const worldBuildMs = performance.now() - worldStartedAt;
  // Only re-upload textures whose sampling filters actually changed.
  applyTextureSmoothing(scene, userSettings.textureSmoothing);
  timeFreezeChip.reset();
  luminousWardChip.reset();
  annihilationPulseChip.reset();
  cullBrandChip.reset();
  fogClearChip.reset();
  mobilityChip.reset();
  resetCurseHud();
  syncBiomeEvent();
  controller.setSurfaceMovement(1, 1);
  controller.setControlMods({});
  lastHazardKind = undefined;
  activeHazardKind = null;
  hazardHitBoost = 0;
  syncHazardStatus({ kind: null, label: "", damage: 0, movementScale: 1, traction: 1 });
  elements.damage.dataset.kind = "enemy";
  elements.healthOrb.dataset.damageKind = "enemy";
  lastRunTimerSecond = -1;
  syncRunTimer();
  const atmosphereStartedAt = performance.now();
  atmosphere.setDungeon(dungeon, mood);
  const atmosphereMs = performance.now() - atmosphereStartedAt;
  await yieldIfCovered();
  controller.setDungeon(dungeon);
  controller.setBlockedCells([]);
  controller.setSolidColliders(world.getSolidColliders());
  if (options.restore) {
    applyRunResumePlan(options.restore);
    const restoredPlayer = controller.getState().position;
    state = playRuntime.restore(
      options.restore.persistedSession,
      options.restore.runtimeProgress
        ? {
            ...options.restore.runtimeProgress,
            player: { x: restoredPlayer.x, z: restoredPlayer.z },
          }
        : undefined,
    );
  }
  if (options.restore?.playerPose) syncDomainExplore();
  controller.setEnabled(canEnablePlayController());
  editorView.setDungeon(dungeon, mood);
  setEditorSurfaceStatus(
    "runtime",
    `PLAY MAP · FLOOR ${nextDungeon.floor?.number ?? 1}/${nextDungeon.floor?.count ?? 1} · ${nextDungeon.stats.roomCount} ROOMS · ${nextDungeon.stats.loopCount} LOOPS`,
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
  syncAnnihilationPulseHud();
  syncFogClearHud();
  syncMobilityHud();
  syncCurseHud();
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
  publishMapLoadTelemetry({
    seed: nextDungeon.seed,
    clearToReadyMs: performance.now() - loadStartedAt,
    worldBuildMs,
    atmosphereMs,
    rooms: nextDungeon.stats.roomCount,
    floorCells: nextDungeon.stats.floorCount,
    props: world.stats.props,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? 0,
  });
  startRendererWarmup(warmupSequence, message);
  if (persistBuild) {
    runHasStarted = true;
    domainBridge.syncSession(playRuntime.snapshot());
    localRunSave.schedule(0);
  }
  return getRuntimeState();
}

async function buildDungeon(
  seed = elements.seed.value,
  options: {
    persistBuild?: boolean;
    restore?: RunResumeActivationPlan;
  } = {},
): Promise<DungeonRuntimeState> {
  povPost.resetCrtHistory();
  const normalizedSeed = seed.trim() || COPY.hud.seedDefault;
  const params = readEditorParams();
  try {
    const generationOptions = {
      roomTarget: params.roomTarget,
      extraConnectionRate: params.loopRate / 100,
      width: params.mapWidth,
      height: params.mapHeight,
      minRoomSize: params.minRoomSize,
      maxRoomSize: params.maxRoomSize,
      corridorRadius: params.corridorRadius,
      roomPadding: params.roomPadding,
    };
    const requestedCampaignMood =
      runSource === "campaign"
        ? (parseDungeonMoodId(options.restore?.generation.campaignBiomeId) ??
          forcedPlayMoodId ??
          parseDungeonMoodId(launchConfig.mood))
        : null;
    let generated: DungeonData;
    if (runSource === "campaign" && requestedCampaignMood) {
      const rootSeed = options.restore?.generation.seed ?? normalizedSeed;
      const floorCount = biomeCampaignFloorCount(requestedCampaignMood);
      campaignFloorSet = createDungeonFloorCampaign(rootSeed, generationOptions, floorCount);
      const activeFloorIndex = Math.min(
        floorCount - 1,
        Math.max(0, options.restore?.generation.activeFloor ?? 0),
      );
      generated = campaignFloorSet.floor(activeFloorIndex)!;
    } else {
      generated = generateCompletableDungeon(normalizedSeed, generationOptions);
      if (runSource === "campaign" && !generated.forge) {
        const rootSeed = options.restore?.generation.seed ?? normalizedSeed;
        if (rootSeed !== normalizedSeed) {
          generated = generateCompletableDungeon(rootSeed, generationOptions);
        }
        const moodId = resolveActiveMood(generated).id;
        const floorCount = biomeCampaignFloorCount(moodId);
        campaignFloorSet = createDungeonFloorCampaign(
          rootSeed,
          generationOptions,
          floorCount,
          generated,
        );
        const activeFloorIndex = Math.min(
          floorCount - 1,
          Math.max(0, options.restore?.generation.activeFloor ?? 0),
        );
        generated = campaignFloorSet.floor(activeFloorIndex)!;
      } else {
        campaignFloorSet = null;
      }
    }
    const mood = resolveActiveMood(generated);
    const statusMessage = localDevTools
      ? COPY.status.generation(params.profile, mood.label)
      : COPY.status.generationPlayer(mood.label);
    return await activateDungeon(generated, statusMessage, params, options);
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
  if (nextSurface === "forge" && engineMode !== "play") {
    void forgeFrameClient.ensureLoaded({ presentation: isRunIntroActive(), timeoutMs: 8_000 });
  }
  const visible = nextSurface === "forge" && (engineMode === "editor" || isRunIntroActive());
  forgeFrameClient.setVisible(visible);
  if (engineMode === "editor") setMapToolsOpen(nextSurface === "runtime");
  if (nextSurface === "runtime") window.requestAnimationFrame(() => editorView.redraw());
}

function applyForgeDungeon(): void {
  if (!forgeIntake) return;
  void (async () => {
    if (!forgeIntake) return;
    try {
      const imported = forgePreviewDungeon ?? forgeIntake.dungeon;
      const { params } = forgeIntake;
      applyEditorParamsToForm(params);
      const mood = resolveActiveMood(imported);
      setRunSource("custom", true);
      await activateDungeon(
        imported,
        `${imported.forge?.name ?? "Dungeon Creation"} · ${mood.label} ready to play.`,
        params,
      );
      setContinueCandidate(null, "Imported Forge maps are session-only.");
      setEngineMode("play");
      showPickupFeedback(COPY.status.forgeLoaded);
      playCue("forge");
      setStatus("Forge map ready. Continue is unavailable for imported maps.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not load the Dungeon Creation map.";
      setEditorSurfaceStatus("forge", message.toUpperCase(), "error");
      setStatus(message);
    }
  })();
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
  applyTextureSmoothing(scene, userSettings.textureSmoothing);
  timeFreezeChip.reset();
  luminousWardChip.reset();
  annihilationPulseChip.reset();
  cullBrandChip.reset();
  fogClearChip.reset();
  mobilityChip.reset();
  resetCurseHud();
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
  syncFogClearHud();
  syncMobilityHud();
  syncCurseHud();
  updateReadout();
  drawMap();
  setStatus(`Spawn set to ${formatCell(cell)}. Exit was recalculated.`);
  startRendererWarmup(warmupSequence, `Spawn set to ${formatCell(cell)}.`);
  playCue("spawn");
  flash();
}

function setEngineMode(
  nextMode: EngineMode,
  options: { hydrate?: boolean; persist?: boolean; deferController?: boolean } = {},
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
  launchHistory.replace({ mode: nextMode });
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
        const restore = planRunResumeRestore(hydrated.state);
        await buildDungeon(hydrated.seed, {
          persistBuild: false,
          restore,
        });
        setStatus(COPY.status.hydrate(hydrated.seed));
      } else if (dungeon && hydrated.seed === localSeed) {
        applyPersistedRunSession(planRunResumeRestore(hydrated.state));
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
  if (!options.deferController) controller.setEnabled(canEnablePlayController());
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

function queueNewProceduralSeed(): void {
  forgeFrameClient.setProceduralSeed(makeProceduralSeed());
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
  cullBrandRemaining?: number;
  mirrorCurseRemaining?: number;
  spinCurseRemaining?: number;
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
  if (!launchConfig.performanceAudit && engineMode !== "debug") return;
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
  if (launchConfig.performanceAudit) {
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
    cullBrandRemaining: Number(world.cullBrandRemaining.toFixed(2)),
    mirrorCurseRemaining: Number(world.mirrorCurseRemaining.toFixed(2)),
    spinCurseRemaining: Number(world.spinCurseRemaining.toFixed(2)),
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
  void rebuildDungeonCovered(async () => {
    await buildDungeon();
    playCue("forge");
  });
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

async function submitPreparedLeaderboardEntry(): Promise<void> {
  if (!isLeaderboardEligible(runSource) || Boolean(dungeon?.forge)) {
    setStatus(COPY.leaderboard.customExcluded);
    return;
  }
  if (!pendingLeaderboardSubmission || leaderboardSubmissionPending) return;
  const playerName = normalizePlayerName(elements.leaderboardName.value);
  if (!playerName) {
    elements.leaderboardSubmitStatus.textContent = `Use 1-20 letters, numbers, spaces or . _ ' -`;
    elements.leaderboardName.focus();
    return;
  }
  leaderboardSubmissionPending = true;
  elements.leaderboardSubmit.disabled = true;
  elements.leaderboardSubmit.textContent = COPY.leaderboard.saving;
  elements.leaderboardSubmitStatus.textContent = COPY.leaderboard.saving;
  const portraitIndex =
    currentSelectedPortraitIndex !== null
      ? currentSelectedPortraitIndex
      : portraitIndexForName(playerName);
  try {
    const { entry } = await submitLeaderboardEntry({
      ...pendingLeaderboardSubmission,
      playerName,
      portraitIndex,
    });
    try {
      localStorage.setItem(LAST_LEADERBOARD_NAME_KEY, entry.playerName);
    } catch {
      // Score is already stored. Remembering the local name is optional.
    }
    elements.leaderboardName.value = entry.playerName;
    if (playerProfile) {
      const nextProfile = updatePlayerIdentity(playerProfile, entry.playerName, portraitIndex);
      if (nextProfile && writePlayerProfile(nextProfile)) {
        playerProfile = nextProfile;
        syncPlayerProfileUi();
      }
    }
    elements.leaderboardName.disabled = true;
    elements.leaderboardSubmit.textContent = "Saved";
    updateLeaderboardPortraitPreview(entry.playerName);
    elements.leaderboardSubmitStatus.textContent = COPY.leaderboard.saved(entry.rank, entry.score);
    roundResults.save(entry.rank, entry.score, renderEndLeaderboardComparison);
    // Keep progression UI in sync when an older restored win is submitted.
    revealEndNextBiomeAfterSave();
    void refreshLeaderboard();
  } catch (error) {
    elements.leaderboardSubmit.disabled = false;
    elements.leaderboardSubmit.textContent = "Retry save";
    elements.leaderboardSubmitStatus.textContent =
      error instanceof Error ? error.message : COPY.leaderboard.unavailable;
  } finally {
    leaderboardSubmissionPending = false;
  }
}

elements.endLeaderboardForm.addEventListener("submit", (event) => {
  event.preventDefault();
  void submitPreparedLeaderboardEntry();
});
function scheduleEditorRegeneration(): void {
  if (!localDevTools || engineMode === "play") return;
  void audio.unlock();
  window.clearTimeout(regenerateTimer);
  setEditorSurfaceStatus("runtime", "PLAY MAP · UPDATING", "updating");
  regenerateTimer = window.setTimeout(() => {
    elements.profileSelect.value = "custom";
    setRunSource("custom", false);
    void buildDungeon().then(() => {
      audio.play("forge");
    });
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
    void rebuildDungeonCovered(async () => {
      await buildDungeon();
      playCue("forge");
      setStatus(`Preset ${id} applied and regenerated.`);
    });
  });
});
elements.cameraSensitivity.addEventListener("input", applyCameraSettings);
elements.cameraMotion.addEventListener("input", applyCameraSettings);
elements.reroll.addEventListener("click", () => {
  if (!localDevTools) return;
  elements.seed.value = makeSeed();
  setRunSource("custom", false);
  void rebuildDungeonCovered(async () => {
    await buildDungeon();
    playCue("forge");
  });
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
      await buildDungeon(created.run.seed);
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
        await buildDungeon(hydrated.seed, {
          persistBuild: false,
          restore: planRunResumeRestore(d),
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
elements.welcomeHallToggle.addEventListener("click", () => {
  const expanded = !elements.welcomeLeaderboard.classList.contains("is-expanded");
  elements.welcomeLeaderboard.classList.toggle("is-expanded", expanded);
  elements.welcomeHallToggle.setAttribute("aria-expanded", String(expanded));
  const label = elements.welcomeHallToggle.firstElementChild;
  const arrow = elements.welcomeHallToggle.lastElementChild;
  if (label) label.textContent = expanded ? "HIDE HALL" : "VIEW HALL";
  if (arrow) arrow.textContent = expanded ? "↑" : "→";
});
elements.welcomeProfileEdit.addEventListener("click", () => {
  showPlayerProfileEditor(false);
});
elements.welcomeProfileBack.addEventListener("click", () => {
  showWelcomeHome();
  window.requestAnimationFrame(() => elements.welcomeProfileEdit.focus());
});
elements.welcomeProfileAvatar.addEventListener("click", () => {
  profileAvatarDraft = (profileAvatarDraft + 1) % LEADERBOARD_PORTRAIT_COUNT;
  const portrait = portraitForIndex(profileAvatarDraft);
  elements.welcomeProfileAvatarImage.src = portrait.src;
  elements.welcomeProfileAvatar.title = `Change avatar · ${portrait.title}`;
  playCue("mode");
});
elements.welcomeProfileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const startingNewGame = playerProfile === null;
  if (!persistPlayerIdentity(elements.welcomeProfileName.value, profileAvatarDraft)) {
    elements.welcomeProfileName.focus();
    return;
  }
  if (startingNewGame) {
    void audio.unlock();
    showBiomePicker();
  } else {
    elements.welcomeProfileStatus.textContent = "Player saved.";
    showWelcomeHome();
    window.requestAnimationFrame(() => elements.welcomeProfileEdit.focus());
  }
});
elements.biomePickerBack.addEventListener("click", () => {
  showWelcomeHome();
  window.requestAnimationFrame(() => elements.welcomeNew.focus());
});
elements.welcomeContinue.addEventListener("click", () => {
  void (async () => {
    const save = readLocalRunSave();
    const validSave = canContinueLocalRun(save) ? save : null;
    const recovery = continueRecoveryOverride;
    const state = recovery
      ? continueDomainState
      : validSave
        ? validSave.state
        : continueDomainState;
    if (!state) return;

    void audio.unlock();
    setWelcomeTransitionBusy(true, "Restoring saved dungeon…");
    // Two frames guarantee the busy state is painted before generation blocks the main thread.
    await waitAnimationFrames(2);
    try {
      setRunSource(recovery?.runSource ?? runSourceFromLocalSave(validSave), false);
      applyDungeonDomainToForm(state);
      const restore = planRunResumeRestore(state, recovery?.resume ?? validSave?.resume);
      forcedPlayMoodId = parseDungeonMoodId(restore.generation.campaignBiomeId);
      elements.seed.value = restore.generation.seed;
      await buildDungeon(restore.generation.seed, {
        persistBuild: true,
        restore,
      });
      await waitForRendererWarmup(10_000);
      runHasStarted = true;
      setWelcomeTransitionBusy(false);
      setWelcomeOpen(false);
      setEngineMode("play", { hydrate: false });
      localRunSave.schedule(0);
      setStatus(`Continued run · seed ${state.seed}. Click the scene to look.`);
    } catch (error) {
      console.warn("Could not restore saved dungeon", error);
      setWelcomeTransitionBusy(false, "Could not restore this run. Try again or start a new game.");
    }
  })();
});
elements.welcomeCustom.addEventListener("click", () => {
  void (async () => {
    void audio.unlock();
    continueRecoveryOverride = null;
    setWelcomeTransitionBusy(true, "Creating custom dungeon…");
    // Keep feedback visible even when procedural generation takes more than one frame.
    await waitAnimationFrames(2);
    try {
      forcedPlayMoodId = null;
      setRunSource("custom", false);
      const freshSeed = makeSeed();
      queueNewProceduralSeed();
      elements.seed.value = freshSeed;
      await buildDungeon(freshSeed);
      setWelcomeTransitionBusy(false);
      setWelcomeOpen(false);
      setEngineMode("editor", { hydrate: false });
      setEditorSurface("forge");
      setStatus("Custom run · practice only. Create a dungeon, then select PLAY.");
    } catch (error) {
      console.warn("Could not create custom dungeon", error);
      setWelcomeTransitionBusy(false, "Could not create a custom dungeon. Try again.");
    }
  })();
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
forgeFrameClient.onLoaded(() => {
  if (forgeIntake) return;
  setEditorSurfaceStatus("forge", "DUNGEON CREATION · BUILDING", "loading");
});
forgeFrameClient.onTrustedMessage((data) => {
  const intake = parseForgeDungeonMessage(data);
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

function updateUserSettings(patch: Partial<UserSettings>): void {
  userSettings = { ...userSettings, ...patch };
  writeUserSettings(userSettings);
}

function syncVolumeControl(
  input: HTMLInputElement,
  output: HTMLOutputElement,
  value: number,
): void {
  const percent = Math.round(value * 100);
  input.value = String(percent);
  output.value = `${percent}%`;
}

function syncTextureSmoothingUi(): void {
  setToggleValue(elements.textureSmoothingToggle, userSettings.textureSmoothing, "ON", "OFF");
  elements.textureSmoothingToggle.title = userSettings.textureSmoothing
    ? "Use crisp texture filtering"
    : "Use smooth texture filtering";
}

function applyVolumeInputs(): void {
  const musicVolume = Number(elements.musicVolume.value) / 100;
  const effectsVolume = Number(elements.effectsVolume.value) / 100;
  audio.setMusicVolume(musicVolume);
  audio.setEffectsVolume(effectsVolume);
  updateUserSettings({ musicVolume, effectsVolume });
  syncVolumeControl(elements.musicVolume, elements.musicVolumeValue, musicVolume);
  syncVolumeControl(elements.effectsVolume, elements.effectsVolumeValue, effectsVolume);
}

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
elements.musicVolume.addEventListener("input", applyVolumeInputs);
elements.effectsVolume.addEventListener("input", applyVolumeInputs);
elements.effectsVolume.addEventListener("change", () => playCue("uiTick"));
elements.textureSmoothingToggle.addEventListener("click", () => {
  const textureSmoothing = !userSettings.textureSmoothing;
  updateUserSettings({ textureSmoothing });
  const textureCount = applyTextureSmoothing(scene, textureSmoothing);
  syncTextureSmoothingUi();
  setStatus(`Texture smoothing ${textureSmoothing ? "on" : "off"} · ${textureCount} textures.`);
});
function syncCrtToggleUi(): void {
  elements.shell.classList.toggle("crt-off", !crtEnabled);
  setToggleValue(elements.crtToggle, crtEnabled, COPY.hud.crtOn, COPY.hud.crtOff);
  elements.crtToggle.title = crtEnabled ? "Turn CRT off" : "Turn CRT on";
}

// Apply capability default before first paint (toggle reflects Firefox/low-end path).
povPost.setCrtEnabled(crtEnabled);
syncCrtToggleUi();
syncAudioToggleUi();
syncVolumeControl(elements.musicVolume, elements.musicVolumeValue, userSettings.musicVolume);
syncVolumeControl(elements.effectsVolume, elements.effectsVolumeValue, userSettings.effectsVolume);
syncTextureSmoothingUi();

elements.crtToggle.addEventListener("click", () => {
  crtEnabled = !crtEnabled;
  crtManualOverride = true;
  crtAutoDisabled = false;
  povPost.setCrtEnabled(crtEnabled);
  syncCrtToggleUi();
  setStatus(crtEnabled ? "CRT on." : "CRT off.");
});
elements.retry.addEventListener("click", () => {
  void rebuildDungeonCovered(() => buildDungeon());
});
elements.newDungeon.addEventListener("click", () => {
  elements.seed.value = makeSeed();
  void rebuildDungeonCovered(() => buildDungeon());
});
elements.endHome.addEventListener("click", () => {
  returnToMainScreen();
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
  if (event.repeat) return;
  // Escape always owns pause, including while a range input has focus.
  if (!welcomeOpen && event.code === "Escape" && engineMode === "play") {
    event.preventDefault();
    if (mapExpanded) {
      toggleMap(false);
      return;
    }
    // While pointer-locked, the browser unlocks first; onLockChange opens options.
    // Do not also toggle here or the same Escape would open then immediately close.
    if (controller.getState().locked) return;
    if (optionsOpen) {
      resumePlay();
      // Escape often cannot re-lock; leave a clear click-to-continue cue.
      if (!controller.getState().locked && !touchSessionActive) {
        setStatus(COPY.status.pointerFailed);
      }
    } else if (suppressPauseOnPointerUnlock) {
      // Mid resume-pending (options closed, not locked): Escape re-opens pause.
      suppressPauseOnPointerUnlock = false;
      setOptionsOpen(true);
    } else {
      setOptionsOpen(true);
    }
    return;
  }
  if (event.target instanceof HTMLElement && event.target.closest("input, textarea, select"))
    return;
  if (welcomeOpen) return;
  if (event.code === "KeyM") {
    event.preventDefault();
    toggleMap();
  }
  if (event.code === "KeyR" && (engineMode !== "play" || optionsOpen)) {
    event.preventDefault();
    if (engineMode === "play" && optionsOpen) restartCurrentMap();
    else void rebuildDungeonCovered(() => buildDungeon());
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

interface PreparedFloorTransition {
  targetFloor: number;
  direction: "up" | "down";
  targetDungeon: DungeonData;
  floorCount: number;
  previousDomain: DungeonDomainState;
  resume: LocalRunResumeState;
  restore: RunResumeActivationPlan;
  runSource: RunSource;
}

const floorTransitions = new FloorTransitionDirector<PreparedFloorTransition>({
  prepare(request) {
    if (!campaignFloorSet || !dungeon?.floor) return { ok: false, reason: "not-ready" };
    if (
      !Number.isInteger(request.targetFloor) ||
      request.targetFloor < 0 ||
      request.targetFloor >= campaignFloorSet.count
    ) {
      return { ok: false, reason: "invalid-target" };
    }
    const currentFloor = dungeon.floor.index;
    const targetDungeon = campaignFloorSet.floor(request.targetFloor);
    const resume = captureLocalRunResume();
    if (!targetDungeon || !resume) return { ok: false, reason: "not-ready" };
    const entryStair = targetDungeon.floor?.stairs.find(
      (stair) => stair.targetFloor === currentFloor,
    );
    if (!entryStair) return { ok: false, reason: "missing-linked-stair" };

    const entry = gridToWorld(targetDungeon, entryStair.cell, TILE_SIZE);
    const previousDomain = currentDomainSave();
    const restore = planFloorTransition({
      domain: previousDomain,
      resume,
      destination: {
        floorIndex: request.targetFloor,
        entryCell: entryStair.cell,
        position: { x: entry.x, y: PLAYER_COMBAT_EYE_HEIGHT, z: entry.z },
        yaw: entryStair.yaw + Math.PI,
        pitch: 0,
      },
    });
    return {
      ok: true,
      value: {
        targetFloor: request.targetFloor,
        direction: request.direction,
        targetDungeon,
        floorCount: campaignFloorSet.count,
        previousDomain,
        resume,
        restore,
        runSource,
      },
    };
  },
  checkpoint() {
    return localRunSave.flush();
  },
  setInputBlocked(blocked) {
    floorTransitionInputBlocked = blocked;
    if (blocked) {
      controller.setEnabled(false);
      controller.releasePointerLock();
    } else {
      controller.setEnabled(canEnablePlayController());
    }
  },
  fade(opaque) {
    return setSceneFadeOpaque(opaque, { durationMs: opaque ? 180 : 240 });
  },
  async activate(prepared) {
    await activateDungeon(
      prepared.targetDungeon,
      `Floor ${prepared.targetFloor + 1} of ${prepared.floorCount}.`,
      readEditorParams(),
      { restore: prepared.restore },
    );
  },
  isTargetActive(prepared) {
    return dungeon === prepared.targetDungeon;
  },
  async warmup() {
    await waitForRendererWarmup(10_000);
    return elements.shell.dataset.rendererReady === "true" ? "ready" : "degraded";
  },
  present(prepared, checkpoint) {
    const portalOpen = playRuntime.state().quest.portalOpen;
    showObjectiveBanner(
      portalOpen && prepared.targetFloor === prepared.floorCount - 1
        ? COPY.objective.openPortal
        : `Floor ${prepared.targetFloor + 1}/${prepared.floorCount} · Find the remaining stones`,
      portalOpen ? "portal" : "hunt",
      2600,
      900,
    );
    setStatus(
      `${prepared.direction === "down" ? "Descended" : "Ascended"} to floor ${prepared.targetFloor + 1}/${prepared.floorCount}.${checkpoint === "saved" ? "" : " Local save unavailable."}`,
    );
  },
  recoverTarget(prepared, checkpoint) {
    runHasStarted = false;
    controller.setEnabled(false);
    setContinueCandidate(
      prepared.previousDomain,
      checkpoint === "saved" ? "Saved descent ready." : "Saved descent ready for this session.",
      { resume: prepared.resume, runSource: prepared.runSource },
      {
        runSeconds: prepared.resume.runSeconds,
        biomeId: prepared.resume.campaignBiomeId,
      },
    );
    setWelcomeOpen(true);
  },
});

/** Legacy fade transition retained for recovery tooling; play stairs are walkable. */
function transitionCampaignFloor(
  targetFloor: number,
  direction: "up" | "down",
): Promise<FloorTransitionResult> {
  return floorTransitions.start({ targetFloor, direction });
}
void transitionCampaignFloor;

async function descendFloor(): Promise<DungeonRuntimeState> {
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
  reset(seed?: string): Promise<DungeonRuntimeState>;
  primaryAction(): DungeonRuntimeState;
  toggleMap(forceExpanded?: boolean): void;
  setMode(mode: EngineMode): void;
  getDomain(): ReturnType<DomainBridge["getDungeon"]>;
  projectDomain(): ReturnType<DomainBridge["project"]>;
  descendFloor(): Promise<DungeonRuntimeState>;
}

window.__BLACK_FLAG_DUNGEON_ENGINE__ = api;
window.__BLACK_FLAG_PROTOTYPE__ = api;
window.__THREE_GAME_DIAGNOSTICS__ = {
  getState: getRuntimeState,
  getRenderer: getRendererDiagnostics,
  getScene: () => scene,
  getCamera: () => camera,
  getController: () => controller,
  getAudio: () => audio.getLoadDiagnostics(),
  getLoop: getThreeLoopDiagnostics,
};

// Three r185+ Timer API is absent from the pinned renderer; use a local delta clock.
let lastFrameMs = performance.now();
let damageHitActive = false;
let lastPaused = "";
let lastAudioFrameSync = Number.NEGATIVE_INFINITY;
let appDisposed = false;
let animationFrameId = 0;
let threeFrameCount = 0;
let threeRenderCount = 0;

function shouldRunThreeRenderLoop(): boolean {
  return !appDisposed && !welcomeOpen && document.visibilityState === "visible";
}

function syncThreeRenderLoop(): void {
  const shouldRun = shouldRunThreeRenderLoop();
  if (!shouldRun) {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animationFrameId = 0;
    return;
  }
  if (animationFrameId) return;
  lastFrameMs = performance.now();
  animationFrameId = requestAnimationFrame(frame);
}

function getThreeLoopDiagnostics(): { running: boolean; frames: number; renders: number } {
  return {
    running: animationFrameId !== 0 && shouldRunThreeRenderLoop(),
    frames: threeFrameCount,
    renders: threeRenderCount,
  };
}

function frame(now: number): void {
  animationFrameId = 0;
  if (!shouldRunThreeRenderLoop()) return;
  animationFrameId = requestAnimationFrame(frame);
  threeFrameCount += 1;
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
  controller.setMobilityBoost(world.mobilityBoostRemaining > 0);
  controller.setSlowCurse(world.isSlowCurseActive);
  controller.setControlMods({
    invertLook: world.isMirrorCurseActive,
    invertMove: world.isMirrorCurseActive,
    yawBias: world.isSpinCurseActive ? SPIN_CURSE_YAW_BIAS : 0,
    sensitivityScale: world.isSpinCurseActive ? SPIN_CURSE_SENSITIVITY_SCALE : 1,
  });
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
  // Multi-slab: rebind the logical floor from feet height (no scene rebuild).
  if (dungeon && campaignFloorSet && campaignFloorSet.count > 1 && player.cell) {
    const supportY = Math.max(0, player.position.y - PLAYER_COMBAT_EYE_HEIGHT);
    const nextIndex = activeFloorFromSupportY(supportY, campaignFloorSet.count);
    if (nextIndex !== (dungeon.floor?.index ?? 0)) {
      const nextDungeon = campaignFloorSet.floor(nextIndex);
      if (nextDungeon) {
        dungeon = nextDungeon;
        // Never call controller.setDungeon here — it teleports to spawn.
        floorExploration.switchFloor(nextDungeon, player.cell);
        controller.bindDungeon(nextDungeon);
        world.rebindActiveDungeon(nextDungeon);
        updateReadout();
        drawMap(true);
        const captured = domainBridge.captureBuild({
          seed: nextDungeon.seed,
          topologySignature: nextDungeon.topologySignature,
          ...readEditorParams(),
        });
        if (!captured.ok) {
          // Keep play going; save path may be stale until the next successful build capture.
        }
      }
    }
  }
  if (dungeon && player.cell) {
    const exploration = floorExploration.reveal(player.cell);
    if (exploration.cellChanged) syncDomainExplore();
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
    world.setPlayerTraversalState({ jumpHeight: player.jumpHeight });
    const step = playRuntime.step({
      delta,
      player: playerPosition,
      atExit: result.atExit,
      interactPressed: result.interactPressed || uiInteractQueued,
      mouseForwardHeld: result.mouseForwardHeld,
    });
    uiInteractQueued = false;
    const { worldUpdate, effects, state } = step;
    if (worldUpdate) {
      syncTimeFreezeHud(worldUpdate.timeFreezeRemaining);
      syncLuminousWardHud(worldUpdate.luminousWardRemaining);
      syncAnnihilationPulseHud(worldUpdate.annihilationPulseRemaining);
      syncCullBrandHud(worldUpdate.cullBrandRemaining);
      syncPhoenixHud(worldUpdate.phoenixCharges);
      syncFogClearHud(worldUpdate.fogClearRemaining);
      syncMobilityHud(worldUpdate.mobilityBoostRemaining);
      syncCurseHud({
        slow: worldUpdate.slowCurseRemaining,
        frenzy: worldUpdate.frenzyCurseRemaining,
        gloom: worldUpdate.gloomCurseRemaining,
        swarm: worldUpdate.swarmCurseActive,
        mirror: worldUpdate.mirrorCurseRemaining,
        spin: worldUpdate.spinCurseRemaining,
      });
      syncBiomeEvent(worldUpdate.biomeEvent);
      floorExploration.setMapRevealed(worldUpdate.mapRevealed);
      controller.setMobilityBoost(worldUpdate.mobilityBoostRemaining > 0);
      controller.setSlowCurse(worldUpdate.slowCurseRemaining > 0);
      controller.setControlMods({
        invertLook: worldUpdate.mirrorCurseRemaining > 0,
        invertMove: worldUpdate.mirrorCurseRemaining > 0,
        yawBias: worldUpdate.spinCurseRemaining > 0 ? SPIN_CURSE_YAW_BIAS : 0,
        sensitivityScale:
          worldUpdate.spinCurseRemaining > 0 ? SPIN_CURSE_SENSITIVITY_SCALE : 1,
      });
      controller.setSurfaceMovement(
        worldUpdate.surfaceEffect.movementScale,
        worldUpdate.surfaceEffect.traction,
      );
      syncHazardStatus(worldUpdate.surfaceEffect);
      const interactionPrompt = worldUpdate.interactionPrompt;
      elements.interactionPrompt.hidden = interactionPrompt === null;
      if (interactionPrompt) {
        const label = COPY.interaction.openChest;
        const text = elements.interactionPrompt.querySelector("span");
        if (text) text.textContent = label;
        elements.interactionPrompt.setAttribute("aria-label", label.toLowerCase());
      }
      // Walkable multi-slab stairs: no fade transition on height change.

      if (effects.questStonesFound !== undefined) {
        elements.shell.dataset.relic = effects.questPortalOpen ? "true" : "false";
        elements.shell.dataset.stones = String(effects.questStonesFound);
        updateObjective();
      }
      if (effects.sessionChanged) {
        domainBridge.syncSession(playRuntime.snapshot());
        localRunSave.schedule();
      }
      if (effects.status) setStatus(effects.status);
      if (effects.playPickup && effects.pickup) {
        audio.playPickup(worldUpdate.collectedPickup);
        if (effects.questPortalOpen) audio.playPortal(world.getAudioFrame().portal);
        showPickupFeedback(effects.pickup.label, effects.pickup);
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
      if (worldUpdate.cullBrandKill) {
        audio.playAnnihilationPulse(worldUpdate.cullBrandKill.position);
        hitTrauma = Math.max(hitTrauma, 0.42);
        flash("event");
      }
      if (effects.phoenixRevive) {
        world.applyPhoenixRevive(playerPosition);
        if (effects.phoenixCharges !== undefined) world.setPhoenixCharges(effects.phoenixCharges);
        syncPhoenixHud(0);
        audio.playAnnihilationPulse(playerPosition);
        hitTrauma = Math.max(hitTrauma, 0.55);
        flash("event");
        updateResolve();
      } else if (effects.phoenixCharges !== undefined) {
        world.setPhoenixCharges(effects.phoenixCharges);
        syncPhoenixHud(effects.phoenixCharges);
      }
      if (effects.playEnemyHit) {
        elements.shell.dataset.resolve = String(Math.ceil(state.resolve));
        const damageIntent = projectPlayStepDamage({
          enemyDamage: Math.max(0, worldUpdate.damage - worldUpdate.surfaceEffect.damage),
          surface: worldUpdate.surfaceEffect,
          hasAttacker: Boolean(worldUpdate.damageSource),
        });
        triggerDamageFeedback(worldUpdate.knockback, damageIntent.washKind);
        if (damageIntent.useAttackerAudio && worldUpdate.damageSource) {
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
  syncFogClearHud();
  syncMobilityHud();
  syncCurseHud();
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
    audio.playFootstep(
      footstepSurfaceAt(dungeon, result.cell),
      world.mobilityBoostRemaining > 0 ? MOBILITY_BOOST_FOOTSTEP_GAIN : 1,
    );
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
  const explorationView = floorExploration.activeView();
  // Clarity always wins over gloom when both windows overlap.
  let explorationFogMul = resolveExplorationFogMultiplier({
    exploredCount: explorationView.exploredCount,
    totalWalkableCells: dungeon?.stats.floorCount ?? 1,
    mapRevealed: explorationView.mapRevealed,
    // Fourth stone opens the portal and lifts the deep fog wall for the escape run.
    allStonesBound: playRuntime.state().quest.portalOpen,
    // Clarity phial temporarily opens the air without revealing the minimap.
    fogClearActive: world.isFogClearActive,
  });
  let lanternMul = 1;
  if (world.isGloomCurseActive && !world.isFogClearActive) {
    explorationFogMul *= GLOOM_CURSE_FOG_MULTIPLIER;
    lanternMul = GLOOM_CURSE_LANTERN_MULTIPLIER;
  }
  lighting.update(
    delta,
    playerPosition,
    currentThreatDistance,
    lanternForward,
    explorationFogMul,
    lanternMul,
  );

  // POV: close enemies shake a little; hits keep the lens unstable for a few seconds.
  const maxSpeed = PLAYER_MOVE_SPEED * PLAYER_SPRINT_MULT;
  const speedRatio = THREE.MathUtils.clamp(player.speed / maxSpeed, 0, 1);
  const feelTarget = computePovFeel({
    sprinting: player.sprinting && simulationActive,
    speedRatio: simulationActive ? speedRatio : 0,
    threatDistance: simulationActive ? currentThreatDistance : null,
    hitTrauma: simulationActive ? hitTrauma : 0,
    exhaustionTrauma: simulationActive ? exhaustionTrauma : 0,
    // Ease the tail out over the last ~1.5s instead of cutting the FX cold.
    mobilityBoost: simulationActive ? Math.min(1, world.mobilityBoostRemaining / 1.5) : 0,
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
  if (engineMode === "play") {
    const previousCrtEnabled = crtEnabled;
    const nextCrt = stepAdaptiveCrt(
      { enabled: crtEnabled, autoDisabled: crtAutoDisabled },
      {
        frameMs: smoothedFrameMs,
        disableMs: renderCaps.adaptiveCrtDisableMs,
        manualOverride: crtManualOverride,
        enableByDefault: renderCaps.enableCrtByDefault,
      },
    );
    crtEnabled = nextCrt.enabled;
    crtAutoDisabled = nextCrt.autoDisabled;
    // Match pre-extraction host: only push presentation when enabled flips.
    // Recover-to-off clears the latch without a redundant CRT toggle sync.
    if (crtEnabled !== previousCrtEnabled) {
      povPost.setCrtEnabled(crtEnabled);
      syncCrtToggleUi();
    }
  }
  elements.shell.dataset.criticalHealth = String(criticalHealth.active);
  povPost.setParams(
    feel.curvature,
    feel.chromatic,
    simulationActive ? criticalHealth.redTint : 0,
    // Reduced motion: drop animated grain entirely so frozen hash noise does
    // not sit as static dirt. Normal path stays a light living film grade.
    reducedMotion ? 0 : 0.0065,
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
    lastMapDraw = now;
    localRunSave.schedule();
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
    elements.debugFloor.textContent = dungeon?.floor
      ? `${dungeon.floor.number}/${dungeon.floor.count}`
      : "1/1";
    elements.debugRooms.textContent = String(dungeon?.stats.roomCount ?? 0);
    elements.debugDoors.textContent = String(
      Math.floor((dungeon?.topology?.doorways.length ?? 0) / 2),
    );
    elements.debugEnemies.textContent = `${world.stats.enemies}/${world.stats.enemies + world.stats.reserveEnemies}`;
    elements.debugMode.textContent =
      frameMs <= 18 ? "FRAME OK" : frameMs <= 28 ? "FRAME WARN" : "FRAME HOT";
    elements.debugPanel.dataset.frameState = frameMs <= 18 ? "ok" : frameMs <= 28 ? "warn" : "hot";
    lastDebugDraw = now;
  }
  if (renderWarmupReady) {
    povPost.render(renderer, scene, camera);
  } else {
    renderer.setRenderTarget(null);
    renderer.clear();
  }
  threeRenderCount += 1;
  lastRenderSnapshot.calls = renderer.info.render.calls;
  lastRenderSnapshot.triangles = renderer.info.render.triangles;
  lastRenderSnapshot.points = renderer.info.render.points;
  lastRenderSnapshot.lines = renderer.info.render.lines;
  publishPerformanceDiagnostics(now);
}

window.addEventListener("pagehide", clearTouchSession);
window.addEventListener("pagehide", () => localRunSave.flush());
document.addEventListener("visibilitychange", clearTouchSessionWhenHidden);
document.addEventListener("visibilitychange", flushLocalRunSaveWhenHidden);
document.addEventListener("visibilitychange", syncThreeRenderLoop);
window.addEventListener("beforeunload", () => {
  if (appDisposed) return;
  appDisposed = true;
  cancelAnimationFrame(animationFrameId);
  localRunSave.flush();
  localRunSave.dispose();
  runIntroDirector.dispose();
  forgeFrameClient.dispose();
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

function waitAnimationFrames(count: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    let left = Math.max(1, count);
    let frameId = 0;
    const done = (): void => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", done);
      if (frameId) window.cancelAnimationFrame(frameId);
      resolve();
    };
    const step = (): void => {
      left -= 1;
      if (left <= 0) done();
      else frameId = window.requestAnimationFrame(step);
    };
    signal?.addEventListener("abort", done, { once: true });
    frameId = window.requestAnimationFrame(step);
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

async function waitForRendererWarmup(timeoutMs = 6_000, signal?: AbortSignal): Promise<void> {
  if (renderWarmupReady || signal?.aborted) return;
  const started = performance.now();
  while (!renderWarmupReady && !signal?.aborted && performance.now() - started < timeoutMs) {
    // Race a short timer so a stalled rAF cannot freeze the load cover forever.
    await Promise.race([waitAnimationFrames(1, signal), waitMs(32, signal)]);
  }
  if (!renderWarmupReady && !signal?.aborted) {
    // Parent covers must still be able to lift. Mark ready so Play can continue.
    renderWarmupReady = true;
    elements.shell.dataset.rendererReady = "timeout";
    controller.setEnabled(canEnablePlayController());
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
    // Some browsers return focus to body when the covering boot region becomes
    // hidden. Restore the first real menu action after that observable milestone.
    if (welcomeOpen) focusWelcomeEntry();
  }, 480);
}

function consumeShellIntent(): void {
  const intent = window.__DUNGEON_SHELL_INTENT__;
  delete window.__DUNGEON_SHELL_INTENT__;
  if (!intent) return;
  if (intent.type === "profile-submit") {
    profileAvatarDraft = intent.avatarIndex;
    elements.welcomeProfileName.value = intent.profileName;
    elements.welcomeProfileAvatarImage.src = portraitForIndex(profileAvatarDraft).src;
    elements.welcomeProfileForm.requestSubmit();
    return;
  }
  document.getElementById(intent.targetId)?.click();
}

resize();
applyCameraSettings();
setBootProgress(0.12, "Binding audio…");
// Restore music preference before the welcome bed is requested.
audio.setMusicMuted(readStoredMusicMuted());
syncMusicToggleUi();
// Welcome owns the first choice. New Game starts play; Custom Run opens Creation.
const visualQaState = launchConfig.visualQa.state;
setBootProgress(0.28, visualQaState ? "Forging the QA map…" : "Opening the hall…");
// The welcome screen does not need either WebGL world. Keep the runtime canvas
// empty and the Forge iframe unmounted until the player chooses a real route.
setEditorSurface("runtime");
setEngineMode("editor", { hydrate: false, persist: false });
// Keep welcome closed only while its font and cover art settle.
setWelcomeOpen(false);
const localContinue = readLocalRunSave();
if (canContinueLocalRun(localContinue)) {
  // Continue builds only after the player asks for it; parsing the validated
  // save is enough to render the menu and keeps first choice immediate.
  setContinueCandidate(localContinue.state, "Saved descent ready.", null, {
    runSeconds: localContinue.resume?.runSeconds,
    savedAt: localContinue.savedAt,
    biomeId: localContinue.resume?.campaignBiomeId,
  });
} else {
  setContinueCandidate(null, "No active saved run. Start a new descent.");
}
if (visualQaState) {
  // Deterministic visual-QA URLs intentionally own a live world at boot.
  setBootProgress(0.55, "Warming the renderer…");
  void (async () => {
    await buildDungeon(urlSeed, { persistBuild: false });
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
    setBootProgress(0.8, "Loading type…");
    await Promise.all([
      document.fonts.ready.catch(() => undefined),
      preloadImage("/assets/ui/biome-screens/ancient-main.webp"),
      preloadImage(elements.endArt.src),
      waitForRendererWarmup(renderCaps.rendererReadyTimeoutMs),
    ]);
    await waitAnimationFrames(2);
    await dismissBootScreen();
    consumeShellIntent();
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
          setContinueCandidate(hydrated.state, "Saved descent ready.", null, {
            biomeId: forcedPlayMoodId ?? undefined,
          });
          setStatus(`Saved run ready · seed ${hydrated.seed}`);
        } else if (!continueDomainState) {
          setContinueCandidate(null, "No active saved run. Start a new descent.");
        }
        await refreshRunSelect();
      } else if (!continueDomainState) {
        setContinueCandidate(null, "No active saved run. Start a new descent.");
      }
    } catch (error) {
      console.warn("Boot hydrate failed", error);
    }
    setBootProgress(0.8, "Loading type and art…");
    await Promise.all([
      document.fonts.ready.catch(() => undefined),
      preloadImage("/assets/ui/biome-screens/ancient-main.webp"),
    ]);
    setBootProgress(0.96, "Opening the hall…");
    await waitAnimationFrames(2);
    setWelcomeOpen(true);
    await dismissBootScreen();
    consumeShellIntent();
  })();
}
syncThreeRenderLoop();
