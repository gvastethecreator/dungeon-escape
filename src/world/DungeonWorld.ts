import * as THREE from "three";
import type { CreatureVoice, DungeonAudioFrame } from "../audio/GameAudio";
import { gridToWorld, worldToGridInto, type WorldCollider } from "../dungeon/gridCollision";
import type { DungeonData, GridCell } from "../dungeon/types";
import { isPlayerAirborneFromJumpHeight } from "../player/CombatPose";
import { creatureVoiceForEnemy, projectDungeonAudioFrame } from "./DungeonAudioFrame";
import {
  canCollectPickup,
  canInteractWithChest,
  horizontalDistance,
  shouldOpenChest,
} from "./InteractionReach";
import { DOOR_DEFAULT_OPEN_DISTANCE, resolveDoorTargetOpen } from "./DoorOpenPolicy";
import { updateDoorLeafPresentation } from "./DoorLeafPresentation";
import { beginChestRewardReveal, updateChestPresentation } from "./ChestPresentation";
import { updateCollectedPickupMotion, updateIdlePickupMotion } from "./PickupMotionPresentation";
import {
  composeDifficultyWithBiomeEvent,
  composeHazardWithBiomeEvent,
} from "../systems/BiomeEventSurface";
import type { ResidentMinimapProjection } from "../ui/projectMinimapFeatures";
import { AssetLibrary } from "./AssetLibrary";
import { createDungeonMaterials, disposeDungeonMaterials } from "./MaterialLibrary";
import {
  createRoomSurfaceMaterials,
  disposeRoomSurfaceMaterials,
  type SceneTextureCloneSink,
} from "./RoomSurfaceMaterials";
import { setPickupDormant, setPickupOpacity } from "./ItemFactory";
import { PickupBurstPool } from "./PickupBurstPool";
import {
  createEnemyContactShadowMaterial,
  disposeEnemyContactShadowMaterial,
} from "./EnemyBillboardMaterial";
import type { DungeonMood } from "../systems/DungeonMood";
import { getDungeonMood } from "../systems/DungeonMood";
import type { DungeonLoadPhaseObserver } from "../systems/DungeonLoadTrace";
import { sampleBiomeEvent, type BiomeEventSnapshot } from "../systems/BiomeEventDirector";
import {
  DEFAULT_DIFFICULTY,
  resolveDifficultySnapshot,
  type DifficultySnapshot,
} from "../game/DifficultyDirector";
import type { HazardSurfaceEffect } from "./HazardTileSystem";
import { magicStoneIds } from "./MagicStoneKit";
import {
  isInsideMagicPortal,
  setMagicPortalOpen,
  setMagicPortalWarmupVisible,
  updateMagicPortal,
} from "./MagicPortalKit";
import type { StoneId } from "../ui/copy";
import { STONE_ORDER } from "../ui/copy";
import type { MinimapFeatures } from "../ui/minimapFeatures";
import { WORLD_TILE_SIZE, WORLD_WALL_HEIGHT } from "./WorldMetrics";
import { ThreeResourceDisposer } from "./ThreeResourceDisposer";
import { TimeFreezeVfx } from "./TimeFreezeVfx";
import { EnemyMotionTrailVfx } from "./EnemyMotionTrailVfx";
import {
  activateAnnihilationPulse,
  annihilationPulseHitsEnemy,
  ANNIHILATION_PULSE_REPEL_RADIUS,
  ANNIHILATION_PULSE_REPEL_SPEED_MULTIPLIER,
} from "../game/AnnihilationPulse";
import { AnnihilationPulseVfx } from "./AnnihilationPulseVfx";
import { LUMINOUS_WARD_REPEL_RADIUS } from "../game/LuminousWard";
import { LuminousWardVfx } from "./LuminousWardVfx";
import { MobilityBoostVfx } from "./MobilityBoostVfx";
import {
  FRENZY_CURSE_ATTACK_RATE_MULTIPLIER,
  FRENZY_CURSE_DETECTION_MULTIPLIER,
  FRENZY_CURSE_SPEED_MULTIPLIER,
} from "../game/FrenzyCurse";
import { CULL_BRAND_MIN_PHASE_VISIBILITY, tryConsumeCullBrand } from "../game/CullBrand";
import { clampPhoenixCharges, hasPhoenixCharge } from "../game/PhoenixEgg";
import {
  applyPickupToRunPowers,
  createRunPowerRuntime,
  isAnnihilationPulseOn,
  isCullBrandOn,
  isFogClearOn,
  isFrenzyCurseOn,
  isGloomCurseOn,
  isLuminousWardOn,
  isMirrorCurseOn,
  isMobilityBoostOn,
  isSlowCurseOn,
  isSpinCurseOn,
  isSwarmCurseOn,
  isTimeFreezeOn,
  resetRunPowerRuntime,
  restoreRunPowerRuntime,
  tickRunPowerRuntime,
} from "../game/RunPowerRuntime";
import { CullBrandVfx } from "./CullBrandVfx";
import { ControlCurseVfx } from "./ControlCurseVfx";
import { PhoenixEggVfx } from "./PhoenixEggVfx";
import { StaticResourceCatalog, type StaticResourceCatalogSnapshot } from "./StaticResourceCatalog";
import { type ResidentFloorRuntime, type ResidentFloorRuntimeOwner } from "./ResidentFloorRuntime";
import { ENEMY_ROSTER } from "./EnemySpriteAtlas";
import {
  ResidentEnemyRuntimeOwner,
  type ResidentEnemyActivationInput,
  type ResidentEnemyActor,
  type ResidentEnemyRuntime,
} from "./ResidentEnemyRuntime";
import {
  clearStaticPropTemplateBatchCache,
  StaticDungeonScene,
  type StaticChestActor,
  type StaticDungeonSceneHandles,
  type StaticDungeonSceneStats,
  type StaticFireEffect,
  type StaticPickupActor,
  type StaticPickupKind,
} from "./StaticDungeonScene";
import { createResidentDungeonPlan, type ResidentDungeonPlan } from "./ResidentDungeonPlan";

export { knockbackAwayFrom } from "./knockback";

type EnemyActor = ResidentEnemyActor;

export interface WorldUpdate {
  /** @deprecated use collectedStoneId — kept for domain bridge “all stones” */
  collectedRelic: boolean;
  collectedStoneId: StoneId | null;
  /** Every stone bound in this simulation update; prevents world/quest count drift. */
  collectedStoneIds: readonly StoneId[];
  /** Position is kept for the presentation layer that plays the collection source. */
  collectedPickup: {
    kind: StaticPickupKind;
    position: { x: number; y: number; z: number };
  } | null;
  /** Remaining gameplay seconds in the active time-freeze field. */
  timeFreezeRemaining: number;
  /** Remaining gameplay seconds in the active luminous ward field. */
  luminousWardRemaining: number;
  /** Remaining gameplay seconds in the active annihilation pulse field. */
  annihilationPulseRemaining: number;
  /** True after the map pickup reveals fog-of-war for this floor. */
  mapRevealed: boolean;
  /** Active speed/stamina/trap-immunity window. */
  mobilityBoostRemaining: number;
  /** Temporary fog-clear / clarity window (seconds). */
  fogClearRemaining: number;
  /** Timed player slowdown curse. */
  slowCurseRemaining: number;
  /** Timed enemy frenzy curse. */
  frenzyCurseRemaining: number;
  /** Timed darkness curse. */
  gloomCurseRemaining: number;
  /** Sticky floor swarm pressure (doubles active monster demand). */
  swarmCurseActive: boolean;
  /** Cull brand window remaining (seconds) while a charge is held. */
  cullBrandRemaining: number;
  /** Timed look+move invert curse. */
  mirrorCurseRemaining: number;
  /** Timed yaw-bias disorientation curse. */
  spinCurseRemaining: number;
  /** Pulse ring event; hits are already removed from the enemy seats. */
  annihilationPulse: {
    position: { x: number; y: number; z: number };
    hits: number;
  } | null;
  /** Contact brand spent this tick; seat already reserved. */
  cullBrandKill: {
    position: { x: number; y: number; z: number };
  } | null;
  /** Armed phoenix charges (0 or 1) after this update. */
  phoenixCharges: number;
  stonesFound: number;
  stonesTotal: number;
  portalOpen: boolean;
  resolveGain: number;
  damage: number;
  damageSource: {
    position: { x: number; y: number; z: number };
    voice: CreatureVoice;
  } | null;
  surfaceEffect: HazardSurfaceEffect;
  doorSound: {
    kind: "open" | "close";
    position: { x: number; y: number; z: number };
  } | null;
  chestSound: { position: { x: number; y: number; z: number } } | null;
  interactionPrompt: "open-chest" | null;
  /** @deprecated Walkable stairs no longer emit transitions. Always null. */
  floorTransition: {
    direction: "up" | "down";
    targetFloor: number;
  } | null;
  /** Deterministic biome pressure window derived from the run clock. */
  biomeEvent: BiomeEventSnapshot;
  /** Unit XZ push away from the attacker(s); null when no hit this frame. */
  knockback: { x: number; z: number } | null;
  reachedLockedExit: boolean;
  reachedOpenExit: boolean;
  nearestThreat: number | null;
}

