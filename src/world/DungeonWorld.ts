import * as THREE from "three";
import type { CreatureVoice, DungeonAudioFrame } from "../audio/GameAudio";
import { createSeededRandom } from "../core/random";
import { gridToWorld, worldToGrid, type WorldCollider } from "../dungeon/gridCollision";
import type { DungeonData, DungeonRoom, GridCell } from "../dungeon/types";
import { AssetLibrary } from "./AssetLibrary";
import {
  ENEMY_ROSTER,
  enemyAnimationFrameIndex,
  enemyAnimationsForMood,
  type EnemyAnimationDefinition,
} from "./EnemySpriteAtlas";
import {
  buildDistributedEnemySpawns,
  buildInitialRoomEnemyQuotas,
  selectEnemyKindsForSpawns,
} from "./EnemySpawnPlan";
import { tickVolumetricBeamTime } from "./VolumetricBeam";
import { createDungeonMaterials, disposeDungeonMaterials } from "./MaterialLibrary";
import { createRoomSurfaceMaterials, disposeRoomSurfaceMaterials } from "./RoomSurfaceMaterials";
import { setPickupDormant, setPickupOpacity } from "./ItemFactory";
import { PickupBurstPool } from "./PickupBurstPool";
import {
  ENEMY_ARCHETYPES,
  enemyCeilingY,
  enemyGroundY,
  getEnemySpriteRenderMetrics,
  isLowProfileEnemy,
  type EnemyKind,
} from "./EnemyArchetypes";
import { computeTorchLod } from "./TorchLod";
import {
  createEnemyBillboardMaterial,
  setEnemyFreezeAmount,
  createEnemyContactShadowMaterial,
  disposeEnemyContactShadowMaterial,
  enemyOpaqueFeetY,
  resolveEnemyContactShadowLayout,
  setEnemyBillboardFrame,
} from "./EnemyBillboardMaterial";
import type { DungeonMood } from "../systems/DungeonMood";
import { getDungeonMood } from "../systems/DungeonMood";
import {
  DEFAULT_DIFFICULTY,
  ENEMY_ACTIVATION_SPREAD,
  ENEMY_HARD_CAP,
  isEnemyKindUnlocked,
  resolveDifficultySnapshot,
  resolveDifficultyTuning,
  type DifficultySnapshot,
} from "../game/DifficultyDirector";
import { hasGridLineOfSight } from "./LightOcclusion";
import type { HazardSurfaceEffect } from "./HazardTileSystem";
import { magicStoneIds } from "./MagicStoneKit";
import {
  isInsideMagicPortal,
  setMagicPortalOpen,
  setMagicPortalWarmupVisible,
  updateMagicPortal,
} from "./MagicPortalKit";
import type { MagicStonePlacement } from "./MagicStonePlacement";
import type { StoneId } from "../ui/copy";
import { STONE_ORDER } from "../ui/copy";
import type { MinimapCell, MinimapFeatures } from "../ui/minimapFeatures";
import { tickEnemySim, type EnemySimBody } from "./EnemySim";
import { WORLD_TILE_SIZE, WORLD_WALL_HEIGHT } from "./WorldMetrics";
import { tickLiquidSections } from "./LiquidSectionKit";
import { clampBiomeSpriteYaw, biomeSpriteFloorDistanceFade } from "./BiomeSpriteDecorKit";
import { activateTimeFreeze, isTimeFreezeActive, tickTimeFreeze } from "../game/TimeFreeze";
import { TimeFreezeVfx } from "./TimeFreezeVfx";
import { EnemyMotionTrailVfx } from "./EnemyMotionTrailVfx";
import {
  activateAnnihilationPulse,
  ANNIHILATION_PULSE_RADIUS,
  ANNIHILATION_PULSE_REPEL_RADIUS,
  ANNIHILATION_PULSE_REPEL_SPEED_MULTIPLIER,
  createAnnihilationPulseClock,
  isAnnihilationPulseActive,
  tickAnnihilationPulse,
} from "../game/AnnihilationPulse";
import { AnnihilationPulseVfx } from "./AnnihilationPulseVfx";
import {
  activateLuminousWard,
  isLuminousWardActive,
  LUMINOUS_WARD_REPEL_RADIUS,
  tickLuminousWard,
} from "../game/LuminousWard";
import { LuminousWardVfx } from "./LuminousWardVfx";
import {
  canCollectPickup,
  canInteractWithChest,
  StaticDungeonScene,
  type StaticDungeonSceneHandles,
  type StaticDungeonSceneStats,
} from "./StaticDungeonScene";

export { knockbackAwayFrom } from "./knockback";

interface EnemyActor {
  kind: EnemyKind;
  position: THREE.Vector3;
  batch: THREE.InstancedMesh;
  shadowBatch: THREE.InstancedMesh;
  instanceIndex: number;
  shadowInstanceIndex: number;
  hitCooldown: number;
  baseY: number;
  baseScale: THREE.Vector2;
  phase: number;
  attackPulse: number;
  scaleX: number;
  scaleY: number;
  roll: number;
  yaw: number;
  phaseEpoch: number;
  phaseVisibility: number;
  /** Smooth reveal used when the difficulty director adds a threat. */
  spawnReveal: number;
  /** Part of the deterministic one-or-two enemy opening quota for its room. */
  startsActive: boolean;
  moving: boolean;
  visibilityAttribute: THREE.InstancedBufferAttribute;
  /** Threat tier 0-3; drives minimap marker size. */
  tier: number;
  /** Permanent run-local death; the instanced seat remains allocated at zero scale. */
  defeated: boolean;
}

interface EnemyAnimationBatch {
  kind: EnemyKind;
  material: THREE.MeshStandardMaterial;
  animation: EnemyAnimationDefinition;
  frame: number;
  phaseOffset: number;
}

interface DoorActor {
  root: THREE.Group;
  left: THREE.Group;
  right: THREE.Group;
  openness: number;
  targetOpen: boolean;
}

interface PickupActor {
  kind: "stone" | "resolve" | "time-freeze" | "luminous-ward" | "annihilation-pulse";
  stoneId?: StoneId;
  object: THREE.Object3D;
  collected: boolean;
  collectTime: number;
  available: boolean;
  revealTime: number;
  baseY: number;
  baseScale: THREE.Vector3;
  /** Chest rewards that activate after their reveal without a proximity check. */
  autoCollect?: boolean;
  stoneSignal?: {
    light: THREE.PointLight;
    glow: THREE.Mesh;
    crown: THREE.Mesh;
    baseLightIntensity: number;
    baseGlowOpacity: number;
  };
  timeFreezeSignal?: {
    light: THREE.PointLight;
    baseIntensity: number;
  };
  luminousWardSignal?: {
    light: THREE.PointLight;
    glow: THREE.Mesh;
    baseIntensity: number;
    baseGlowOpacity: number;
  };
  annihilationPulseSignal?: {
    light: THREE.PointLight;
    glow: THREE.Mesh;
    baseIntensity: number;
    baseGlowOpacity: number;
  };
}

interface ChestActor {
  id: string;
  root: THREE.Group;
  lid: THREE.Group;
  reward: PickupActor;
  opened: boolean;
  openness: number;
}

interface FireEffect {
  root: THREE.Group;
  flame: THREE.Mesh;
  flameDetails: THREE.Object3D[];
  halos: THREE.Object3D[];
  light: THREE.PointLight | null;
  baseIntensity: number;
  baseY: number;
  baseFlameScaleY: number;
  currentLightFactor: number;
  cutoffDistance: number;
  phase: number;
  /** Cached line-of-sight; refreshed on a throttle to cut grid ray cost. */
  losOpen: boolean;
  losAge: number;
  /** Fluorescent fixtures share light LOD without emitting fire crackle. */
  audio?: boolean;
}