interface DungeonWorldLoadOptions {
  carryPhoenix?: boolean;
  stack?: readonly DungeonData[];
  loadTrace?: DungeonLoadPhaseObserver;
}

interface DungeonWorldTextureLifecycle {
  active: boolean;
  textureSink?: SceneTextureCloneSink;
}

interface DungeonWorldOptions {
  tileSize?: number;
  wallHeight?: number;
  textureRegistry?: SceneTextureCloneSink;
}

export { creatureVoiceForEnemy } from "./DungeonAudioFrame";

function nearestEnemyDistance(enemies: readonly EnemyActor[], player: THREE.Vector3): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (const enemy of enemies) {
    if (enemy.scaleX <= 0.001 || enemy.scaleY <= 0.001) continue;
    nearest = Math.min(nearest, horizontalDistance(enemy.position, player));
  }
  return nearest;
}

export class DungeonWorld {
  readonly stats: StaticDungeonSceneStats;
  private readonly scene: THREE.Scene;
  private readonly tileSize: number;
  private readonly wallHeight: number;
  private readonly group = new THREE.Group();
  private readonly assets: AssetLibrary;
  private readonly materials: ReturnType<typeof createDungeonMaterials>;
  private readonly surfaceMaterials: ReturnType<typeof createRoomSurfaceMaterials>;
  private readonly textureLifecycle: DungeonWorldTextureLifecycle;
  private readonly staticResourceCatalog = new StaticResourceCatalog();
  private readonly staticScene: StaticDungeonScene;
  private disposed = false;
  private staticHandles: StaticDungeonSceneHandles = StaticDungeonScene.emptyHandles();
  /** Canonical resident lookup for rebinds. Aggregate scene handles stay legacy-only. */
  private readonly residentFloorRuntimesByIndex = new Map<number, ResidentFloorRuntime>();
  /** Interactions update this owner only. Rebind changes this pointer without rebuilding. */
  private activeFloorRuntime: ResidentFloorRuntime | null = null;
  /** Enemy ownership follows the static resident floor owner exactly once. */
  private readonly residentEnemyRuntimesByIndex = new Map<number, ResidentEnemyRuntimeOwner>();
  /** Rebind swaps this pointer. Inactive slabs never simulate or present enemies. */
  private activeEnemyRuntime: ResidentEnemyRuntimeOwner | null = null;
  private readonly enemyShadowMaterial: THREE.MeshBasicMaterial;
  private pickupBurstPool: PickupBurstPool | null = null;
  private timeFreezeVfx: TimeFreezeVfx | null = null;
  private enemyMotionTrailVfx: EnemyMotionTrailVfx | null = null;
  private luminousWardVfx: LuminousWardVfx | null = null;
  private mobilityBoostVfx: MobilityBoostVfx | null = null;
  private annihilationPulseVfx: AnnihilationPulseVfx | null = null;
  private readonly pickupBurstWarmupPosition = new THREE.Vector3();
  /** Reused only for immediate world-coordinate reads from resident floor roots. */
  private readonly residentWorldPosition = new THREE.Vector3();
  private dungeon: DungeonData | null = null;
  private readonly emptyMinimapFeatures: MinimapFeatures = {
    doors: [],
    fires: [],
    enemies: [],
    stones: [],
    pickups: [],
    spawn: { x: 0, y: 0 },
  };
  private minimapFeatures: MinimapFeatures = this.emptyMinimapFeatures;
  /** Active cached projection; rebinds replace only this pointer. */
  private activeMinimapProjection: ResidentMinimapProjection | null = null;
  private minimapFeatureRevision = 0;
  private readonly collectedStones = new Set<StoneId>();
  private portalOpen = false;
  private readonly audioFrame: DungeonAudioFrame = {
    fires: [],
    magicStones: [],
    enemies: [],
    portal: null,
    moodId: null,
  };
  private lockedExitCooldown = 0;
  private elapsed = 0;
  private readonly powers = createRunPowerRuntime();
  private cullBrandVfx: CullBrandVfx | null = null;
  private controlCurseVfx: ControlCurseVfx | null = null;
  private phoenixEggVfx: PhoenixEggVfx | null = null;
  private playerAirborne = false;
  private readonly stoneTextures = new Map<StoneId, THREE.Texture>();
  private activeMood: DungeonMood = getDungeonMood("ash");
  private decorDensity = 0.6;
  private difficulty = DEFAULT_DIFFICULTY;
  private readonly emptyDifficultyState: DifficultySnapshot = resolveDifficultySnapshot(
    DEFAULT_DIFFICULTY,
    0,
    1,
    0,
    0,
  );

  constructor(
    scene: THREE.Scene,
    {
      tileSize = WORLD_TILE_SIZE,
      wallHeight = WORLD_WALL_HEIGHT,
      textureRegistry,
    }: DungeonWorldOptions = {},
  ) {
    this.scene = scene;
    this.tileSize = tileSize;
    this.wallHeight = wallHeight;
    this.textureLifecycle = { active: true, textureSink: textureRegistry };
    this.assets = new AssetLibrary(textureRegistry);
    this.materials = createDungeonMaterials({
      compact: typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches,
      textureSink: textureRegistry,
    });
    this.surfaceMaterials = createRoomSurfaceMaterials(
      {
        floor: this.assets.floor,
        wall: this.assets.wall,
        ceiling: this.assets.ceiling,
        semanticFloors: {
          grave: this.assets.floorCrypt,
          shrine: this.assets.floorShrine,
          treasure: this.assets.floorTreasure,
          boss: this.assets.floorBoss,
        },
        semanticWalls: {
          grave: this.assets.wallCrypt,
          shrine: this.assets.wallShrine,
          treasure: this.assets.wallTreasure,
          elite: this.assets.wallBoss,
          boss: this.assets.wallBoss,
        },
      },
      textureRegistry,
    );
    this.enemyShadowMaterial = createEnemyContactShadowMaterial(textureRegistry);
    this.group.name = "Dungeon Escape world";
    this.scene.add(this.group);
    this.staticScene = new StaticDungeonScene({
      group: this.group,
      assets: this.assets,
      materials: this.materials,
      surfaceMaterials: this.surfaceMaterials,
      tileSize: this.tileSize,
      wallHeight: this.wallHeight,
      stoneTextures: this.stoneTextures,
      resourceCatalog: this.staticResourceCatalog,
      textureSink: textureRegistry,
    });
    this.staticHandles = this.staticScene.currentHandles;
    this.stats = this.staticScene.stats;
  }

  private borrowStaticHandles(handles: StaticDungeonSceneHandles, activeFloorIndex: number): void {
    this.staticHandles = handles;
    this.residentFloorRuntimesByIndex.clear();
    for (const runtime of handles.residentFloors) {
      this.residentFloorRuntimesByIndex.set(runtime.floorIndex, runtime);
    }
    this.bindActiveFloorRuntime(activeFloorIndex);
  }

  private releaseStaticHandles(): void {
    this.activeFloorRuntime = null;
    this.activeEnemyRuntime = null;
    this.activeMinimapProjection = null;
    this.residentFloorRuntimesByIndex.clear();
    this.residentEnemyRuntimesByIndex.clear();
    this.staticHandles = StaticDungeonScene.emptyHandles();
  }

  private bindActiveFloorRuntime(floorIndex: number): void {
    const requested = Number.isFinite(floorIndex) ? Math.floor(floorIndex) : 0;
    const runtime = this.residentFloorRuntimesByIndex.get(requested) ?? null;
    this.activeFloorRuntime = runtime;
    this.staticScene.setActiveFloor(runtime?.floorIndex ?? requested);
    this.bindActiveMinimapProjection(runtime);
    this.bindActiveEnemyRuntime(runtime?.floorIndex ?? requested);
  }

  private bindActiveEnemyRuntime(floorIndex: number): void {
    const requested = Number.isFinite(floorIndex) ? Math.floor(floorIndex) : 0;
    const runtime = this.residentEnemyRuntimesByIndex.get(requested) ?? null;
    if (this.activeEnemyRuntime === runtime) return;
    for (const candidate of this.residentEnemyRuntimesByIndex.values()) {
      candidate.setActive(candidate === runtime);
    }
    this.activeEnemyRuntime = runtime;
    const slabY = runtime?.floorSlabY ?? 0;
    if (this.enemyMotionTrailVfx) {
      this.enemyMotionTrailVfx.root.position.y = slabY;
      this.enemyMotionTrailVfx.resetForRebind();
    }
    if (this.timeFreezeVfx) {
      this.timeFreezeVfx.root.position.y = slabY;
      this.timeFreezeVfx.resetForRebind();
    }
  }

  /** Stable RDL-14 owner seam for consumers that need active-floor state. */
  getActiveFloorRuntime(): ResidentFloorRuntime | null {
    return this.activeFloorRuntime;
  }

  /** Stable RDL-15 owner seam for active, floor-local enemy state. */
  getActiveEnemyRuntime(): ResidentEnemyRuntime | null {
    return this.activeEnemyRuntime;
  }

  /** Read-only lookup for resident enemy diagnostics and focused tests. */
  getResidentEnemyRuntime(floorIndex: number): ResidentEnemyRuntime | null {
    const requested = Number.isFinite(floorIndex) ? Math.floor(floorIndex) : 0;
    return this.residentEnemyRuntimesByIndex.get(requested) ?? null;
  }

  /** Per-floor build accounting. This allocates only for explicit diagnostics. */
  getResidentEnemyBuildDiagnostics(): readonly {
    floorIndex: number;
    seats: number;
    active: number;
    reserve: number;
    rawBatches: number;
    buildDurationMs: number;
  }[] {
    return [...this.residentEnemyRuntimesByIndex.values()].map((runtime) => ({
      floorIndex: runtime.floorIndex,
      seats: runtime.seatCount,
      active: runtime.activeCount,
      reserve: runtime.reserveCount,
      rawBatches: runtime.rawBatchCount,
      buildDurationMs: runtime.buildDurationMs,
    }));
  }

  /** Compatibility read views. They always point at the active runtime. */
  private get enemies(): readonly EnemyActor[] {
    return this.activeEnemyRuntime?.actors ?? [];
  }

  get enemyReserve(): readonly EnemyActor[] {
    return this.activeEnemyRuntime?.reserveActors ?? [];
  }

  private get pickups(): StaticPickupActor[] {
    return this.staticHandles.pickups;
  }

  private get fireEffects(): readonly StaticFireEffect[] {
    return this.activeFloorRuntime?.fires ?? [];
  }

  private get solidCells(): Map<string, GridCell> {
    return this.staticHandles.solidCells;
  }

  private get solidColliders(): WorldCollider[] {
    return this.staticHandles.solidColliders;
  }

  private get portalRoot(): THREE.Group | null {
    return this.staticHandles.portalRoot;
  }

  private get exitPosition(): THREE.Vector3 {
    return this.staticHandles.exitPosition;
  }

  private set portalRoot(value: THREE.Group | null) {
    this.staticHandles.portalRoot = value;
  }

  private get portalBeam(): THREE.Mesh | null {
    return this.staticHandles.portalBeam;
  }

  private set portalBeam(value: THREE.Mesh | null) {
    this.staticHandles.portalBeam = value;
  }

  private get portalLight(): THREE.PointLight | null {
    return this.staticHandles.portalLight;
  }

  private set portalLight(value: THREE.PointLight | null) {
    this.staticHandles.portalLight = value;
  }

  private worldPositionOf(object: THREE.Object3D): THREE.Vector3 {
    return object.getWorldPosition(this.residentWorldPosition);
  }

  /**
   * Replace the active floor. Sync path for tests and callers that already
   * own their own frame scheduling.
   */
  setDungeon(
    dungeon: DungeonData,
    mood: DungeonMood = getDungeonMood("ash"),
    options: DungeonWorldLoadOptions = {},
  ): void {
    // Floor transitions pass carryPhoenix so loot planning can skip a second egg.
    const carryPhoenix = options.carryPhoenix ? this.powers.phoenixCharges : 0;
    this.clear();
    this.powers.phoenixCharges = carryPhoenix;
    this.populateDungeon(dungeon, mood, options.stack, options.loadTrace);
  }

  /**
   * Point simulation at another slab of an already-built multi-floor stack.
   * Does not rebuild meshes or colliders.
   */
  rebindActiveDungeon(dungeon: DungeonData): void {
    this.dungeon = dungeon;
    this.bindActiveFloorRuntime(dungeon.floor?.index ?? 0);
  }

  /**
   * Same as `setDungeon`, but yields after disposing the previous floor so the
   * browser can paint the load cover and reclaim GPU memory before the next
   * architecture + actor build. Used by successive map loads in a long session.
   */
  async setDungeonWithYield(
    dungeon: DungeonData,
    mood: DungeonMood,
    yieldToMain: () => Promise<void>,
    options: DungeonWorldLoadOptions = {},
  ): Promise<void> {
    const carryPhoenix = options.carryPhoenix ? this.powers.phoenixCharges : 0;
    this.clear();
    this.powers.phoenixCharges = carryPhoenix;
    await yieldToMain();
    await this.populateDungeonWithYield(
      dungeon,
      mood,
      yieldToMain,
      options.stack,
      options.loadTrace,
    );
  }

  private populateDungeon(
    dungeon: DungeonData,
    mood: DungeonMood,
    stack?: readonly DungeonData[],
    loadTrace?: DungeonLoadPhaseObserver,
  ): void {
    const { residentFloors, residentPlan } = this.prepareDungeonPopulation(
      dungeon,
      mood,
      stack,
      loadTrace,
    );
    loadTrace?.begin("sceneCommit");
    try {
      const staticHandles =
        residentFloors.length > 1
          ? this.staticScene.buildStack(residentFloors, mood, this.decorDensity, residentPlan)
          : this.staticScene.build(dungeon, mood, this.decorDensity, residentPlan);
      this.borrowStaticHandles(staticHandles, dungeon.floor?.index ?? 0);
    } finally {
      loadTrace?.end("sceneCommit");
    }
    this.finishDungeonPopulation(dungeon, residentFloors, loadTrace);
  }

  private async populateDungeonWithYield(
    dungeon: DungeonData,
    mood: DungeonMood,
    yieldToMain: () => Promise<void>,
    stack?: readonly DungeonData[],
    loadTrace?: DungeonLoadPhaseObserver,
  ): Promise<void> {
    const { residentFloors, residentPlan } = this.prepareDungeonPopulation(
      dungeon,
      mood,
      stack,
      loadTrace,
    );
    loadTrace?.begin("sceneCommit");
    try {
      const staticHandles =
        residentFloors.length > 1
          ? await this.staticScene.buildStackWithYield(
              residentFloors,
              mood,
              this.decorDensity,
              yieldToMain,
              residentPlan,
            )
          : this.staticScene.build(dungeon, mood, this.decorDensity, residentPlan);
      this.borrowStaticHandles(staticHandles, dungeon.floor?.index ?? 0);
    } finally {
      loadTrace?.end("sceneCommit");
    }
    this.finishDungeonPopulation(dungeon, residentFloors, loadTrace);
  }