export interface WorldUpdate {
  /** @deprecated use collectedStoneId — kept for domain bridge “all stones” */
  collectedRelic: boolean;
  collectedStoneId: StoneId | null;
  /** Every stone bound in this simulation update; prevents world/quest count drift. */
  collectedStoneIds: readonly StoneId[];
  /** Position is kept for the presentation layer that plays the collection source. */
  collectedPickup: {
    kind: "stone" | "resolve" | "time-freeze" | "luminous-ward" | "annihilation-pulse";
    position: { x: number; y: number; z: number };
  } | null;
  /** Remaining gameplay seconds in the active time-freeze field. */
  timeFreezeRemaining: number;
  /** Remaining gameplay seconds in the active luminous ward field. */
  luminousWardRemaining: number;
  /** Remaining gameplay seconds in the active annihilation pulse field. */
  annihilationPulseRemaining: number;
  /** Pulse ring event; hits are already removed from the enemy seats. */
  annihilationPulse: {
    position: { x: number; y: number; z: number };
    hits: number;
  } | null;
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
  /** Unit XZ push away from the attacker(s); null when no hit this frame. */
  knockback: { x: number; z: number } | null;
  reachedLockedExit: boolean;
  reachedOpenExit: boolean;
  nearestThreat: number | null;
}

/** Presence and attack SFX are keyed 1:1 with enemy kind. */
export function creatureVoiceForEnemy(kind: EnemyKind): CreatureVoice {
  return kind;
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : mesh.material
        ? [mesh.material]
        : [];
    for (const material of materials)
      if (!material.userData.sharedDungeonMaterial) material.dispose();
  });
}

function roomDistance(dungeon: DungeonData, room: DungeonRoom): number {
  return dungeon.distances[room.center.y * dungeon.width + room.center.x] ?? -1;
}