  private prepareDungeonPopulation(
    dungeon: DungeonData,
    mood: DungeonMood,
    stack?: readonly DungeonData[],
    loadTrace?: DungeonLoadPhaseObserver,
  ): { residentFloors: readonly DungeonData[]; residentPlan: ResidentDungeonPlan } {
    this.dungeon = dungeon;
    this.activeMood = mood;
    // Skip a second egg if the player already carries a phoenix charge.
    const phoenixArmed = hasPhoenixCharge(this.powers.phoenixCharges);
    this.staticScene.setPhoenixArmedForNextBuild(phoenixArmed);
    this.collectedStones.clear();
    this.portalOpen = false;
    this.lockedExitCooldown = 0;
    this.elapsed = 0;
    // Preserve phoenix when setDungeon restored a carried charge after clear().
    resetRunPowerRuntime(this.powers, { carryPhoenix: true });
    this.playerAirborne = false;
    this.ensureStoneTextures();
    const residentFloors = stack && stack.length > 1 ? stack : [dungeon];
    let residentPlan: ResidentDungeonPlan;
    loadTrace?.begin("plan");
    try {
      residentPlan = createResidentDungeonPlan(residentFloors, undefined, {
        moodId: mood.id,
        decorDensity: this.decorDensity,
        phoenixArmed,
      });
    } finally {
      loadTrace?.end("plan");
    }
    return { residentFloors, residentPlan };
  }

  private finishDungeonPopulation(
    dungeon: DungeonData,
    residentFloors: readonly DungeonData[],
    loadTrace?: DungeonLoadPhaseObserver,
  ): void {
    loadTrace?.begin("actors");
    try {
      this.buildResidentEnemyRuntimes(residentFloors);
      this.createSharedEnemyPresentation();
      this.bindActiveEnemyRuntime(dungeon.floor?.index ?? 0);
    } catch (error) {
      // Enemy owners are registered before their batches. Roll back the whole
      // static transaction and preserve the construction error for the caller.
      try {
        this.clear();
      } catch {
        // Cleanup is best-effort. The original build error remains authoritative.
      }
      throw error;
    } finally {
      loadTrace?.end("actors");
    }
    this.refreshMinimapFeatures();
    const pickupBurstAnchor = gridToWorld(dungeon, dungeon.spawn, this.tileSize);
    this.pickupBurstWarmupPosition.set(pickupBurstAnchor.x, 0.4, pickupBurstAnchor.z);
    this.pickupBurstPool = new PickupBurstPool(6);
    this.group.add(this.pickupBurstPool.root);
    this.refreshDifficultyState();
    this.stats.pickups = this.pickups.length;
  }

  /** Build every enemy owner after the static stack owns its floor runtimes. */
  private buildResidentEnemyRuntimes(floors: readonly DungeonData[]): void {
    for (const floor of floors) {
      const floorIndex = floor.floor?.index ?? 0;
      const floorRuntime = this.residentFloorRuntimesByIndex.get(floorIndex);
      if (!floorRuntime) {
        throw new Error(`Enemy actor build requires resident floor ${floorIndex + 1}.`);
      }
      if (floorRuntime.enemyRuntime) {
        throw new Error(`Resident floor ${floorIndex + 1} already owns enemy actors.`);
      }
      const runtime = new ResidentEnemyRuntimeOwner({
        dungeon: floor,
        floorRuntime,
        assets: this.assets,
        mood: this.activeMood,
        shadowMaterial: this.enemyShadowMaterial,
        tileSize: this.tileSize,
        wallHeight: this.wallHeight,
        difficulty: this.difficulty,
      });
      // Register and attach before population so an exception on floor N is
      // released through the same exact-once static runtime transaction.
      this.residentEnemyRuntimesByIndex.set(floorIndex, runtime);
      (floorRuntime as ResidentFloorRuntimeOwner).attachEnemyRuntime(runtime);
      runtime.build();
    }
  }

  /**
   * One reusable trail field and freeze field serve the active runtime. Their
   * capacities are maxima, not four per-floor allocations.
   */
  private detachVfxPointLights(root: THREE.Object3D): void {
    const lights: THREE.PointLight[] = [];
    root.traverse((object) => {
      if (object instanceof THREE.PointLight) lights.push(object);
    });
    for (const light of lights) light.removeFromParent();
  }

  private createSharedEnemyPresentation(): void {
    const runtimes = [...this.residentEnemyRuntimesByIndex.values()];
    const maxSeats = Math.max(1, ...runtimes.map((runtime) => runtime.seatCount));
    this.enemyMotionTrailVfx = new EnemyMotionTrailVfx();
    this.group.add(this.enemyMotionTrailVfx.root);
    for (const kind of ENEMY_ROSTER) {
      let source: ResidentEnemyRuntimeOwner | null = null;
      let capacity = 0;
      for (const runtime of runtimes) {
        const batch = runtime.animationBatches.get(kind);
        if (!batch) continue;
        const count = batch.atlasFrameAttribute.count;
        if (count > capacity) {
          capacity = count;
          source = runtime;
        }
      }
      if (!source || capacity === 0) continue;
      const batch = source.animationBatches.get(kind)!;
      this.enemyMotionTrailVfx.registerKind(
        kind,
        this.assets.enemyAnimation(batch.animation),
        batch.animation,
        capacity,
      );
    }
    this.timeFreezeVfx = new TimeFreezeVfx(maxSeats, this.textureLifecycle.textureSink);
    this.group.add(this.timeFreezeVfx.root);
    this.luminousWardVfx = new LuminousWardVfx(this.textureLifecycle.textureSink);
    this.detachVfxPointLights(this.luminousWardVfx.root);
    this.group.add(this.luminousWardVfx.root);
    this.cullBrandVfx = new CullBrandVfx(this.textureLifecycle.textureSink);
    this.group.add(this.cullBrandVfx.root);
    this.controlCurseVfx = new ControlCurseVfx(this.textureLifecycle.textureSink);
    this.group.add(this.controlCurseVfx.root);
    this.phoenixEggVfx = new PhoenixEggVfx();
    this.group.add(this.phoenixEggVfx.root);
    this.mobilityBoostVfx = new MobilityBoostVfx(undefined, this.textureLifecycle.textureSink);
    this.group.add(this.mobilityBoostVfx.root);
    this.annihilationPulseVfx = new AnnihilationPulseVfx();
    this.detachVfxPointLights(this.annihilationPulseVfx.root);
    this.group.add(this.annihilationPulseVfx.root);
  }

  setDecorDensity(value: number): void {
    this.decorDensity = THREE.MathUtils.clamp(value, 0, 1);
  }
  setEnemyDensity(value: number): void {
    this.difficulty = THREE.MathUtils.clamp(value, 0, 1);
    this.refreshDifficultyState();
  }

  setPlayerTraversalState(state: { jumpHeight: number }): void {
    // Ignore the first few centimeters so ordinary stair/ground jitter cannot
    // bypass a trap; a real jump clears the floor trigger.
    this.playerAirborne = isPlayerAirborneFromJumpHeight(state.jumpHeight);
  }

  getDifficultyState(): Readonly<DifficultySnapshot> {
    return this.activeEnemyRuntime?.difficultyState ?? this.emptyDifficultyState;
  }

  private refreshDifficultyState(): void {
    const runtime = this.activeEnemyRuntime;
    if (!runtime) {
      this.stats.enemies = 0;
      this.stats.reserveEnemies = 0;
      this.stats.difficultyLevel = this.emptyDifficultyState.pressureLevel;
      return;
    }
    const state = runtime.refreshDifficulty(this.difficulty, this.collectedStones.size);
    this.stats.enemies = runtime.activeCount;
    this.stats.reserveEnemies = runtime.reserveCount;
    this.stats.difficultyLevel = state.pressureLevel;
  }

  private updateDifficulty(player: { x: number; z: number }): void {
    const runtime = this.activeEnemyRuntime;
    if (!runtime) return;
    const { mode: _mode, ...input } = this.enemyActivationInput("play");
    runtime.updateDifficulty(player, input);
    this.refreshDifficultyState();
  }

  /**
   * opening — only deterministic first-wave seats (cold start).
   * play — reinforce away from the player with LOS filters.
   * resume — fill target count for the restored clock without LOS gates.
   */
  private activateEnemiesToTarget(
    player: { x: number; z: number },
    mode: "opening" | "play" | "resume",
  ): void {
    this.activeEnemyRuntime?.activateEnemiesToTarget(player, this.enemyActivationInput(mode));
    this.refreshDifficultyState();
  }

  private enemyActivationInput(
    mode: ResidentEnemyActivationInput["mode"],
  ): ResidentEnemyActivationInput {
    return {
      mode,
      difficulty: this.difficulty,
      stonesFound: this.collectedStones.size,
      swarmCurseActive: this.powers.swarmCurseActive,
      wardActive: isLuminousWardOn(this.powers),
      pulseActive: isAnnihilationPulseOn(this.powers),
      wardRadius: LUMINOUS_WARD_REPEL_RADIUS,
      pulseRadius: ANNIHILATION_PULSE_REPEL_RADIUS,
    };
  }

  update(
    delta: number,
    player: THREE.Vector3,
    atExit: boolean,
    interactPressed = false,
    mouseForwardHeld = false,
  ): WorldUpdate {
    this.lockedExitCooldown = Math.max(0, this.lockedExitCooldown - delta);
    const { pulseCount } = tickRunPowerRuntime(this.powers, delta);
    const enemiesFrozen = isTimeFreezeOn(this.powers);
    const luminousWardActive = isLuminousWardOn(this.powers);
    const annihilationPulseActive = isAnnihilationPulseOn(this.powers);
    const frenzyActive = isFrenzyCurseOn(this.powers);
    const activeEnemyRuntime = this.activeEnemyRuntime;
    const enemyPlayer = activeEnemyRuntime?.localPlayerPosition(player) ?? player;
    activeEnemyRuntime?.advanceTimers(delta, enemiesFrozen);
    if (!enemiesFrozen && activeEnemyRuntime) this.updateDifficulty(enemyPlayer);
    let resolveGain = 0;
    let collectedStoneId: StoneId | null = null;
    const collectedStoneIds: StoneId[] = [];
    let collectedPickup: WorldUpdate["collectedPickup"] = null;
    let doorSound: WorldUpdate["doorSound"] = null;
    let chestSound: WorldUpdate["chestSound"] = null;
    let interactionPrompt: WorldUpdate["interactionPrompt"] = null;
    let floorTransition: WorldUpdate["floorTransition"] = null;
    const biomeEvent = sampleBiomeEvent(
      this.activeMood.id,
      activeEnemyRuntime?.difficultyElapsed ?? 0,
      this.dungeon?.seedHash ?? 0,
      activeEnemyRuntime?.biomeEventCycle ?? -1,
    );
    if (biomeEvent.started) activeEnemyRuntime?.setBiomeEventCycle(biomeEvent.cycle);

    // Combat + locomotion (sim) separate from instanced matrix writes (view).
    const sim =
      enemiesFrozen || !activeEnemyRuntime
        ? {
            damage: 0,
            nearestThreat: nearestEnemyDistance(this.enemies, player),
            knockX: 0,
            knockZ: 0,
            knockHits: 0,
            attacker: null,
          }
        : activeEnemyRuntime.tick({
            delta,
            player: enemyPlayer,
            tileSize: this.tileSize,
            repelRadius: Math.max(
              luminousWardActive ? LUMINOUS_WARD_REPEL_RADIUS : 0,
              annihilationPulseActive ? ANNIHILATION_PULSE_REPEL_RADIUS : 0,
            ),
            repelSpeedMultiplier: annihilationPulseActive
              ? ANNIHILATION_PULSE_REPEL_SPEED_MULTIPLIER
              : 1,
            moodId: this.activeMood.id,
            difficulty: composeDifficultyWithBiomeEvent(
              this.difficulty,
              biomeEvent.enemyPressureScale,
            ),
            pursuitSpeedMultiplier: frenzyActive ? FRENZY_CURSE_SPEED_MULTIPLIER : 1,
            attackRateMultiplier: frenzyActive ? FRENZY_CURSE_ATTACK_RATE_MULTIPLIER : 1,
            detectionRangeMultiplier: frenzyActive ? FRENZY_CURSE_DETECTION_MULTIPLIER : 1,
          });
    const sampledSurfaceEffect = this.activeFloorRuntime?.hazardTileSystem?.sample(delta, player, {
      airborne: this.playerAirborne,
      immune: isMobilityBoostOn(this.powers),
    }) ?? {
      kind: null,
      label: "",
      damage: 0,
      movementScale: 1,
      traction: 1,
    };
    const surfaceEffect: HazardSurfaceEffect = composeHazardWithBiomeEvent(
      sampledSurfaceEffect,
      biomeEvent,
    );
    let damage = sim.damage + surfaceEffect.damage;
    const nearestThreat = sim.nearestThreat;
    let knockX = sim.knockX;
    let knockZ = sim.knockZ;
    let knockHits = sim.knockHits;
    let annihilationPulse: WorldUpdate["annihilationPulse"] = null;
    let cullBrandKill: WorldUpdate["cullBrandKill"] = null;
    if (pulseCount > 0) {
      let hits = 0;
      for (let pulse = 0; pulse < pulseCount; pulse += 1) {
        this.annihilationPulseVfx?.triggerPulse(player, this.activeMood.id);
        hits += this.applyAnnihilationPulse(player);
      }
      annihilationPulse = {
        position: { x: player.x, y: player.y, z: player.z },
        hits,
      };
    }
    // Contact brand: first hostile strike spends the charge and kills the attacker.
    if (
      sim.attacker &&
      sim.damage > 0 &&
      isCullBrandOn(this.powers) &&
      (sim.attacker.phaseVisibility ?? 1) >= CULL_BRAND_MIN_PHASE_VISIBILITY &&
      tryConsumeCullBrand(this.powers.cullBrand)
    ) {
      this.defeatEnemySeat(sim.attacker as EnemyActor);
      damage = surfaceEffect.damage;
      knockX = 0;
      knockZ = 0;
      knockHits = 0;
      const attackerPosition = activeEnemyRuntime!.worldPositionInto(
        sim.attacker.position,
        this.residentWorldPosition,
      );
      cullBrandKill = {
        position: {
          x: attackerPosition.x,
          y: attackerPosition.y,
          z: attackerPosition.z,
        },
      };
    }
    const attackerWorldPosition =
      sim.attacker && activeEnemyRuntime
        ? activeEnemyRuntime.worldPositionInto(sim.attacker.position, this.residentWorldPosition)
        : null;
    const damageSource: WorldUpdate["damageSource"] =
      sim.attacker && damage > surfaceEffect.damage
        ? {
            position: {
              x: attackerWorldPosition?.x ?? sim.attacker.position.x,
              y: attackerWorldPosition?.y ?? sim.attacker.position.y,
              z: attackerWorldPosition?.z ?? sim.attacker.position.z,
            },
            voice: creatureVoiceForEnemy(sim.attacker.kind),
          }
        : null;
    activeEnemyRuntime?.present({
      player: enemyPlayer,
      revealSeconds: activeEnemyRuntime.difficultyState.revealSeconds,
      frozen: enemiesFrozen,
      delta,
      moodId: this.activeMood.id,
      trail: this.enemyMotionTrailVfx,
    });

    const activeFloorRuntime = this.activeFloorRuntime;
    if (activeFloorRuntime) {
      for (const door of activeFloorRuntime.doors) {
        const doorPosition = this.worldPositionOf(door.root);
        const distance = horizontalDistance(doorPosition, player);
        const verticalDelta = Math.abs(player.y - doorPosition.y);
        const openDistance =
          (door.root.userData.openDistance as number) ?? DOOR_DEFAULT_OPEN_DISTANCE;
        const targetOpen = resolveDoorTargetOpen(
          door.targetOpen,
          verticalDelta <= 2.2 ? distance : Number.POSITIVE_INFINITY,
          openDistance,
        );
        if (targetOpen !== door.targetOpen) {
          door.targetOpen = targetOpen;
          if (!doorSound && verticalDelta <= 2.2) {
            doorSound = {
              kind: targetOpen ? "open" : "close",
              position: {
                x: doorPosition.x,
                y: doorPosition.y + 1.2,
                z: doorPosition.z,
              },
            };
          }
        }
        updateDoorLeafPresentation(door, delta);
      }
    }

    let nearestChest: StaticChestActor | null = null;
    let nearestChestDistance = Number.POSITIVE_INFINITY;
    if (activeFloorRuntime) {
      for (const chest of activeFloorRuntime.chests) {
        const chestPosition = this.worldPositionOf(chest.root);
        const distance = horizontalDistance(chestPosition, player);
        const verticalDelta = player.y - chestPosition.y;
        if (
          canInteractWithChest(distance, chest.opened, verticalDelta) &&
          distance < nearestChestDistance
        ) {
          nearestChest = chest;
          nearestChestDistance = distance;
        }
        updateChestPresentation(chest, delta);
      }
    }
    if (nearestChest) {
      interactionPrompt = "open-chest";
      if (shouldOpenChest(interactPressed, mouseForwardHeld)) {
        nearestChest.opened = true;
        setPickupDormant(nearestChest.reward.object, false);
        beginChestRewardReveal(nearestChest);
        const chestPosition = this.worldPositionOf(nearestChest.root);
        chestSound = {
          position: {
            x: chestPosition.x,
            y: chestPosition.y + 0.72,
            z: chestPosition.z,
          },
        };
        interactionPrompt = null;
      }
    }

    // Stairs are walkable geometry only — no interact prompt or floor transition.

    const pickupMotionFrame = { player, elapsed: this.elapsed, delta };
    if (activeFloorRuntime) {
      for (const pickup of activeFloorRuntime.pickups) {
        if (pickup.collected) {
          updateCollectedPickupMotion(pickup, pickupMotionFrame);
          continue;
        }
        if (!pickup.available) continue;
        updateIdlePickupMotion(pickup, pickupMotionFrame);
        const pickupPosition = this.worldPositionOf(pickup.object);
        if (
          !canCollectPickup(
            horizontalDistance(pickupPosition, player),
            pickup.autoCollect,
            pickup.kind,
            player.y - pickupPosition.y,
          )
        )
          continue;
        pickup.collected = true;
        pickup.collectTime = 0;
        pickup.collectOriginX = pickup.object.position.x;
        pickup.collectOriginY = pickup.object.position.y;
        pickup.collectOriginZ = pickup.object.position.z;
        this.pickupBurstPool?.trigger(pickupPosition, pickup.kind, pickup.stoneSignal?.effectColor);
        collectedPickup = {
          kind: pickup.kind,
          position: {
            x: pickupPosition.x,
            y: pickupPosition.y,
            z: pickupPosition.z,
          },
        };
        if (pickup.kind === "stone" && pickup.stoneId) {
          if (pickup.stoneSignal) pickup.stoneSignal.light.intensity = 0;
          this.collectedStones.add(pickup.stoneId);
          collectedStoneId = pickup.stoneId;
          collectedStoneIds.push(pickup.stoneId);
          // Each bound stone raises the reinforcement target and wakes seats now.
          this.refreshDifficultyState();
          this.activateEnemiesToTarget(player, "play");
          if (this.collectedStones.size >= STONE_ORDER.length) this.openPortal();
        } else if (pickup.kind === "resolve") {
          resolveGain += 28;
        } else if (applyPickupToRunPowers(this.powers, pickup.kind)) {
          if (pickup.annihilationPulseSignal) pickup.annihilationPulseSignal.light.intensity = 0;
          if (pickup.cullBrandSignal) pickup.cullBrandSignal.light.intensity = 0;
          if (pickup.phoenixEggSignal) pickup.phoenixEggSignal.light.intensity = 0;
          if (pickup.luminousWardSignal) pickup.luminousWardSignal.light.intensity = 0;
          if (pickup.kind === "swarm-curse") {
            this.refreshDifficultyState();
            this.activateEnemiesToTarget(player, "play");
          }
        }
      }
    }

    this.pickupBurstPool?.update(delta);

    if (this.portalRoot) {
      if (this.portalLight) {
        this.portalLight.intensity = this.portalOpen ? 16 + Math.sin(this.elapsed * 4.2) * 3 : 2.5;
      }
      if (this.portalBeam) this.portalBeam.visible = this.portalOpen;
      updateMagicPortal(this.portalRoot, this.elapsed);
    }

    const finalFloor =
      !this.dungeon?.floor || this.dungeon.floor.index === this.dungeon.floor.count - 1;
    const reachedLockedExit =
      finalFloor && atExit && !this.portalOpen && this.lockedExitCooldown === 0;
    const reachedOpenExit =
      finalFloor && this.portalOpen && isInsideMagicPortal(player, this.exitPosition, atExit);
    if (reachedLockedExit) this.lockedExitCooldown = 1.5;
    let knockback: WorldUpdate["knockback"] = null;
    if (knockHits > 0) {
      const len = Math.hypot(knockX, knockZ);
      knockback = len > 1e-4 ? { x: knockX / len, z: knockZ / len } : { x: 0, z: 1 };
    }
    return {
      collectedRelic: this.collectedStones.size >= STONE_ORDER.length && collectedStoneId !== null,
      collectedStoneId,
      collectedStoneIds,
      collectedPickup,
      timeFreezeRemaining: this.powers.timeFreezeSeconds,
      luminousWardRemaining: this.powers.luminousWardSeconds,
      annihilationPulseRemaining: this.powers.annihilationPulse.remaining,
      mapRevealed: this.powers.mapRevealed,
      mobilityBoostRemaining: this.powers.mobilityBoostSeconds,
      fogClearRemaining: this.powers.fogClearSeconds,
      slowCurseRemaining: this.powers.slowCurseSeconds,
      frenzyCurseRemaining: this.powers.frenzyCurseSeconds,
      gloomCurseRemaining: this.powers.gloomCurseSeconds,
      swarmCurseActive: this.powers.swarmCurseActive,
      cullBrandRemaining: this.powers.cullBrand.remaining,
      mirrorCurseRemaining: this.powers.mirrorCurseSeconds,
      spinCurseRemaining: this.powers.spinCurseSeconds,
      annihilationPulse,
      cullBrandKill,
      phoenixCharges: this.powers.phoenixCharges,
      stonesFound: this.collectedStones.size,
      stonesTotal: STONE_ORDER.length,
      portalOpen: this.portalOpen,
      resolveGain,
      damage,
      damageSource,
      surfaceEffect,
      doorSound,
      chestSound,
      interactionPrompt,
      floorTransition,
      biomeEvent,
      knockback,
      reachedLockedExit,
      reachedOpenExit,
      nearestThreat: Number.isFinite(nearestThreat) ? nearestThreat : null,
    };
  }