function horizontalDistance(left: THREE.Vector3, right: THREE.Vector3): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

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
  private readonly assets = new AssetLibrary();
  private readonly materials = createDungeonMaterials({
    compact: typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches,
  });
  private readonly surfaceMaterials = createRoomSurfaceMaterials({
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
  });
  private readonly staticScene: StaticDungeonScene;
  private staticHandles: StaticDungeonSceneHandles = StaticDungeonScene.emptyHandles();
  private readonly enemies: EnemyActor[] = [];
  private readonly enemyReserve: EnemyActor[] = [];
  private readonly enemyBatches = new Set<THREE.InstancedMesh>();
  private readonly enemyShadowBatches = new Set<THREE.InstancedMesh>();
  private readonly enemyVisibilityAttributes = new Set<THREE.InstancedBufferAttribute>();
  private readonly enemyAnimationBatches = new Map<EnemyKind, EnemyAnimationBatch>();
  private readonly movingEnemyKinds = new Set<EnemyKind>();
  private readonly enemyShadowMaterial = createEnemyContactShadowMaterial();
  private pickupBurstPool: PickupBurstPool | null = null;
  private timeFreezeVfx: TimeFreezeVfx | null = null;
  private enemyMotionTrailVfx: EnemyMotionTrailVfx | null = null;
  private luminousWardVfx: LuminousWardVfx | null = null;
  private annihilationPulseVfx: AnnihilationPulseVfx | null = null;
  private readonly pickupBurstWarmupPosition = new THREE.Vector3();
  private dungeon: DungeonData | null = null;
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
  private enemySimulationElapsed = 0;
  private enemyAnimationElapsed = 0;
  private difficultyElapsed = 0;
  private difficultySecond = -1;
  private timeFreezeSeconds = 0;
  private luminousWardSeconds = 0;
  private readonly annihilationPulseClock = createAnnihilationPulseClock();
  private difficultyRoomCount = 1;
  private enemyActivationRandom = createSeededRandom("difficulty-activation");
  private readonly stoneTextures = new Map<StoneId, THREE.Texture>();
  private activeMood: DungeonMood = getDungeonMood("ash");
  private decorDensity = 0.6;
  private difficulty = DEFAULT_DIFFICULTY;
  private difficultyState: DifficultySnapshot = resolveDifficultySnapshot(
    DEFAULT_DIFFICULTY,
    0,
    1,
    0,
    0,
  );
  private readonly tempPosition = new THREE.Vector3();
  private readonly tempScale = new THREE.Vector3();
  private readonly tempQuaternion = new THREE.Quaternion();
  private readonly tempEuler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly tempMatrix = new THREE.Matrix4();
  private readonly tempAxisX = new THREE.Vector3(1, 0, 0);

  constructor(
    scene: THREE.Scene,
    { tileSize = WORLD_TILE_SIZE, wallHeight = WORLD_WALL_HEIGHT } = {},
  ) {
    this.scene = scene;
    this.tileSize = tileSize;
    this.wallHeight = wallHeight;
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
    });
    this.staticHandles = this.staticScene.currentHandles;
    this.stats = this.staticScene.stats;
  }

  private borrowStaticHandles(handles: StaticDungeonSceneHandles): void {
    this.staticHandles = handles;
  }

  private releaseStaticHandles(): void {
    this.staticHandles = StaticDungeonScene.emptyHandles();
  }

  private get doors(): DoorActor[] {
    return this.staticHandles.doors;
  }

  private get pickups(): PickupActor[] {
    return this.staticHandles.pickups;
  }

  private get chests(): ChestActor[] {
    return this.staticHandles.chests;
  }

  private get fireEffects(): FireEffect[] {
    return this.staticHandles.fireEffects;
  }

  private get solidCells(): Map<string, GridCell> {
    return this.staticHandles.solidCells;
  }

  private get objectOccupiedCells(): Set<string> {
    return this.staticHandles.objectOccupiedCells;
  }

  private get solidColliders(): WorldCollider[] {
    return this.staticHandles.solidColliders;
  }

  private get objectiveClearanceCells(): Set<string> {
    return this.staticHandles.objectiveClearanceCells;
  }

  private get hazardCells(): Set<string> {
    return this.staticHandles.hazardCells;
  }

  private get floorBiomeSprites(): StaticDungeonSceneHandles["floorBiomeSprites"] {
    return this.staticHandles.floorBiomeSprites;
  }

  private get wallSpriteOccupiedCells(): Set<string> {
    return this.staticHandles.wallSpriteOccupiedCells;
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

  private get stoneBeams(): THREE.Mesh[] {
    return this.staticHandles.stoneBeams;
  }

  private get liquidKit(): StaticDungeonSceneHandles["liquidKit"] {
    return this.staticHandles.liquidKit;
  }

  private set liquidKit(value: StaticDungeonSceneHandles["liquidKit"]) {
    this.staticHandles.liquidKit = value;
  }

  private get hazardTiles(): StaticDungeonSceneHandles["hazardTiles"] {
    return this.staticHandles.hazardTiles;
  }

  private set hazardTiles(value: StaticDungeonSceneHandles["hazardTiles"]) {
    this.staticHandles.hazardTiles = value;
  }

  setDungeon(dungeon: DungeonData, mood: DungeonMood = getDungeonMood("ash")): void {
    this.clear();
    this.dungeon = dungeon;
    this.activeMood = mood;
    this.collectedStones.clear();
    this.portalOpen = false;
    this.lockedExitCooldown = 0;
    this.elapsed = 0;
    this.enemyAnimationElapsed = 0;
    this.difficultyElapsed = 0;
    this.difficultySecond = -1;
    this.timeFreezeSeconds = 0;
    this.luminousWardSeconds = 0;
    this.annihilationPulseClock.remaining = 0;
    this.annihilationPulseClock.timeSincePulse = 0;
    this.enemySimulationElapsed = 0;
    this.ensureStoneTextures();
    const staticHandles = this.staticScene.build(dungeon, mood, this.decorDensity);
    this.borrowStaticHandles(staticHandles);
    this.addActors(dungeon, staticHandles.stonePlacements);
    const pickupBurstAnchor = gridToWorld(dungeon, dungeon.spawn, this.tileSize);
    this.pickupBurstWarmupPosition.set(pickupBurstAnchor.x, 0.4, pickupBurstAnchor.z);
    this.pickupBurstPool = new PickupBurstPool(6);
    this.group.add(this.pickupBurstPool.root);
    this.stats.enemies = this.enemies.length;
    this.stats.pickups = this.pickups.length;
  }

  setDecorDensity(value: number): void {
    this.decorDensity = THREE.MathUtils.clamp(value, 0, 1);
  }
  setEnemyDensity(value: number): void {
    this.difficulty = THREE.MathUtils.clamp(value, 0, 1);
    this.refreshDifficultyState();
  }

  getDifficultyState(): Readonly<DifficultySnapshot> {
    return this.difficultyState;
  }

  private refreshDifficultyState(): void {
    this.difficultyState = resolveDifficultySnapshot(
      this.difficulty,
      this.difficultyElapsed,
      this.difficultyRoomCount,
      this.enemies.length,
      this.enemyReserve.length,
    );
    this.stats.enemies = this.enemies.length;
    this.stats.reserveEnemies = this.enemyReserve.length;
    this.stats.difficultyLevel = this.difficultyState.pressureLevel;
  }

  private updateDifficulty(player: { x: number; z: number }): void {
    const second = Math.floor(this.difficultyElapsed);
    if (second === this.difficultySecond) return;
    this.difficultySecond = second;
    this.refreshDifficultyState();
    this.activateEnemiesToTarget(player, "play");
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
    if (!this.dungeon) return;
    this.refreshDifficultyState();
    const target = this.difficultyState.targetEnemies;
    const wardSafeSpawnDistance = isLuminousWardActive(this.luminousWardSeconds)
      ? Math.max(this.difficultyState.safeSpawnDistance, LUMINOUS_WARD_REPEL_RADIUS + 1)
      : this.difficultyState.safeSpawnDistance;
    const pulseSafeSpawnDistance = isAnnihilationPulseActive(this.annihilationPulseClock)
      ? Math.max(this.difficultyState.safeSpawnDistance, ANNIHILATION_PULSE_REPEL_RADIUS + 1)
      : this.difficultyState.safeSpawnDistance;
    const safeSpawnDistance = Math.max(wardSafeSpawnDistance, pulseSafeSpawnDistance);
    const activatedThisPulse: THREE.Vector3[] = [];
    while (this.enemies.length < target) {
      const candidates: number[] = [];
      for (let index = 0; index < this.enemyReserve.length; index += 1) {
        const enemy = this.enemyReserve[index]!;
        if (mode === "opening" && !enemy.startsActive) continue;
        if (!isEnemyKindUnlocked(enemy.kind, this.difficultyElapsed, this.difficultyState))
          continue;
        if (
          this.dungeon &&
          this.isObjectOccupiedCell(
            worldToGrid(this.dungeon, { x: enemy.position.x, z: enemy.position.z }, this.tileSize),
          )
        )
          continue;
        const distance = Math.hypot(enemy.position.x - player.x, enemy.position.z - player.z);
        if (mode === "play" && distance < safeSpawnDistance) continue;
        if (mode === "resume" && distance < 2.4) continue;
        if (
          mode === "play" &&
          hasGridLineOfSight(this.dungeon, player, enemy.position, this.tileSize)
        ) {
          continue;
        }
        candidates.push(index);
      }
      if (candidates.length === 0) break;
      const minSpread = ENEMY_ACTIVATION_SPREAD;
      const spreadCandidates = candidates.filter((index) => {
        const enemy = this.enemyReserve[index]!;
        const farFromPulse = activatedThisPulse.every(
          (active) =>
            Math.hypot(enemy.position.x - active.x, enemy.position.z - active.z) >= minSpread,
        );
        if (!farFromPulse) return false;
        // Also stay clear of enemies already in the active set, not only this pulse.
        return this.enemies.every(
          (active) =>
            Math.hypot(
              enemy.position.x - active.position.x,
              enemy.position.z - active.position.z,
            ) >= minSpread,
        );
      });
      const pool = spreadCandidates.length > 0 ? spreadCandidates : candidates;
      const selectedIndex = pool[this.enemyActivationRandom.integer(0, pool.length - 1)]!;
      const [enemy] = this.enemyReserve.splice(selectedIndex, 1);
      if (!enemy) break;
      // Opening and resume seats are already "in the world"; play waves still
      // fade in so reinforcements read as arrivals.
      enemy.spawnReveal = mode === "play" ? 0 : 1;
      enemy.hitCooldown =
        mode === "play"
          ? Math.max(enemy.hitCooldown, this.difficultyState.revealSeconds)
          : enemy.hitCooldown;
      this.enemies.push(enemy);
      activatedThisPulse.push(enemy.position);
    }
    this.refreshDifficultyState();
  }

  private isObjectiveClearanceCell(cell: GridCell): boolean {
    return this.staticScene.isObjectiveClearanceCell(cell);
  }

  private isObjectOccupiedCell(cell: GridCell): boolean {
    return this.staticScene.isObjectOccupiedCell(cell);
  }

  update(
    delta: number,
    player: THREE.Vector3,
    atExit: boolean,
    interactPressed = false,
  ): WorldUpdate {
    this.lockedExitCooldown = Math.max(0, this.lockedExitCooldown - delta);
    this.timeFreezeSeconds = tickTimeFreeze(this.timeFreezeSeconds, delta);
    this.luminousWardSeconds = tickLuminousWard(this.luminousWardSeconds, delta);
    const pulseCount = tickAnnihilationPulse(this.annihilationPulseClock, delta);
    const enemiesFrozen = isTimeFreezeActive(this.timeFreezeSeconds);
    const luminousWardActive = isLuminousWardActive(this.luminousWardSeconds);
    const annihilationPulseActive = isAnnihilationPulseActive(this.annihilationPulseClock);
    if (!enemiesFrozen) {
      this.enemyAnimationElapsed += Math.max(0, delta);
      this.enemySimulationElapsed += Math.max(0, delta);
      this.difficultyElapsed += Math.max(0, delta);
      this.updateDifficulty(player);
    }
    let resolveGain = 0;
    let collectedStoneId: StoneId | null = null;
    const collectedStoneIds: StoneId[] = [];
    let collectedPickup: WorldUpdate["collectedPickup"] = null;
    let doorSound: WorldUpdate["doorSound"] = null;
    let chestSound: WorldUpdate["chestSound"] = null;
    let interactionPrompt: WorldUpdate["interactionPrompt"] = null;

    // Combat + locomotion (sim) separate from instanced matrix writes (view).
    const sim = enemiesFrozen
      ? {
          damage: 0,
          nearestThreat: nearestEnemyDistance(this.enemies, player),
          knockX: 0,
          knockZ: 0,
          knockHits: 0,
          attacker: null,
        }
      : tickEnemySim(this.enemies as EnemySimBody[], {
          delta,
          elapsed: this.enemySimulationElapsed,
          player,
          dungeon: this.dungeon,
          solidColliders: this.solidColliders,
          tileSize: this.tileSize,
          repelRadius: Math.max(
            luminousWardActive ? LUMINOUS_WARD_REPEL_RADIUS : 0,
            annihilationPulseActive ? ANNIHILATION_PULSE_REPEL_RADIUS : 0,
          ),
          repelSpeedMultiplier: annihilationPulseActive
            ? ANNIHILATION_PULSE_REPEL_SPEED_MULTIPLIER
            : 1,
          moodId: this.activeMood.id,
          difficulty: this.difficulty,
        });
    const surfaceEffect = this.hazardTiles?.sample(delta, player) ?? {
      kind: null,
      label: "",
      damage: 0,
      movementScale: 1,
      traction: 1,
    };
    const damage = sim.damage + surfaceEffect.damage;
    const nearestThreat = sim.nearestThreat;
    const knockX = sim.knockX;
    const knockZ = sim.knockZ;
    const knockHits = sim.knockHits;
    let annihilationPulse: WorldUpdate["annihilationPulse"] = null;
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
    const damageSource: WorldUpdate["damageSource"] = sim.attacker
      ? {
          position: {
            x: sim.attacker.position.x,
            y: sim.attacker.position.y,
            z: sim.attacker.position.z,
          },
          voice: creatureVoiceForEnemy(sim.attacker.kind),
        }
      : null;
    this.updateEnemyAnimationFrames();

    for (const enemy of this.enemies) {
      if (!enemiesFrozen) {
        enemy.spawnReveal = Math.min(
          1,
          enemy.spawnReveal + delta / Math.max(0.1, this.difficultyState.revealSeconds),
        );
      }
      // Keep facing the player while frozen so the freeze read stays on the
      // billboard (desat + body frost) instead of a locked sideways pose.
      const yaw = Math.atan2(player.x - enemy.position.x, player.z - enemy.position.z);
      enemy.yaw = yaw;
      this.tempEuler.set(0, yaw, enemy.roll);
      this.tempQuaternion.setFromEuler(this.tempEuler);
      this.tempScale.set(enemy.scaleX, enemy.scaleY, 1);
      const visible = enemy.phaseVisibility * enemy.spawnReveal;
      enemy.visibilityAttribute.setX(enemy.instanceIndex, visible);
      enemy.batch.setMatrixAt(
        enemy.instanceIndex,
        this.tempMatrix.compose(enemy.position, this.tempQuaternion, this.tempScale),
      );
      this.writeEnemyContactShadow(enemy, visible);
    }
    for (const batch of this.enemyBatches) batch.instanceMatrix.needsUpdate = true;
    for (const batch of this.enemyShadowBatches) batch.instanceMatrix.needsUpdate = true;
    for (const attribute of this.enemyVisibilityAttributes) attribute.needsUpdate = true;
    const freezeLook = enemiesFrozen ? 1 : 0;
    for (const batch of this.enemyAnimationBatches.values()) {
      setEnemyFreezeAmount(batch.material, freezeLook);
    }
    this.enemyMotionTrailVfx?.update(this.enemies, delta, enemiesFrozen, player);

    for (const door of this.doors) {
      const distance = horizontalDistance(door.root.position, player);
      const targetOpen =
        distance < ((door.root.userData.openDistance as number) ?? 2.65)
          ? true
          : distance > 3.7
            ? false
            : door.targetOpen;
      if (targetOpen !== door.targetOpen) {
        door.targetOpen = targetOpen;
        if (!doorSound) {
          doorSound = {
            kind: targetOpen ? "open" : "close",
            position: {
              x: door.root.position.x,
              y: door.root.position.y + 1.2,
              z: door.root.position.z,
            },
          };
        }
      }
      const target = door.targetOpen ? 1 : 0;
      door.openness = THREE.MathUtils.damp(
        door.openness,
        target,
        target > door.openness ? 9 : 3.2,
        delta,
      );
      door.left.rotation.y = (door.left.userData.openRotation as number) * door.openness;
      door.right.rotation.y = (door.right.userData.openRotation as number) * door.openness;
      door.root.userData.passable = door.openness > 0.82;
      door.root.userData.closed = door.openness < 0.08;
    }

    let nearestChest: ChestActor | null = null;
    let nearestChestDistance = Number.POSITIVE_INFINITY;
    for (const chest of this.chests) {
      const distance = horizontalDistance(chest.root.position, player);
      if (canInteractWithChest(distance, chest.opened) && distance < nearestChestDistance) {
        nearestChest = chest;
        nearestChestDistance = distance;
      }
      chest.openness = THREE.MathUtils.damp(
        chest.openness,
        chest.opened ? 1 : 0,
        chest.opened ? 7.5 : 5,
        delta,
      );
      chest.lid.rotation.x = -1.18 * chest.openness;
      if (!chest.opened || chest.reward.available || chest.reward.collected) continue;
      chest.reward.revealTime += delta;
      const reveal = THREE.MathUtils.clamp(chest.reward.revealTime / 0.52, 0, 1);
      const eased = 1 - Math.pow(1 - reveal, 3);
      // Keep visible so PointLights on power rewards stay in the fixed light count.
      chest.reward.object.visible = true;
      chest.reward.object.position.y = chest.reward.baseY - 0.34 + eased * 0.34;
      chest.reward.object.rotation.y += delta * (1.35 + reveal * 1.25);
      chest.reward.object.scale
        .copy(chest.reward.baseScale)
        .multiplyScalar(0.68 + eased * 0.32 + Math.sin(reveal * Math.PI) * 0.08);
      if (chest.reward.timeFreezeSignal) {
        chest.reward.timeFreezeSignal.light.intensity =
          chest.reward.timeFreezeSignal.baseIntensity * eased;
      }
      if (chest.reward.luminousWardSignal) {
        chest.reward.luminousWardSignal.light.intensity =
          chest.reward.luminousWardSignal.baseIntensity * eased;
      }
      if (chest.reward.annihilationPulseSignal) {
        chest.reward.annihilationPulseSignal.light.intensity =
          chest.reward.annihilationPulseSignal.baseIntensity * eased;
      }
      if (reveal >= 1) {
        chest.reward.available = true;
        chest.reward.object.scale.copy(chest.reward.baseScale);
      }
    }
    if (nearestChest) {
      interactionPrompt = "open-chest";
      if (interactPressed) {
        nearestChest.opened = true;
        nearestChest.reward.revealTime = 0;
        nearestChest.reward.object.visible = true;
        nearestChest.reward.object.position.y = nearestChest.reward.baseY - 0.34;
        nearestChest.reward.object.scale.copy(nearestChest.reward.baseScale).multiplyScalar(0.62);
        if (nearestChest.reward.timeFreezeSignal)
          nearestChest.reward.timeFreezeSignal.light.intensity = 0;
        if (nearestChest.reward.luminousWardSignal)
          nearestChest.reward.luminousWardSignal.light.intensity = 0;
        if (nearestChest.reward.annihilationPulseSignal)
          nearestChest.reward.annihilationPulseSignal.light.intensity = 0;
        chestSound = {
          position: {
            x: nearestChest.root.position.x,
            y: nearestChest.root.position.y + 0.72,
            z: nearestChest.root.position.z,
          },
        };
        interactionPrompt = null;
      }
    }

    for (const pickup of this.pickups) {
      if (pickup.collected) {
        pickup.collectTime += delta;
        const progress = THREE.MathUtils.clamp(pickup.collectTime / 0.38, 0, 1);
        const lift = 1 - Math.pow(1 - progress, 3);
        const pop = 1 + Math.sin(progress * Math.PI) * (pickup.stoneSignal ? 0.34 : 0.18);
        pickup.object.position.y = pickup.baseY + lift * 1.08;
        pickup.object.scale.copy(pickup.baseScale).multiplyScalar(pop);
        pickup.object.rotation.y +=
          delta * (pickup.stoneSignal ? 2.8 + progress * 5 : 1.8 + progress * 3);
        setPickupOpacity(pickup.object, 1 - progress);
        if (pickup.stoneSignal) pickup.stoneSignal.light.intensity = 0;
        if (pickup.timeFreezeSignal) pickup.timeFreezeSignal.light.intensity = 0;
        if (pickup.luminousWardSignal) pickup.luminousWardSignal.light.intensity = 0;
        if (pickup.annihilationPulseSignal) pickup.annihilationPulseSignal.light.intensity = 0;
        if (progress >= 1) {
          // Dormant scale keeps lights/materials in the graph; never flip visible off.
          setPickupDormant(pickup.object, true);
        }
        continue;
      }
      if (!pickup.available) continue;
      const powerPickup =
        pickup.timeFreezeSignal || pickup.luminousWardSignal || pickup.annihilationPulseSignal;
      const motionScale = pickup.stoneSignal ? 1 : powerPickup ? 0.56 : 0.68;
      pickup.object.position.y =
        pickup.baseY + Math.sin(this.elapsed * 2 + pickup.object.id) * 0.08 * motionScale;
      pickup.object.rotation.y += delta * (pickup.stoneSignal ? 0.72 : 0.46);
      if (pickup.timeFreezeSignal) {
        const pulse = 0.95 + Math.sin(this.elapsed * 2.35 + pickup.object.id) * 0.05;
        pickup.timeFreezeSignal.light.intensity = pickup.timeFreezeSignal.baseIntensity * pulse;
      }
      if (pickup.luminousWardSignal) {
        const pulse = 0.95 + Math.sin(this.elapsed * 2.15 + pickup.object.id) * 0.05;
        pickup.luminousWardSignal.light.intensity = pickup.luminousWardSignal.baseIntensity * pulse;
        const glowMaterial = pickup.luminousWardSignal.glow.material;
        if (glowMaterial instanceof THREE.MeshBasicMaterial) {
          glowMaterial.opacity = pickup.luminousWardSignal.baseGlowOpacity * (0.95 + pulse * 0.05);
        }
      }
      if (pickup.annihilationPulseSignal) {
        const pulse = 0.92 + Math.sin(this.elapsed * 3.1 + pickup.object.id) * 0.08;
        pickup.annihilationPulseSignal.light.intensity =
          pickup.annihilationPulseSignal.baseIntensity * pulse;
        const glowMaterial = pickup.annihilationPulseSignal.glow.material;
        if (glowMaterial instanceof THREE.MeshBasicMaterial) {
          glowMaterial.opacity =
            pickup.annihilationPulseSignal.baseGlowOpacity * (0.9 + pulse * 0.1);
        }
      }
      if (pickup.stoneSignal) {
        const pulse = 0.88 + Math.sin(this.elapsed * 2.9 + pickup.object.id) * 0.12;
        pickup.stoneSignal.light.intensity = pickup.stoneSignal.baseLightIntensity * pulse;
        const glowMaterial = pickup.stoneSignal.glow.material;
        if (glowMaterial instanceof THREE.MeshBasicMaterial) {
          glowMaterial.opacity = pickup.stoneSignal.baseGlowOpacity * (0.86 + pulse * 0.2);
        }
        pickup.stoneSignal.crown.scale.setScalar(0.96 + pulse * 0.08);
      }
      if (!canCollectPickup(horizontalDistance(pickup.object.position, player), pickup.autoCollect))
        continue;
      pickup.collected = true;
      pickup.collectTime = 0;
      this.pickupBurstPool?.trigger(pickup.object.position, pickup.kind);
      collectedPickup = {
        kind: pickup.kind,
        position: {
          x: pickup.object.position.x,
          y: pickup.object.position.y,
          z: pickup.object.position.z,
        },
      };
      if (pickup.kind === "stone" && pickup.stoneId) {
        if (pickup.stoneSignal) pickup.stoneSignal.light.intensity = 0;
        this.collectedStones.add(pickup.stoneId);
        collectedStoneId = pickup.stoneId;
        collectedStoneIds.push(pickup.stoneId);
        if (this.collectedStones.size >= STONE_ORDER.length) this.openPortal();
      } else if (pickup.kind === "resolve") {
        resolveGain += 28;
      } else if (pickup.kind === "time-freeze") {
        this.timeFreezeSeconds = activateTimeFreeze();
      } else if (pickup.kind === "annihilation-pulse") {
        if (pickup.annihilationPulseSignal) pickup.annihilationPulseSignal.light.intensity = 0;
        activateAnnihilationPulse(this.annihilationPulseClock);
      } else {
        if (pickup.luminousWardSignal) pickup.luminousWardSignal.light.intensity = 0;
        this.luminousWardSeconds = activateLuminousWard();
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

    const reachedLockedExit = atExit && !this.portalOpen && this.lockedExitCooldown === 0;
    const reachedOpenExit =
      this.portalOpen && isInsideMagicPortal(player, this.exitPosition, atExit);
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
      timeFreezeRemaining: this.timeFreezeSeconds,
      luminousWardRemaining: this.luminousWardSeconds,
      annihilationPulseRemaining: this.annihilationPulseClock.remaining,
      annihilationPulse,
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
      knockback,
      reachedLockedExit,
      reachedOpenExit,
      nearestThreat: Number.isFinite(nearestThreat) ? nearestThreat : null,
    };
  }

  private applyAnnihilationPulse(origin: THREE.Vector3): number {
    let hits = 0;
    for (const enemy of this.enemies) {
      if (
        enemy.defeated ||
        enemy.scaleX <= 0.001 ||
        enemy.scaleY <= 0.001 ||
        enemy.phaseVisibility < 0.04
      ) {
        continue;
      }
      const distance = horizontalDistance(enemy.position, origin);
      const enemyReach = Math.max(0.28, Math.min(enemy.baseScale.x, enemy.baseScale.y) * 0.2);
      if (distance > ANNIHILATION_PULSE_RADIUS + enemyReach) continue;

      enemy.defeated = true;
      enemy.scaleX = 0;
      enemy.scaleY = 0;
      enemy.phaseVisibility = 0;
      enemy.spawnReveal = 0;
      enemy.moving = false;
      this.annihilationPulseVfx?.triggerEnemyBurst(
        enemy.position,
        this.activeMood.id,
        enemy.instanceIndex + enemy.position.x * 13.17 + enemy.position.z * 7.91,
      );
      hits += 1;
    }
    return hits;
  }

  private updateEnemyAnimationFrames(): void {
    this.movingEnemyKinds.clear();
    for (const enemy of this.enemies) if (enemy.moving) this.movingEnemyKinds.add(enemy.kind);
    for (const batch of this.enemyAnimationBatches.values()) {
      const frame = enemyAnimationFrameIndex(
        batch.kind,
        this.enemyAnimationElapsed,
        batch.phaseOffset,
        this.movingEnemyKinds.has(batch.kind),
      );
      if (frame !== batch.frame) {
        setEnemyBillboardFrame(batch.material, batch.animation, frame);
        batch.frame = frame;
      }
      // Afterimages lag one animation frame behind the live sprite.
      this.enemyMotionTrailVfx?.syncAnimationFrame(batch.kind, batch.frame);
    }
  }

  /**
   * Flatten a radial disc under the enemy. Width shrinks with feet elevation so
   * grounded skitterers read hard contact while floating / ceiling threats leave
   * a softer stain on the floor they cast on.
   */
  private writeEnemyContactShadow(enemy: EnemyActor, visibility: number): void {
    const archetype = ENEMY_ARCHETYPES[enemy.kind];
    const sprite = getEnemySpriteRenderMetrics(enemy.kind, this.activeMood.id);
    const feetY = enemyOpaqueFeetY(enemy.position.y, sprite.planeHeight, sprite.bottomPaddingRatio);
    const layout = resolveEnemyContactShadowLayout({
      bodyWidth: archetype.width,
      lowProfile: isLowProfileEnemy(enemy.kind),
      feetY,
      visibility,
      spectral: archetype.silhouette === "spectral",
    });
    this.tempPosition.set(enemy.position.x, layout.y, enemy.position.z);
    this.tempQuaternion.setFromAxisAngle(this.tempAxisX, -Math.PI / 2);
    this.tempScale.set(layout.width, layout.depth, 1);
    enemy.shadowBatch.setMatrixAt(
      enemy.shadowInstanceIndex,
      this.tempMatrix.compose(this.tempPosition, this.tempQuaternion, this.tempScale),
    );
  }

  updateEffects(delta: number, viewerPosition?: THREE.Vector3Like): void {
    this.elapsed += delta;
    if (viewerPosition) this.updateBiomeFloorSprites(viewerPosition);
    this.timeFreezeVfx?.update(this.timeFreezeSeconds, this.elapsed, this.enemies);
    this.luminousWardVfx?.update(
      this.luminousWardSeconds,
      this.elapsed,
      viewerPosition ?? { x: 0, y: 1.5, z: 0 },
      delta,
    );
    this.annihilationPulseVfx?.update(
      this.annihilationPulseClock.remaining,
      this.elapsed,
      viewerPosition ?? { x: 0, y: 1.5, z: 0 },
      delta,
      this.activeMood.id,
    );
    this.hazardTiles?.update(delta);
    const losInterval = 0.12; // ~8 Hz LOS refresh — enough for occlusion feel, cheap on large forge maps
    for (const effect of this.fireEffects) {
      const distance = viewerPosition
        ? Math.hypot(
            effect.root.position.x - viewerPosition.x,
            effect.root.position.z - viewerPosition.z,
          )
        : 0;
      const releaseDistance = effect.cutoffDistance + 7;
      // Far fires: skip grid LOS entirely (dominant cost when dozens of torches).
      if (viewerPosition && this.dungeon && distance <= releaseDistance) {
        effect.losAge += delta;
        if (effect.losAge >= losInterval) {
          effect.losAge = 0;
          effect.losOpen = hasGridLineOfSight(
            this.dungeon,
            viewerPosition,
            effect.root.position,
            this.tileSize,
          );
        }
      } else if (!viewerPosition || !this.dungeon) {
        effect.losOpen = true;
      } else {
        effect.losOpen = false;
      }
      const lineOfSight = effect.losOpen;
      const lod = computeTorchLod(distance, effect.cutoffDistance);
      effect.root.visible = lod.rootVisible;
      // Keep flame/halo tied to the soft light factor so they fade with the
      // light instead of hard-toggling the same frame the point light enables.
      const fxFactor = lineOfSight ? Math.max(lod.lightFactor, effect.currentLightFactor) : 0;
      const showFlame = fxFactor > 0.02;
      const showHalo = fxFactor > 0.08 && distance < Math.min(15, effect.cutoffDistance);
      effect.flame.visible = showFlame;
      for (const detail of effect.flameDetails) detail.visible = showFlame;
      const fade = THREE.MathUtils.clamp(fxFactor, 0, 1);
      for (const halo of effect.halos) {
        halo.visible = showHalo;
        if (!(halo instanceof THREE.Mesh)) continue;
        const mat = halo.material;
        if (mat instanceof THREE.ShaderMaterial && mat.uniforms.uStrength) {
          const baseStrength =
            (halo.userData.baseStrength as number | undefined) ??
            (mat.uniforms.uStrength.value as number);
          if (halo.userData.baseStrength === undefined) halo.userData.baseStrength = baseStrength;
          mat.uniforms.uStrength.value = baseStrength * fade;
          tickVolumetricBeamTime(halo as THREE.Mesh, this.elapsed + effect.phase);
          continue;
        }
        if (mat && !Array.isArray(mat) && "opacity" in mat) {
          const base =
            (halo.userData.baseOpacity as number | undefined) ??
            (mat as THREE.MeshBasicMaterial).opacity;
          if (halo.userData.baseOpacity === undefined) halo.userData.baseOpacity = base;
          (mat as THREE.MeshBasicMaterial).opacity = base * fade;
        }
      }
      const pulse =
        0.86 +
        Math.sin(this.elapsed * 9 + effect.phase) *
          Math.sin(this.elapsed * 4.7 + effect.phase * 1.7) *
          0.14;
      effect.flame.scale.y = effect.baseFlameScaleY * (0.92 + pulse * 0.08);
      effect.flame.position.y = effect.baseY + Math.sin(this.elapsed * 7 + effect.phase) * 0.018;
      if (effect.light) {
        const targetFactor = lineOfSight ? lod.lightFactor : 0;
        // Slower ramp-up softens the first lit contribution; faster decay cuts fill.
        const lambda = targetFactor > effect.currentLightFactor ? 3.6 : 10;
        effect.currentLightFactor = THREE.MathUtils.damp(
          effect.currentLightFactor,
          targetFactor,
          lambda,
          delta,
        );
        // Keep the PointLight in the scene graph. Toggling visibility changes
        // the renderer's light count and can compile a new shader while moving.
        effect.light.intensity = effect.baseIntensity * pulse * effect.currentLightFactor;
      }
    }
    // Portal / stone beams share the same soft grit clock.
    if (this.portalBeam) tickVolumetricBeamTime(this.portalBeam, this.elapsed);
    for (const beam of this.stoneBeams) tickVolumetricBeamTime(beam, this.elapsed);
    if (this.liquidKit) tickLiquidSections(this.liquidKit.surfaces, this.elapsed);
  }

  setPickupEffectsWarmupVisible(visible: boolean): void {
    this.pickupBurstPool?.setWarmupVisible(visible, this.pickupBurstWarmupPosition);
    this.timeFreezeVfx?.setWarmupVisible(visible);
    this.annihilationPulseVfx?.setWarmupVisible(visible);
    // Chest rewards stay visible (tiny scale when dormant) so compile sees them.
    for (const pickup of this.pickups) pickup.object.visible = true;
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
    return this.timeFreezeSeconds;
  }

  get luminousWardRemaining(): number {
    return this.luminousWardSeconds;
  }

  get annihilationPulseRemaining(): number {
    return this.annihilationPulseClock.remaining;
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
      pickup.object.visible = true;
      pickup.object.position.y = pickup.baseY;
      if (collected) setPickupDormant(pickup.object, true);
      else pickup.object.scale.copy(pickup.baseScale);
      setPickupOpacity(pickup.object, collected ? 0 : 1);
      if (pickup.stoneSignal)
        pickup.stoneSignal.light.intensity = collected ? 0 : pickup.stoneSignal.baseLightIntensity;
    }
    this.setPortalOpen(restored.size === STONE_ORDER.length);
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
    },
    player: { x: number; z: number },
  ): void {
    this.difficultyElapsed = Math.max(0, progress.difficultyElapsed);
    this.difficultySecond = Math.floor(this.difficultyElapsed);
    this.timeFreezeSeconds = Math.max(0, progress.timeFreezeRemaining ?? 0);
    this.luminousWardSeconds = Math.max(0, progress.luminousWardRemaining ?? 0);
    this.annihilationPulseClock.remaining = Math.max(0, progress.annihilationPulseRemaining ?? 0);
    this.annihilationPulseClock.timeSincePulse = 0;
    this.refreshDifficultyState();
    this.activateEnemiesToTarget(player, "resume");
  }

  getSolidCells(): GridCell[] {
    return [...this.solidCells.values()].map((cell) => ({ ...cell }));
  }

  getSolidColliders(): WorldCollider[] {
    return this.solidColliders.map((collider) => ({ ...collider }));
  }

  /**
   * Read-only snapshot of placed world entities for minimap rendering.
   * Door/fire/enemy/pickup positions come from the live actors; spawn from
   * the dungeon grid so the entrance is shown even before actors populate.
   * Stones and relic are derived from pickups + collected-stone state.
   */
  getMinimapFeatures(): MinimapFeatures {
    const dungeon = this.dungeon;
    const toCell = (position: THREE.Vector3): MinimapCell => {
      if (!dungeon) return { x: 0, y: 0 };
      return worldToGrid(dungeon, { x: position.x, z: position.z }, this.tileSize);
    };
    const doors = this.doors.map((door) => toCell(door.root.position));
    const fires = this.fireEffects.map((fire) => toCell(fire.root.position));
    const enemies = this.enemies
      .filter((enemy) => enemy.scaleX > 0.001 && enemy.scaleY > 0.001)
      .map((enemy) => ({ cell: toCell(enemy.position), tier: enemy.tier }));
    const stones = this.pickups
      .filter(
        (pickup): pickup is PickupActor & { kind: "stone"; stoneId: StoneId } =>
          pickup.kind === "stone" && pickup.stoneId !== undefined,
      )
      .map((pickup) => ({
        cell: toCell(pickup.object.position),
        collected: pickup.collected,
        id: pickup.stoneId,
      }));
    const pickups = this.pickups
      .filter((pickup) => pickup.kind === "resolve" && pickup.available && !pickup.collected)
      .map((pickup) => toCell(pickup.object.position));
    const timeFreeze = this.pickups.find(
      (pickup) => pickup.kind === "time-freeze" && !pickup.collected,
    );
    const luminousWard = this.pickups.find(
      (pickup) => pickup.kind === "luminous-ward" && !pickup.collected,
    );
    const annihilationPulse = this.pickups.find(
      (pickup) => pickup.kind === "annihilation-pulse" && !pickup.collected,
    );
    return {
      doors,
      fires,
      enemies,
      stones,
      pickups,
      timeFreeze: timeFreeze ? toCell(timeFreeze.object.position) : undefined,
      luminousWard: luminousWard ? toCell(luminousWard.object.position) : undefined,
      annihilationPulse: annihilationPulse ? toCell(annihilationPulse.object.position) : undefined,
      spawn: dungeon ? { x: dungeon.spawn.x, y: dungeon.spawn.y } : { x: 0, y: 0 },
    };
  }

  /** Positions for HRTF sound placement; no simulation state leaves this adapter. */
  getAudioFrame(): DungeonAudioFrame {
    let fireCount = 0;
    for (const fire of this.fireEffects) {
      if (fire.audio === false) continue;
      const anchor = this.audioFrame.fires[fireCount] ?? {
        id: `fire-${fireCount}`,
        x: 0,
        y: 0,
        z: 0,
      };
      anchor.x = fire.root.position.x;
      anchor.y = fire.root.position.y + fire.baseY;
      anchor.z = fire.root.position.z;
      this.audioFrame.fires[fireCount++] = anchor;
    }
    this.audioFrame.fires.length = fireCount;

    let stoneCount = 0;
    for (const pickup of this.pickups) {
      if (pickup.kind !== "stone" || pickup.collected || !pickup.stoneId) continue;
      const anchor = this.audioFrame.magicStones[stoneCount] ?? {
        id: `stone-${pickup.stoneId}`,
        x: 0,
        y: 0,
        z: 0,
      };
      anchor.id = `stone-${pickup.stoneId}`;
      anchor.x = pickup.object.position.x;
      anchor.y = pickup.object.position.y;
      anchor.z = pickup.object.position.z;
      this.audioFrame.magicStones[stoneCount++] = anchor;
    }
    this.audioFrame.magicStones.length = stoneCount;

    let enemyCount = 0;
    for (const enemy of this.enemies) {
      if (enemy.scaleX <= 0.001 || enemy.scaleY <= 0.001) continue;
      const anchor = this.audioFrame.enemies[enemyCount] ?? {
        id: `enemy-${enemy.kind}-${enemy.instanceIndex}`,
        x: 0,
        y: 0,
        z: 0,
        voice: creatureVoiceForEnemy(enemy.kind),
      };
      anchor.id = `enemy-${enemy.kind}-${enemy.instanceIndex}`;
      anchor.voice = creatureVoiceForEnemy(enemy.kind);
      anchor.x = enemy.position.x;
      anchor.y = enemy.position.y + ENEMY_ARCHETYPES[enemy.kind].height * 0.5;
      anchor.z = enemy.position.z;
      this.audioFrame.enemies[enemyCount++] = anchor;
    }
    this.audioFrame.enemies.length = enemyCount;

    if (this.portalRoot) {
      const portal = this.audioFrame.portal ?? { id: "exit-portal", x: 0, y: 0, z: 0 };
      portal.x = this.portalRoot.position.x;
      portal.y = this.portalRoot.position.y + 1.7;
      portal.z = this.portalRoot.position.z;
      this.audioFrame.portal = portal;
    } else {
      this.audioFrame.portal = null;
    }
    this.audioFrame.moodId = this.activeMood.id;
    return this.audioFrame;
  }

  dispose(): void {
    this.clear();
    this.staticScene.dispose();
    disposeRoomSurfaceMaterials(this.surfaceMaterials);
    disposeDungeonMaterials(this.materials);
    disposeEnemyContactShadowMaterial(this.enemyShadowMaterial);
    this.assets.dispose();
    this.scene.remove(this.group);
  }

  private updateBiomeFloorSprites(player: THREE.Vector3Like): void {
    for (const prop of this.floorBiomeSprites) {
      const deltaX = player.x - prop.x;
      const deltaZ = player.z - prop.z;
      const distance = Math.hypot(deltaX, deltaZ);
      const fade = biomeSpriteFloorDistanceFade(distance);
      prop.material.opacity = prop.baseOpacity * fade;
      prop.mesh.visible = fade > 0.001;
      prop.mesh.userData.distanceFade = fade;
      if (prop.placement === "floor-decal") continue;
      if (Math.abs(deltaX) + Math.abs(deltaZ) < 0.0001) continue;
      // Keep floor cards upright. Corner cards can turn toward the player only
      // inside the open sector between their two adjacent walls.
      const targetYaw = Math.atan2(deltaX, deltaZ);
      prop.mesh.rotation.y =
        prop.placement === "corner-standing"
          ? clampBiomeSpriteYaw(prop.baseYaw, targetYaw)
          : targetYaw;
    }
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
    for (const id of magicStoneIds()) {
      const texture = loader.load(`/assets/textures/stones/${id}-albedo.jpg`);
      texture.colorSpace = THREE.SRGBColorSpace;
      // Pixel-art grimdark: hard texels, no bilinear mush.
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(2, 2);
      this.stoneTextures.set(id, texture);
    }
  }

  private addActors(dungeon: DungeonData, stonePlacements: readonly MagicStonePlacement[]): void {
    const random = createSeededRandom(`${dungeon.seed}:actors`);
    const enemyRooms = dungeon.rooms
      .filter((room) => room.role === "room")
      .sort((left, right) => roomDistance(dungeon, left) - roomDistance(dungeon, right));
    this.difficultyRoomCount = Math.max(1, enemyRooms.length);
    const kinds: readonly EnemyKind[] = ENEMY_ROSTER;

    const authoredSpawns = dungeon.forge?.spawns.length
      ? dungeon.forge.spawns
          .filter(
            (spawn) => !this.isObjectiveClearanceCell(spawn) && !this.isObjectOccupiedCell(spawn),
          )
          .map((spawn) => {
            const room = enemyRooms.find(
              (candidate) =>
                spawn.x >= candidate.x &&
                spawn.x < candidate.x + candidate.width &&
                spawn.y >= candidate.y &&
                spawn.y < candidate.y + candidate.height,
            );
            return {
              cell: { x: spawn.x, y: spawn.y },
              tier: spawn.tier,
              roomId: room?.id ?? -1,
              pass: 2,
            };
          })
      : [];
    // Keep two guaranteed seats per room, plus a deep reserve for 16-second
    // room pulses (~1 new enemy per room). Instancing keeps dormant seats cheap.
    const distributedTarget = Math.min(
      ENEMY_HARD_CAP,
      Math.max(enemyRooms.length * 2, Math.round(enemyRooms.length * (5 + this.difficulty * 3))),
    );
    const maxPool = Math.min(ENEMY_HARD_CAP + 32, distributedTarget + authoredSpawns.length);
    const excludedSpawnCells = new Set([
      ...this.objectOccupiedCells,
      ...this.solidCells.keys(),
      ...this.wallSpriteOccupiedCells,
      ...this.hazardCells,
      ...this.objectiveClearanceCells,
      `${dungeon.spawn.x},${dungeon.spawn.y}`,
      `${dungeon.exit.x},${dungeon.exit.y}`,
      ...stonePlacements.map((placement) => `${placement.cell.x},${placement.cell.y}`),
    ]);
    authoredSpawns.forEach((spawn) => excludedSpawnCells.add(`${spawn.cell.x},${spawn.cell.y}`));
    const distributedSpawns = buildDistributedEnemySpawns(
      dungeon.seed,
      enemyRooms,
      distributedTarget,
      excludedSpawnCells,
    );
    const spawnRecords = [...distributedSpawns, ...authoredSpawns].slice(0, maxPool);
    const entranceRoom = enemyRooms.find(
      (room) =>
        dungeon.spawn.x >= room.x &&
        dungeon.spawn.x < room.x + room.width &&
        dungeon.spawn.y >= room.y &&
        dungeon.spawn.y < room.y + room.height,
    );
    const openingTuning = resolveDifficultyTuning(
      this.difficulty,
      enemyRooms.length,
      spawnRecords.length,
    );
    const openingQuotas = buildInitialRoomEnemyQuotas(
      dungeon.seed,
      enemyRooms,
      openingTuning.initialEnemies,
      entranceRoom?.id,
    );
    const usedOpeningSlots = new Map<number, number>();
    const plannedSpawns = spawnRecords.map((spawn) => {
      const used = usedOpeningSlots.get(spawn.roomId) ?? 0;
      const quota = openingQuotas.get(spawn.roomId) ?? 0;
      const startsActive = used < quota;
      if (startsActive) usedOpeningSlots.set(spawn.roomId, used + 1);
      return { ...spawn, tier: startsActive ? 0 : spawn.tier, startsActive };
    });
    this.enemyActivationRandom = createSeededRandom(`${dungeon.seed}:difficulty-activation`);
    const selectedKinds = selectEnemyKindsForSpawns(
      dungeon.seed,
      plannedSpawns.map((spawn) => spawn.tier),
    );
    const actorSpecs = plannedSpawns.map((spawn, index) => {
      const kind = selectedKinds[index] ?? kinds[index % kinds.length] ?? "goblin";
      const sprite = getEnemySpriteRenderMetrics(kind, this.activeMood.id);
      const width = sprite.planeWidth;
      const height = sprite.planeHeight;
      const p = gridToWorld(dungeon, spawn.cell, this.tileSize);
      const spawnY =
        kind === "imp"
          ? enemyCeilingY(kind, this.wallHeight, 0.38, this.activeMood.id)
          : enemyGroundY(kind, this.activeMood.id);
      return {
        kind,
        width,
        height,
        tier: spawn.tier,
        startsActive: spawn.startsActive,
        position: new THREE.Vector3(
          p.x + (random.next() - 0.5) * 0.56,
          spawnY,
          p.z + (random.next() - 0.5) * 0.56,
        ),
        phase: index * 1.37 + 1.1,
        shadowInstanceIndex: index,
      };
    });
    const sharedShadowBatch =
      actorSpecs.length > 0
        ? new THREE.InstancedMesh(
            new THREE.PlaneGeometry(1, 1),
            this.enemyShadowMaterial,
            actorSpecs.length,
          )
        : null;
    if (sharedShadowBatch) {
      sharedShadowBatch.name = "Enemy shared contact shadow batch";
      sharedShadowBatch.renderOrder = 1;
      sharedShadowBatch.frustumCulled = true;
    }
    const moodAnimations = enemyAnimationsForMood(this.activeMood.id);
    this.enemyMotionTrailVfx = new EnemyMotionTrailVfx();
    this.group.add(this.enemyMotionTrailVfx.root);
    for (const kind of kinds) {
      const specs = actorSpecs.filter((spec) => spec.kind === kind);
      if (specs.length === 0) continue;
      const animation = moodAnimations[kind];
      const texture = this.assets.enemyAnimation(animation);
      const material = createEnemyBillboardMaterial(texture, this.activeMood);
      setEnemyBillboardFrame(material, animation, 0);
      this.enemyAnimationBatches.set(kind, {
        kind,
        material,
        animation,
        frame: 0,
        phaseOffset: this.enemyAnimationBatches.size * 0.03125,
      });
      this.enemyMotionTrailVfx.registerKind(kind, texture, animation, specs.length);
      const billboardGeometry = new THREE.PlaneGeometry(1, 1);
      const visibilityAttribute = new THREE.InstancedBufferAttribute(
        new Float32Array(specs.length),
        1,
      );
      billboardGeometry.setAttribute("aEnemyVisibility", visibilityAttribute);
      this.enemyVisibilityAttributes.add(visibilityAttribute);
      const batch = new THREE.InstancedMesh(billboardGeometry, material, specs.length);
      batch.name = `Enemy billboard batch ${kind}`;
      batch.renderOrder = 2;
      batch.frustumCulled = true;
      specs.forEach((spec, instanceIndex) => {
        if (!sharedShadowBatch) return;
        const actor: EnemyActor = {
          kind,
          position: spec.position,
          batch,
          shadowBatch: sharedShadowBatch,
          instanceIndex,
          shadowInstanceIndex: spec.shadowInstanceIndex,
          hitCooldown: 0,
          baseY: spec.position.y,
          baseScale: new THREE.Vector2(spec.width, spec.height),
          phase: spec.phase,
          attackPulse: 0,
          scaleX: spec.width,
          scaleY: spec.height,
          roll: 0,
          yaw: 0,
          phaseEpoch: -1,
          phaseVisibility: 1,
          spawnReveal: 0,
          startsActive: spec.startsActive,
          moving: false,
          visibilityAttribute,
          tier: spec.tier,
          defeated: false,
        };
        this.enemyReserve.push(actor);
        batch.setMatrixAt(
          instanceIndex,
          new THREE.Matrix4().compose(
            actor.position,
            new THREE.Quaternion(),
            new THREE.Vector3(actor.scaleX, actor.scaleY, 1),
          ),
        );
        // Reserve seats stay zero-size until activation; active opening seats
        // get a full contact disc so basals read on the first rendered frame.
        if (actor.startsActive) {
          this.writeEnemyContactShadow(actor, 1);
        } else {
          sharedShadowBatch.setMatrixAt(
            spec.shadowInstanceIndex,
            new THREE.Matrix4().compose(
              new THREE.Vector3(actor.position.x, 0.028, actor.position.z),
              new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2),
              new THREE.Vector3(0, 0, 1),
            ),
          );
        }
      });
      batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingSphere();
      // Inflate sphere so culled batches still cover movement within a room.
      if (batch.boundingSphere)
        batch.boundingSphere.radius = Math.max(batch.boundingSphere.radius, 24);
      this.enemyBatches.add(batch);
      this.group.add(batch);
    }
    if (sharedShadowBatch) {
      sharedShadowBatch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      sharedShadowBatch.instanceMatrix.needsUpdate = true;
      sharedShadowBatch.computeBoundingSphere();
      if (sharedShadowBatch.boundingSphere)
        sharedShadowBatch.boundingSphere.radius = Math.max(
          sharedShadowBatch.boundingSphere.radius,
          24,
        );
      this.enemyShadowBatches.add(sharedShadowBatch);
      this.group.add(sharedShadowBatch);
    }

    this.timeFreezeVfx = new TimeFreezeVfx(actorSpecs.length);
    this.group.add(this.timeFreezeVfx.root);
    this.luminousWardVfx = new LuminousWardVfx();
    this.group.add(this.luminousWardVfx.root);
    this.stats.lights += 1;
    this.annihilationPulseVfx = new AnnihilationPulseVfx();
    this.group.add(this.annihilationPulseVfx.root);
    this.stats.lights += 1;

    const entrance = gridToWorld(dungeon, dungeon.spawn, this.tileSize);
    this.activateEnemiesToTarget(entrance, "opening");
  }

  private clear(): void {
    this.enemies.length = 0;
    this.enemyReserve.length = 0;
    this.enemyBatches.clear();
    this.enemyShadowBatches.clear();
    this.enemyVisibilityAttributes.clear();
    this.enemyAnimationBatches.clear();
    this.movingEnemyKinds.clear();
    this.enemyAnimationElapsed = 0;
    this.enemySimulationElapsed = 0;
    this.difficultyElapsed = 0;
    this.difficultySecond = -1;
    this.timeFreezeSeconds = 0;
    this.luminousWardSeconds = 0;
    this.annihilationPulseClock.remaining = 0;
    this.annihilationPulseClock.timeSincePulse = 0;
    this.difficultyRoomCount = 1;
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
    while (this.group.children.length > 0) {
      const child = this.group.children[0] as THREE.Object3D;
      this.group.remove(child);
      disposeObject(child);
    }
  }
}