  private defeatEnemySeat(enemy: EnemyActor): void {
    const runtime = this.activeEnemyRuntime;
    if (!runtime) return;
    runtime.defeat(enemy);
    const worldPosition = runtime.worldPositionInto(enemy.position, this.residentWorldPosition);
    this.annihilationPulseVfx?.triggerEnemyBurst(
      worldPosition,
      this.activeMood.id,
      enemy.instanceIndex + enemy.position.x * 13.17 + enemy.position.z * 7.91,
    );
  }

  private applyAnnihilationPulse(origin: THREE.Vector3): number {
    const runtime = this.activeEnemyRuntime;
    if (!runtime) return 0;
    const localOrigin = runtime.localPlayerPosition(origin);
    let hits = 0;
    for (const enemy of runtime.actors) {
      if (
        !annihilationPulseHitsEnemy(localOrigin, {
          defeated: enemy.defeated,
          scaleX: enemy.scaleX,
          scaleY: enemy.scaleY,
          phaseVisibility: enemy.phaseVisibility,
          position: enemy.position,
          baseScaleX: enemy.baseScale.x,
          baseScaleY: enemy.baseScale.y,
        })
      ) {
        continue;
      }

      this.defeatEnemySeat(enemy);
      hits += 1;
    }
    return hits;
  }

  updateEffects(delta: number, viewerPosition?: THREE.Vector3Like): void {
    this.elapsed += delta;
    const viewer = viewerPosition ?? { x: 0, y: 1.5, z: 0 };
    this.timeFreezeVfx?.update(
      this.powers.timeFreezeSeconds,
      this.elapsed,
      this.activeEnemyRuntime?.actors ?? [],
    );
    this.luminousWardVfx?.update(this.powers.luminousWardSeconds, this.elapsed, viewer, delta);
    this.mobilityBoostVfx?.update(this.powers.mobilityBoostSeconds, this.elapsed, viewer, delta);
    this.annihilationPulseVfx?.update(
      this.powers.annihilationPulse.remaining,
      this.elapsed,
      viewer,
      delta,
      this.activeMood.id,
    );
    this.cullBrandVfx?.update(this.powers.cullBrand.remaining, this.elapsed, viewer);
    this.controlCurseVfx?.update(
      this.powers.mirrorCurseSeconds,
      this.powers.spinCurseSeconds,
      this.elapsed,
      viewer,
    );
    this.phoenixEggVfx?.update(this.powers.phoenixCharges, this.elapsed, delta, viewer);
    const runtime = this.activeFloorRuntime;
    // Gameplay and decorative state advance only on the active slab. Nearby
    // roots remain visible for stair continuity but are intentionally inert.
    if (runtime) {
      runtime.hazardTileSystem?.update(delta);
      runtime.fixedSceneEffects.update({
        delta,
        elapsed: this.elapsed,
        viewerPosition,
        dungeon: this.dungeon,
        tileSize: this.tileSize,
        floorSprites: runtime.floorBiomeSprites,
        ceilingSprites: runtime.ceilingBiomeSprites,
        uncannyWallRuntime: runtime.uncannyWallRuntime,
        fires: runtime.fires,
        // The portal is one global objective. It is passed through exactly this
        // active update, never once for every resident runtime.
        portalBeam: this.portalBeam,
        stoneBeams: runtime.stoneBeams,
        ambientBeams: runtime.ambientBeams,
        liquidSurfaces: runtime.liquidKit?.surfaces ?? null,
      });
    }
  }

  setPickupEffectsWarmupVisible(visible: boolean): void {
    this.pickupBurstPool?.setWarmupVisible(visible, this.pickupBurstWarmupPosition);
    this.timeFreezeVfx?.setWarmupVisible(visible);
    this.annihilationPulseVfx?.setWarmupVisible(visible);
    this.mobilityBoostVfx?.setWarmupVisible(visible, {
      x: this.pickupBurstWarmupPosition.x,
      y: 1.5,
      z: this.pickupBurstWarmupPosition.z,
    });
    // Reward clones share their template geometry/materials. Compile one visible
    // representative per active reward kind instead of drawing every dormant
    // copy across the resident stack during the blocking first-frame warmup.
    const warmupRepresentatives = new Set<string>();
    for (const pickup of this.pickups) {
      if (!visible) {
        setPickupDormant(pickup.object, pickup.collected || !pickup.available);
        continue;
      }
      const floorVisible =
        this.residentFloorRuntimesByIndex.get(pickup.floorIndex)?.root.visible === true;
      const key = pickup.kind === "stone" ? `stone:${pickup.stoneId ?? pickup.id}` : pickup.kind;
      const representative = floorVisible && !warmupRepresentatives.has(key);
      if (representative) warmupRepresentatives.add(key);
      setPickupDormant(pickup.object, !representative);
    }
    // Portal open materials are usually hidden until the fourth stone.
    if (this.portalBeam) this.portalBeam.visible = visible || this.portalOpen;
    if (this.portalRoot) setMagicPortalWarmupVisible(this.portalRoot, visible, this.portalOpen);
  }

  /** True when all four magic stones are bound (portal open). */
  get hasRelic(): boolean {
    return this.portalOpen;
  }
  get stonesFound(): number {
    return this.collectedStones.size;
  }
  get stonesTotal(): number {
    return STONE_ORDER.length;
  }
  get isPortalOpen(): boolean {
    return this.portalOpen;
  }

  get timeFreezeRemaining(): number {
    return this.powers.timeFreezeSeconds;
  }

  get luminousWardRemaining(): number {
    return this.powers.luminousWardSeconds;
  }

  get annihilationPulseRemaining(): number {
    return this.powers.annihilationPulse.remaining;
  }

  get cullBrandRemaining(): number {
    return this.powers.cullBrand.remaining;
  }

  get isCullBrandActive(): boolean {
    return isCullBrandOn(this.powers);
  }

  get phoenixChargeCount(): number {
    return this.powers.phoenixCharges;
  }

  get isPhoenixArmed(): boolean {
    return hasPhoenixCharge(this.powers.phoenixCharges);
  }

  /**
   * Host calls after a lethal hit spends a phoenix charge in RunSession.
   * Arms annihilation pulse only — no ambient phoenix motes while equipped.
   */
  applyPhoenixRevive(_viewer: { x: number; y: number; z: number }): void {
    this.powers.phoenixCharges = 0;
    activateAnnihilationPulse(this.powers.annihilationPulse);
  }

  /** Keep world charges aligned when session reports remaining charges. */
  setPhoenixCharges(charges: number): void {
    this.powers.phoenixCharges = clampPhoenixCharges(charges);
  }

  get isMapRevealed(): boolean {
    return this.powers.mapRevealed;
  }

  get mobilityBoostRemaining(): number {
    return this.powers.mobilityBoostSeconds;
  }

  get fogClearRemaining(): number {
    return this.powers.fogClearSeconds;
  }

  get isFogClearActive(): boolean {
    return isFogClearOn(this.powers);
  }

  get slowCurseRemaining(): number {
    return this.powers.slowCurseSeconds;
  }

  get isSlowCurseActive(): boolean {
    return isSlowCurseOn(this.powers);
  }

  get frenzyCurseRemaining(): number {
    return this.powers.frenzyCurseSeconds;
  }

  get isFrenzyCurseActive(): boolean {
    return isFrenzyCurseOn(this.powers);
  }

  get mirrorCurseRemaining(): number {
    return this.powers.mirrorCurseSeconds;
  }

  get isMirrorCurseActive(): boolean {
    return isMirrorCurseOn(this.powers);
  }

  get spinCurseRemaining(): number {
    return this.powers.spinCurseSeconds;
  }

  get isSpinCurseActive(): boolean {
    return isSpinCurseOn(this.powers);
  }

  get gloomCurseRemaining(): number {
    return this.powers.gloomCurseSeconds;
  }

  get isGloomCurseActive(): boolean {
    return isGloomCurseOn(this.powers);
  }

  get isSwarmCurseActive(): boolean {
    return isSwarmCurseOn(this.powers);
  }

  restoreSession(foundStoneIds: readonly StoneId[]): void {
    const restored = new Set(foundStoneIds.filter((id) => STONE_ORDER.includes(id)));
    this.collectedStones.clear();
    for (const id of restored) this.collectedStones.add(id);
    for (const pickup of this.pickups) {
      if (pickup.kind !== "stone" || !pickup.stoneId) continue;
      const collected = restored.has(pickup.stoneId);
      pickup.collected = collected;
      pickup.collectTime = collected ? 1 : 0;
      pickup.object.position.y = pickup.baseY;
      if (collected) setPickupDormant(pickup.object, true);
      else {
        setPickupDormant(pickup.object, false);
        pickup.object.scale.copy(pickup.baseScale);
      }
      setPickupOpacity(pickup.object, collected ? 0 : 1);
      if (pickup.stoneSignal)
        pickup.stoneSignal.light.intensity = collected ? 0 : pickup.stoneSignal.baseLightIntensity;
    }
    const finalFloor =
      !this.dungeon?.floor || this.dungeon.floor.index === this.dungeon.floor.count - 1;
    this.setPortalOpen(finalFloor && restored.size === STONE_ORDER.length);
  }

  /**
   * Resume the run clock and active power timers after a continue. Catch-up
   * enemy activation uses the restored player seat so pressure matches time.
   */
  restoreRuntimeProgress(
    progress: {
      difficultyElapsed: number;
      timeFreezeRemaining?: number;
      luminousWardRemaining?: number;
      annihilationPulseRemaining?: number;
      mapRevealed?: boolean;
      mobilityBoostRemaining?: number;
      fogClearRemaining?: number;
      slowCurseRemaining?: number;
      frenzyCurseRemaining?: number;
      gloomCurseRemaining?: number;
      swarmCurseActive?: boolean;
      cullBrandRemaining?: number;
      mirrorCurseRemaining?: number;
      spinCurseRemaining?: number;
      phoenixCharges?: number;
    },
    player: { x: number; z: number },
  ): void {
    this.activeEnemyRuntime?.restoreDifficultyElapsed(progress.difficultyElapsed);
    restoreRunPowerRuntime(this.powers, progress);
    this.refreshDifficultyState();
    this.activateEnemiesToTarget(player, "resume");
  }

  getSolidCells(): GridCell[] {
    return [...this.solidCells.values()].map((cell) => ({ ...cell }));
  }

  getSolidColliders(): WorldCollider[] {
    return this.solidColliders.map((collider) => ({ ...collider }));
  }

  /** Switch the minimap pointer only; resident projections are built once. */
  private bindActiveMinimapProjection(runtime: ResidentFloorRuntime | null): void {
    this.activeMinimapProjection = runtime?.minimapProjection ?? null;
    this.minimapFeatures = this.activeMinimapProjection?.features ?? this.emptyMinimapFeatures;
    this.minimapFeatureRevision += 1;
  }

  private refreshMinimapFeatures(): void {
    let changed = this.activeMinimapProjection?.refreshPickups() ?? false;
    changed = this.refreshActiveEnemyMarkers() || changed;
    if (changed) this.minimapFeatureRevision += 1;
  }

  /**
   * Enemy cells are a dynamic overlay on the active cached static projection.
   * Rebinds never rebuild or mutate another floor projection.
   */
  private refreshActiveEnemyMarkers(): boolean {
    const runtime = this.activeFloorRuntime;
    const enemyRuntime = this.activeEnemyRuntime;
    const dungeon = this.dungeon;
    const markers = this.minimapFeatures.enemies;
    if (!runtime || !enemyRuntime || !dungeon || runtime.floorIndex !== enemyRuntime.floorIndex) {
      if (markers.length === 0) return false;
      markers.length = 0;
      return true;
    }

    let changed = false;
    let writeIndex = 0;
    for (const enemy of enemyRuntime.actors) {
      if (enemy.scaleX <= 0.001 || enemy.scaleY <= 0.001) continue;
      let marker = this.minimapFeatures.enemies[writeIndex];
      if (!marker) {
        marker = { cell: { x: 0, y: 0 }, tier: enemy.tier };
        this.minimapFeatures.enemies.push(marker);
        changed = true;
      }
      const previousX = marker.cell.x;
      const previousY = marker.cell.y;
      const previousTier = marker.tier;
      enemyRuntime.worldPositionInto(enemy.position, this.residentWorldPosition);
      worldToGridInto(dungeon, this.residentWorldPosition, this.tileSize, marker.cell);
      marker.tier = enemy.tier;
      if (
        marker.cell.x !== previousX ||
        marker.cell.y !== previousY ||
        marker.tier !== previousTier
      ) {
        changed = true;
      }
      writeIndex += 1;
    }
    if (this.minimapFeatures.enemies.length !== writeIndex) {
      markers.length = writeIndex;
      changed = true;
    }
    return changed;
  }

  /**
   * Stable minimap snapshot. Static markers are projected once per floor;
   * moving enemy cells update in place and pickup changes rebuild on demand.
   */
  getMinimapFeatures(): MinimapFeatures {
    this.refreshMinimapFeatures();
    return this.minimapFeatures;
  }

  getMinimapFeatureRevision(): number {
    return this.minimapFeatureRevision;
  }

  /** Safe cache accounting for resident-world diagnostics; no Three resource is exposed. */
  getStaticResourceCatalogSnapshot(): StaticResourceCatalogSnapshot {
    return this.staticResourceCatalog.snapshot();
  }

  /** Positions for HRTF sound placement; no simulation state leaves this adapter. */
  getAudioFrame(): DungeonAudioFrame {
    const portalPosition = this.portalRoot ? this.worldPositionOf(this.portalRoot) : null;
    return projectDungeonAudioFrame(this.audioFrame, {
      fires: this.fireEffects,
      stones: this.activeFloorRuntime?.pickups ?? [],
      enemies: this.enemies,
      enemyWorldYOffset: this.activeEnemyRuntime?.floorSlabY ?? 0,
      portal: portalPosition
        ? {
            position: {
              x: portalPosition.x,
              y: portalPosition.y,
              z: portalPosition.z,
            },
          }
        : null,
      moodId: this.activeMood.id,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.textureLifecycle.active = false;
    this.clear();
    this.staticScene.dispose();
    this.staticResourceCatalog.dispose();
    disposeRoomSurfaceMaterials(this.surfaceMaterials);
    disposeDungeonMaterials(this.materials);
    // Geometry cache pins material refs from createStaticPropTemplateBatches.
    clearStaticPropTemplateBatchCache();
    disposeEnemyContactShadowMaterial(this.enemyShadowMaterial, this.textureLifecycle.textureSink);
    for (const texture of this.stoneTextures.values()) {
      this.textureLifecycle.textureSink?.unregister(texture);
      texture.dispose();
    }
    this.stoneTextures.clear();
    this.assets.dispose();
    this.textureLifecycle.textureSink = undefined;
    this.scene.remove(this.group);
  }

  /**
   * Extra room dressing from the generated six-frame biome atlas. Each frame
   * declares whether it is a wall decal, a horizontal floor mark, an upright
   * floor card, or a corner card with a bounded yaw.
   */
  private openPortal(): void {
    this.setPortalOpen(true);
  }

  private setPortalOpen(open: boolean): void {
    this.portalOpen = open;
    if (this.portalBeam) this.portalBeam.visible = open;
    if (this.portalLight) this.portalLight.intensity = open ? 18 : 3;
    if (this.portalRoot) {
      const bars = this.portalRoot.getObjectByName("Portal sealed bars");
      if (bars) bars.visible = !open;
      setMagicPortalOpen(this.portalRoot, open);
    }
  }

  private ensureStoneTextures(): void {
    if (this.stoneTextures.size > 0) return;
    const loader = new THREE.TextureLoader();
    const lifecycle = this.textureLifecycle;
    for (const id of magicStoneIds()) {
      const texture = loader.load(`/assets/textures/stones/${id}-albedo.webp`, (loaded) => {
        if (!lifecycle.active) return;
        lifecycle.textureSink?.markRenderable(loaded);
      });
      texture.colorSpace = THREE.SRGBColorSpace;
      // Pixel-art grimdark: hard texels, no bilinear mush.
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 2);
      lifecycle.textureSink?.register(texture);
      this.stoneTextures.set(id, texture);
    }
  }

  private clear(): void {
    // Floor transitions restore phoenix via restoreRuntimeProgress after clear.
    resetRunPowerRuntime(this.powers);
    this.playerAirborne = false;
    this.activeEnemyRuntime = null;
    this.activeMinimapProjection = null;
    this.minimapFeatures = this.emptyMinimapFeatures;
    this.minimapFeatureRevision += 1;
    if (this.pickupBurstPool) {
      this.group.remove(this.pickupBurstPool.root);
      this.pickupBurstPool.dispose();
      this.pickupBurstPool = null;
    }
    if (this.timeFreezeVfx) {
      this.group.remove(this.timeFreezeVfx.root);
      this.timeFreezeVfx.dispose();
      this.timeFreezeVfx = null;
    }
    if (this.enemyMotionTrailVfx) {
      this.group.remove(this.enemyMotionTrailVfx.root);
      this.enemyMotionTrailVfx.dispose();
      this.enemyMotionTrailVfx = null;
    }
    if (this.luminousWardVfx) {
      this.group.remove(this.luminousWardVfx.root);
      this.luminousWardVfx.dispose();
      this.luminousWardVfx = null;
    }
    if (this.mobilityBoostVfx) {
      this.group.remove(this.mobilityBoostVfx.root);
      this.mobilityBoostVfx.dispose();
      this.mobilityBoostVfx = null;
    }
    if (this.cullBrandVfx) {
      this.group.remove(this.cullBrandVfx.root);
      this.cullBrandVfx.dispose();
      this.cullBrandVfx = null;
    }
    if (this.controlCurseVfx) {
      this.group.remove(this.controlCurseVfx.root);
      this.controlCurseVfx.dispose();
      this.controlCurseVfx = null;
    }
    if (this.phoenixEggVfx) {
      this.group.remove(this.phoenixEggVfx.root);
      this.phoenixEggVfx.dispose();
      this.phoenixEggVfx = null;
    }
    if (this.annihilationPulseVfx) {
      this.group.remove(this.annihilationPulseVfx.root);
      this.annihilationPulseVfx.dispose();
      this.annihilationPulseVfx = null;
    }
    // The facade must release its borrowed build handles before the static
    // owner removes or disposes their scene nodes.
    this.releaseStaticHandles();
    this.staticScene.clear();
    this.collectedStones.clear();
    this.portalOpen = false;
    const resourceDisposer = new ThreeResourceDisposer();
    while (this.group.children.length > 0) {
      const child = this.group.children[0] as THREE.Object3D;
      this.group.remove(child);
      resourceDisposer.dispose(child);
    }
  }
}
